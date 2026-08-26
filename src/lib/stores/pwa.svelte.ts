import { isRunningAsPWA, getDeviceOS, type DeviceOS } from '$lib/utils/pwa';

export interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	readonly userChoice: Promise<{
		outcome: 'accepted' | 'dismissed';
		platform: string;
	}>;
	prompt(): Promise<void>;
}

declare global {
	interface Window {
		__pwaInstallPrompt?: BeforeInstallPromptEvent;
	}
}

class PWAStore {
	isStandalone = $state(false);
	canInstall = $state(false);
	isInstalled = $state(false);
	userOS = $state<DeviceOS>('desktop');
	installOutcome = $state<'accepted' | 'dismissed' | null>(null);
	private deferredPrompt: BeforeInstallPromptEvent | null = null;
	private initialized = false;

	init() {
		if (typeof window === 'undefined' || this.initialized) return;
		this.initialized = true;

		this.isStandalone = isRunningAsPWA();
		this.userOS = getDeviceOS();

		// Check if prompt was intercepted before hydration
		if (window.__pwaInstallPrompt) {
			this.deferredPrompt = window.__pwaInstallPrompt;
			this.canInstall = true;
		}

		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			this.deferredPrompt = e as BeforeInstallPromptEvent;
			window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
			this.canInstall = true;
		});

		window.addEventListener('appinstalled', () => {
			this.isInstalled = true;
			this.canInstall = false;
			this.deferredPrompt = null;
			window.__pwaInstallPrompt = undefined;
		});

		// Register service worker if available to ensure installability
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
				navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {});
			});
		}

		// Listen to display-mode change (e.g. window opened in standalone)
		if (typeof window.matchMedia === 'function') {
			try {
				window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
					if (e.matches) {
						this.isStandalone = true;
						this.isInstalled = true;
						this.canInstall = false;
					}
				});
			} catch {
				// matchMedia addEventListener may not be supported in older runtimes
			}
		}
	}

	async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
		if (!this.deferredPrompt && window.__pwaInstallPrompt) {
			this.deferredPrompt = window.__pwaInstallPrompt;
		}

		if (!this.deferredPrompt) {
			return 'unavailable';
		}

		try {
			await this.deferredPrompt.prompt();
			const choice = await this.deferredPrompt.userChoice;
			this.installOutcome = choice.outcome;

			if (choice.outcome === 'accepted') {
				this.isInstalled = true;
			}

			this.deferredPrompt = null;
			this.canInstall = false;
			window.__pwaInstallPrompt = undefined;

			return choice.outcome;
		} catch (err) {
			console.error('Error invoking PWA install prompt:', err);
			return 'unavailable';
		}
	}
}

export const pwaStore = new PWAStore();
