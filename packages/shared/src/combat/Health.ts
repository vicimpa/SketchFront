export interface HealthConfig
{
	max: number;
	/** Seconds without damage before regeneration starts; Infinity disables it. */
	regenDelay: number;
	/** Health per second while regenerating. */
	regenRate: number;
}

export const DEFAULT_HEALTH: HealthConfig = { max: 100, regenDelay: 5, regenRate: 25 };

export class Health
{
	public readonly config: HealthConfig;
	public current: number;
	private sinceDamage: number = Infinity;

	constructor(config: HealthConfig = DEFAULT_HEALTH)
	{
		this.config = config;
		this.current = config.max;
	}

	public get isDead(): boolean
	{
		return this.current <= 0;
	}

	/** Applies damage and returns how much was actually taken. */
	public damage(amount: number): number
	{
		if (this.isDead || amount <= 0) return 0;

		const taken = Math.min(this.current, amount);
		this.current -= taken;
		this.sinceDamage = 0;
		return taken;
	}

	public update(dt: number): void
	{
		if (this.isDead) return;

		this.sinceDamage += dt;

		// Only the part of dt past the delay counts
		const regenTime = Math.min(dt, this.sinceDamage - this.config.regenDelay);
		if (regenTime > 0)
		{
			this.current = Math.min(this.config.max, this.current + this.config.regenRate * regenTime);
		}
	}

	public reset(): void
	{
		this.current = this.config.max;
		this.sinceDamage = Infinity;
	}
}
