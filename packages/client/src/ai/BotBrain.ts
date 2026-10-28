import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ICharacterAI } from '../interfaces/ICharacterAI';
import { Character } from '../characters/Character';
import { CollisionGroups } from '../enums/CollisionGroups';
import type { Combatant } from '../combat/Combatant';

type Mode = 'patrol' | 'engage' | 'search';

/** Tuning knobs for how dangerous a bot is. */
export interface BotSkill
{
	viewRange: number;
	/** Half-angle of the view cone, degrees. Anything closer than hearingRange is noticed anyway. */
	viewAngle: number;
	hearingRange: number;
	/** Seconds from spotting a target to the first shot. */
	reaction: [min: number, max: number];
	/** Aim error when a target is first acquired, meters at the target. */
	initialError: number;
	/** Aim error the bot settles to while tracking a target. */
	settledError: number;
	/** How fast the error settles, per second. */
	errorDecay: number;
	burst: [min: number, max: number];
	pause: [min: number, max: number];
	/** Distance the bot tries to keep while fighting. */
	preferredRange: [min: number, max: number];
}

export const DEFAULT_SKILL: BotSkill = {
	viewRange: 45,
	viewAngle: 70,
	hearingRange: 6,
	reaction: [0.7, 1.2],
	initialError: 2,
	settledError: 0.35,
	errorDecay: 0.6,
	burst: [0.15, 0.35],
	pause: [0.6, 1.2],
	preferredRange: [8, 20],
};

const PERCEPTION_INTERVAL = 0.2;
const LOSE_TARGET_AFTER = 1.2;
const SEARCH_TIME = 8;
const PATROL_RADIUS = 20;
const WAYPOINT_REACHED = 0.6;
const STUCK_TIME = 2;

const rayFrom = new CANNON.Vec3();
const rayTo = new CANNON.Vec3();
const rayResult = new CANNON.RaycastResult();
const eye = new THREE.Vector3();
const chest = new THREE.Vector3();
const toTarget = new THREE.Vector3();
const flatForward = new THREE.Vector3();

/**
 * Bot behaviour on foot: patrols the navmesh, fights the enemies it sees,
 * searches where it last saw them. Drives its character through the same
 * actions and combat stance a player uses.
 */
export class BotBrain implements ICharacterAI
{
	public character: Character;
	public mode: Mode = 'patrol';
	public target: Combatant;

	private skill: BotSkill;
	private random: () => number;
	private perceptionTimer: number = Math.random() * PERCEPTION_INTERVAL;
	private sinceSeen: number = Infinity;
	private readonly lastSeen = new THREE.Vector3();
	private readonly aimError = new THREE.Vector3();
	private reactionLeft: number = 0;
	private fireTimer: number = 0;
	private firing: boolean = false;
	private strafeTimer: number = 0;
	private strafe: -1 | 0 | 1 = 0;
	private searchTime: number = 0;

	private path: THREE.Vector3[] = [];
	private pathIndex: number = 0;
	private progressTimer: number = 0;
	private lastProgress = new THREE.Vector3();

	constructor(skill: BotSkill = DEFAULT_SKILL, random: () => number = Math.random)
	{
		this.skill = skill;
		this.random = random;
	}

	public update(timeStep: number): void
	{
		const combat = this.character.combat;
		if (combat === undefined || combat.dead || this.character.world === undefined) return;

		this.perceptionTimer -= timeStep;
		if (this.perceptionTimer <= 0)
		{
			this.perceptionTimer = PERCEPTION_INTERVAL;
			this.perceive(combat);
		}
		else
		{
			this.sinceSeen += timeStep;
		}

		switch (this.mode)
		{
			case 'engage': this.engage(combat, timeStep); break;
			case 'search': this.search(combat, timeStep); break;
			case 'patrol': this.patrol(combat, timeStep); break;
		}
	}

	/** Called when this bot gets hit: turn toward the shooter even if unseen. */
	public onDamaged(attacker: Combatant): void
	{
		if (this.mode === 'engage') return;
		this.target = attacker;
		attacker.character.getWorldPosition(this.lastSeen);
		this.startSearch();
	}

