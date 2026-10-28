export type HitmarkerKind = 'hit' | 'headshot' | 'kill';

const KILLFEED_SIZE = 5;
const KILLFEED_LIFETIME = 6000;

/** Combat HUD drawn as DOM over the canvas. */
export class Hud
{
	private root: HTMLElement;
	private crosshair: HTMLElement;
	private hitmarker: HTMLElement;
	private weaponName: HTMLElement;
	private ammo: HTMLElement;
	private reserve: HTMLElement;
	private reloadBar: HTMLElement;
	private healthFill: HTMLElement;
	private healthText: HTMLElement;
	private killfeed: HTMLElement;
	private damage: HTMLElement;
	private damageArrows: HTMLElement;
	private death: HTMLElement;
	private hitmarkerTimer: number;

	constructor()
	{
		this.root = document.createElement('div');
		this.root.id = 'hud';
		this.root.innerHTML = `
			<div class="hud-crosshair"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
			<div class="hud-hitmarker"><i></i><i></i><i></i><i></i></div>
			<div class="hud-damage"></div>
			<div class="hud-damage-arrows"></div>
			<div class="hud-death"><div class="hud-death-title"></div><div class="hud-death-timer"></div></div>
			<div class="hud-killfeed"></div>
			<div class="hud-health">
				<div class="hud-health-text"></div>
				<div class="hud-health-bar"><div class="hud-health-fill"></div></div>
			</div>
			<div class="hud-weapon">
				<div class="hud-weapon-name"></div>
				<div class="hud-ammo"><span class="hud-ammo-mag"></span><span class="hud-ammo-reserve"></span></div>
				<div class="hud-reload"><div class="hud-reload-fill"></div></div>
			</div>
		`;
		document.body.appendChild(this.root);

		this.crosshair = this.root.querySelector('.hud-crosshair');
		this.hitmarker = this.root.querySelector('.hud-hitmarker');
		this.damage = this.root.querySelector('.hud-damage');
		this.damageArrows = this.root.querySelector('.hud-damage-arrows');
		this.death = this.root.querySelector('.hud-death');
		this.killfeed = this.root.querySelector('.hud-killfeed');
		this.healthFill = this.root.querySelector('.hud-health-fill');
		this.healthText = this.root.querySelector('.hud-health-text');
		this.weaponName = this.root.querySelector('.hud-weapon-name');
		this.ammo = this.root.querySelector('.hud-ammo-mag');
		this.reserve = this.root.querySelector('.hud-ammo-reserve');
		this.reloadBar = this.root.querySelector('.hud-reload');

		this.setVisible(false);
	}

	public setVisible(visible: boolean): void
	{
		this.root.style.display = visible ? 'block' : 'none';
	}

	/** Gap between the crosshair lines, in pixels from the center. */
	public setCrosshairGap(pixels: number, aiming: boolean): void
	{
		this.crosshair.style.setProperty('--gap', `${Math.round(pixels)}px`);
		this.crosshair.classList.toggle('aiming', aiming);
	}

	public showHitmarker(kind: HitmarkerKind): void
	{
		this.hitmarker.className = `hud-hitmarker ${kind}`;
		// Restart the animation even when hits come in faster than it runs
		void this.hitmarker.offsetWidth;
		this.hitmarker.classList.add('show');
		window.clearTimeout(this.hitmarkerTimer);
		this.hitmarkerTimer = window.setTimeout(() => this.hitmarker.classList.remove('show'), kind === 'kill' ? 400 : 200);
	}

	public setWeapon(name: string, ammo: number, reserve: number, reloadProgress: number | null): void
	{
		this.weaponName.textContent = name;
		this.ammo.textContent = String(ammo);
		this.ammo.classList.toggle('low', ammo === 0);
		this.reserve.textContent = `/ ${reserve}`;
		this.reloadBar.style.visibility = reloadProgress === null ? 'hidden' : 'visible';
		this.reloadBar.style.setProperty('--progress', String(reloadProgress ?? 0));
	}

	public setHealth(current: number, max: number): void
	{
		const fraction = Math.max(0, current / max);
		this.healthFill.style.width = `${fraction * 100}%`;
		this.healthFill.classList.toggle('low', fraction < 0.35);
		this.healthText.textContent = String(Math.ceil(current));
	}

	public addKill(killer: string, victim: string, weapon: string, headshot: boolean, involvesPlayer: boolean): void
	{
		const row = document.createElement('div');
		row.className = 'hud-kill' + (involvesPlayer ? ' mine' : '');
		const parts = [killer, `[${weapon}${headshot ? ' ✛' : ''}]`, victim];
		for (const [i, text] of parts.entries())
		{
			const span = document.createElement('span');
			span.textContent = text;
			if (i === 1) span.className = 'weapon';
			row.appendChild(span);
		}

		this.killfeed.prepend(row);
		while (this.killfeed.children.length > KILLFEED_SIZE) this.killfeed.lastElementChild.remove();
		window.setTimeout(() => row.remove(), KILLFEED_LIFETIME);
	}

	/** Red arc around the crosshair pointing toward where the damage came from. Angle in radians, 0 ahead, positive right. */
	public damageDirection(angle: number): void
	{
		const arrow = document.createElement('div');
		arrow.className = 'hud-damage-arrow';
		arrow.style.transform = `rotate(${angle}rad)`;
		this.damageArrows.appendChild(arrow);
		window.setTimeout(() => arrow.remove(), 1200);
	}

	/** Death banner with the respawn countdown; null hides it. */
	public setDeathMessage(title: string | null, respawnIn: number = 0): void
	{
		this.death.style.display = title === null ? 'none' : 'block';
		if (title === null) return;
		this.death.querySelector('.hud-death-title').textContent = title;
		this.death.querySelector('.hud-death-timer').textContent = `Respawn in ${Math.max(0, respawnIn).toFixed(1)}`;
	}

	/** Red edge flash when the player takes damage; strength from 0 to 1. */
	public damageFlash(strength: number): void
	{
		this.damage.style.setProperty('--strength', String(Math.min(1, 0.3 + strength)));
		this.damage.classList.remove('show');
		void this.damage.offsetWidth;
		this.damage.classList.add('show');
	}
}
