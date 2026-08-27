import { featureFlags } from '$lib/stores/featureFlags.svelte';
import { encryptBlob, decryptToBlob } from './imageCrypto';

/**
 * Everything a share payload needs to carry to let a recipient fetch and
 * decrypt a relayed photo — see `RawBondLike.sharedImage` in
 * `profile.svelte.ts`, the field this shape travels as on the wire.
 * `mimeType` is carried alongside the ciphertext (AES-GCM has no metadata
 * of its own) so the recipient can reconstruct a correctly-typed `Blob`
 * without needing to guess or default it.
 */
export interface SharedImageRef {
	shareId: string;
	key: string;
	iv: string;
	mimeType: string;
}

/**
 * Encrypt and upload a photo to the server relay for a QR/link share.
 *
 * Fails soft — returns `null`, never throws — whether the cause is the
 * feature toggle being off, no network, or a server error (including the
 * 8MB size cap), so a caller can just skip attaching a photo rather than
 * blocking the whole share. Checking `featureFlags.flags.shareImages` here
 * (in addition to the endpoint's own 404-when-disabled) avoids a guaranteed-
 * to-fail encrypt+upload attempt if this ever gets called from anywhere
 * other than a toggle that's already hidden itself when the flag is off.
 */
export async function uploadSharedImage(blob: Blob): Promise<SharedImageRef | null> {
	if (!featureFlags.flags.shareImages) return null;

	try {
		const { ciphertext, key, iv } = await encryptBlob(blob);
		const res = await fetch('/api/share/image', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ciphertext })
		});
		if (!res.ok) return null;

		const data = await res.json();
		if (typeof data?.shareId !== 'string') return null;
		return { shareId: data.shareId, key, iv, mimeType: blob.type || 'image/jpeg' };
	} catch {
		return null;
	}
}

/**
 * Fetch and decrypt a relayed photo.
 *
 * Fails soft (`null`) for every failure mode alike — expired, never
 * existed, offline, or a corrupt key/iv — since the caller's contract (see
 * IMAGE_SHARING_PLAN.md, Stage 5) is that a missing photo must never block
 * the rest of an import.
 */
export async function fetchSharedImage(
	shareId: string,
	key: string,
	iv: string,
	mimeType: string
): Promise<Blob | null> {
	try {
		const res = await fetch(`/api/share/image/${encodeURIComponent(shareId)}`);
		if (!res.ok) return null;

		const data = await res.json();
		if (typeof data?.ciphertext !== 'string') return null;
		return await decryptToBlob(data.ciphertext, key, iv, mimeType);
	} catch {
		return null;
	}
}
