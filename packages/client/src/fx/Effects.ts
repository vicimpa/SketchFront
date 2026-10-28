import * as THREE from 'three';
import { IUpdatable } from '../interfaces/IUpdatable';

export type ImpactKind = 'world' | 'flesh';

const TRACER_LIFE = 0.06;
const FLASH_LIFE = 0.05;
const MAX_PARTICLES = 400;
const GRAVITY = 9.81;

interface Tracer
{
	mesh: THREE.Mesh;
	material: THREE.MeshBasicMaterial;
	life: number;
}

interface Flash
{
	mesh: THREE.Mesh;
	life: number;
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpColor = new THREE.Color();
const Z = new THREE.Vector3(0, 0, 1);

/**
 * Pooled shot effects: tracers, muzzle flashes and impact particles.
 * Everything is allocated up front so firing never adds objects or lights to the scene.
 */
export class Effects implements IUpdatable
{
	public updateOrder: number = 6;

	private tracers: Tracer[] = [];
	private nextTracer: number = 0;
	private flashes: Flash[] = [];
	private nextFlash: number = 0;
	private flashLight: THREE.PointLight;
	private flashLightLife: number = 0;

	private particles: THREE.InstancedMesh;
	private positions = new Float32Array(MAX_PARTICLES * 3);
	private velocities = new Float32Array(MAX_PARTICLES * 3);
	private lives = new Float32Array(MAX_PARTICLES);
	private maxLives = new Float32Array(MAX_PARTICLES);
	private sizes = new Float32Array(MAX_PARTICLES);
	private gravityScales = new Float32Array(MAX_PARTICLES);
	private nextParticle: number = 0;

