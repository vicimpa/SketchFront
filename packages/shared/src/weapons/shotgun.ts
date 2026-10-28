import type { WeaponDef } from './types.ts';

export const shotgun: WeaponDef = {
	id: 'shotgun',
	name: 'Shotgun',
	slot: 'primary',

	damage: 16,
	falloff: { start: 8, end: 25, minMultiplier: 0.25 },
	zoneMultipliers: { head: 1.5, torso: 1, limb: 0.8 },
	range: 60,

	fireRate: 70,
	fireMode: 'semi',
	pellets: 8,
	pelletSpread: 3.5,

	spread: { hip: 2, aim: 1.2, moving: 1.3, perShot: 0, maxBloom: 0, recovery: 10 },
	recoil: {
		pattern: [[3, 0]],
		yawJitter: 0.6,
		aimMultiplier: 0.8,
		resetTime: 0.5,
	},

	magazine: 6,
	reserve: 30,
	reload: { tactical: 2.6, empty: 3.2 },
	equipTime: 0.6,

	aimTime: 0.25,
	aimZoom: 1.2,
	moveSpeed: 0.9,
};
