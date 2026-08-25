<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { UIThemeId, ColorMode, ColorPalette } from '$lib/types/profile';
	import type { MilestoneItem } from '$lib/types/time';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input';
	import Switch from '$lib/components/ui/switch';
	import Badge from '$lib/components/ui/badge';
	import {
		Palette,
		Sun,
		Moon,
		Monitor,
		Upload,
		Trash2,
		Trophy,
		Sparkles,
		RotateCcw,
		UploadCloud,
		PartyPopper,
		HeartHandshake,
		Plus,
		Check,
		BellRing
	} from '@lucide/svelte';
	import { subscribeToPush, unsubscribeFromPush, sendTestPush, isPushSupported } from '$lib/push/client';

	interface Props {
		open?: boolean;
		milestones: MilestoneItem[];
		onclose?: () => void;
	}

	let { open = $bindable(false), milestones, onclose }: Props = $props();

	let fileInputRef = $state<HTMLInputElement | null>(null);
	let backupInputRef = $state<HTMLInputElement | null>(null);

	// Push state
	let isPushLoading = $state(false);
	let pushStatusMessage = $state('');

	async function handlePushToggle(enable: boolean) {
		isPushLoading = true;
		pushStatusMessage = '';
		try {
			if (enable) {
				const res = await subscribeToPush();
				if (!res.success) {
					pushStatusMessage = res.error || 'Failed to enable notifications';
				} else {
					pushStatusMessage = 'Push notifications enabled!';
				}
			} else {
				await unsubscribeFromPush();
				pushStatusMessage = 'Push notifications disabled';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error updating push notifications';
		} finally {
			isPushLoading = false;
		}
	}

	async function handleTestPush() {
		isPushLoading = true;
		pushStatusMessage = 'Sending test notification...';
		try {
			const res = await sendTestPush();
			if (res.success) {
				pushStatusMessage = 'Test notification sent!';
			} else {
				pushStatusMessage = res.error || 'Failed to send test push';
			}
		} catch (err: any) {
			pushStatusMessage = err.message || 'Error sending test push';
		} finally {
			isPushLoading = false;
		}
	}

	// Milestone filter tab
	let selectedMilestoneTab = $state<'all' | 'months' | 'years' | 'days' | 'custom'>('all');

	let filteredMilestones = $derived(
		milestones.filter((m) => {
			if (selectedMilestoneTab === 'all') return true;
			return m.type === selectedMilestoneTab;
		})
	);

	// Custom milestone form
	let newMilestoneTitle = $state('');
	let newMilestoneDate = $state('');
	let isAddingMilestone = $state(false);

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			await profileStore.setPhoto(file);
		}
	}

	async function removePhoto() {
		await profileStore.setPhoto(null);
	}

	async function handleBackupImport(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			const text = await file.text();
			const ok = await profileStore.importJSON(text);
			if (ok) {
				alert('Profile restored successfully!');
			} else {
				alert('Failed to restore backup. Invalid file format.');
			}
		}
	}

	async function addCustomMilestone() {
		if (!newMilestoneTitle.trim() || !newMilestoneDate) return;

		const current = profileStore.profile.customMilestones;
		const updated = [
			...current,
			{
				id: `custom_${Date.now()}`,
				title: newMilestoneTitle.trim(),
				date: newMilestoneDate
			}
		];
		await profileStore.update({ customMilestones: updated });
		newMilestoneTitle = '';
		newMilestoneDate = '';
		isAddingMilestone = false;
	}

	async function deleteCustomMilestone(id: string) {
		const current = profileStore.profile.customMilestones;
		const updated = current.filter((m) => m.id !== id);
		await profileStore.update({ customMilestones: updated });
	}

	const palettes: { id: ColorPalette; name: string; bg: string }[] = [
		{ id: 'rose', name: 'Rose', bg: 'bg-rose-500' },
		{ id: 'lavender', name: 'Lavender', bg: 'bg-purple-500' },
		{ id: 'terracotta', name: 'Terracotta', bg: 'bg-orange-600' },
		{ id: 'sage', name: 'Sage', bg: 'bg-emerald-600' },
		{ id: 'midnight', name: 'Midnight', bg: 'bg-blue-600' }
	];
