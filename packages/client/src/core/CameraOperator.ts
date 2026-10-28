import * as THREE from 'three';
import * as Utils from './FunctionLibrary';
import { World } from '../world/World';
import { IInputReceiver } from '../interfaces/IInputReceiver';
import { KeyBinding } from './KeyBinding';
import { Character } from '../characters/Character';
import { IUpdatable } from '../interfaces/IUpdatable';

export class CameraOperator implements IInputReceiver, IUpdatable
{
	public updateOrder: number = 4;

	public world: World;
	public camera: THREE.Camera;
	public target: THREE.Vector3;
	public sensitivity: THREE.Vector2;
	public radius: number = 1;
	public theta: number;
	public phi: number;
	public onMouseDownPosition: THREE.Vector2;
	public onMouseDownTheta: any;
	public onMouseDownPhi: any;
	public targetRadius: number = 1;

	public movementSpeed: number;
	public actions: { [action: string]: KeyBinding };

	public upVelocity: number = 0;
	public forwardVelocity: number = 0;
	public rightVelocity: number = 0;

	public followMode: boolean = false;

	/** Over-the-shoulder framing for a character on foot. */
	public shoulderMode: boolean = false;
	/** 1 for the right shoulder, -1 for the left. */
	public shoulderSide: number = 1;
	/** Aim from 0 (hip) to 1 (aimed), set by the player's combatant every frame. */
	public aimAmount: number = 0;
	/** FOV divisor at full aim. */
	public aimZoom: number = 1;

	private shoulderBlend: number = 0;
	private shoulderSideSmoothed: number = 1;
	private baseFov: number;
	private pendingRecoil = new THREE.Vector2();
	/** Recoil pitch the player hasn't pulled back down yet; returned once firing stops. */
	private recoilDebt: number = 0;
	private sinceRecoil: number = Infinity;
	private shake: number = 0;
	private offset = new THREE.Vector3();

	public characterCaller: Character;

	constructor(world: World, camera: THREE.Camera, sensitivityX: number = 1, sensitivityY: number = sensitivityX * 0.8)
	{
		this.world = world;
		this.camera = camera;
		this.target = new THREE.Vector3();
		this.sensitivity = new THREE.Vector2(sensitivityX, sensitivityY);

		this.movementSpeed = 0.06;
		this.radius = 3;
		this.theta = 0;
		this.phi = 0;

		this.onMouseDownPosition = new THREE.Vector2();
		this.onMouseDownTheta = this.theta;
		this.onMouseDownPhi = this.phi;

		this.actions = {
			'forward': new KeyBinding('KeyW'),
			'back': new KeyBinding('KeyS'),
			'left': new KeyBinding('KeyA'),
			'right': new KeyBinding('KeyD'),
			'up': new KeyBinding('KeyE'),
			'down': new KeyBinding('KeyQ'),
			'fast': new KeyBinding('ShiftLeft'),
		};

		this.baseFov = (camera as THREE.PerspectiveCamera).fov;

		world.registerUpdatable(this);
	}

	public setSensitivity(sensitivityX: number, sensitivityY: number = sensitivityX): void
	{
		this.sensitivity = new THREE.Vector2(sensitivityX, sensitivityY);
	}

	public setRadius(value: number, instantly: boolean = false): void
	{
		this.targetRadius = Math.max(0.001, value);
		if (instantly === true)
		{
			this.radius = value;
		}
	}

	public move(deltaX: number, deltaY: number): void
	{
		this.theta -= deltaX * (this.sensitivity.x / 2);
		this.theta %= 360;
		this.phi += deltaY * (this.sensitivity.y / 2);
		// Pulling down against recoil pays it off, so recovery doesn't drag the aim under the target
		if (deltaY > 0) this.recoilDebt = Math.max(0, this.recoilDebt - deltaY * (this.sensitivity.y / 2));
		this.phi = Math.min(85, Math.max(-85, this.phi));
	}

	/** Kicks the view up and sideways, in degrees. Applied over a few frames. */
	public addRecoil(pitch: number, yaw: number): void
	{
		this.pendingRecoil.x += pitch;
		this.pendingRecoil.y += yaw;
		this.recoilDebt += pitch;
		this.sinceRecoil = 0;
	}

	/** Adds camera shake; intensity is clamped to 1 and decays quickly. */
	public addShake(amount: number): void
	{
		this.shake = Math.min(1, this.shake + amount);
	}

	public update(timeScale: number): void
	{
		// Recoil: apply most of the pending kick right away, the rest over the next frames
		const kick = Math.min(1, timeScale * 40);
		this.phi = Math.min(85, Math.max(-85, this.phi - this.pendingRecoil.x * kick));
		this.theta -= this.pendingRecoil.y * kick;
		this.pendingRecoil.multiplyScalar(1 - kick);

		// Once firing stops, ease the view back down by the recoil the player didn't compensate
		this.sinceRecoil += timeScale;
		if (this.sinceRecoil > 0.15 && this.recoilDebt > 0)
		{
			const recover = Math.min(this.recoilDebt, Math.max(this.recoilDebt * 8, 4) * timeScale);
			this.phi = Math.min(85, this.phi + recover);
			this.recoilDebt -= recover;
		}

		if (this.followMode === true)
		{
			this.camera.position.y = THREE.MathUtils.clamp(this.camera.position.y, this.target.y, Number.POSITIVE_INFINITY);
			this.camera.lookAt(this.target);
			let newPos = this.target.clone().add(new THREE.Vector3().subVectors(this.camera.position, this.target).normalize().multiplyScalar(this.targetRadius));
			this.camera.position.x = newPos.x;
			this.camera.position.y = newPos.y;
			this.camera.position.z = newPos.z;
		}
		else 
		{
			this.radius = THREE.MathUtils.lerp(this.radius, this.targetRadius, 0.1);
	
			this.camera.position.x = this.target.x + this.radius * Math.sin(this.theta * Math.PI / 180) * Math.cos(this.phi * Math.PI / 180);
			this.camera.position.y = this.target.y + this.radius * Math.sin(this.phi * Math.PI / 180);
			this.camera.position.z = this.target.z + this.radius * Math.cos(this.theta * Math.PI / 180) * Math.cos(this.phi * Math.PI / 180);
			this.camera.updateMatrix();
			this.camera.lookAt(this.target);

			this.updateShoulder(timeScale);
		}

		this.updateShake(timeScale);
	}

