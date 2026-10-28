import * as CANNON from 'cannon-es';

declare module 'cannon-es'
{
	interface Body
	{
		/** Called every physics step, after the world's 'preStep' event (vehicles update there). */
		preStep?: (body: Body) => void;
		/** Called every physics step, after the world's 'postStep' event. */
		postStep?: (body: Body) => void;
	}
}

/**
 * cannon-es dropped per-body preStep/postStep callbacks, which the character and vehicle
 * controllers are built on. This restores them with the semantics of Sketchbook's patched
 * cannon.js: the body is passed as the argument and callbacks run right after the event.
 */
export class PhysicsWorld extends CANNON.World
{
	/** Where rendering sits between the last two physics steps, the t that interpolated poses use. */
	public interpolationFactor: number = 0;

	public step(dt: number, timeSinceLastCalled?: number, maxSubSteps?: number): void
	{
		super.step(dt, timeSinceLastCalled, maxSubSteps);
		this.interpolationFactor = this.accumulator / dt;
	}

	public dispatchEvent(event: { type: string; [key: string]: any }): CANNON.EventTarget
	{
		super.dispatchEvent(event);

		if (event.type === 'preStep')
		{
			for (const body of this.bodies) body.preStep?.(body);
		}
		else if (event.type === 'postStep')
		{
			for (const body of this.bodies) body.postStep?.(body);
		}

		return this;
	}
}
