import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader, GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { damageForHit, intersectRayCapsule, type HitZone, type Shot, type WeaponDef } from '@sketchfront/shared';
import { World } from '../world/World';
import { Character } from '../characters/Character';
import { BotBrain } from '../ai/BotBrain';
import { CollisionGroups } from '../enums/CollisionGroups';
import { IUpdatable } from '../interfaces/IUpdatable';
import { Effects } from '../fx/Effects';
import { Hud, HitmarkerKind } from '../hud/Hud';
import { Combatant } from './Combatant';

/** Wandering bots around the player; `?bots=N` in the URL overrides it, `?bots=0` turns them off. */
const TRAINING_BOTS = Number(new URLSearchParams(window.location.search).get('bots') ?? 5);
/** Bots allowed to shoot at the same target at once; the rest reposition and wait. */
const ATTACKERS_PER_TARGET = 2;
/** Bots come back at least this far from the player. */
const BOT_RESPAWN_DISTANCE: [min: number, max: number] = [18, 35];
const PLAYER_TEAM = 'player';
const BOT_TEAM = 'bots';
/** Characters farther than this from a ray skip the per-capsule tests. */
const CHARACTER_BOUNDS = 1.2;

interface RayHit
{
	distance: number;
	point: THREE.Vector3;
	normal: THREE.Vector3;
	target?: Combatant;
	zone?: HitZone;
}

const rayResult = new CANNON.RaycastResult();
const rayFrom = new CANNON.Vec3();
const rayTo = new CANNON.Vec3();
const origin = new THREE.Vector3();
const forward = new THREE.Vector3();
const direction = new THREE.Vector3();
const right = new THREE.Vector3();
const up = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const end = new THREE.Vector3();
const toCharacter = new THREE.Vector3();

/**
 * Combat layer of the world: gives every character a Combatant, resolves hitscan shots
 * against the level and hitboxes, applies damage, handles deaths and respawns,
 * and feeds effects and the HUD.
 */
export class CombatSystem implements IUpdatable
{
	// After the camera (4), so the player's shots use this frame's view
	public updateOrder: number = 4.5;

	public readonly effects: Effects;
	public readonly hud: Hud;

	private world: World;
	private combatants = new Map<Character, Combatant>();
	private attackers = new Map<Combatant, Set<Combatant>>();
	private botModel: Promise<GLTF>;
	private botsSpawnedFor: Character;
	private botCount: number = 0;

	constructor(world: World)
	{
		this.world = world;
		this.effects = new Effects(world.graphicsWorld);
		this.hud = new Hud();

		world.registerUpdatable(this.effects);
		world.registerUpdatable(this);

		// Right mouse button aims, keep the context menu out of the way
		world.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
	}

	public getCombatants(): IterableIterator<Combatant>
	{
		return this.combatants.values();
	}

	/** Claims one of the target's attack slots; false when enough others are already shooting at it. */
	public tryAcquireAttack(attacker: Combatant, target: Combatant): boolean
	{
		let set = this.attackers.get(target);
		if (set === undefined) this.attackers.set(target, set = new Set());

		// Drop attackers that died or stopped fighting without letting go
		for (const other of set) if (other.dead || other.character.world === undefined) set.delete(other);

		if (set.has(attacker)) return true;
		if (set.size >= ATTACKERS_PER_TARGET) return false;
		set.add(attacker);
		return true;
	}

	public releaseAttack(attacker: Combatant, target: Combatant): void
	{
		this.attackers.get(target)?.delete(attacker);
	}

	/** The character the player controls on foot, if any. */
	public get player(): Character | undefined
	{
		const receiver = this.world.inputManager.inputReceiver;
		return receiver instanceof Character ? receiver : undefined;
	}

