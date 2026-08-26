// The whole app is a client-rendered shell: every byte of UI state comes out of
// IndexedDB, so SSR produced no useful markup. Prerendering the root route gives
// Workbox a real `/` document to precache and serve as the offline navigation
// fallback — without it `createHandlerBoundToURL('/')` throws and the service
// worker dies before it can cache anything.
//
// `/api/*` endpoints opt back out individually with `export const prerender = false`.
export const prerender = true;
export const ssr = false;
