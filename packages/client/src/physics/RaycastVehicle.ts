import * as CANNON from 'cannon-es';

/**
 * Skips the update while the chassis sleeps, as Sketchbook's patched cannon.js did.
 * Otherwise the suspension impulse wakes the chassis every step and parked vehicles never sleep.
 */
export class RaycastVehicle extends CANNON.RaycastVehicle
{
	public updateVehicle(timeStep: number): void
	{
		if (this.chassisBody.sleepState === CANNON.Body.SLEEPING) return;
		super.updateVehicle(timeStep);
	}
}
