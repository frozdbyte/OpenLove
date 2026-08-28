import { profileStore } from './profile.svelte';
import type { Bond } from '$lib/types/bonds';

/**
 * See `profileStore.regeneratePhotoUrl`'s doc comment: an `<img>` can fail to
 * load a `photoUrl` that looks valid after the app sits backgrounded a
 * while, possibly more than once per session. The returned `handleError`
 * guards against looping against a genuinely corrupt Blob — it blocks
 * retrying again until the regenerated URL actually loads (`handleLoad`),
 * not just until the Blob itself changes (bond switch, new upload).
 *
 * For a single bond's photo. Call from a component's top-level `<script>` so
 * the internal `$effect` runs in that component's lifecycle.
 */
export function createPhotoRetryGuard(
	bondId: () => string | undefined,
	photoBlob: () => Blob | null | undefined
) {
	let attempted = $state(false);

	$effect(() => {
		photoBlob();
		attempted = false;
	});

	function handleError() {
		const id = bondId();
		if (attempted || !photoBlob() || !id) return;
		attempted = true;
		profileStore.regeneratePhotoUrl(id);
	}

	function handleLoad() {
		attempted = false;
	}

	return { handleError, handleLoad };
}

/**
 * Keyed variant of `createPhotoRetryGuard`, for a component that renders more
 * than one bond's photo in a single instance (e.g. a bond list).
 */
export function createKeyedPhotoRetryGuard() {
	let attempted = $state<Record<string, boolean>>({});

	function handleError(bond: Bond) {
		if (attempted[bond.id] || !bond.photoBlob) return;
		attempted = { ...attempted, [bond.id]: true };
		profileStore.regeneratePhotoUrl(bond.id);
	}

	function handleLoad(bond: Bond) {
		if (!attempted[bond.id]) return;
		const { [bond.id]: _, ...rest } = attempted;
		attempted = rest;
	}

	return { handleError, handleLoad };
}
