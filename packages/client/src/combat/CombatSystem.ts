import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { damageForHit, intersectRayCapsule, type HitZone, type Shot, type WeaponDef } from '@sketchfront/shared';
import { World } from '../world/World';
import { Character } from '../characters/Character';
import { RandomBehaviour } from '../characters/character_ai/RandomBehaviour';
import { CollisionGroups } from '../enums/CollisionGroups';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Effects } from '../fx/Effects';
import { Hud, HitmarkerKind } from '../hud/Hud';
import { Combatant } from './Combatant';

const TRAINING_BOTS = 5;
/** Characters farther than this from a ray skip the per-capsule tests. */
const CHARACTER_BOUNDS = 1.2;

interface RayHit
{
	distance: number;
	point: THREE.Vector3;
	normal: THREE.Vector3;
	target?: Combatant;
	zone?: HitZone;
}

const rayResult = new CANNON.RaycastResult();
const rayFrom = new CANNON.Vec3();
const rayTo = new CANNON.Vec3();
const origin = new THREE.Vector3();
const forward = new THREE.Vector3();
const direction = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const end = new THREE.Vector3();
const toCharacter = new THREE.Vector3();

/**
 * Combat layer of the world: gives every character a Combatant, resolves hitscan shots
 * against the level and hitboxes, applies damage, handles deaths and respawns,
 * and feeds effects and the HUD.
 */
export class CombatSystem implements IUpdatable
{
	// After the camera (4), so the player's shots use this frame's view
	public updateOrder: number = 4.5;

	public readonly effects: Effects;
	public readonly hud: Hud;

	private world: World;
	private combatants = new Map<Character, Combatant>();
	private botModel: Promise<GLTF>;
	private botsSpawnedFor: Character;
	private botCount: number = 0;

	constructor(world: World)
	{
		this.world = world;
		this.effects = new Effects(world.graphicsWorld);
		this.hud = new Hud();

		world.registerUpdatable(this.effects);
		world.registerUpdatable(this);

		// Right mouse button aims, keep the context menu out of the way
		world.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
	}

	/** The character the player controls on foot, if any. */
	public get player(): Character | undefined
	{
		const receiver = this.world.inputManager.inputReceiver;
		return receiver instanceof Character ? receiver : undefined;
	}

	public update(timeStep: number): void
	{
		this.syncCombatants();

		const player = this.player;
		if (player !== undefined && player.controlledObject === undefined) this.ensureTrainingBots(player);

		for (const combatant of this.combatants.values())
		{
			combatant.health.update(timeStep);

			if (combatant.dead)
			{
				combatant.respawnTimer -= timeStep;
				if (combatant.respawnTimer <= 0) combatant.respawn();
				continue;
			}

			const isPlayer = combatant.character === player;
			if (isPlayer) this.updatePlayerAim(combatant);

			for (const shot of combatant.updateWeapon(timeStep))
			{
				this.fire(combatant, shot, isPlayer);
			}
		}

		this.updateHud(player);
	}

	/** Gives new characters a Combatant and forgets removed ones. */
	private syncCombatants(): void
	{
		for (const character of this.world.characters)
		{
			if (this.combatants.has(character)) continue;

			const name = character === this.player ? 'You' : `Bot ${++this.botCount}`;
			const combatant = new Combatant(character, name, this.world.graphicsWorld, (material) => this.world.sky.csm.setupMaterial(material));
			character.combat = combatant;
			this.combatants.set(character, combatant);
		}

		for (const [character, combatant] of this.combatants)
		{
			if (this.world.characters.includes(character)) continue;

			combatant.dispose(this.world.graphicsWorld);
			character.combat = undefined;
			this.combatants.delete(character);
		}
	}

	/** Points the player's weapon at whatever is under the crosshair. */
	private updatePlayerAim(combatant: Combatant): void
	{
		const camera = this.world.camera;
		camera.getWorldPosition(origin);
		camera.getWorldDirection(forward);

		const hit = this.raycast(this.rayStart(combatant, origin, forward), forward, 300, combatant);
		combatant.aimPoint.copy(hit?.point ?? end.copy(origin).addScaledVector(forward, 300));
	}