	private updateShoulder(timeStep: number): void
	{
		const blendSpeed = Math.min(1, timeStep * 10);
		this.shoulderBlend += ((this.shoulderMode ? 1 : 0) - this.shoulderBlend) * blendSpeed;
		this.shoulderSideSmoothed += (this.shoulderSide - this.shoulderSideSmoothed) * blendSpeed;

		// Slide the camera sideways and up without turning it, so the character sits off-center
		// Aiming pushes the camera further out over the shoulder to clear the view
		this.offset.set((0.55 + 0.2 * this.aimAmount) * this.shoulderSideSmoothed, 0.15, 0).multiplyScalar(this.shoulderBlend);
		this.offset.applyQuaternion(this.camera.quaternion);
		this.camera.position.add(this.offset);

		// Aiming zooms with the FOV
		const perspective = this.camera as THREE.PerspectiveCamera;
		const fov = this.baseFov / THREE.MathUtils.lerp(1, this.aimZoom, this.aimAmount * this.shoulderBlend);
		if (Math.abs(perspective.fov - fov) > 0.01)
		{
			perspective.fov = fov;
			perspective.updateProjectionMatrix();
		}
	}

	private updateShake(timeStep: number): void
	{
		if (this.shake < 0.001) return;

		const angle = this.shake * this.shake * 0.02;
		this.camera.rotateX((Math.random() * 2 - 1) * angle);
		this.camera.rotateY((Math.random() * 2 - 1) * angle);
		this.shake *= Math.exp(-timeStep * 14);
	}

	public handleKeyboardEvent(event: KeyboardEvent, code: string, pressed: boolean): void
	{
		// Free camera
		if (code === 'KeyC' && pressed === true && event.shiftKey === true)
		{
			if (this.characterCaller !== undefined)
			{
				this.world.inputManager.setInputReceiver(this.characterCaller);
				this.characterCaller = undefined;
			}
		}
		else
		{
			for (const action in this.actions) {
				if (this.actions.hasOwnProperty(action)) {
					const binding = this.actions[action];
	
					if (binding.eventCodes.includes(code))
					{
						binding.isPressed = pressed;
					}
				}
			}
		}
	}

	public handleMouseWheel(event: WheelEvent, value: number): void
	{
		this.world.scrollTheTimeScale(value);
	}

	public handleMouseButton(event: MouseEvent, code: string, pressed: boolean): void
	{
		for (const action in this.actions) {
			if (this.actions.hasOwnProperty(action)) {
				const binding = this.actions[action];

				if (binding.eventCodes.includes(code))
				{
					binding.isPressed = pressed;
				}
			}
		}
	}

	public handleMouseMove(event: MouseEvent, deltaX: number, deltaY: number): void
	{
		this.move(deltaX, deltaY);
	}

	public inputReceiverInit(): void
	{
		this.shoulderMode = false;
		this.target.copy(this.camera.position);
		this.setRadius(0, true);
		// this.world.dirLight.target = this.world.camera;

		this.world.updateControls([
			{
				keys: ['W', 'S', 'A', 'D'],
				desc: 'Move around'
			},
			{
				keys: ['E', 'Q'],
				desc: 'Move up / down'
			},
			{
				keys: ['Shift'],
				desc: 'Speed up'
			},
			{
				keys: ['Shift', '+', 'C'],
				desc: 'Exit free camera mode'
			},
		]);
	}

	public inputReceiverUpdate(timeStep: number): void
	{
		// Set fly speed
		let speed = this.movementSpeed * (this.actions.fast.isPressed ? timeStep * 600 : timeStep * 60);

		const up = Utils.getUp(this.camera);
		const right = Utils.getRight(this.camera);
		const forward = Utils.getBack(this.camera);

		this.upVelocity = THREE.MathUtils.lerp(this.upVelocity, +this.actions.up.isPressed - +this.actions.down.isPressed, 0.3);
		this.forwardVelocity = THREE.MathUtils.lerp(this.forwardVelocity, +this.actions.forward.isPressed - +this.actions.back.isPressed, 0.3);
		this.rightVelocity = THREE.MathUtils.lerp(this.rightVelocity, +this.actions.right.isPressed - +this.actions.left.isPressed, 0.3);

		this.target.add(up.multiplyScalar(speed * this.upVelocity));
		this.target.add(forward.multiplyScalar(speed * this.forwardVelocity));
		this.target.add(right.multiplyScalar(speed * this.rightVelocity));
	}
}