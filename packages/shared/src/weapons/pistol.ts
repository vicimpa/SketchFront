import type { WeaponDef } from './types.ts';

export const pistol: WeaponDef = {
	id: 'pistol',
	name: 'Pistol',
	slot: 'secondary',

	damage: 34,
	falloff: { start: 15, end: 40, minMultiplier: 0.6 },
	zoneMultipliers: { head: 2, torso: 1, limb: 0.8 },
	range: 150,

	fireRate: 400,
	fireMode: 'semi',
	pellets: 1,

	spread: { hip: 2, aim: 0.6, moving: 1.5, perShot: 0.8, maxBloom: 3, recovery: 10 },
	recoil: {
		pattern: [[1.2, 0]],
		yawJitter: 0.3,
		aimMultiplier: 0.8,
		resetTime: 0.3,
	},

	magazine: 12,
	reserve: 48,
	reload: { tactical: 1.4, empty: 1.8 },
	equipTime: 0.3,

	aimTime: 0.15,
	aimZoom: 1.25,
	moveSpeed: 1,
};