</script>

<Modal bind:open title="Settings & Customization" description="Customize your relationship tracker" {onclose}>
	<div class="space-y-6 pb-4">
		<!-- Names & Anniversary Date -->
		<section class="space-y-3">
			<label for="settings-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Names</label>
			<Input
				id="settings-names"
				value={profileStore.profile.names}
				placeholder="e.g. Emma & Paul"
				oninput={(e) => profileStore.update({ names: (e.target as HTMLInputElement).value })}
			/>

			<label for="settings-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block pt-1">Together Since Date</label>
			<Input
				id="settings-date"
				type="date"
				value={profileStore.profile.togetherSince}
				onchange={(e) => profileStore.update({ togetherSince: (e.target as HTMLInputElement).value })}
			/>
		</section>

		<!-- Couple Photo -->
		<section class="space-y-3">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Couple Photo</span>
			<div class="flex items-center gap-4">
				<div class="h-16 w-16 rounded-2xl overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
					{#if profileStore.profile.photoUrl}
						<img src={profileStore.profile.photoUrl} alt="Couple" class="h-full w-full object-cover" />
					{:else}
						<Upload class="h-6 w-6 text-muted-foreground" />
					{/if}
				</div>

				<div class="flex flex-col gap-2 flex-1">
					<input
						type="file"
						accept="image/*"
						class="hidden"
						bind:this={fileInputRef}
						onchange={handlePhotoUpload}
					/>
					<Button size="sm" variant="outline" onclick={() => fileInputRef?.click()}>
						<Upload class="h-4 w-4 mr-1.5" />
						<span>{profileStore.profile.photoUrl ? 'Change Photo' : 'Upload Photo'}</span>
					</Button>

					{#if profileStore.profile.photoUrl}
						<Button size="sm" variant="ghost" class="text-destructive hover:bg-destructive/10" onclick={removePhoto}>
							<Trash2 class="h-4 w-4 mr-1.5" />
							<span>Remove Photo</span>
						</Button>
					{/if}
				</div>
			</div>
		</section>

		<!-- UI Style (Modern vs Traditional) -->
		<section class="space-y-3">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">UI Style Theme</span>
			<div class="grid grid-cols-2 gap-2.5">
				<button
					type="button"
					class="p-3 rounded-2xl border text-left transition-all cursor-pointer {profileStore.profile.uiTheme === 'modern'
						? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground'
						: 'border-border bg-card/60 text-foreground hover:bg-accent'}"
					onclick={() => profileStore.setUITheme('modern')}
				>
					<div class="flex items-center justify-between font-bold text-sm">
						<span>Modern UI</span>
						{#if profileStore.profile.uiTheme === 'modern'}
							<Check class="h-4 w-4 text-primary" />
						{/if}
					</div>
					<p class="text-[11px] text-muted-foreground mt-1">Cards, glowing avatar & progress metrics</p>
				</button>

				<button
					type="button"
					class="p-3 rounded-2xl border text-left transition-all cursor-pointer {profileStore.profile.uiTheme === 'traditional'
						? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground'
						: 'border-border bg-card/60 text-foreground hover:bg-accent'}"
					onclick={() => profileStore.setUITheme('traditional')}
				>
					<div class="flex items-center justify-between font-bold text-sm">
						<span>Traditional</span>
						{#if profileStore.profile.uiTheme === 'traditional'}
							<Check class="h-4 w-4 text-primary" />
						{/if}
					</div>
					<p class="text-[11px] text-muted-foreground mt-1">Original My Love crimson top bar layout</p>
				</button>
			</div>
		</section>

		<!-- Dark Mode & Palette -->
		<section class="space-y-3">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Color Appearance</span>
			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					class="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer {profileStore.profile.colorMode === 'system'
						? 'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary'
						: 'border-border bg-card/60 text-foreground hover:bg-accent'}"
					onclick={() => profileStore.setColorMode('system')}
				>
					<Monitor class="h-4 w-4 {profileStore.profile.colorMode === 'system' ? 'text-primary' : 'text-muted-foreground'}" />
					<span class="text-xs">System</span>
				</button>

				<button
					type="button"
					class="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer {profileStore.profile.colorMode === 'light'
						? 'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary'
						: 'border-border bg-card/60 text-foreground hover:bg-accent'}"
					onclick={() => profileStore.setColorMode('light')}
				>
					<Sun class="h-4 w-4 {profileStore.profile.colorMode === 'light' ? 'text-primary' : 'text-muted-foreground'}" />
					<span class="text-xs">Light</span>
				</button>

				<button
					type="button"
					class="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer {profileStore.profile.colorMode === 'dark'
						? 'border-primary bg-primary/15 font-bold shadow-xs ring-2 ring-primary/25 text-primary'
						: 'border-border bg-card/60 text-foreground hover:bg-accent'}"
					onclick={() => profileStore.setColorMode('dark')}
				>
					<Moon class="h-4 w-4 {profileStore.profile.colorMode === 'dark' ? 'text-primary' : 'text-muted-foreground'}" />
					<span class="text-xs">Dark</span>
				</button>
			</div>

			<!-- Accent Palette -->
			{#if profileStore.profile.uiTheme === 'modern'}
				<div class="pt-2">
					<span class="text-[11px] text-muted-foreground font-medium block mb-2">Accent Color</span>
					<div class="flex items-center gap-3 px-2">
						{#each palettes as p}
							<button
								type="button"
								class="h-8 w-8 rounded-full {p.bg} transition-transform cursor-pointer flex items-center justify-center {profileStore.profile.colorPalette === p.id ? 'ring-5 ring-primary/30 scale-110' : 'opacity-80 hover:opacity-100'}"
								onclick={() => profileStore.setColorPalette(p.id)}
								title={p.name}
								aria-label={p.name}
							>
								{#if profileStore.profile.colorPalette === p.id}
									<Check class="h-4 w-4 text-white" />
								{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<!-- Push Notifications Toggle -->
		<section class="p-3 rounded-2xl bg-card border border-border space-y-3">
			<div class="flex items-center justify-between">
				<div class="space-y-0.5">
					<div class="text-sm font-semibold flex items-center gap-1.5">
						<BellRing class="h-4 w-4 text-primary" />
						<span>Milestone Notifications</span>
					</div>
					<div class="text-xs text-muted-foreground">Get alerted on anniversaries & special days</div>
				</div>
				<Switch
					checked={profileStore.profile.pushSubscribed}
					disabled={isPushLoading}
					onchange={handlePushToggle}
				/>
			</div>

			{#if profileStore.profile.pushSubscribed}
				<div class="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
					<span class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Device Connected</span>
					<Button size="sm" variant="outline" class="h-7 text-xs px-2.5" onclick={handleTestPush} disabled={isPushLoading}>
						<span>Send Test Push</span>
					</Button>
				</div>
			{/if}

			{#if pushStatusMessage}
				<p class="text-xs text-muted-foreground italic">{pushStatusMessage}</p>
			{/if}
		</section>

		<!-- Ticking Seconds Toggle -->
		<section class="flex items-center justify-between p-3 rounded-2xl bg-card border border-border">
			<div>
				<div class="text-sm font-semibold">Live Ticking Seconds</div>
				<div class="text-xs text-muted-foreground">Show live ticking second counters</div>
			</div>
			<Switch
				checked={profileStore.profile.showSeconds}
				onchange={(val) => profileStore.update({ showSeconds: val })}
			/>
		</section>

		<!-- Milestones List & Custom Milestones -->
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Special Milestones (Months, Years, Days)</span>
				<Button size="sm" variant="ghost" onclick={() => (isAddingMilestone = !isAddingMilestone)}>
					<Plus class="h-4 w-4 mr-1" />
					<span>Add Custom</span>
				</Button>
			</div>

			{#if isAddingMilestone}
				<div class="p-3 rounded-2xl bg-card border border-border space-y-2">
					<Input placeholder="Milestone Name (e.g. First Date, Moved In)" bind:value={newMilestoneTitle} />
					<Input type="date" bind:value={newMilestoneDate} />
					<div class="flex gap-2">
						<Button size="sm" class="flex-1" onclick={addCustomMilestone}>Save</Button>
						<Button size="sm" variant="outline" onclick={() => (isAddingMilestone = false)}>Cancel</Button>
					</div>
				</div>
			{/if}

			<!-- Filter tabs -->
			<div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
				{#each [
					{ id: 'all' as const, label: 'All' },
					{ id: 'months' as const, label: 'Months' },
					{ id: 'years' as const, label: 'Years' },
					{ id: 'days' as const, label: 'Days' },
					{ id: 'custom' as const, label: 'Custom' }
				] as tab}
					<button
						type="button"
						class="px-2.5 py-1 rounded-full font-medium transition-colors cursor-pointer {selectedMilestoneTab === tab.id
							? 'bg-primary text-white shadow-sm'
							: 'bg-card text-muted-foreground hover:text-foreground border border-border'}"
						onclick={() => (selectedMilestoneTab = tab.id)}
					>
						{tab.label}
					</button>
				{/each}
			</div>

			<div class="space-y-2 max-h-52 overflow-y-auto pr-1">
				{#each filteredMilestones as m}
					<div class="flex items-center justify-between p-2.5 rounded-xl bg-card border border-border/60 text-xs text-foreground">
						<div class="flex items-center gap-2">
							{#if m.type === 'years'}
								<PartyPopper class="h-4 w-4 text-amber-500 shrink-0" />
							{:else if m.type === 'months'}
								<Sparkles class="h-4 w-4 text-rose-500 shrink-0" />
							{:else if m.type === 'custom'}
								<HeartHandshake class="h-4 w-4 text-primary shrink-0" />
							{:else}
								<Trophy class="h-4 w-4 text-amber-600 shrink-0" />
							{/if}
							<span class="font-medium {m.isAchieved ? 'line-through text-muted-foreground' : 'text-foreground'}">{m.title}</span>
						</div>
						<div class="flex items-center gap-1.5">
							<Badge variant={m.isAchieved ? 'secondary' : 'romantic'} class="text-[10px]">
								{m.isAchieved ? 'Achieved' : `in ${m.daysRemaining} days`}
							</Badge>
							{#if m.type === 'custom'}
								<button
									type="button"
									class="text-muted-foreground hover:text-destructive p-1 rounded transition-colors cursor-pointer"
									onclick={() => deleteCustomMilestone(m.id.replace('custom_', ''))}
									title="Delete"
									aria-label="Delete milestone"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Backup & Reset -->
		<section class="pt-2 border-t border-border space-y-2">
			<input
				type="file"
				accept=".json"
				class="hidden"
				bind:this={backupInputRef}
				onchange={handleBackupImport}
			/>
			<Button variant="outline" class="w-full" onclick={() => backupInputRef?.click()}>
				<UploadCloud class="h-4 w-4 mr-1.5" />
				<span>Restore from JSON Backup</span>
			</Button>

			<Button variant="ghost" class="w-full text-destructive hover:bg-destructive/10" onclick={() => {
				if (confirm('Are you sure you want to reset all data?')) {
					profileStore.reset();
				}
			}}>
				<RotateCcw class="h-4 w-4 mr-1.5" />
				<span>Reset All Data</span>
			</Button>
		</section>
	</div>
</Modal>
