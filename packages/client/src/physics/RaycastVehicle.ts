import * as CANNON from 'cannon-es';

const up = new CANNON.Vec3();
const right = new CANNON.Vec3();
const localPosition = new CANNON.Vec3();
const steeringOrn = new CANNON.Quaternion();
const rotatingOrn = new CANNON.Quaternion();

export class RaycastVehicle extends CANNON.RaycastVehicle
{
	private lastRotations: number[] = [];
	private lastSuspensionLengths: number[] = [];

	/**
	 * Skips the update while the chassis sleeps, as Sketchbook's patched cannon.js did.
	 * Otherwise the suspension impulse wakes the chassis every step and parked vehicles never sleep.
	 */
	public updateVehicle(timeStep: number): void
	{
		if (this.chassisBody.sleepState === CANNON.Body.SLEEPING) return;

		for (let i = 0; i < this.wheelInfos.length; i++)
		{
			this.lastRotations[i] = this.wheelInfos[i].rotation;
			this.lastSuspensionLengths[i] = this.wheelInfos[i].suspensionLength;
		}

		super.updateVehicle(timeStep);
	}

	/**
	 * Wheel transform for rendering. Built from the chassis pose interpolated between physics
	 * steps, the same pose the vehicle model is drawn with, so wheels stay put relative to the body.
	 * Wheel spin and suspension travel are interpolated too. Physics state is left untouched.
	 */
	public getInterpolatedWheelTransform(wheelIndex: number, t: number, position: CANNON.Vec3, quaternion: CANNON.Quaternion): void
	{
		const wheel = this.wheelInfos[wheelIndex];
		const chassis = this.chassisBody;
		const rotation = lerp(this.lastRotations[wheelIndex] ?? wheel.rotation, wheel.rotation, t);
		const suspensionLength = lerp(this.lastSuspensionLengths[wheelIndex] ?? wheel.suspensionLength, wheel.suspensionLength, t);

		// Steer around the up axis, then spin around the axle
		wheel.directionLocal.scale(-1, up);
		right.copy(wheel.axleLocal);
		right.normalize();
		steeringOrn.setFromAxisAngle(up, wheel.steering);
		rotatingOrn.setFromAxisAngle(right, rotation);
		chassis.interpolatedQuaternion.mult(steeringOrn, quaternion);
		quaternion.mult(rotatingOrn, quaternion);
		quaternion.normalize();

		// Hang the wheel from its connection point along the suspension direction
		wheel.directionLocal.scale(suspensionLength, localPosition);
		localPosition.vadd(wheel.chassisConnectionPointLocal, localPosition);
		chassis.interpolatedQuaternion.vmult(localPosition, position);
		position.vadd(chassis.interpolatedPosition, position);
	}
}

function lerp(from: number, to: number, t: number): number
{
	return from + (to - from) * t;
}