	private perceive(combat: Combatant): void
	{
		const seen = this.findVisibleEnemy(combat);
		if (seen === undefined)
		{
			this.sinceSeen += PERCEPTION_INTERVAL;
			if (this.mode === 'engage' && this.sinceSeen > LOSE_TARGET_AFTER) this.startSearch();
			return;
		}

		const newTarget = this.mode !== 'engage' || seen !== this.target;
		this.target = seen;
		this.sinceSeen = 0;
		seen.character.getWorldPosition(this.lastSeen);

		if (newTarget)
		{
			this.mode = 'engage';
			this.reactionLeft = this.range(this.skill.reaction);
			this.randomizeError(this.skill.initialError);
			this.firing = false;
			this.fireTimer = 0;
			this.path = [];
		}
	}

	private findVisibleEnemy(combat: Combatant): Combatant | undefined
	{
		const world = this.character.world;
		this.character.getWorldPosition(eye).y += 0.3;
		flatForward.copy(this.character.orientation).setY(0).normalize();
		const cosView = Math.cos(THREE.MathUtils.degToRad(this.skill.viewAngle));

		let best: Combatant;
		let bestDistance = Infinity;
		for (const other of world.combat.getCombatants())
		{
			if (other.team === combat.team || !other.isTargetable) continue;

			other.character.getWorldPosition(chest);
			toTarget.subVectors(chest, eye);
			const distance = toTarget.length();
			if (distance > this.skill.viewRange || distance >= bestDistance) continue;

			const inView = distance < this.skill.hearingRange
				|| flatForward.dot(toTarget.setY(0).normalize()) > cosView
				|| (this.mode === 'engage' && other === this.target);
			if (!inView || !this.hasLineOfSight(eye, chest, distance)) continue;

			best = other;
			bestDistance = distance;
		}
		return best;
	}