	public update(timeStep: number): void
	{
		this.syncCombatants();

		const player = this.player;
		if (player !== undefined && player.controlledObject === undefined) this.ensureTrainingBots(player);

		for (const combatant of this.combatants.values())
		{
			combatant.health.update(timeStep);
			combatant.protectedFor = Math.max(0, combatant.protectedFor - timeStep);

			const isPlayer = combatant.character === player;
			if (combatant.dead)
			{
				if (isPlayer) this.updateDeathCamera(combatant);
				combatant.respawnTimer -= timeStep;
				if (combatant.respawnTimer <= 0) combatant.respawn(isPlayer ? undefined : this.botRespawnPoint());
				continue;
			}

			if (isPlayer) this.updatePlayerAim(combatant);

			for (const shot of combatant.updateWeapon(timeStep))
			{
				this.fire(combatant, shot, isPlayer);
			}
		}

		this.updateHud(player);
	}

	/** Gives new characters a Combatant and forgets removed ones. */
	private syncCombatants(): void
	{
		for (const character of this.world.characters)
		{
			if (this.combatants.has(character)) continue;

			const isPlayer = character === this.player;
			const name = isPlayer ? 'You' : `Bot ${++this.botCount}`;
			const combatant = new Combatant(character, name, isPlayer ? PLAYER_TEAM : BOT_TEAM, this.world.graphicsWorld, (material) => this.world.sky.csm.setupMaterial(material));
			character.combat = combatant;
			this.combatants.set(character, combatant);
		}

		for (const [character, combatant] of this.combatants)
		{
			if (this.world.characters.includes(character)) continue;

			combatant.dispose(this.world.graphicsWorld);
			character.combat = undefined;
			this.combatants.delete(character);
			this.attackers.delete(combatant);
			for (const set of this.attackers.values()) set.delete(combatant);
		}
	}

	/** Points the player's weapon at whatever is under the crosshair. */
	private updatePlayerAim(combatant: Combatant): void
	{
		const camera = this.world.camera;
		camera.getWorldPosition(origin);
		camera.getWorldDirection(forward);

		const hit = this.raycast(this.rayStart(combatant, origin, forward), forward, 300, combatant);
		combatant.aimPoint.copy(hit?.point ?? end.copy(origin).addScaledVector(forward, 300));
	}

	/** Start rays at the character, not the camera, so nothing behind the player is hit. */
	private rayStart(combatant: Combatant, from: THREE.Vector3, along: THREE.Vector3): THREE.Vector3
	{
		combatant.character.getWorldPosition(toCharacter).sub(from);
		return from.addScaledVector(along, Math.max(0, toCharacter.dot(along)));
	}

	private fire(shooter: Combatant, shot: Shot, isPlayer: boolean): void
	{
		const def = shooter.weapon.def;

		// The player shoots along the crosshair; other combatants from the muzzle at their aim point
		shooter.muzzle.getWorldPosition(muzzle);
		if (isPlayer)
		{
			this.world.camera.getWorldPosition(origin);
			this.world.camera.getWorldDirection(forward);
			this.rayStart(shooter, origin, forward);
		}
		else
		{
			origin.copy(muzzle);
			forward.subVectors(shooter.aimPoint, muzzle).normalize();
		}

		let bestMarker: HitmarkerKind = undefined;
		for (let i = 0; i < def.pellets; i++)
		{
			randomInCone(forward, shot.spread, direction);
			if (def.pellets > 1) randomInCone(direction, def.pelletSpread ?? 0, direction);

			const hit = this.raycast(origin, direction, def.range, shooter);
			end.copy(hit?.point ?? end.copy(origin).addScaledVector(direction, def.range));
			if (i < 4) this.effects.tracer(muzzle, end);
			if (hit === undefined) continue;

			this.effects.impact(hit.point, hit.normal, hit.target ? 'flesh' : 'world');
			if (hit.target === undefined) continue;

			const marker = this.damage(hit.target, shooter, damageForHit(def, hit.distance, hit.zone), hit.zone, def);
			if (marker === 'kill' || (marker === 'headshot' && bestMarker !== 'kill') || bestMarker === undefined) bestMarker = marker;
		}

		this.effects.muzzleFlash(muzzle, forward, def.pellets > 1 ? 0.22 : 0.16);

		if (isPlayer)
		{
			if (bestMarker !== undefined) this.hud.showHitmarker(bestMarker);
			this.world.cameraOperator.addRecoil(shot.recoilPitch, shot.recoilYaw);
			this.world.cameraOperator.addShake(0.1 + shot.recoilPitch * 0.1);
		}
	}

