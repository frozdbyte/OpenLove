import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeatureFlags } from './featureFlags';

describe('getFeatureFlags', () => {
	const originalShareImages = process.env.FEATURE_SHARE_IMAGES;
	const originalDevMode = process.env.FEATURE_DEV_MODE;
	const originalDevModeFallback = process.env.DEV_MODE;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		if (originalShareImages === undefined) {
			delete process.env.FEATURE_SHARE_IMAGES;
		} else {
			process.env.FEATURE_SHARE_IMAGES = originalShareImages;
		}

		if (originalDevMode === undefined) {
			delete process.env.FEATURE_DEV_MODE;
		} else {
			process.env.FEATURE_DEV_MODE = originalDevMode;
		}

		if (originalDevModeFallback === undefined) {
			delete process.env.DEV_MODE;
		} else {
			process.env.DEV_MODE = originalDevModeFallback;
		}

		warnSpy.mockRestore();
	});

	it('defaults shareImages to true and devMode to false when unset', () => {
		delete process.env.FEATURE_SHARE_IMAGES;
		delete process.env.FEATURE_DEV_MODE;
		delete process.env.DEV_MODE;
		const flags = getFeatureFlags();
		expect(flags.shareImages).toBe(true);
		expect(flags.devMode).toBe(false);
	});

	it('resolves devMode to true when FEATURE_DEV_MODE is set to true', () => {
		process.env.FEATURE_DEV_MODE = 'true';
		expect(getFeatureFlags().devMode).toBe(true);
	});

	it('resolves devMode to true when DEV_MODE fallback is set to true', () => {
		delete process.env.FEATURE_DEV_MODE;
		process.env.DEV_MODE = 'true';
		expect(getFeatureFlags().devMode).toBe(true);
	});

	it('defaults to true when set to an empty string', () => {
		process.env.FEATURE_SHARE_IMAGES = '';
		expect(getFeatureFlags().shareImages).toBe(true);
	});

	for (const truthy of ['true', 'True', '1', 'on', 'yes']) {
		it(`resolves "${truthy}" to true`, () => {
			process.env.FEATURE_SHARE_IMAGES = truthy;
			expect(getFeatureFlags().shareImages).toBe(true);
		});
	}

	for (const falsy of ['false', 'False', '0', 'off', 'no']) {
		it(`resolves "${falsy}" to false`, () => {
			process.env.FEATURE_SHARE_IMAGES = falsy;
			expect(getFeatureFlags().shareImages).toBe(false);
		});
	}

	it('falls back to the default (not a crash) on an unrecognized value, and warns once', () => {
		process.env.FEATURE_SHARE_IMAGES = 'maybe';
		expect(getFeatureFlags().shareImages).toBe(true);
		expect(warnSpy).toHaveBeenCalledTimes(1);

		// Second call with the same bad value does not warn again.
		getFeatureFlags();
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it('tolerates surrounding whitespace', () => {
		process.env.FEATURE_SHARE_IMAGES = '  false  ';
		expect(getFeatureFlags().shareImages).toBe(false);
	});
});
