import type { HitZone } from '../combat/hitbox.ts';

export type FireMode = 'auto' | 'semi' | 'burst';

/**
 * Everything balance-related about a weapon. Distances are in meters, angles in degrees,
 * times in seconds. Tune weapons here, never in code (docs/GAME_BRIEF.md §5).
 */
export interface WeaponDef
{
	id: string;
	name: string;
	slot: 'primary' | 'secondary';

	/** Damage of one bullet (or one pellet) before falloff and zone multipliers. */
	damage: number;
	/** Full damage up to start, linear drop to minMultiplier at end. */
	falloff: { start: number; end: number; minMultiplier: number };
	zoneMultipliers: Record<HitZone, number>;
	/** Hitscan reach; nothing is hit past this. */
	range: number;

	/** Rounds per minute. */
	fireRate: number;
	fireMode: FireMode;
	/** Rounds per trigger pull in burst mode. */
	burstCount?: number;
	/** Rays per shot; above 1 for shotguns. */
	pellets: number;
	/** Cone of the pellet pattern on top of the regular spread. */
	pelletSpread?: number;

	spread: {
		hip: number;
		aim: number;
		/** Multiplier while moving. */
		moving: number;
		/** Bloom added per shot. */
		perShot: number;
		maxBloom: number;
		/** Bloom recovered per second once firing stops. */
		recovery: number;
	};

	recoil: {
		/** Camera kick per shot as [pitch up, yaw right]; the last entries repeat. */
		pattern: [number, number][];
		/** Random yaw added on top of the pattern. */
		yawJitter: number;
		/** Multiplier while aiming down sights. */
		aimMultiplier: number;
		/** Pause after which the pattern starts over. */
		resetTime: number;
	};

	magazine: number;
	reserve: number;
	reload: { tactical: number; empty: number };
	equipTime: number;

	/** Time to fully aim down sights. */
	aimTime: number;
	/** FOV divisor while aiming. */
	aimZoom: number;
	/** Multiplier on character move speed while holding the weapon. */
	moveSpeed: number;
}
