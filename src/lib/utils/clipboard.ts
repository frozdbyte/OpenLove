/**
 * Bulletproof clipboard copy utility.
 * Supports modern Async Clipboard API and legacy document.execCommand('copy')
 * for non-HTTPS environments (e.g. local IP HTTP testing).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	if (typeof window === 'undefined') return false;

	// 1. Try modern Async Clipboard API
	if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch (err) {
			console.warn('navigator.clipboard.writeText failed, attempting execCommand fallback:', err);
		}
	}

	// 2. Fallback using temporary textarea + execCommand('copy')
	try {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		textArea.setAttribute('readonly', '');
		document.body.appendChild(textArea);

		textArea.focus();
		textArea.select();
		textArea.setSelectionRange(0, text.length);

		const successful = document.execCommand('copy');
		document.body.removeChild(textArea);
		return successful;
	} catch (fallbackErr) {
		console.error('Failed to copy text using execCommand:', fallbackErr);
		return false;
	}
}
