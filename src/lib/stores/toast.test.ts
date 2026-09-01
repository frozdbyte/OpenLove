import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toasts, showToast, dismissToast } from './toast.svelte';

describe('toast store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Clear existing toasts
		while (toasts.items.length > 0) {
			dismissToast(toasts.items[0].id);
		}
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('adds a default toast with 3500ms duration', () => {
		showToast('Hello world');
		expect(toasts.items).toHaveLength(1);
		expect(toasts.items[0].message).toBe('Hello world');
		expect(toasts.items[0].variant).toBe('default');
		expect(toasts.items[0].durationMs).toBe(3500);
	});

	it('adds success and error toasts with correct default durations', () => {
		showToast('Success msg', 'success');
		showToast('Error msg', 'error');
		expect(toasts.items).toHaveLength(2);
		expect(toasts.items[0].variant).toBe('success');
		expect(toasts.items[0].durationMs).toBe(3500);
		expect(toasts.items[1].variant).toBe('error');
		expect(toasts.items[1].durationMs).toBe(5000);
	});

	it('respects custom durationMs', () => {
		showToast('Custom duration', 'default', 10000);
		expect(toasts.items[0].durationMs).toBe(10000);
	});

	it('limits to 3 toasts max, evicting the oldest', () => {
		showToast('Toast 1');
		showToast('Toast 2');
		showToast('Toast 3');
		expect(toasts.items).toHaveLength(3);
		expect(toasts.items[0].message).toBe('Toast 1');

		showToast('Toast 4');
		expect(toasts.items).toHaveLength(3);
		expect(toasts.items[0].message).toBe('Toast 2');
		expect(toasts.items[1].message).toBe('Toast 3');
		expect(toasts.items[2].message).toBe('Toast 4');
	});

	it('auto-dismisses toasts after duration expires', () => {
		showToast('Auto dismiss test', 'success', 2000);
		expect(toasts.items).toHaveLength(1);

		vi.advanceTimersByTime(1999);
		expect(toasts.items).toHaveLength(1);

		vi.advanceTimersByTime(2);
		expect(toasts.items).toHaveLength(0);
	});

	it('allows manual dismissal before timer fires', () => {
		showToast('Manual dismiss', 'default', 5000);
		const id = toasts.items[0].id;
		dismissToast(id);
		expect(toasts.items).toHaveLength(0);

		// Advance timer to ensure no error is thrown
		vi.advanceTimersByTime(6000);
		expect(toasts.items).toHaveLength(0);
	});
});