	/** Start rays at the character, not the camera, so nothing behind the player is hit. */
	private rayStart(combatant: Combatant, from: THREE.Vector3, along: THREE.Vector3): THREE.Vector3
	{
		combatant.character.getWorldPosition(toCharacter).sub(from);
		return from.addScaledVector(along, Math.max(0, toCharacter.dot(along)));
	}

	private fire(shooter: Combatant, shot: Shot, isPlayer: boolean): void
	{
		const def = shooter.weapon.def;

		// The player shoots along the crosshair; other combatants from the muzzle at their aim point
		shooter.muzzle.getWorldPosition(muzzle);
		if (isPlayer)
		{
			this.world.camera.getWorldPosition(origin);
			this.world.camera.getWorldDirection(forward);
			this.rayStart(shooter, origin, forward);
		}
		else
		{
			origin.copy(muzzle);
			forward.subVectors(shooter.aimPoint, muzzle).normalize();
		}

		let bestMarker: HitmarkerKind = undefined;
		for (let i = 0; i < def.pellets; i++)
		{
			randomInCone(forward, shot.spread, direction);
			if (def.pellets > 1) randomInCone(direction, def.pelletSpread ?? 0, direction);

			const hit = this.raycast(origin, direction, def.range, shooter);
			end.copy(hit?.point ?? end.copy(origin).addScaledVector(direction, def.range));
			if (i < 4) this.effects.tracer(muzzle, end);
			if (hit === undefined) continue;

			this.effects.impact(hit.point, hit.normal, hit.target ? 'flesh' : 'world');
			if (hit.target === undefined) continue;

			const marker = this.damage(hit.target, shooter, damageForHit(def, hit.distance, hit.zone), hit.zone, def, direction);
			if (marker === 'kill' || (marker === 'headshot' && bestMarker !== 'kill') || bestMarker === undefined) bestMarker = marker;
		}

		this.effects.muzzleFlash(muzzle, forward, def.pellets > 1 ? 0.22 : 0.16);

		if (isPlayer)
		{
			if (bestMarker !== undefined) this.hud.showHitmarker(bestMarker);
			this.world.cameraOperator.addRecoil(shot.recoilPitch, shot.recoilYaw);
			this.world.cameraOperator.addShake(0.1 + shot.recoilPitch * 0.1);
		}
	}

	/** Applies damage and returns the hitmarker the shooter should see. */
	private damage(target: Combatant, attacker: Combatant, amount: number, zone: HitZone, def: WeaponDef, direction: THREE.Vector3): HitmarkerKind
	{
		const taken = target.health.damage(amount);

		if (target.character === this.player)
		{
			this.hud.damageFlash(taken / 50);
			this.world.cameraOperator.addShake(0.3);
		}

		if (!target.health.isDead) return zone === 'head' ? 'headshot' : 'hit';

		target.die();
		const involvesPlayer = attacker.character === this.player || target.character === this.player;
		this.hud.addKill(attacker.name, target.name, def.name, zone === 'head', involvesPlayer);
		return 'kill';
	}

	/** Closest hit along a normalized ray: level geometry, vehicles or another character's hitbox. */
	private raycast(from: THREE.Vector3, dir: THREE.Vector3, range: number, ignore: Combatant): RayHit | undefined
	{
		let best: RayHit;

		rayFrom.set(from.x, from.y, from.z);
		rayTo.set(from.x + dir.x * range, from.y + dir.y * range, from.z + dir.z * range);
		rayResult.reset();
		const hasHit = this.world.physicsWorld.raycastClosest(rayFrom, rayTo, {
			collisionFilterMask: ~CollisionGroups.Characters,
			skipBackfaces: true,
		}, rayResult);
		if (hasHit)
		{
			const n = rayResult.hitNormalWorld;
			best = {
				distance: rayResult.distance,
				point: new THREE.Vector3(rayResult.hitPointWorld.x, rayResult.hitPointWorld.y, rayResult.hitPointWorld.z),
				normal: new THREE.Vector3(n.x, n.y, n.z),
			};
		}

		for (const combatant of this.combatants.values())
		{
			if (combatant === ignore || !combatant.isTargetable) continue;

			// Cheap reject: ray passes far from the character
			combatant.character.getWorldPosition(toCharacter).sub(from);
			const along = toCharacter.dot(dir);
			if (along < -CHARACTER_BOUNDS || toCharacter.addScaledVector(dir, -along).length() > CHARACTER_BOUNDS) continue;

			for (const capsule of combatant.hitboxes.capsules)
			{
				const t = intersectRayCapsule(from, dir, capsule);
				if (t === null || t > range || (best !== undefined && t >= best.distance)) continue;

				best = {
					distance: t,
					point: from.clone().addScaledVector(dir, t),
					normal: dir.clone().negate(),
					target: combatant,
					zone: capsule.zone,
				};
			}
		}

		return best;
	}

