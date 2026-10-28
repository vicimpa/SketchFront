import type { WeaponDef } from '../weapons/types.ts';
import type { HitZone } from './hitbox.ts';

/** Damage of one bullet or pellet hitting a zone at a distance. */
export function damageForHit(weapon: WeaponDef, distance: number, zone: HitZone): number
{
	const { start, end, minMultiplier } = weapon.falloff;
	const progress = end > start ? Math.min(1, Math.max(0, (distance - start) / (end - start))) : 0;
	const falloff = 1 - progress * (1 - minMultiplier);

	return weapon.damage * falloff * weapon.zoneMultipliers[zone];
}

/** Shots to kill a target with full health in one zone, ignoring regen. */
export function shotsToKill(weapon: WeaponDef, distance: number, zone: HitZone, health = 100): number
{
	const perShot = damageForHit(weapon, distance, zone) * weapon.pellets;
	return Math.ceil(health / perShot);
}

/** Time to kill in seconds, assuming every shot lands. */
export function timeToKill(weapon: WeaponDef, distance: number, zone: HitZone, health = 100): number
{
	return (shotsToKill(weapon, distance, zone, health) - 1) * 60 / weapon.fireRate;
}
