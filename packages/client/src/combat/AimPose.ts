import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const boneAxis = new THREE.Vector3();
const delta = new THREE.Quaternion();
const identity = new THREE.Quaternion();
const worldQuat = new THREE.Quaternion();
const parentQuat = new THREE.Quaternion();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const target = new THREE.Vector3();

export type HoldStyle = 'rifle' | 'pistol';

/**
 * Procedural upper-body pose for holding a weapon, layered over whatever the mixer played.
 * A stand-in until the characters get real weapon animations: legs keep animating,
 * torso, head and arms turn toward the aim direction.
 */
export class AimPose
{
	private spine: THREE.Object3D;
	private head: THREE.Object3D;
	private upperR: THREE.Object3D;
	private lowerR: THREE.Object3D;
	private upperL: THREE.Object3D;
	private lowerL: THREE.Object3D;
	/** Forearm length in the bone's local units. */
	private forearmLength: number = 0.436;

	constructor(model: THREE.Object3D)
	{
		this.spine = model.getObjectByName('body_upper');
		this.head = model.getObjectByName('head');
		this.upperR = model.getObjectByName('arm_upperR');
		this.lowerR = model.getObjectByName('arm_lowerR');
		this.upperL = model.getObjectByName('arm_upperL');
		this.lowerL = model.getObjectByName('arm_lowerL');
	}

	public get isSupported(): boolean
	{
		return [this.spine, this.head, this.upperR, this.lowerR, this.upperL, this.lowerL].every((bone) => bone !== undefined);
	}

	/**
	 * Poses the upper body. aim is the normalized world direction to point the weapon,
	 * facing the character's flat forward direction; weight blends with the animated pose.
	 */
	public apply(aim: THREE.Vector3, facing: THREE.Vector3, style: HoldStyle, weight: number): void
	{
		if (!this.isSupported || weight <= 0) return;

		forward.copy(facing).setY(0).normalize();
		right.crossVectors(forward, UP);
		const pitch = Math.asin(THREE.MathUtils.clamp(aim.y, -1, 1));

		// Lean the spine and tilt the head with the aim pitch
		pointBone(this.spine, tilt(-pitch * 0.35), weight);
		pointBone(this.head, tilt(-pitch * 0.5), weight);

		if (style === 'rifle')
		{
			pointBone(this.upperR, combine(aim, 0.75, UP, -0.55, right, -0.2), weight);
			pointBone(this.lowerR, aim, weight);
			pointBone(this.upperL, combine(aim, 0.85, UP, -0.4, right, 0.5), weight);
			pointBone(this.lowerL, combine(aim, 0.7, right, 0.65, UP, 0), weight);
		}
		else
		{
			pointBone(this.upperR, combine(aim, 1, right, -0.25, UP, -0.1), weight);
			pointBone(this.lowerR, aim, weight);
			pointBone(this.upperL, combine(aim, 1, right, 0.45, UP, -0.1), weight);
			pointBone(this.lowerL, combine(aim, 1, right, 0.3, UP, 0), weight);
		}
	}

	/** World position of the right hand, where the weapon grip goes. */
	public getHandPosition(target: THREE.Vector3): THREE.Vector3
	{
		return target.set(0, this.forearmLength, 0).applyMatrix4(this.lowerR.matrixWorld);
	}
}

function tilt(angle: number): THREE.Vector3
{
	return target.copy(UP).multiplyScalar(Math.cos(angle)).addScaledVector(forward, Math.sin(angle)).normalize();
}

function combine(a: THREE.Vector3, wa: number, b: THREE.Vector3, wb: number, c: THREE.Vector3, wc: number): THREE.Vector3
{
	return target.copy(a).multiplyScalar(wa).addScaledVector(b, wb).addScaledVector(c, wc).normalize();
}

/** Rotates a bone so its +Y axis points along a world direction. */
function pointBone(bone: THREE.Object3D, direction: THREE.Vector3, weight: number): void
{
	bone.getWorldQuaternion(worldQuat);
	boneAxis.set(0, 1, 0).applyQuaternion(worldQuat);

	delta.setFromUnitVectors(boneAxis, direction);
	if (weight < 1) delta.slerpQuaternions(identity, delta, weight);

	worldQuat.premultiply(delta);
	bone.parent.getWorldQuaternion(parentQuat);
	bone.quaternion.copy(parentQuat.invert().multiply(worldQuat));
	bone.updateMatrixWorld(true);
}