	constructor(scene: THREE.Scene)
	{
		// Tracers: unit box stretched from start to end
		const tracerGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
		for (let i = 0; i < 32; i++)
		{
			const material = new THREE.MeshBasicMaterial({
				color: 0xffd98a,
				transparent: true,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				toneMapped: false,
			});
			const mesh = new THREE.Mesh(tracerGeometry, material);
			mesh.visible = false;
			mesh.frustumCulled = false;
			scene.add(mesh);
			this.tracers.push({ mesh, material, life: 0 });
		}

		// Muzzle flashes: two crossed quads
		const flashGeometry = new THREE.BufferGeometry();
		flashGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
			-0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1,
			0, -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 0, 0, 0.5, 1, 0, -0.5, 1,
		], 3));
		const flashMaterial = new THREE.MeshBasicMaterial({
			color: 0xffc46b,
			transparent: true,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
			side: THREE.DoubleSide,
			toneMapped: false,
		});
		for (let i = 0; i < 8; i++)
		{
			const mesh = new THREE.Mesh(flashGeometry, flashMaterial);
			mesh.visible = false;
			scene.add(mesh);
			this.flashes.push({ mesh, life: 0 });
		}

		// One light shared by all flashes, always in the scene so no shader is recompiled
		this.flashLight = new THREE.PointLight(0xffb45a, 0, 4, 2);
		scene.add(this.flashLight);

		// Impact particles
		this.particles = new THREE.InstancedMesh(
			new THREE.BoxGeometry(1, 1, 1),
			new THREE.MeshBasicMaterial({ toneMapped: false }),
			MAX_PARTICLES
		);
		this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.particles.frustumCulled = false;
		tmpMatrix.makeScale(0, 0, 0);
		for (let i = 0; i < MAX_PARTICLES; i++)
		{
			this.particles.setMatrixAt(i, tmpMatrix);
			this.particles.setColorAt(i, tmpColor.set(0xffffff));
		}
		scene.add(this.particles);
	}

	public tracer(from: THREE.Vector3, to: THREE.Vector3): void
	{
		const tracer = this.tracers[this.nextTracer];
		this.nextTracer = (this.nextTracer + 1) % this.tracers.length;

		const length = from.distanceTo(to);
		if (length < 0.01) return;

		tmpDir.subVectors(to, from).divideScalar(length);
		tracer.mesh.position.copy(from);
		tracer.mesh.quaternion.setFromUnitVectors(Z, tmpDir);
		tracer.mesh.scale.set(0.012, 0.012, length);
		tracer.mesh.visible = true;
		tracer.life = TRACER_LIFE;
	}

	public muzzleFlash(position: THREE.Vector3, direction: THREE.Vector3, size: number): void
	{
		const flash = this.flashes[this.nextFlash];
		this.nextFlash = (this.nextFlash + 1) % this.flashes.length;

		flash.mesh.position.copy(position);
		flash.mesh.quaternion.setFromUnitVectors(Z, direction);
		flash.mesh.rotateZ(Math.random() * Math.PI);
		const scale = size * (0.8 + Math.random() * 0.4);
		flash.mesh.scale.set(scale * 0.6, scale * 0.6, scale);
		flash.mesh.visible = true;
		flash.life = FLASH_LIFE;

		this.flashLight.position.copy(position).addScaledVector(direction, 0.1);
		this.flashLightLife = FLASH_LIFE;
	}

	public impact(point: THREE.Vector3, normal: THREE.Vector3, kind: ImpactKind): void
	{
		if (kind === 'flesh')
		{
			this.burst(point, normal, 8, 0x9e1b1b, 1.5, 0.035, 0.35, 0.6);
		}
		else
		{
			this.burst(point, normal, 5, 0xffcf6a, 4, 0.015, 0.15, 0.3);
			this.burst(point, normal, 5, 0x8f8a80, 1.2, 0.04, 0.5, 0.15);
		}
	}

	public update(timeStep: number): void
	{
		for (const tracer of this.tracers)
		{
			if (tracer.life <= 0) continue;
			tracer.life -= timeStep;
			tracer.mesh.visible = tracer.life > 0;
			tracer.material.opacity = Math.max(0, tracer.life / TRACER_LIFE);
		}

		for (const flash of this.flashes)
		{
			if (flash.life <= 0) continue;
			flash.life -= timeStep;
			flash.mesh.visible = flash.life > 0;
		}

		this.flashLightLife = Math.max(0, this.flashLightLife - timeStep);
		this.flashLight.intensity = (this.flashLightLife / FLASH_LIFE) * 3;

		this.updateParticles(timeStep);
	}

	private burst(point: THREE.Vector3, normal: THREE.Vector3, count: number, color: number, speed: number, size: number, life: number, gravityScale: number): void
	{
		tmpColor.set(color);
		for (let n = 0; n < count; n++)
		{
			const i = this.nextParticle;
			this.nextParticle = (this.nextParticle + 1) % MAX_PARTICLES;

			// Spray around the surface normal
			tmpDir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2).add(normal).normalize();
			const v = speed * (0.5 + Math.random() * 0.5);

			this.positions.set([point.x, point.y, point.z], i * 3);
			this.velocities.set([tmpDir.x * v, tmpDir.y * v, tmpDir.z * v], i * 3);
			this.maxLives[i] = this.lives[i] = life * (0.6 + Math.random() * 0.4);
			this.sizes[i] = size * (0.6 + Math.random() * 0.8);
			this.gravityScales[i] = gravityScale;
			this.particles.setColorAt(i, tmpColor);
		}
		this.particles.instanceColor.needsUpdate = true;
	}

	private updateParticles(timeStep: number): void
	{
		let changed = false;
		for (let i = 0; i < MAX_PARTICLES; i++)
		{
			if (this.lives[i] <= 0) continue;
			changed = true;

			this.lives[i] -= timeStep;
			const p = i * 3;
			this.velocities[p + 1] -= GRAVITY * this.gravityScales[i] * timeStep;
			this.positions[p] += this.velocities[p] * timeStep;
			this.positions[p + 1] += this.velocities[p + 1] * timeStep;
			this.positions[p + 2] += this.velocities[p + 2] * timeStep;

			const s = this.lives[i] > 0 ? this.sizes[i] * (this.lives[i] / this.maxLives[i]) : 0;
			tmpScale.set(s, s, s);
			tmpMatrix.compose(tmpDir.set(this.positions[p], this.positions[p + 1], this.positions[p + 2]), tmpQuat.identity(), tmpScale);
			this.particles.setMatrixAt(i, tmpMatrix);
		}
		if (changed) this.particles.instanceMatrix.needsUpdate = true;
	}
}
