/**
 * Blob <-> base64 conversion for embedding bond photos inline in JSON *file*
 * backups (`profileStore.exportBackupJSON()` / `importJSON()`). Deliberately
 * not encrypted — this data only ever leaves the device via the user's own
 * explicit file download/upload, the same trust level as every other field
 * already in a backup. Kept separate from `utils/base64.ts` (VAPID key
 * decoding, service-worker-safe) since this is a different concern with no
 * reason to be loaded by the service worker.
 */

/** Avoids `String.fromCharCode(...hugeArray)` blowing the call stack on a large photo. */
const CHUNK_SIZE = 0x8000;

export async function blobToBase64(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
	}
	return btoa(binary);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}
