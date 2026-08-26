/// <reference types="vite-plugin-pwa/client" />

declare module 'virtual:pwa-info' {
	export const pwaInfo:
		| {
				webManifest: {
					linkTag: string;
					href: string;
				};
		  }
		| undefined;
}
