import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageForHit, timeToKill } from './damage.ts';
import { rifle, pistol, shotgun } from '../weapons/index.ts';

test('falloff keeps full damage up close and bottoms out far away', () => {
	assert.equal(damageForHit(rifle, 5, 'torso'), rifle.damage);
	assert.equal(damageForHit(rifle, 1000, 'torso'), rifle.damage * rifle.falloff.minMultiplier);
});

test('zone multipliers apply', () => {
	assert.equal(damageForHit(rifle, 5, 'head'), rifle.damage * rifle.zoneMultipliers.head);
});

// docs/GAME_BRIEF.md §5: rifle TTK 0.3–0.5 s at medium range
test('rifle time to kill at 30 m is within the brief target', () => {
	const ttk = timeToKill(rifle, 30, 'torso');
	assert.ok(ttk >= 0.3 && ttk <= 0.5, `rifle TTK ${ttk}`);
});

test('shotgun one-shots up close but not at range', () => {
	assert.equal(timeToKill(shotgun, 5, 'torso'), 0);
	assert.ok(timeToKill(shotgun, 30, 'torso') > 0);
});

test('pistol kills slower than the rifle at range', () => {
	assert.ok(timeToKill(pistol, 30, 'torso') > timeToKill(rifle, 30, 'torso'));
});
