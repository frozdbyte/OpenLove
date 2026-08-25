<script lang="ts">
	import { Heart } from "@lucide/svelte";
	import Button from "$lib/components/ui/button";
	import Card, { CardContent } from "$lib/components/ui/card";
</script>

<main class="container mx-auto max-w-md px-4 py-12 flex flex-col items-center justify-center min-h-screen text-center">
	<Card class="w-full border-rose-200/60 shadow-xl bg-white/80 dark:bg-zinc-900/80">
		<CardContent class="pt-8 pb-8 flex flex-col items-center gap-4">
			<div class="relative">
				<div class="h-20 w-20 rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-inner">
					<Heart class="h-10 w-10 fill-primary animate-heartbeat" />
				</div>
			</div>
			<h1 class="text-3xl font-bold font-serif text-foreground">OpenLove</h1>
			<p class="text-sm text-muted-foreground">Self-hosted, privacy-first relationship tracker</p>
			<Button class="mt-4 w-full">
				Get Started
			</Button>
		</CardContent>
	</Card>
</main>
