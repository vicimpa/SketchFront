import { CharacterStateBase } from './_stateLibrary';
import { Character } from '../Character';

/**
 * The character is down. Ignores input; the combat system knocks the model over
 * and brings the character back with a fresh state on respawn.
 */
export class Dead extends CharacterStateBase
{
	constructor(character: Character)
	{
		super(character);

		this.canFindVehiclesToEnter = false;
		this.canLeaveVehicles = false;

		this.character.setArcadeVelocityTarget(0);
		this.character.vehicleEntryInstance = null;
		this.playAnimation('stop', 0.1);
	}

	public onInputChange(): void
	{
		// The dead don't take orders
	}
}
