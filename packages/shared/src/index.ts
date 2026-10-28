// Code shared by client and server. Weapons, modes and the network protocol live here
// (see docs/GAME_BRIEF.md §5–6); the server tick rates are fixed by §4.

export const GAME_NAME = 'Sketchfront';

export const SERVER_TICK_RATE = 30;
export const SNAPSHOT_RATE = 20;

export * from './math/vec3.ts';
export * from './combat/hitbox.ts';
export * from './combat/damage.ts';
export * from './combat/Health.ts';
export * from './weapons/types.ts';
export * from './weapons/WeaponState.ts';
export * from './weapons/index.ts';
