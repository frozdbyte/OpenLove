import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFeatureFlags } from './featureFlags';

describe('getFeatureFlags', () => {
	const originalValue = process.env.FEATURE_SHARE_IMAGES;
	let warnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env.FEATURE_SHARE_IMAGES;
		} else {
			process.env.FEATURE_SHARE_IMAGES = originalValue;
		}
		warnSpy.mockRestore();
	});

	it('defaults to true when unset', () => {
		delete process.env.FEATURE_SHARE_IMAGES;
		expect(getFeatureFlags().shareImages).toBe(true);
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