	/** Applies damage and returns the hitmarker the shooter should see. */
	private damage(target: Combatant, attacker: Combatant, amount: number, zone: HitZone, def: WeaponDef): HitmarkerKind
	{
		const taken = target.protectedFor > 0 ? 0 : target.health.damage(amount);

		if (target.character === this.player)
		{
			this.hud.damageFlash(taken / 50);
			this.hud.damageDirection(this.screenAngleTo(attacker.character.position));
			this.world.cameraOperator.addShake(0.3);
		}

		const behaviour = target.character.behaviour;
		if (behaviour instanceof BotBrain) behaviour.onDamaged(attacker);

		if (!target.health.isDead) return zone === 'head' ? 'headshot' : 'hit';

		target.die(attacker);
		const involvesPlayer = attacker.character === this.player || target.character === this.player;
		this.hud.addKill(attacker.name, target.name, def.name, zone === 'head', involvesPlayer);
		return 'kill';
	}

	/** Closest hit along a normalized ray: level geometry, vehicles or another character's hitbox. */
	private raycast(from: THREE.Vector3, dir: THREE.Vector3, range: number, ignore: Combatant): RayHit | undefined
	{
		let best: RayHit;

		rayFrom.set(from.x, from.y, from.z);
		rayTo.set(from.x + dir.x * range, from.y + dir.y * range, from.z + dir.z * range);
		rayResult.reset();
		const hasHit = this.world.physicsWorld.raycastClosest(rayFrom, rayTo, {
			collisionFilterMask: ~CollisionGroups.Characters,
			skipBackfaces: true,
		}, rayResult);
		if (hasHit)
		{
			const n = rayResult.hitNormalWorld;
			best = {
				distance: rayResult.distance,
				point: new THREE.Vector3(rayResult.hitPointWorld.x, rayResult.hitPointWorld.y, rayResult.hitPointWorld.z),
				normal: new THREE.Vector3(n.x, n.y, n.z),
			};
		}

		for (const combatant of this.combatants.values())
		{
			if (combatant === ignore || !combatant.isTargetable) continue;

			// Cheap reject: ray passes far from the character
			combatant.character.getWorldPosition(toCharacter).sub(from);
			const along = toCharacter.dot(dir);
			if (along < -CHARACTER_BOUNDS || toCharacter.addScaledVector(dir, -along).length() > CHARACTER_BOUNDS) continue;

			for (const capsule of combatant.hitboxes.capsules)
			{
				const t = intersectRayCapsule(from, dir, capsule);
				if (t === null || t > range || (best !== undefined && t >= best.distance)) continue;

				best = {
					distance: t,
					point: from.clone().addScaledVector(dir, t),
					normal: dir.clone().negate(),
					target: combatant,
					zone: capsule.zone,
				};
			}
		}

		return best;
	}

	/** Angle of a world point around the screen center: 0 straight ahead, positive to the right. */
	private screenAngleTo(point: THREE.Vector3): number
	{
		this.world.camera.getWorldDirection(forward).setY(0).normalize();
		direction.subVectors(point, this.world.camera.position).setY(0).normalize();
		right.crossVectors(forward, THREE.Object3D.DEFAULT_UP);
		return Math.atan2(direction.dot(right), direction.dot(forward));
	}

