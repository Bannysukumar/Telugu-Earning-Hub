/**
 * Must stay in sync with Orval’s `getGetMeQueryKey()` in `@workspace/api-client-react`
 * (currently `["/api/auth/me"]`). Used so the app does not depend on that symbol’s barrel re-export under Vite.
 */
export const AUTH_ME_QUERY_KEY = ["/api/auth/me"] as const;
