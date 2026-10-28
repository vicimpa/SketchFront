export interface DialogOptions
{
	title: string;
	/** Plain text body. */
	text?: string;
	/** HTML body, for trusted content such as scenario descriptions from our own map files. */
	html?: string;
	/** HTML shown under a divider at the bottom, for trusted links. */
	footer?: string;
	icon?: 'warning' | 'success';
	/** Label of the confirm button; omit to show no button. */
	confirmText?: string;
	onClose?: () => void;
}

/**
 * Minimal modal dialog. Closes on the confirm button, Escape or a click on the backdrop.
 */
export class Dialog
{
	public static show(options: DialogOptions): void
	{
		const backdrop = document.createElement('div');
		backdrop.className = 'dialog-backdrop';

		const popup = document.createElement('div');
		popup.className = 'dialog';
		popup.setAttribute('role', 'dialog');
		popup.setAttribute('aria-modal', 'true');
		backdrop.appendChild(popup);

		if (options.icon !== undefined)
		{
			const icon = document.createElement('div');
			icon.className = `dialog-icon dialog-icon-${options.icon}`;
			icon.textContent = options.icon === 'warning' ? '!' : '✓';
			popup.appendChild(icon);
		}

		const title = document.createElement('h2');
		title.className = 'dialog-title';
		title.textContent = options.title;
		popup.appendChild(title);

		const content = document.createElement('div');
		content.className = 'dialog-content';
		if (options.html !== undefined) content.innerHTML = options.html;
		else if (options.text !== undefined) content.textContent = options.text;
		popup.appendChild(content);

		let confirm: HTMLButtonElement | undefined;
		if (options.confirmText !== undefined)
		{
			confirm = document.createElement('button');
			confirm.className = 'dialog-confirm';
			confirm.textContent = options.confirmText;
			const actions = document.createElement('div');
			actions.className = 'dialog-actions';
			actions.appendChild(confirm);
			popup.appendChild(actions);
		}

		if (options.footer !== undefined)
		{
			const footer = document.createElement('div');
			footer.className = 'dialog-footer';
			footer.innerHTML = options.footer;
			popup.appendChild(footer);
		}

		const close = () =>
		{
			document.removeEventListener('keydown', onKeyDown, true);
			backdrop.remove();
			options.onClose?.();
		};
		const onKeyDown = (event: KeyboardEvent) =>
		{
			if (event.code !== 'Escape') return;
			event.stopPropagation();
			close();
		};

		confirm?.addEventListener('click', close);
		backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
		document.addEventListener('keydown', onKeyDown, true);

		document.body.appendChild(backdrop);
		confirm?.focus();
	}
}
