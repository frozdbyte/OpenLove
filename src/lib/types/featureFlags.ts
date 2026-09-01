/**
 * Shared shape for env-driven feature toggles — the single contract between
 * `src/lib/server/featureFlags.ts` (resolves it from `process.env`),
 * `GET /api/share/config` (serves it), and `src/lib/stores/featureFlags.svelte.ts`
 * (fetches + caches it client-side). See IMAGE_SHARING_PLAN.md, Stage 2.
 */
export interface FeatureFlags {
	/** Server-relayed encrypted photo sharing via QR/link (IMAGE_SHARING_PLAN.md, Stage 5). */
	shareImages: boolean;
	/** Developer & testing toolbar across the app. */
	devMode: boolean;
}
