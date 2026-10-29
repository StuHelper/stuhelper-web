import type { components } from "./session.gen";
export type Session = components["schemas"]["Session"];
export type Profile = components["schemas"]["Profile"];

// Only the session-bound CSRF value is readable by JavaScript. OIDC tokens and
// the application session remain in the backend and an HttpOnly cookie.
export const sessionFetch: typeof fetch = (input, init) => {
  if (typeof window !== 'undefined') {
    const target = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href,
    );
    if (target.origin !== window.location.origin) throw new TypeError("session_origin_mismatch");
  }
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && typeof document !== "undefined") {
    const value = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("stuhelper_csrf="))
      ?.slice("stuhelper_csrf=".length);
    if (value) headers.set("X-CSRF-Token", value);
  }
  return fetch(input, { ...init, credentials: "same-origin", headers });
};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function profile(value: unknown): value is Profile {
  return (
    record(value) &&
    typeof value.nickname === "string" &&
    [...value.nickname].length >= 1 &&
    [...value.nickname].length <= 64 &&
    typeof value.revision === "number" &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 1
  );
}
export async function getSession(): Promise<Session | null> {
  const response = await sessionFetch("/api/v1/auth/session", {
    signal: AbortSignal.timeout(10000),
  });
  if ([401, 403].includes(response.status)) return null;
  if (!response.ok) throw new Error("session_unavailable");
  const value: unknown = await response.json();
  if (
    !record(value) ||
    value.authenticated !== true ||
    !profile(value.profile) ||
    typeof value.csrf_token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.csrf_token) ||
    typeof value.phone_bound !== "boolean" ||
    typeof value.administrator !== "boolean" ||
    typeof value.expires_at !== "string" ||
    !Number.isFinite(Date.parse(value.expires_at))
  )
    throw new Error("session_invalid");
  return {
    authenticated: true,
    profile: value.profile,
    csrf_token: value.csrf_token,
    phone_bound: value.phone_bound,
    administrator: value.administrator,
    expires_at: value.expires_at,
  };
}
export function signIn() {
  window.location.assign(
    "/api/v1/auth/login?return_to=" +
      encodeURIComponent(window.location.href.split("#")[0] ?? window.location.origin),
  );
}
export async function signOut(all = false) {
  const response = await sessionFetch("/api/v1/auth/" + (all ? "logout-all" : "logout"), {
    method: "POST",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("logout_failed");
  window.location.assign("/");
}
export async function saveProfile(value: Profile, key: string): Promise<Profile> {
  const response = await sessionFetch("/api/v1/profiles/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("profile_failed");
  const body: unknown = await response.json();
  if (!profile(body)) throw new Error("profile_invalid");
  return body;
}
