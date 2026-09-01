export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastItem {
	id: string;
	message: string;
	variant: ToastVariant;
	durationMs: number;
}

const MAX_TOASTS = 3;
const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
	default: 3500,
	success: 3500,
	error: 5000
};

let toastList = $state<ToastItem[]>([]);
const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const toasts = {
	get items(): readonly ToastItem[] {
		return toastList;
	}
};

export function dismissToast(id: string): void {
	const timer = activeTimers.get(id);
	if (timer) {
		clearTimeout(timer);
		activeTimers.delete(id);
	}
	toastList = toastList.filter((t) => t.id !== id);
}

export function showToast(
	message: string,
	variant: ToastVariant = 'default',
	durationMs?: number
): void {
	const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
	const duration = durationMs ?? DEFAULT_DURATIONS[variant];

	// Remove oldest if limit reached
	while (toastList.length >= MAX_TOASTS) {
		const oldest = toastList[0];
		dismissToast(oldest.id);
	}

	const item: ToastItem = {
		id,
		message,
		variant,
		durationMs: duration
	};

	toastList = [...toastList, item];

	const timer = setTimeout(() => {
		dismissToast(id);
	}, duration);

	activeTimers.set(id, timer);
}
