<script lang="ts">
	/**
	 * Step 1 of `OnboardingFlow.svelte`'s wizard: app overview + privacy pitch.
	 * Extracted per REFACTOR_PLAN.md, Medium M5. Purely static content plus the
	 * "scan partner QR" shortcut, so it needs no state of its own.
	 */
	import Card from '$lib/components/ui/card';
	import { Heart, ShieldCheck, Calendar, Sparkles, QrCode } from '@lucide/svelte';

	interface Props {
		onScanQR: () => void;
	}

	let { onScanQR }: Props = $props();
</script>

<div class="space-y-3 sm:space-y-4 text-center animate-in fade-in duration-300">
	<div class="h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center text-primary shadow-md shadow-rose-500/10 shrink-0">
		<Heart class="h-6 w-6 sm:h-8 sm:w-8 fill-primary text-primary animate-heartbeat" />
	</div>

	<div class="space-y-1">
		<h1 class="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">Welcome to Open Love</h1>
		<p class="text-xs sm:text-sm text-muted-foreground">A private, romantic space to celebrate your journey</p>
	</div>

	<!-- Feature Highlights with Privacy Emphasis -->
	<div class="space-y-2 text-left">
		<!-- Feature 1: Privacy (Highlighted) -->
		<Card class="p-3 sm:p-3.5 bg-card/90 border-primary/25 shadow-xs flex items-start gap-3 rounded-2xl ring-1 ring-primary/10">
			<div class="p-2 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
				<ShieldCheck class="h-4 w-4 sm:h-5 sm:w-5" />
			</div>
			<div class="space-y-0.5 min-w-0">
				<div class="text-xs sm:text-sm font-bold text-foreground flex items-center gap-1.5">
					<span>100% Private & Zero-Knowledge</span>
				</div>
				<p class="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
					Your names, dates, notes, and photos stay strictly on this device in IndexedDB. No ads, tracking, or cloud data harvesting.
				</p>
			</div>
		</Card>

		<!-- Feature 2: Milestones & Timers -->
		<Card class="p-3 sm:p-3.5 bg-card border-border shadow-xs flex items-start gap-3 rounded-2xl">
			<div class="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5">
				<Calendar class="h-4 w-4 sm:h-5 sm:w-5" />
			</div>
			<div class="space-y-0.5 min-w-0">
				<div class="text-xs sm:text-sm font-bold text-foreground">
					Live Timers & Milestones
				</div>
				<p class="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
					Exact years, months, and days together with smart countdowns for anniversaries and custom memories.
				</p>
			</div>
		</Card>

		<!-- Feature 3: Offline PWA & Partner Sync -->
		<Card class="p-3 sm:p-3.5 bg-card border-border shadow-xs flex items-start gap-3 rounded-2xl">
			<div class="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
				<Sparkles class="h-4 w-4 sm:h-5 sm:w-5" />
			</div>
			<div class="space-y-0.5 min-w-0">
				<div class="text-xs sm:text-sm font-bold text-foreground">
					Themes & Private Sync
				</div>
				<p class="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">
					Works offline, supports Modern & Classic themes, and syncs seamlessly with your partner via private QR code.
				</p>
			</div>
		</Card>
	</div>

	<div class="pt-0.5">
		<button
			type="button"
			class="text-xs font-semibold text-primary hover:underline flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer"
			onclick={onScanQR}
		>
			<QrCode class="h-3.5 w-3.5" />
			<span>Have an invite? Scan Partner QR</span>
		</button>
	</div>
</div>
