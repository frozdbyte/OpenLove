<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import { createKeyedPhotoRetryGuard } from '$lib/stores/photoRetryGuard.svelte';

	/**
	 * Keeps one `<img>` per bond permanently mounted, off-screen, for the
	 * lifetime of the app — including bonds that aren't the active one and
	 * aren't currently shown anywhere (e.g. `BondSwitcherDrawer` is closed,
	 * which fully unmounts its own `<img>`s).
	 *
	 * `profileStore.regeneratePhotoUrl`'s self-heal only runs when an `<img>`
	 * fires `onerror`, so without this, only the active bond's photo (the one
	 * `<img>` that's always on screen) ever gets a chance to recover after the
	 * app sits backgrounded long enough for iOS to evict its object URLs.
	 * Mounting one here for every bond means every bond gets that chance,
	 * regardless of what the user currently has open.
	 *
	 * Deliberately visually hidden rather than `display:none` — some engines
	 * skip decoding (and thus never fire `onerror`) for images that were never
	 * actually laid out.
	 */
	const photoGuard = createKeyedPhotoRetryGuard();
</script>

<div
	aria-hidden="true"
	style="position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;"
>
	{#each profileStore.state.bonds as bond (bond.id)}
		{#if bond.photoUrl}
			<img
				src={bond.photoUrl}
				alt=""
				width="1"
				height="1"
				onerror={() => photoGuard.handleError(bond)}
				onload={() => photoGuard.handleLoad(bond)}
			/>
		{/if}
	{/each}
</div>
