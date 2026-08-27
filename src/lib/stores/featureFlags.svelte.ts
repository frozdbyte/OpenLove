import { get, set } from 'idb-keyval';
import type { FeatureFlags } from '$lib/types/featureFlags';

const CACHE_KEY = 'openlove_feature_flags_v1';

/**
 * Compiled-in defaults, used until the first successful fetch (or forever,
 * offline). Must match `src/lib/server/featureFlags.ts`'s registry defaults
 * — kept as a separate literal rather than importing the server module,
 * since that module (and its `process.env` reads) must never end up in the
 * client bundle.
 */
const DEFAULTS: FeatureFlags = { shareImages: true };

/**
 * Client-side cache + reactive access for server-resolved feature flags.
 *
 * `init()` is called once from `+layout.svelte`'s `onMount`, same convention
 * as `pwaStore`/`networkStore` (unlike `profileStore`, which self-initializes
 * eagerly at module load because routing decisions depend on it before the
 * layout even mounts — no such urgency here).
 *
 * Never blocks on the network: `profileStore.ready` (and the app's loading
 * screen) must not wait on this. `init()` applies the last-cached value
 * first (works fully offline), then refreshes from the server in the
 * background — components reading `.flags` reactively pick up the change
 * if/when it lands.
 */
class FeatureFlagsStore {
	flags = $state<FeatureFlags>({ ...DEFAULTS });

	private initialized = false;

	async init() {
		if (typeof window === 'undefined' || this.initialized) return;
		this.initialized = true;

		try {
			const cached = await get<FeatureFlags>(CACHE_KEY);
			if (cached) this.flags = { ...DEFAULTS, ...cached };
		} catch {
			// IndexedDB unavailable — fall through to compiled-in defaults.
		}

		try {
			const res = await fetch('/api/share/config');
			if (!res.ok) return;
			const fresh = (await res.json()) as Partial<FeatureFlags>;
			this.flags = { ...DEFAULTS, ...fresh };
			// AGENTS.md Invariant 3: `this.flags` is a Svelte 5 $state Proxy;
			// idb-keyval's structured clone throws DataCloneError on it directly.
			await set(CACHE_KEY, JSON.parse(JSON.stringify(this.flags)));
		} catch {
			// Offline or server unreachable — keep the cached/default value.
		}
	}
}

export const featureFlags = new FeatureFlagsStore();