	private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3, distance: number): boolean
	{
		rayFrom.set(from.x, from.y, from.z);
		rayTo.set(to.x, to.y, to.z);
		rayResult.reset();
		const blocked = this.character.world.physicsWorld.raycastClosest(rayFrom, rayTo, {
			collisionFilterMask: CollisionGroups.Default,
			skipBackfaces: true,
		}, rayResult);
		return !blocked || rayResult.distance > distance - 0.3;
	}

	private engage(combat: Combatant, timeStep: number): void
	{
		const target = this.target;
		if (target === undefined || !target.isTargetable)
		{
			this.startPatrol(combat);
			return;
		}

		const combatSystem = this.character.world.combat;

		// Aim at the chest, with an error that settles while the bot keeps tracking
		target.character.getWorldPosition(chest);
		chest.y += 0.05;
		const settle = Math.exp(-this.skill.errorDecay * timeStep);
		const settledLength = this.skill.settledError;
		if (this.aimError.length() > settledLength) this.aimError.multiplyScalar(settle);
		combat.aimPoint.copy(chest).add(this.aimError);
		combat.aimHeld = true;

		// Shoot in bursts once the reaction time has passed and the target is in sight
		this.reactionLeft -= timeStep;
		const canShoot = this.reactionLeft <= 0 && this.sinceSeen < 0.4;
		this.fireTimer -= timeStep;
		if (!canShoot)
		{
			if (this.firing) combatSystem.releaseAttack(combat, target);
			this.firing = false;
			this.setTrigger(combat, false);
		}
		else if (this.fireTimer <= 0)
		{
			// A new burst needs one of the target's limited attack slots
			const wantsToFire = !this.firing && combatSystem.tryAcquireAttack(combat, target);
			if (this.firing) combatSystem.releaseAttack(combat, target);
			this.firing = wantsToFire;
			this.fireTimer = this.range(this.firing ? this.skill.burst : this.skill.pause);
			// Each new burst wobbles the aim a bit again
			if (this.firing) this.aimError.add(randomOffset(this.skill.settledError, this.random));
			this.setTrigger(combat, this.firing);
		}
		else if (this.firing && combat.weapon.def.fireMode === 'semi')
		{
			// Semi-automatics need the trigger released between shots
			this.setTrigger(combat, !combat.weapon.isTriggerHeld);
		}
		if (combat.weapon.ammo === 0 && !combat.weapon.isReloading) combat.weapon.startReload();

		// Keep at a comfortable range and strafe
		const distance = chest.distanceTo(this.character.position);
		const [near, far] = this.skill.preferredRange;
		this.strafeTimer -= timeStep;
		if (this.strafeTimer <= 0)
		{
			this.strafeTimer = 0.7 + this.random() * 1.2;
			const roll = this.random();
			this.strafe = roll < 0.4 ? -1 : roll < 0.8 ? 1 : 0;
		}
		this.press('up', distance > far);
		this.press('down', distance < near);
		this.press('left', this.strafe === -1);
		this.press('right', this.strafe === 1);
		this.press('run', false);
	}

	private search(combat: Combatant, timeStep: number): void
	{
		this.searchTime += timeStep;
		this.setTrigger(combat, false);
		combat.aimHeld = false;

		if (this.searchTime > SEARCH_TIME || !this.followPath(timeStep))
		{
			this.startPatrol(combat);
		}
	}

	private patrol(combat: Combatant, timeStep: number): void
	{
		this.setTrigger(combat, false);
		combat.aimHeld = false;

		if (!this.followPath(timeStep))
		{
			const navigation = this.character.world.navigation;
			const goal = navigation?.randomPointAround(combat.spawnPosition, PATROL_RADIUS);
			if (goal) this.setPath(goal);
			else this.stopMoving();
		}
	}

	private startSearch(): void
	{
		this.releaseAttack();
		this.mode = 'search';
		this.searchTime = 0;
		this.firing = false;
		this.setPath(this.lastSeen);
	}

	private startPatrol(combat: Combatant): void
	{
		this.releaseAttack();
		this.mode = 'patrol';
		this.target = undefined;
		this.path = [];
		this.setTrigger(combat, false);
		combat.aimHeld = false;
	}

	private setPath(goal: THREE.Vector3): void
	{
		const navigation = this.character.world.navigation;
		this.path = navigation !== undefined ? navigation.findPath(this.character.position, goal) : [];
		this.pathIndex = 1;
		this.progressTimer = 0;
		this.lastProgress.copy(this.character.position);
	}

	/** Walks toward the next waypoint. Returns false once there is nowhere left to go. */
	private followPath(timeStep: number): boolean
	{
		if (this.pathIndex >= this.path.length)
		{
			this.stopMoving();
			return false;
		}

		const waypoint = this.path[this.pathIndex];
		toTarget.subVectors(waypoint, this.character.position).setY(0);
		if (toTarget.length() < WAYPOINT_REACHED)
		{
			this.pathIndex++;
			return true;
		}

		// Give up on a path that isn't getting anywhere, e.g. blocked by a vehicle
		this.progressTimer += timeStep;
		if (this.progressTimer > STUCK_TIME)
		{
			if (this.lastProgress.distanceTo(this.character.position) < 0.5)
			{
				this.path = [];
				this.stopMoving();
				return false;
			}
			this.progressTimer = 0;
			this.lastProgress.copy(this.character.position);
		}

		this.character.setViewVector(toTarget);
		this.press('up', true);
		this.press('down', false);
		this.press('left', false);
		this.press('right', false);
		this.press('run', this.mode === 'search');
		return true;
	}

	private releaseAttack(): void
	{
		const combat = this.character.combat;
		if (this.firing && combat !== undefined && this.target !== undefined) this.character.world?.combat.releaseAttack(combat, this.target);
		this.firing = false;
	}

	private stopMoving(): void
	{
		for (const action of ['up', 'down', 'left', 'right', 'run']) this.press(action, false);
	}

	private press(action: string, value: boolean): void
	{
		if (this.character.actions[action].isPressed !== value) this.character.triggerAction(action, value);
	}

	private setTrigger(combat: Combatant, pulled: boolean): void
	{
		if (pulled) combat.weapon.pullTrigger();
		else combat.weapon.releaseTrigger();
	}

	private randomizeError(radius: number): void
	{
		this.aimError.copy(randomOffset(radius, this.random));
	}

	private range([min, max]: [number, number]): number
	{
		return min + (max - min) * this.random();
	}
}

function randomOffset(radius: number, random: () => number): THREE.Vector3
{
	return new THREE.Vector3(random() * 2 - 1, (random() * 2 - 1) * 0.6, random() * 2 - 1).normalize().multiplyScalar(radius * (0.5 + random() * 0.5));
}
