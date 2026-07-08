/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When set (e.g. production static hosting), API requests go to this origin instead of same-origin `/api`. No trailing slash. */
  readonly VITE_API_BASE_URL?: string;
}
