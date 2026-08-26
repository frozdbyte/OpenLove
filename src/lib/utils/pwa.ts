export type DeviceOS = 'ios' | 'android' | 'desktop';

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
	if (typeof window.matchMedia === 'function') {
		if (window.matchMedia('(display-mode: standalone)').matches) {
			return true;
		}
		if (window.matchMedia('(display-mode: fullscreen)').matches) {
			return true;
		}
		if (window.matchMedia('(display-mode: minimal-ui)').matches) {
			return true;
		}
	}

	// Android TWA / installed referrer
	if (document.referrer && document.referrer.startsWith('android-app://')) {
		return true;
	}

	return false;
}

/**
 * Robustly detects client OS, accurately handling:
 * - iPhone & iPod (all iOS versions)
 * - iPad & iPadOS (including iPadOS 13+ desktop-class Safari reporting "Macintosh")
 * - iOS Safari "Request Desktop Website" mode
 * - iOS WebViews and alternative iOS browsers (Chrome CriOS, Firefox FxiOS, Edge EdgiOS)
 * - Android phones & tablets
 * - Desktop (Windows, macOS without touchscreen, Linux)
 */
export function getDeviceOS(): DeviceOS {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'desktop';

	const ua = navigator.userAgent || '';
	const platform = (navigator as any)?.userAgentData?.platform || navigator.platform || '';
	const maxTouchPoints = navigator.maxTouchPoints || 0;

	// 1. Explicit iOS UA identifiers (iPhone, iPad, iPod, CriOS, FxiOS, EdgiOS)
	if (/iphone|ipad|ipod|crios|fxios|edgios/i.test(ua)) {
		return 'ios';
	}

	// 2. Explicit iOS platform identifiers
	if (/iphone|ipad|ipod/i.test(platform)) {
		return 'ios';
	}

	// 3. Apple's unique navigator.standalone property (present only on iOS WebKit/Safari)
	if ('standalone' in navigator) {
		return 'ios';
	}

	// 4. iPadOS & iOS Desktop Mode (reports "Macintosh" / "MacIntel" but has multi-touch screen)
	const isApplePlatform = /macintosh|mac os x|macintel/i.test(ua) || platform === 'MacIntel';
	if (isApplePlatform && maxTouchPoints > 0) {
		return 'ios';
	}

	// 5. Apple vendor with touch points (iOS in desktop mode, WebViews, or fullscreen apps)
	if (navigator.vendor && /apple/i.test(navigator.vendor) && maxTouchPoints > 0) {
		return 'ios';
	}

	// 6. Android detection
	if (/android/i.test(ua) || /android/i.test(platform)) {
		return 'android';
	}

	// 7. General mobile coarse pointer fallback for Apple devices
	if (maxTouchPoints > 0 && typeof window.matchMedia === 'function') {
		if (window.matchMedia('(pointer: coarse)').matches && /apple/i.test(navigator.vendor || '')) {
			return 'ios';
		}
	}

	return 'desktop';
}
