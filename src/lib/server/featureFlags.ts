import type { FeatureFlags } from '$lib/types/featureFlags';

/**
 * Single registry for env-driven feature toggles. Adding a new flag is one
 * entry here plus one field on `FeatureFlags` — no other plumbing changes,
 * since `GET /api/share/config` and the client store both just pass the
 * whole resolved object through.
 */
const FLAG_REGISTRY: Record<keyof FeatureFlags, { env: string; default: boolean }> = {
	shareImages: { env: 'FEATURE_SHARE_IMAGES', default: true }
};

const TRUTHY = new Set(['true', '1', 'on', 'yes']);
const FALSY = new Set(['false', '0', 'off', 'no']);

const warnedKeys = new Set<string>();

function parseBooleanEnv(key: string, raw: string | undefined, fallback: boolean): boolean {
	if (raw === undefined) return fallback;
	const value = raw.trim().toLowerCase();
	if (value === '') return fallback;
	if (TRUTHY.has(value)) return true;
	if (FALSY.has(value)) return false;

	if (!warnedKeys.has(key)) {
		warnedKeys.add(key);
		console.warn(
			`⚠️  ${key} has an unrecognized value "${raw}" (expected true/false/1/0/on/off/yes/no). Falling back to the default (${fallback}).`
		);
	}
	return fallback;
}

/**
 * Resolve every registered flag from `process.env`, falling back to its
 * default for anything unset or unparseable — never throws. Read fresh on
 * every call (no caching) so a flag flipped via `docker-compose` and the
 * container restarted takes effect without a rebuild; see IMAGE_SHARING_PLAN.md's
 * "Key constraint" note on why this can't be resolved at build time instead.
 */
export function getFeatureFlags(): FeatureFlags {
	const result = {} as FeatureFlags;
	for (const key of Object.keys(FLAG_REGISTRY) as (keyof FeatureFlags)[]) {
		const { env, default: fallback } = FLAG_REGISTRY[key];
		result[key] = parseBooleanEnv(env, process.env[env], fallback);
	}
	return result;
}
