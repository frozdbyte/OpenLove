/**
 * Detects if the web application is running as an installed PWA (Standalone / Fullscreen mode).
 * Works across iOS Safari (navigator.standalone), Android Chrome / WebAPK, and Desktop Chromium/Safari.
 */
export function isRunningAsPWA(): boolean {
	if (typeof window === 'undefined') return false;

	// iOS Safari standalone web app
	if ('standalone' in window.navigator && (window.navigator as any).standalone === true) {
		return true;
	}

	// Standard display-mode queries
	if (window.matchMedia('(display-mode: standalone)').matches) {
		return true;
	}
	if (window.matchMedia('(display-mode: fullscreen)').matches) {
		return true;
	}
	if (window.matchMedia('(display-mode: minimal-ui)').matches) {
		return true;
	}

	// Android TWA / installed referrer
	if (document.referrer && document.referrer.startsWith('android-app://')) {
		return true;
	}

	return false;
}
