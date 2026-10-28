import * as THREE from 'three';
import { Health, WeaponState, WEAPONS, type Shot } from '@sketchfront/shared';
import { Character } from '../characters/Character';
import { Dead } from '../characters/character_states/Dead';
import { Idle } from '../characters/character_states/Idle';
import { ICharacterAI } from '../interfaces/ICharacterAI';
import { Hitboxes } from './Hitboxes';
import { AimPose, HoldStyle } from './AimPose';
import { createWeaponModel, WeaponModel } from './WeaponModels';

const LOADOUT = ['rifle', 'shotgun', 'pistol'];
const RESPAWN_DELAY = 3;
const SPAWN_PROTECTION = 2;
const DEATH_FALL_TIME = 0.35;
/** How long combat stance lasts after the last shot or after letting go of aim. */
const COMBAT_LINGER = 1.5;
/** Time to bring a holstered weapon up; it can't fire until then. */
const RAISE_TIME = 0.2;
/** Move speed in combat stance, as an arcade velocity target (walking is 0.8). */
const COMBAT_WALK_SPEED = 0.65;
const AIM_WALK_SPEED = 0.5;

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** Combat side of a character: health, weapons, hitboxes, death and respawn. */
export class Combatant
{
	public readonly character: Character;
	public readonly name: string;
	/** Combatants on the same team never target each other. */
	public team: string;
	/** Who landed the killing blow, for the death camera. */
	public killer: Combatant;
	public readonly health = new Health();
	public readonly hitboxes: Hitboxes;
	public weapons: WeaponState[];
	public currentIndex: number = 0;

	/** Aim button held. */
	public aimHeld: boolean = false;
	/** Smoothed aim from 0 (hip) to 1 (aimed down sights). */
	public aimAmount: number = 0;
	public sinceShot: number = Infinity;
	/** 0 with the weapon holstered, 1 with it raised and ready to fire. */
	public readiness: number = 0;
	private sinceCombatInput: number = Infinity;
	/** World point the weapon points at. */
	public readonly aimPoint = new THREE.Vector3();

	public dead: boolean = false;
	/** Seconds of spawn protection left; no damage is taken meanwhile. */
	public protectedFor: number = 0;
	public respawnTimer: number = 0;
	public readonly spawnPosition = new THREE.Vector3();
	public readonly spawnOrientation = new THREE.Vector3(0, 0, 1);

	private pose: AimPose;
	private models: WeaponModel[];
	private savedBehaviour: ICharacterAI;
	private deathTime: number = 0;

	constructor(character: Character, name: string, team: string, scene: THREE.Scene, setupMaterial: (material: THREE.Material) => void)
	{
		this.character = character;
		this.name = name;
		this.team = team;

		const model = character.modelContainer;
		this.hitboxes = new Hitboxes(model);
		this.pose = new AimPose(model);

		this.weapons = LOADOUT.map((id) => new WeaponState(WEAPONS[id]));
		this.models = LOADOUT.map((id) => createWeaponModel(id));
		for (const weaponModel of this.models)
		{
			weaponModel.root.visible = false;
			weaponModel.materials.forEach(setupMaterial);
			scene.add(weaponModel.root);
		}

		character.getWorldPosition(this.spawnPosition);
		this.spawnOrientation.copy(character.orientation);
		this.weapon.equip();
	}

	public get weapon(): WeaponState
	{
		return this.weapons[this.currentIndex];
	}

	public get muzzle(): THREE.Object3D
	{
		return this.models[this.currentIndex].muzzle;
	}

	/** On foot and able to use a weapon. */
	public get isArmed(): boolean
	{
		const c = this.character;
		return !this.dead && c.world !== undefined && c.controlledObject === undefined && c.occupyingSeat === null && c.vehicleEntryInstance === null;
	}

	/** Can be hit. Characters in vehicles are out of reach until vehicles take damage. */
	public get isTargetable(): boolean
	{
		return !this.dead && this.character.occupyingSeat === null;
	}

	/**
	 * Combat stance: weapon up, facing the aim, moving slower in any direction without turning.
	 * Entered by aiming or pulling the trigger; otherwise the character runs freely
	 * with the weapon holstered.
	 */
	public get inCombat(): boolean
	{
		return this.isArmed && (this.aimHeld || this.weapon.isTriggerHeld || this.sinceCombatInput < COMBAT_LINGER);
	}

	public get holdStyle(): HoldStyle
	{
		return this.weapon.def.slot === 'secondary' ? 'pistol' : 'rifle';
	}

	// Input, routed here by the player's Character while on foot

	public handleMouseButton(code: string, pressed: boolean): boolean
	{
		if (this.dead) return code === 'mouse0' || code === 'mouse2';

		if (code === 'mouse0')
		{
			if (pressed) this.weapon.pullTrigger();
			else this.weapon.releaseTrigger();
			return true;
		}
		if (code === 'mouse2')
		{
			this.aimHeld = pressed;
			return true;
		}
		return false;
	}

	public handleKey(code: string, pressed: boolean, event: KeyboardEvent): boolean
	{
		if (!pressed || event.shiftKey || this.dead) return false;

		if (code === 'KeyR')
		{
			this.weapon.startReload();
			return true;
		}
		if (code === 'KeyQ')
		{
			const camera = this.character.world.cameraOperator;
			camera.shoulderSide = -camera.shoulderSide;
			return true;
		}
		const slot = ['Digit1', 'Digit2', 'Digit3'].indexOf(code);
		if (slot !== -1)
		{
			this.switchTo(slot);
			return true;
		}
		return false;
	}

