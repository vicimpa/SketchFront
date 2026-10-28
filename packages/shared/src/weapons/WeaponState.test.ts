import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeaponState } from './WeaponState.ts';
import { rifle, pistol } from './index.ts';

const frame = 1 / 60;

function run(weapon: WeaponState, seconds: number): number
{
	let shots = 0;
	for (let t = 0; t < seconds - 1e-9; t += frame) shots += weapon.update(frame, 0, false).length;
	return shots;
}

test('automatic fire follows the fire rate', () => {
	const weapon = new WeaponState(rifle, () => 0.5);
	weapon.pullTrigger();
	// 600 rpm: first round immediately, then one every 0.1 s
	assert.equal(run(weapon, 1), 10);
});

test('several rounds come out of one long update', () => {
	const weapon = new WeaponState(rifle, () => 0.5);
	weapon.pullTrigger();
	assert.equal(weapon.update(0.25, 0, false).length, 3);
});

test('semi-auto fires once per trigger pull', () => {
	const weapon = new WeaponState(pistol, () => 0.5);
	weapon.pullTrigger();
	assert.equal(run(weapon, 1), 1);
	weapon.releaseTrigger();
	weapon.pullTrigger();
	assert.equal(run(weapon, 1), 1);
});

test('an empty magazine reloads from reserve on trigger pull', () => {
	const weapon = new WeaponState(pistol, () => 0.5);
	for (let i = 0; i < pistol.magazine; i++)
	{
		weapon.pullTrigger();
		run(weapon, 0.2);
		weapon.releaseTrigger();
	}
	assert.equal(weapon.ammo, 0);
	weapon.pullTrigger();
	weapon.update(frame, 0, false);
	assert.ok(weapon.isReloading);
	run(weapon, pistol.reload.empty + 0.1);
	assert.equal(weapon.ammo, pistol.magazine);
	assert.equal(weapon.reserve, pistol.reserve - pistol.magazine);
});

test('equipping blocks fire and cancels a reload', () => {
	const weapon = new WeaponState(rifle, () => 0.5);
	weapon.ammo = 10;
	weapon.startReload();
	weapon.equip();
	assert.ok(!weapon.isReloading);
	weapon.pullTrigger();
	assert.equal(run(weapon, rifle.equipTime - 0.05), 0);
});

test('bloom grows while firing and recovers after', () => {
	const weapon = new WeaponState(rifle, () => 0.5);
	weapon.pullTrigger();
	run(weapon, 0.5);
	assert.ok(weapon.bloom > 0);
	weapon.releaseTrigger();
	run(weapon, 1);
	assert.equal(weapon.bloom, 0);
});

test('aiming reduces spread and recoil', () => {
	const hip = new WeaponState(rifle, () => 0.5);
	const aimed = new WeaponState(rifle, () => 0.5);
	assert.ok(aimed.spread(1, false) < hip.spread(0, false));
	hip.pullTrigger();
	aimed.pullTrigger();
	const [hipShot] = hip.update(frame, 0, false);
	const [aimedShot] = aimed.update(frame, 1, false);
	assert.ok(aimedShot.recoilPitch < hipShot.recoilPitch);
});
