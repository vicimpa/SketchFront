import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersectRayCapsule, type Capsule } from './hitbox.ts';

// Vertical capsule from y=0 to y=2 with radius 0.5 at the origin
const capsule: Capsule = { a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 2, z: 0 }, radius: 0.5, zone: 'torso' };
const forward = { x: 0, y: 0, z: 1 };

test('ray hits the side of the capsule', () => {
	const t = intersectRayCapsule({ x: 0, y: 1, z: -5 }, forward, capsule);
	assert.ok(t !== null && Math.abs(t - 4.5) < 1e-9);
});

test('ray hits the rounded end cap', () => {
	const t = intersectRayCapsule({ x: 0, y: 2.3, z: -5 }, forward, capsule);
	assert.ok(t !== null && Math.abs(t - (5 - Math.sqrt(0.25 - 0.09))) < 1e-9);
});

test('ray above the cap misses', () => {
	assert.equal(intersectRayCapsule({ x: 0, y: 2.6, z: -5 }, forward, capsule), null);
});

test('ray beside the capsule misses', () => {
	assert.equal(intersectRayCapsule({ x: 0.6, y: 1, z: -5 }, forward, capsule), null);
});

test('ray pointing away misses', () => {
	assert.equal(intersectRayCapsule({ x: 0, y: 1, z: -5 }, { x: 0, y: 0, z: -1 }, capsule), null);
});

test('ray starting inside hits at 0', () => {
	assert.equal(intersectRayCapsule({ x: 0, y: 1, z: 0 }, forward, capsule), 0);
});

test('ray along the axis enters through the cap', () => {
	const t = intersectRayCapsule({ x: 0, y: 10, z: 0 }, { x: 0, y: -1, z: 0 }, capsule);
	assert.ok(t !== null && Math.abs(t - 7.5) < 1e-9);
});
