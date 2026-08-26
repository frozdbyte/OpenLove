declare const __APP_VERSION__: string;

/**
 * The current application version dynamically injected from package.json by Vite at build/dev time.
 */
export const APP_VERSION: string =
	typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.2.0';