	private updateHud(player: Character | undefined): void
	{
		const combatant = player?.combat;
		const visible = combatant !== undefined && (combatant.isArmed || combatant.dead);
		this.hud.setVisible(visible);

		const camera = this.world.cameraOperator;
		camera.aimAmount = combatant?.aimAmount ?? 0;
		camera.aimZoom = combatant?.weapon.def.aimZoom ?? 1;
		if (!visible) return;

		const weapon = combatant.weapon;
		const spread = weapon.spread(combatant.aimAmount, player.velocity.lengthSq() > 0.01);
		const focal = (window.innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(this.world.camera.fov / 2));
		this.hud.setCrosshairGap(focal * Math.tan(THREE.MathUtils.degToRad(spread)) + 3, combatant.aimAmount > 0.5);
		this.hud.setWeapon(weapon.def.name, weapon.ammo, weapon.reserve, weapon.reloadProgress);
		this.hud.setHealth(combatant.health.current, combatant.health.config.max);
	}

	/** Scatters a few wandering bots around the player to have something to shoot at. */
	private ensureTrainingBots(player: Character): void
	{
		if (this.botsSpawnedFor === player) return;
		this.botsSpawnedFor = player;

		this.botModel ??= new GLTFLoader().loadAsync('assets/boxman.glb');
		this.botModel.then((gltf) =>
		{
			if (this.botsSpawnedFor !== player || player.world === undefined) return;

			const center = player.position;
			for (let i = 0; i < TRAINING_BOTS; i++)
			{
				const angle = (i / TRAINING_BOTS) * Math.PI * 2 + Math.random() * 0.5;
				const distance = 6 + Math.random() * 6;
				const x = center.x + Math.sin(angle) * distance;
				const z = center.z + Math.cos(angle) * distance;
				const ground = this.groundHeight(x, center.y, z);
				if (ground === undefined) continue;

				const bot = new Character({ scene: SkeletonUtils.clone(gltf.scene), animations: gltf.animations });
				bot.setPosition(x, ground + 0.6, z);
				bot.setOrientation(new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle)), true);
				bot.setBehaviour(new RandomBehaviour(150));
				this.world.add(bot);
			}
		});
	}

	private groundHeight(x: number, y: number, z: number): number | undefined
	{
		rayFrom.set(x, y + 10, z);
		rayTo.set(x, y - 20, z);
		rayResult.reset();
		const hit = this.world.physicsWorld.raycastClosest(rayFrom, rayTo, { collisionFilterMask: CollisionGroups.Default, skipBackfaces: true }, rayResult);
		return hit ? rayResult.hitPointWorld.y : undefined;
	}
}

/** Random direction within a cone of the given half-angle (degrees) around axis. */
function randomInCone(axis: THREE.Vector3, halfAngle: number, target: THREE.Vector3): THREE.Vector3
{
	if (halfAngle <= 0) return target.copy(axis);

	// Uniform over the cone's base disk
	const radius = Math.tan(THREE.MathUtils.degToRad(halfAngle)) * Math.sqrt(Math.random());
	const theta = Math.random() * Math.PI * 2;

	right.crossVectors(axis, Math.abs(axis.y) < 0.99 ? THREE.Object3D.DEFAULT_UP : new THREE.Vector3(1, 0, 0)).normalize();
	up.crossVectors(right, axis);

	return target.copy(axis)
		.addScaledVector(right, Math.cos(theta) * radius)
		.addScaledVector(up, Math.sin(theta) * radius)
		.normalize();
}
