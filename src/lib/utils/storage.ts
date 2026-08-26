/**
 * Storage durability.
 *
 * IndexedDB is not a cache here — under the zero-knowledge invariant it holds the
 * *only* copy of the couple's names, date and photo. iOS Safari evicts IndexedDB
 * for non-installed web apps after roughly 7 days of inactivity, which would be
 * silent, unrecoverable loss of the app's entire value proposition.
 */

export async function isStoragePersisted(): Promise<boolean> {
	try {
		return (await navigator.storage?.persisted?.()) ?? false;
	} catch {
		return false;
	}
}

/**
 * Ask the browser to exempt our storage from eviction.
 *
 * Call this right after a real user gesture (finishing onboarding, accepting the
 * install prompt) — Chrome weighs engagement signals when deciding whether to
 * grant silently, so timing materially changes the outcome.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (!navigator.storage?.persist) return false;
		if (await isStoragePersisted()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

export interface StorageEstimate {
	usage: number;
	quota: number;
	usageLabel: string;
	quotaLabel: string;
	percent: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
	try {
		const estimate = await navigator.storage?.estimate?.();
		if (!estimate) return null;

		const usage = estimate.usage ?? 0;
		const quota = estimate.quota ?? 0;

		return {
			usage,
			quota,
			usageLabel: formatBytes(usage),
			quotaLabel: formatBytes(quota),
			percent: quota > 0 ? Math.min(100, (usage / quota) * 100) : 0
		};
	} catch {
		return null;
	}
}

export function formatBytes(bytes: number): string {
	if (!bytes) return '0 KB';
	const units = ['B', 'KB', 'MB', 'GB'];
	const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
	const value = bytes / 1024 ** index;
	return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}
