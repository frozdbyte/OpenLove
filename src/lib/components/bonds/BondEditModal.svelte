<script lang="ts">
	import { profileStore } from '$lib/stores/profile.svelte';
	import type { Bond, BondType, DaysMilestoneFilter } from '$lib/types/bonds';
	import Modal from '$lib/components/ui/dialog/modal.svelte';
	import Button from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input';
	import Switch from '$lib/components/ui/switch';
	import {
		Heart,
		Sparkles,
		Upload,
		Trash2,
		BellRing,
		PartyPopper,
		Trophy,
		HeartHandshake
	} from '@lucide/svelte';

	interface Props {
		open?: boolean;
		bondToEdit?: Bond | null;
		onclose?: () => void;
	}

	let { open = $bindable(false), bondToEdit = null, onclose }: Props = $props();

	let fileInputRef = $state<HTMLInputElement | null>(null);

	// Form state
	let type = $state<BondType>('romantic');
	let names = $state('');
	let togetherSince = $state('');
	let photoBlob = $state<Blob | null>(null);
	let photoUrl = $state<string | undefined>(undefined);
	let notificationsEnabled = $state(true);
	let yearsPref = $state(true);
	let monthsPref = $state(true);
	let daysPref = $state<DaysMilestoneFilter>('all');
	let customPref = $state(true);

	$effect(() => {
		if (open) {
			if (bondToEdit) {
				type = bondToEdit.type || 'romantic';
				names = bondToEdit.names || '';
				togetherSince = bondToEdit.togetherSince || '';
				photoBlob = bondToEdit.photoBlob ?? null;
				photoUrl = bondToEdit.photoUrl;
				notificationsEnabled = bondToEdit.notificationsEnabled ?? true;
				yearsPref = bondToEdit.milestonePrefs?.years ?? true;
				monthsPref = bondToEdit.milestonePrefs?.months ?? (bondToEdit.type === 'friendship' ? false : true);
				daysPref = bondToEdit.milestonePrefs?.days ?? (bondToEdit.type === 'friendship' ? 'major' : 'all');
				customPref = bondToEdit.milestonePrefs?.custom ?? true;
			} else {
				// New bond defaults
				type = 'romantic';
				names = '';
				togetherSince = new Date().toISOString().split('T')[0];
				photoBlob = null;
				photoUrl = undefined;
				notificationsEnabled = true;
				yearsPref = true;
				monthsPref = true;
				daysPref = 'all';
				customPref = true;
			}
		}
	});

	function handleTypeChange(newType: BondType) {
		type = newType;
		if (!bondToEdit) {
			// Adjust smart defaults on type switch for new bonds
			if (newType === 'friendship') {
				monthsPref = false;
				daysPref = 'major';
			} else {
				monthsPref = true;
				daysPref = 'all';
			}
		}
	}

	async function handlePhotoUpload(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			const file = target.files[0];
			photoBlob = file;
			if (photoUrl && photoUrl.startsWith('blob:')) {
				URL.revokeObjectURL(photoUrl);
			}
			photoUrl = URL.createObjectURL(file);
		}
	}

	function removePhoto() {
		if (photoUrl && photoUrl.startsWith('blob:')) {
			URL.revokeObjectURL(photoUrl);
		}
		photoBlob = null;
		photoUrl = undefined;
	}

	async function handleSave() {
		if (!names.trim() || !togetherSince) return;

		const milestonePrefs = {
			years: yearsPref,
			months: monthsPref,
			days: daysPref,
			custom: customPref
		};

		if (bondToEdit) {
			// Update existing bond
			await profileStore.updateBond(bondToEdit.id, {
				type,
				names: names.trim(),
				togetherSince,
				notificationsEnabled,
				milestonePrefs
			});
			if (photoBlob !== undefined) {
				await profileStore.setPhoto(photoBlob, bondToEdit.id);
			}
		} else {
			// Create new bond
			const newId = `bond_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
			const newBond: Bond = {
				id: newId,
				type,
				names: names.trim(),
				togetherSince,
				photoBlob: null,
				photoUrl: undefined,
				customMilestones: [],
				notificationsEnabled,
				milestonePrefs
			};
			await profileStore.addBond(newBond);
			if (photoBlob) {
				await profileStore.setPhoto(photoBlob, newId);
			}
		}

		open = false;
		onclose?.();
	}

	async function handleDelete() {
		if (!bondToEdit) return;
		if (confirm(`Are you sure you want to delete "${bondToEdit.names}"?`)) {
			await profileStore.deleteBond(bondToEdit.id);
			open = false;
			onclose?.();
		}
	}
</script>

<Modal
	bind:open
	title={bondToEdit ? 'Edit Bond' : 'Add New Bond'}
	description={bondToEdit
		? 'Update relationship details and notification preferences'
		: 'Track another romantic relationship or friendship'}
	{onclose}
>
	<div class="space-y-5 pb-2">
		<!-- Bond Type Selector -->
		<div class="space-y-1.5">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Bond Type</span>
			<div class="grid grid-cols-2 gap-2.5">
				<button
					type="button"
					class="p-3 rounded-2xl border text-left transition-all cursor-pointer {type === 'romantic'
						? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground'
						: 'border-border bg-card/60 text-muted-foreground hover:bg-accent'}"
					onclick={() => handleTypeChange('romantic')}
				>
					<div class="flex items-center gap-2 font-bold text-sm text-foreground">
						<Heart class="h-4 w-4 text-rose-500 fill-rose-500/20" />
						<span>Relationship</span>
					</div>
					<p class="text-[11px] text-muted-foreground mt-0.5">Romantic couple & anniversaries</p>
				</button>

				<button
					type="button"
					class="p-3 rounded-2xl border text-left transition-all cursor-pointer {type === 'friendship'
						? 'border-primary bg-primary/10 ring-2 ring-primary/20 text-foreground'
						: 'border-border bg-card/60 text-muted-foreground hover:bg-accent'}"
					onclick={() => handleTypeChange('friendship')}
				>
					<div class="flex items-center gap-2 font-bold text-sm text-foreground">
						<Sparkles class="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
						<span>Friendship</span>
					</div>
					<p class="text-[11px] text-muted-foreground mt-0.5">Platonic best friends & bonds</p>
				</button>
			</div>
		</div>

		<!-- Names & Date -->
		<div class="space-y-3">
			<div>
				<label for="bond-names" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
					{type === 'friendship' ? 'Friends Names' : 'Partner Names'}
				</label>
				<Input
					id="bond-names"
					placeholder={type === 'friendship' ? 'e.g. Alex & Sam' : 'e.g. Emma & Paul'}
					bind:value={names}
				/>
			</div>

			<div>
				<label for="bond-date" class="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-1">
					{type === 'friendship' ? 'Friends Since' : 'Together Since'}
				</label>
				<Input id="bond-date" type="date" bind:value={togetherSince} />
			</div>
		</div>

		<!-- Photo Upload -->
		<div class="space-y-2">
			<span class="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Photo</span>
			<div class="flex items-center gap-3">
				<div class="h-14 w-14 rounded-2xl overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
					{#if photoUrl}
						<img src={photoUrl} alt="Preview" class="h-full w-full object-cover" />
					{:else if type === 'friendship'}
						<Sparkles class="h-6 w-6 text-muted-foreground" />
					{:else}
						<Heart class="h-6 w-6 text-muted-foreground" />
					{/if}
				</div>

				<div class="flex flex-col gap-1.5 flex-1">
					<input
						type="file"
						accept="image/*"
						class="hidden"
						bind:this={fileInputRef}
						onchange={handlePhotoUpload}
					/>
					<Button size="sm" variant="outline" onclick={() => fileInputRef?.click()}>
						<Upload class="h-3.5 w-3.5 mr-1.5" />
						<span>{photoUrl ? 'Change Photo' : 'Upload Photo'}</span>
					</Button>
					{#if photoUrl}
						<Button size="sm" variant="ghost" class="text-destructive hover:bg-destructive/10 h-7 text-xs" onclick={removePhoto}>
							<Trash2 class="h-3 w-3 mr-1" />
							<span>Remove</span>
						</Button>
					{/if}
				</div>
			</div>
		</div>

		<!-- Milestone & Push Notification Preferences -->
		<div class="p-3.5 rounded-2xl bg-card border border-border space-y-3">
			<div class="flex items-center justify-between">
				<div class="space-y-0.5">
					<div class="text-sm font-semibold flex items-center gap-1.5 text-foreground">
						<BellRing class="h-4 w-4 text-primary" />
						<span>Push Notifications</span>
					</div>
					<div class="text-xs text-muted-foreground">Alert on special milestones for this bond</div>
				</div>
				<Switch checked={notificationsEnabled} onchange={(v) => (notificationsEnabled = v)} />
			</div>

			{#if notificationsEnabled}
				<div class="pt-2 border-t border-border/50 space-y-2.5">
					<span class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
						Milestone Categories
					</span>

					<!-- Year Anniversaries -->
					<div class="flex items-center justify-between text-xs text-foreground">
						<div class="flex items-center gap-2">
							<PartyPopper class="h-3.5 w-3.5 text-amber-500" />
							<span>Yearly Anniversaries (1st, 2nd, 5th...)</span>
						</div>
						<Switch checked={yearsPref} onchange={(v) => (yearsPref = v)} />
					</div>

					<!-- Month Milestones -->
					<div class="flex items-center justify-between text-xs text-foreground">
						<div class="flex items-center gap-2">
							<Sparkles class="h-3.5 w-3.5 text-rose-500" />
							<span>Monthly Milestones (1st-11th mo, 18mo...)</span>
						</div>
						<Switch checked={monthsPref} onchange={(v) => (monthsPref = v)} />
					</div>

					<!-- Day Milestones -->
					<div class="space-y-1.5 pt-1">
						<div class="flex items-center justify-between text-xs text-foreground">
							<div class="flex items-center gap-2">
								<Trophy class="h-3.5 w-3.5 text-amber-600" />
								<span>Day Milestones</span>
							</div>
							<div class="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/40 text-[11px]">
								<button
									type="button"
									class="px-2 py-0.5 rounded-md transition-colors cursor-pointer {daysPref === 'all'
										? 'bg-primary text-white font-semibold shadow-xs'
										: 'text-muted-foreground hover:text-foreground'}"
									onclick={() => (daysPref = 'all')}
								>
									All
								</button>
								<button
									type="button"
									class="px-2 py-0.5 rounded-md transition-colors cursor-pointer {daysPref === 'major'
										? 'bg-primary text-white font-semibold shadow-xs'
										: 'text-muted-foreground hover:text-foreground'}"
									onclick={() => (daysPref = 'major')}
									title="Only 1,000+ days (1000, 2500, 5000...)"
								>
									Major (1000+)
								</button>
								<button
									type="button"
									class="px-2 py-0.5 rounded-md transition-colors cursor-pointer {daysPref === 'off'
										? 'bg-primary text-white font-semibold shadow-xs'
										: 'text-muted-foreground hover:text-foreground'}"
									onclick={() => (daysPref = 'off')}
								>
									Off
								</button>
							</div>
						</div>
					</div>

					<!-- Custom Moments -->
					<div class="flex items-center justify-between text-xs text-foreground">
						<div class="flex items-center gap-2">
							<HeartHandshake class="h-3.5 w-3.5 text-primary" />
							<span>Custom Moments</span>
						</div>
						<Switch checked={customPref} onchange={(v) => (customPref = v)} />
					</div>
				</div>
			{/if}
		</div>

		<!-- Actions -->
		<div class="flex items-center gap-2 pt-2">
			<Button class="flex-1" onclick={handleSave} disabled={!names.trim() || !togetherSince}>
				<span>{bondToEdit ? 'Save Changes' : 'Create Bond'}</span>
			</Button>

			{#if bondToEdit && profileStore.state.bonds.length > 1}
				<Button variant="outline" class="text-destructive hover:bg-destructive/10" onclick={handleDelete}>
					<Trash2 class="h-4 w-4" />
				</Button>
			{/if}
		</div>
	</div>
</Modal>
