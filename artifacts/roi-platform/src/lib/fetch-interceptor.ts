// Intercept all native fetch calls to append the JWT token
const originalFetch = window.fetch;

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = requestUrl(input);

  if (url.includes("/api/")) {
    const token = localStorage.getItem("roi_token");

    if (token) {
      // @workspace/api-client-react passes headers as a Headers instance. Object-spread
      // on Headers drops every header (e.g. Content-Type), so Express leaves req.body {}.
      const next: RequestInit = init ? { ...init } : {};
      const headers = new Headers(init?.headers);
      if (!headers.has("Authorization") && !headers.has("authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      next.headers = headers;
      init = next;
    }
  }

  const response = await originalFetch(input, init);

  // Auto-logout on 401 Unauthorized (unless it's the login route itself)
  if (response.status === 401 && !url.includes("/auth/login") && !url.includes("/auth/register")) {
    localStorage.removeItem("roi_token");
    localStorage.removeItem("roi_user");
    window.location.href = "/login";
  }

  return response;
};
