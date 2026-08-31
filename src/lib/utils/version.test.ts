import { describe, it, expect, beforeEach, vi } from 'vitest';

const { APP_VERSION_MOCK } = vi.hoisted(() => ({ APP_VERSION_MOCK: '2.0.0' }));
vi.mock('$lib/version', () => ({ APP_VERSION: APP_VERSION_MOCK }));

import { getJustUpdated } from './version';

const LAST_SEEN_KEY = 'openlove_last_seen_version';

/**
 * `vitest.config.ts` deliberately runs without a DOM environment (see its own
 * comment), so `localStorage` isn't a real global here — a small in-memory stub
 * stands in for it, swapped out via `vi.stubGlobal` per test.
 */
function createStorageStub(): Storage {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => void store.set(key, value),
		removeItem: (key: string) => void store.delete(key),
		clear: () => store.clear(),
		key: () => null,
		get length() {
			return store.size;
		}
	};
}

describe('getJustUpdated', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorageStub());
	});

	it('returns false on a first-ever visit (nothing stored) and seeds the current version', () => {
		expect(getJustUpdated()).toBe(false);
		expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(APP_VERSION_MOCK);
	});

	it('returns true when the stored version differs from the current one, and overwrites it', () => {
		localStorage.setItem(LAST_SEEN_KEY, '1.9.0');
		expect(getJustUpdated()).toBe(true);
		expect(localStorage.getItem(LAST_SEEN_KEY)).toBe(APP_VERSION_MOCK);
	});

	it('returns false when the stored version already matches the current one', () => {
		localStorage.setItem(LAST_SEEN_KEY, APP_VERSION_MOCK);
		expect(getJustUpdated()).toBe(false);
	});

	it('returns false and does not throw when localStorage access itself throws', () => {
		vi.stubGlobal(
			'localStorage',
			new Proxy(
				{},
				{
					get() {
						throw new Error('blocked');
					}
				}
			)
		);

		expect(() => getJustUpdated()).not.toThrow();
		expect(getJustUpdated()).toBe(false);
	});
});
