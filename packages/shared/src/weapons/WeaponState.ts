import type { WeaponDef } from './types.ts';

/** One round leaving the barrel. */
export interface Shot
{
	/** Cone half-angle the bullet direction is randomized within, degrees. */
	spread: number;
	/** Camera kick for this round, degrees. */
	recoilPitch: number;
	recoilYaw: number;
}

/**
 * Runtime state of one carried weapon: ammo, fire timing, reload, bloom and recoil progress.
 * Pure logic shared by client prediction and the authoritative server.
 */
export class WeaponState
{
	public readonly def: WeaponDef;
	public ammo: number;
	public reserve: number;
	/** Extra spread from sustained fire, degrees. */
	public bloom: number = 0;

	private random: () => number;
	private cooldown: number = 0;
	private triggerHeld: boolean = false;
	private triggerQueued: boolean = false;
	private burstLeft: number = 0;
	private reloadLeft: number = 0;
	private equipLeft: number = 0;
	private recoilIndex: number = 0;
	private sinceShot: number = Infinity;

	constructor(def: WeaponDef, random: () => number = Math.random)
	{
		this.def = def;
		this.random = random;
		this.ammo = def.magazine;
		this.reserve = def.reserve;
	}

	public get isReloading(): boolean
	{
		return this.reloadLeft > 0;
	}

	public get isEquipping(): boolean
	{
		return this.equipLeft > 0;
	}

	public get isTriggerHeld(): boolean
	{
		return this.triggerHeld;
	}

	/** Reload progress from 0 to 1, or null when not reloading. */
	public get reloadProgress(): number | null
	{
		if (!this.isReloading) return null;
		const total = this.ammo > 0 ? this.def.reload.tactical : this.def.reload.empty;
		return 1 - this.reloadLeft / total;
	}

	public pullTrigger(): void
	{
		if (!this.triggerHeld) this.triggerQueued = true;
		this.triggerHeld = true;
	}

	public releaseTrigger(): void
	{
		this.triggerHeld = false;
	}

	/** Draws the weapon. Cancels a reload in progress. */
	public equip(): void
	{
		this.equipLeft = this.def.equipTime;
		this.reloadLeft = 0;
		this.triggerQueued = false;
		this.burstLeft = 0;
	}

	public startReload(): boolean
	{
		if (this.isReloading || this.ammo >= this.def.magazine || this.reserve <= 0) return false;

		this.reloadLeft = this.ammo > 0 ? this.def.reload.tactical : this.def.reload.empty;
		this.triggerQueued = false;
		this.burstLeft = 0;
		return true;
	}

	/** Current cone half-angle in degrees. aim goes from 0 (hip) to 1 (fully aimed). */
	public spread(aim: number, moving: boolean): number
	{
		const { hip, aim: aimed, moving: movingMultiplier } = this.def.spread;
		const base = hip + (aimed - hip) * aim;
		return base * (moving ? movingMultiplier : 1) + this.bloom;
	}

	/**
	 * Advances timers and returns the rounds fired during dt, in order.
	 * Several rounds come out in one call when dt is longer than the fire interval.
	 * With canFire false (weapon not raised yet) timers run and a trigger pull is kept
	 * until firing is allowed.
	 */
	public update(dt: number, aim: number, moving: boolean, canFire: boolean = true): Shot[]
	{
		const shots: Shot[] = [];

		this.sinceShot += dt;
		// Bloom only recovers once the weapon stops firing, so sustained fire builds it up
		if (this.sinceShot > 60 / this.def.fireRate * 1.5)
		{
			this.bloom = Math.max(0, this.bloom - this.def.spread.recovery * dt);
		}
		if (this.sinceShot > this.def.recoil.resetTime) this.recoilIndex = 0;

		if (this.equipLeft > 0)
		{
			this.equipLeft = Math.max(0, this.equipLeft - dt);
			this.cooldown = 0;
			return shots;
		}

		if (this.reloadLeft > 0)
		{
			this.reloadLeft -= dt;
			if (this.reloadLeft > 0) return shots;
			this.finishReload();
		}

		this.cooldown -= dt;
		while (canFire && this.cooldown <= 0 && this.wantsToFire())
		{
			if (this.ammo <= 0)
			{
				this.triggerQueued = false;
				this.burstLeft = 0;
				this.startReload();
				break;
			}

			if (this.def.fireMode === 'burst' && this.burstLeft === 0) this.burstLeft = this.def.burstCount ?? 3;
			this.burstLeft = Math.max(0, this.burstLeft - 1);
			this.triggerQueued = false;

			shots.push(this.fireRound(aim, moving));
			this.cooldown += 60 / this.def.fireRate;
		}

		// Idle time must not bank up into an instant volley later
		if (this.cooldown < 0) this.cooldown = 0;

		return shots;
	}

	private wantsToFire(): boolean
	{
		switch (this.def.fireMode)
		{
			case 'auto': return this.triggerHeld;
			case 'semi': return this.triggerQueued;
			case 'burst': return this.burstLeft > 0 || this.triggerQueued;
		}
	}

	private fireRound(aim: number, moving: boolean): Shot
	{
		const spread = this.spread(aim, moving);
		const { pattern, yawJitter, aimMultiplier } = this.def.recoil;

		// Past the end of the pattern, keep cycling its last four entries
		const tail = Math.min(4, pattern.length);
		const index = this.recoilIndex < pattern.length
			? this.recoilIndex
			: pattern.length - tail + (this.recoilIndex - pattern.length) % tail;
		const [pitch, yaw] = pattern[index];
		const kick = 1 + (aimMultiplier - 1) * aim;

		this.ammo--;
		this.recoilIndex++;
		this.sinceShot = 0;
		this.bloom = Math.min(this.def.spread.maxBloom, this.bloom + this.def.spread.perShot);

		return {
			spread,
			recoilPitch: pitch * kick,
			recoilYaw: (yaw + (this.random() * 2 - 1) * yawJitter) * kick,
		};
	}

	private finishReload(): void
	{
		this.reloadLeft = 0;
		const loaded = Math.min(this.def.magazine - this.ammo, this.reserve);
		this.ammo += loaded;
		this.reserve -= loaded;
	}
}
