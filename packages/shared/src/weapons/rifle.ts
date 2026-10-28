import type { WeaponDef } from './types.ts';

export const rifle: WeaponDef = {
	id: 'rifle',
	name: 'Assault Rifle',
	slot: 'primary',

	damage: 25,
	falloff: { start: 25, end: 60, minMultiplier: 0.75 },
	zoneMultipliers: { head: 2, torso: 1, limb: 0.8 },
	range: 300,

	fireRate: 600,
	fireMode: 'auto',
	pellets: 1,

	spread: { hip: 2.5, aim: 0.4, moving: 1.8, perShot: 0.35, maxBloom: 3, recovery: 8 },
	recoil: {
		pattern: [[0.55, 0.05], [0.6, 0.1], [0.6, -0.05], [0.6, 0.15], [0.55, 0.2], [0.5, -0.1], [0.45, 0.25], [0.45, -0.2]],
		yawJitter: 0.15,
		aimMultiplier: 0.7,
		resetTime: 0.3,
	},

	magazine: 30,
	reserve: 120,
	reload: { tactical: 2.0, empty: 2.6 },
	equipTime: 0.5,

	aimTime: 0.2,
	aimZoom: 1.25,
	moveSpeed: 0.95,
};