	/** While the player is down, swing the camera around to face the killer. */
	private updateDeathCamera(player: Combatant): void
	{
		const killer = player.killer;
		this.hud.setDeathMessage(`Killed by ${killer?.name ?? 'the world'}`, player.respawnTimer);
		if (killer === undefined || killer === player) return;

		player.character.getWorldPosition(origin);
		direction.subVectors(killer.character.position, origin).normalize();
		const camera = this.world.cameraOperator;
		const theta = THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z));
		const delta = ((theta - camera.theta) % 360 + 540) % 360 - 180;
		camera.theta += delta * 0.08;
		camera.phi += (10 - camera.phi) * 0.08;
	}

	/** A random reachable point away from the player, as a character position. */
	private botRespawnPoint(): THREE.Vector3 | undefined
	{
		const player = this.player;
		const navigation = this.world.navigation;
		if (player === undefined || navigation === undefined) return undefined;

		for (let attempt = 0; attempt < 10; attempt++)
		{
			const point = navigation.randomPointAround(player.position, BOT_RESPAWN_DISTANCE[1]);
			if (point !== null && point.distanceTo(player.position) >= BOT_RESPAWN_DISTANCE[0]) return point.setY(point.y + 0.6);
		}
		return undefined;
	}

	private updateHud(player: Character | undefined): void
	{
		const combatant = player?.combat;
		const visible = combatant !== undefined && (combatant.isArmed || combatant.dead);
		this.hud.setVisible(visible);
		if (combatant === undefined || !combatant.dead) this.hud.setDeathMessage(null);

		const camera = this.world.cameraOperator;
		camera.aimAmount = combatant?.aimAmount ?? 0;
		camera.aimZoom = combatant?.weapon.def.aimZoom ?? 1;
		if (!visible) return;

		const weapon = combatant.weapon;
		const spread = weapon.spread(combatant.aimAmount, player.velocity.lengthSq() > 0.01);
		const focal = (window.innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(this.world.camera.fov / 2));
		this.hud.setCrosshairGap(focal * Math.tan(THREE.MathUtils.degToRad(spread)) + 3, combatant.aimAmount > 0.5);
		this.hud.setWeapon(weapon.def.name, weapon.ammo, weapon.reserve, weapon.reloadProgress);
		this.hud.setHealth(combatant.health.current, combatant.health.config.max);
	}

	/** Scatters a few wandering bots around the player to have something to shoot at. */
	/** Scatters a few bots on the navmesh some way off from the player. */
	private ensureTrainingBots(player: Character): void
	{
		// Bots need the navmesh to find spawn points and to walk
		if (this.botsSpawnedFor === player || this.world.navigation === undefined || !(TRAINING_BOTS > 0)) return;
		this.botsSpawnedFor = player;

		this.botModel ??= new GLTFLoader().loadAsync('assets/boxman.glb');
		this.botModel.then((gltf) =>
		{
			if (this.botsSpawnedFor !== player || player.world === undefined) return;

			for (let i = 0; i < TRAINING_BOTS; i++)
			{
				const position = this.botRespawnPoint();
				if (position === undefined) continue;

				const bot = new Character({ scene: SkeletonUtils.clone(gltf.scene), animations: gltf.animations });
				bot.setPosition(position.x, position.y, position.z);
				bot.setOrientation(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5), true);
				bot.setBehaviour(new BotBrain());
				this.world.add(bot);
			}
		});
	}
}

/** Random direction within a cone of the given half-angle (degrees) around axis. */
function randomInCone(axis: THREE.Vector3, halfAngle: number, target: THREE.Vector3): THREE.Vector3
{
	if (halfAngle <= 0) return target.copy(axis);

	// Uniform over the cone's base disk
	const radius = Math.tan(THREE.MathUtils.degToRad(halfAngle)) * Math.sqrt(Math.random());
	const theta = Math.random() * Math.PI * 2;

	right.crossVectors(axis, Math.abs(axis.y) < 0.99 ? THREE.Object3D.DEFAULT_UP : new THREE.Vector3(1, 0, 0)).normalize();
	up.crossVectors(right, axis);

	return target.copy(axis)
		.addScaledVector(right, Math.cos(theta) * radius)
		.addScaledVector(up, Math.sin(theta) * radius)
		.normalize();
}
