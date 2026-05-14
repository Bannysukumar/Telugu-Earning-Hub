/** Vite `base` + API path (works when app is hosted under a subpath). */
export function apiUrl(apiPath: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return `${base}${path}`;
}
