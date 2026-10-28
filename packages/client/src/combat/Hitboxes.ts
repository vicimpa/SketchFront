import * as THREE from 'three';
import type { Capsule, HitZone } from '@sketchfront/shared';

/**
 * A capsule running along a bone: from the bone's origin along its +Y axis
 * (Blender bones point along +Y) for `length` in the bone's local units.
 */
interface BoneCapsule
{
	bone: string;
	length: number;
	radius: number;
	zone: HitZone;
}

// Fitted to boxman.glb, which is about 1 m tall. Radii are in world units.
const BOXMAN_LAYOUT: BoneCapsule[] = [
	{ bone: 'head', length: 0.75, radius: 0.12, zone: 'head' },
	{ bone: 'body_upper', length: 0.556, radius: 0.13, zone: 'torso' },
	{ bone: 'body_lower', length: 0.488, radius: 0.12, zone: 'torso' },
	{ bone: 'arm_upperL', length: 0.436, radius: 0.045, zone: 'limb' },
	{ bone: 'arm_lowerL', length: 0.436, radius: 0.045, zone: 'limb' },
	{ bone: 'arm_upperR', length: 0.436, radius: 0.045, zone: 'limb' },
	{ bone: 'arm_lowerR', length: 0.436, radius: 0.045, zone: 'limb' },
	{ bone: 'leg_upperL', length: 0.436, radius: 0.06, zone: 'limb' },
	{ bone: 'leg_lowerL', length: 0.436, radius: 0.055, zone: 'limb' },
	{ bone: 'leg_upperR', length: 0.436, radius: 0.06, zone: 'limb' },
	{ bone: 'leg_lowerR', length: 0.436, radius: 0.055, zone: 'limb' },
];

const tail = new THREE.Vector3();
const head = new THREE.Vector3();

/** Hitbox capsules that follow a character's animated skeleton. */
export class Hitboxes
{
	public readonly capsules: Capsule[];
	private bones: THREE.Object3D[];
	private layout: BoneCapsule[];

	constructor(model: THREE.Object3D, layout: BoneCapsule[] = BOXMAN_LAYOUT)
	{
		this.layout = layout.filter((entry) => model.getObjectByName(entry.bone) !== undefined);
		this.bones = this.layout.map((entry) => model.getObjectByName(entry.bone));
		this.capsules = this.layout.map((entry) => ({
			a: { x: 0, y: 0, z: 0 },
			b: { x: 0, y: 0, z: 0 },
			radius: entry.radius,
			zone: entry.zone,
		}));
	}

	/** Moves the capsules to the current pose. Bone world matrices must be up to date. */
	public update(): void
	{
		for (let i = 0; i < this.bones.length; i++)
		{
			const bone = this.bones[i];
			const capsule = this.capsules[i];

			head.setFromMatrixPosition(bone.matrixWorld);
			tail.set(0, this.layout[i].length, 0).applyMatrix4(bone.matrixWorld);

			capsule.a.x = head.x; capsule.a.y = head.y; capsule.a.z = head.z;
			capsule.b.x = tail.x; capsule.b.y = tail.y; capsule.b.z = tail.z;
		}
	}
}
