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

export interface FullBackupInfo {
	bondCount: number;
}

/**
 * Detects a full multi-bond backup (`{ version: 2, bonds: [...] }`, the shape
 * produced by "Download JSON Backup (All Bonds)") in already-decoded JSON text,
 * distinctly from a single-bond partner invite.
 *
 * This distinction matters: `profileStore.importJSON()`'s branch for this shape
 * always replaces the *entire* local app state, regardless of the `mode`
 * argument passed to it — unlike the single-bond-invite branches, which respect
 * `'replace' | 'add'`. A full backup can't be meaningfully previewed as "one
 * incoming bond" (`parseSharePayload`'s `Partial<Bond>` return shape) either —
 * there's no single name/date to show. Callers must use this to route full
 * backups to an explicit, unambiguous "this replaces everything" confirmation
 * instead of the single-bond invite's Add-as-New/Replace-Current flow, whose
 * buttons would otherwise silently wipe every bond already on the device. See
 * REFACTOR_PLAN.md, Phase 7 / M4.
 */
export function detectFullBackup(jsonString: string): FullBackupInfo | null {
	try {
		const data = JSON.parse(jsonString);
		if (data?.version === 2 && Array.isArray(data.bonds) && data.bonds.length > 0) {
			return { bondCount: data.bonds.length };
		}
	} catch {
		// Not JSON — not a backup either. Let the caller's existing parse path
		// produce the appropriate "invalid format" error.
	}
	return null;
}
