import type { WeaponDef } from './types.ts';
import { rifle } from './rifle.ts';
import { pistol } from './pistol.ts';
import { shotgun } from './shotgun.ts';

export const WEAPONS: Record<string, WeaponDef> = { rifle, pistol, shotgun };

export { rifle, pistol, shotgun };
