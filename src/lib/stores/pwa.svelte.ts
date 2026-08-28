import { goto } from '$app/navigation';
import { isRunningAsPWA, getDeviceOS, type DeviceOS } from '$lib/utils/pwa';
import {
	isStoragePersisted as checkStoragePersisted,
	requestPersistentStorage
} from '$lib/utils/storage';

// Desktop-only (Chrome/Edge on Windows/Mac/Linux/ChromeOS — no Android support):
// with `launch_handler.client_mode: 'focus-existing'` in the manifest, opening an
// in-scope link while the app is already running focuses that window instead of
// spawning a new one, but the browser does NOT navigate it for us — without this
// consumer the target URL is just discarded and the focused window stays put.
interface LaunchParams {
	targetURL?: string;
}
declare global {
	interface Window {
		launchQueue?: {
			setConsumer(consumer: (params: LaunchParams) => void): void;
		};
	}
}

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
	// True from the moment the user accepts the native prompt until `appinstalled`
	// actually fires. On Android that gap is the WebAPK minting round-trip and can
	// take a few seconds — `isInstalled` must not flip until the real event, or the
	// UI ends up celebrating a "success" the OS hasn't delivered yet.
	isInstalling = $state(false);
	isInstalled = $state(false);
	userOS = $state<DeviceOS>('desktop');
	installOutcome = $state<'accepted' | 'dismissed' | null>(null);
	isStoragePersisted = $state(false);
	private deferredPrompt: BeforeInstallPromptEvent | null = null;
	private initialized = false;
	private installFallbackTimer: ReturnType<typeof setTimeout> | null = null;

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
			if (this.installFallbackTimer) {
				clearTimeout(this.installFallbackTimer);
				this.installFallbackTimer = null;
			}
			this.isInstalling = false;
			this.isInstalled = true;
			this.canInstall = false;
			this.deferredPrompt = null;
			window.__pwaInstallPrompt = undefined;
			// Installing is the strongest engagement signal there is; a persist()
			// request made now is the most likely to be granted silently.
			void this.ensurePersistentStorage();
		});

		if (window.launchQueue) {
			window.launchQueue.setConsumer((launchParams) => {
				if (!launchParams.targetURL) return;
				const url = new URL(launchParams.targetURL);
				void goto(url.pathname + url.search + url.hash);
			});
		}

		// NOTE: the service worker is registered exactly once, from `+layout.svelte`
		// via `virtual:pwa-register`. There used to be a hand-rolled
		// `register('/sw.js').catch(() => register('/service-worker.js'))` chain here.
		// That silent catch swallowed the real registration error and hid the fact
		// that the caching service worker threw on every single install for the
		// entire life of the project. Registration failures must be loud.

		void this.refreshStoragePersistence();

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
				// `userChoice` resolving 'accepted' only means the user tapped Install
				// in the native dialog — the WebAPK isn't minted yet. `appinstalled`
				// (listened for in init()) is the real completion signal. As a safety
				// net in case that event never arrives, fall back to treating it as
				// installed after a generous delay rather than stranding the UI.
				this.isInstalling = true;
				this.installFallbackTimer = setTimeout(() => {
					this.isInstalling = false;
					this.isInstalled = true;
					this.installFallbackTimer = null;
				}, 15000);
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

	/**
	 * Ask the browser to exempt our IndexedDB from eviction. IndexedDB is the only
	 * copy of the couple's data, so losing it is unrecoverable.
	 */
	async ensurePersistentStorage(): Promise<boolean> {
		const granted = await requestPersistentStorage();
		this.isStoragePersisted = granted;
		return granted;
	}

	private async refreshStoragePersistence() {
		this.isStoragePersisted = await checkStoragePersisted();
	}
}

export const pwaStore = new PWAStore();
