import { afterEach, describe, expect, it, vi } from "vitest";
import { getSession, sessionFetch } from "./session";

afterEach(() => vi.unstubAllGlobals());
describe("application session transport", () => {
  it("adds session-bound CSRF on mutations without binding native fetch", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://app.example/", origin: "https://app.example" },
    });
    vi.stubGlobal("document", { cookie: "stuhelper_csrf=current-csrf" });
    const received: RequestInit[] = [];
    vi.stubGlobal("fetch", function (this: unknown, _input: RequestInfo | URL, init?: RequestInit) {
      expect(this).toBeUndefined();
      received.push(init ?? {});
      return Promise.resolve(Response.json({}));
    });
    await sessionFetch("/api/v1/profiles/me", { method: "PUT" });
    await sessionFetch("/api/v1/auth/session");
    expect(new Headers(received[0]?.headers).get("X-CSRF-Token")).toBe("current-csrf");
    expect(new Headers(received[1]?.headers).get("X-CSRF-Token")).toBeNull();
    expect(received[0]?.credentials).toBe("same-origin");
    expect(() => sessionFetch("https://external.example/", { method: "POST" })).toThrow(
      "session_origin_mismatch",
    );
  });
  it("distinguishes expired sessions from unavailable or malformed responses", async () => {
    vi.stubGlobal("window", {
      location: { href: "https://app.example/", origin: "https://app.example" },
    });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    expect(await getSession()).toBeNull();
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await expect(getSession()).rejects.toThrow("session_unavailable");
    fetcher.mockResolvedValueOnce(
      Response.json({ authenticated: true, profile: { nickname: "A", revision: "1" } }),
    );
    await expect(getSession()).rejects.toThrow("session_invalid");
  });
});
