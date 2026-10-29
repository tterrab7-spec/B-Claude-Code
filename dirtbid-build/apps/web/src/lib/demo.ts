/** Demo mode: VITE_DEMO=1 swaps the API client for an in-memory implementation (src/demo/server.ts). */
export const IS_DEMO: boolean = (import.meta.env.VITE_DEMO as string | undefined) === '1';
export const DEMO_STATE_KEY = 'dirtbid_demo_state';
export const DEMO_BANNER_KEY = 'dirtbid_demo_banner_seen';
