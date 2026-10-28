import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Health } from './Health.ts';

test('damage is clamped and death is reported', () => {
	const health = new Health();
	assert.equal(health.damage(60), 60);
	assert.equal(health.damage(60), 40);
	assert.ok(health.isDead);
	assert.equal(health.damage(10), 0);
});

test('regeneration waits for the delay', () => {
	const health = new Health({ max: 100, regenDelay: 5, regenRate: 20 });
	health.damage(50);
	health.update(4);
	assert.equal(health.current, 50);
	health.update(1);
	health.update(1);
	assert.equal(health.current, 70);
	health.update(10);
	assert.equal(health.current, 100);
});
