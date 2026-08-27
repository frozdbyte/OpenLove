/**
 * Decode a share-payload string into its underlying JSON text.
 *
 * Three call sites — `profile.svelte.ts`'s `parseSharePayload`,
 * `ScanImportModal.svelte`'s `handleImportData`, and `+page.svelte`'s
 * `#import=` hash effect — used to reimplement this independently (see
 * REFACTOR_PLAN.md, High H4). This is the single source of truth for it now.
 *
 * Accepts, in order:
 *  1. A full share URL containing `#import=<uri-encoded-base64-json>`.
 *  2. Raw JSON (starts with `{`).
 *  3. A bare base64 "sync code" (falls back to the raw string if it isn't
 *     valid base64, matching what every prior copy of this logic did).
 */
export function decodeSharePayloadString(raw: string): string {
	if (raw.includes('#import=')) {
		const encoded = raw.split('#import=')[1];
		return atob(decodeURIComponent(encoded));
	}
	if (raw.startsWith('{')) {
		return raw;
	}
	try {
		return atob(raw);
	} catch {
		return raw;
	}
}