	public handleWheel(value: number): void
	{
		if (this.dead || value === 0) return;
		const step = value > 0 ? 1 : -1;
		this.switchTo((this.currentIndex + step + this.weapons.length) % this.weapons.length);
	}

	public switchTo(index: number): void
	{
		if (index === this.currentIndex || index < 0 || index >= this.weapons.length) return;

		this.weapon.releaseTrigger();
		this.currentIndex = index;
		this.weapon.equip();
	}

	/** Advances weapon timers and returns the rounds fired this frame. */
	public updateWeapon(timeStep: number): Shot[]
	{
		this.sinceShot += timeStep;
		this.sinceCombatInput = this.aimHeld || this.weapon.isTriggerHeld ? 0 : this.sinceCombatInput + timeStep;

		const inCombat = this.inCombat;
		this.readiness = THREE.MathUtils.clamp(this.readiness + (inCombat ? 1 : -1) * timeStep / RAISE_TIME, 0, 1);

		const aimTarget = inCombat && this.aimHeld ? 1 : 0;
		const aimSpeed = timeStep / this.weapon.def.aimTime;
		this.aimAmount = THREE.MathUtils.clamp(this.aimAmount + Math.sign(aimTarget - this.aimAmount) * aimSpeed, 0, 1);

		if (!this.isArmed)
		{
			this.weapon.releaseTrigger();
			this.aimHeld = false;
		}

		const moving = this.character.velocity.lengthSq() > 0.01;
		const shots = this.weapon.update(timeStep, this.aimAmount, moving, inCombat && this.readiness >= 1);
		if (shots.length > 0) this.sinceShot = 0;
		return shots;
	}

	/**
	 * Called by the character after its state update. In combat stance the character
	 * faces the aim and strafes at reduced speed; otherwise its state moves it as usual.
	 */
	public applyMovement(): void
	{
		const c = this.character;
		c.movementOverride = null;
		if (!this.inCombat || !c.rayHasHit) return;

		c.getWorldPosition(tmp2);
		tmp.subVectors(this.aimPoint, tmp2).setY(0);
		if (tmp.lengthSq() > 1e-4) c.setOrientation(tmp);

		const speed = (this.aimHeld ? AIM_WALK_SPEED : COMBAT_WALK_SPEED) * this.weapon.def.moveSpeed;
		c.movementOverride = c.getLocalMovementDirection().multiplyScalar(speed);
	}

	/** Called by the character once its animation and transform are final for the frame. */
	public afterCharacterUpdate(timeStep: number): void
	{
		const c = this.character;

		if (this.dead)
		{
			this.deathTime += timeStep;
			const fall = Math.min(1, this.deathTime / DEATH_FALL_TIME);
			c.modelContainer.rotation.x = -Math.PI / 2 * fall * fall;
			this.models.forEach((m) => m.root.visible = false);
			c.updateMatrixWorld(true);
			this.hitboxes.update();
			return;
		}

		// Raise the arms toward the aim point as the weapon comes up
		c.getWorldPosition(tmp2).addScaledVector(UP, 0.25);
		const aim = tmp.subVectors(this.aimPoint, tmp2).normalize();
		const weight = THREE.MathUtils.smoothstep(this.readiness, 0, 1);
		this.pose.apply(aim, c.orientation, this.holdStyle, weight);
		this.hitboxes.update();

		const armed = this.isArmed;
		for (let i = 0; i < this.models.length; i++)
		{
			const root = this.models[i].root;
			root.visible = armed && i === this.currentIndex;
			if (!root.visible) continue;

			if (this.readiness > 0.5)
			{
				this.pose.getHandPosition(root.position);
				root.lookAt(tmp2.copy(root.position).add(aim));
			}
			else
			{
				this.pose.getHolster(this.holdStyle, c.orientation, root.position, root.quaternion);
			}
			root.updateMatrixWorld(true);
		}
	}

	public die(killer: Combatant): void
	{
		const c = this.character;
		this.dead = true;
		this.killer = killer;
		this.deathTime = 0;
		this.respawnTimer = RESPAWN_DELAY;
		this.aimHeld = false;
		this.weapon.releaseTrigger();

		this.savedBehaviour = c.behaviour;
		c.behaviour = undefined;
		c.resetControls();
		c.movementOverride = null;
		c.setState(new Dead(c));
	}

	/** Brings the character back at the given position, or where it first spawned. */
	public respawn(position: THREE.Vector3 = this.spawnPosition): void
	{
		const c = this.character;
		this.dead = false;
		this.killer = undefined;
		this.protectedFor = SPAWN_PROTECTION;
		this.health.reset();
		this.sinceShot = Infinity;
		this.sinceCombatInput = Infinity;
		this.readiness = 0;
		this.weapons = LOADOUT.map((id) => new WeaponState(WEAPONS[id]));
		this.weapon.equip();

		c.modelContainer.rotation.x = 0;
		c.setPosition(position.x, position.y, position.z);
		c.resetVelocity();
		c.setOrientation(this.spawnOrientation, true);
		c.setState(new Idle(c));
		if (this.savedBehaviour !== undefined) c.setBehaviour(this.savedBehaviour);
		this.savedBehaviour = undefined;
	}

	public dispose(scene: THREE.Scene): void
	{
		for (const weaponModel of this.models) scene.remove(weaponModel.root);
	}
}
