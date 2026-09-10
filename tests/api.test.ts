import { describe, expect, it, vi } from "vitest";
import { createApp } from "../apps/worker/src/app";
import { z } from "zod";
import type { Actor } from "../packages/domain/src/access";
const actor: Actor = {
  id: "u1",
  organizationId: "a",
  displayName: "Pengurus Uji",
  status: "active",
  roles: ["admin"],
  scopes: [],
};
function fixture(
  identity: Actor | null = actor,
  authLimit: { success: boolean } = { success: true },
) {
  const dependencies = {
    verify: vi.fn(async () => "synthetic@example.invalid"),
    findActor: vi.fn(async () => identity),
    timezone: vi.fn(async () => ({ timezone: "Asia/Makassar" })),
    audit: vi.fn(async () => {}),
  };
  const app = createApp(dependencies);
  const env = {
    ORGANIZATION_ID: "a",
    APP_ORIGIN: "https://app.example.invalid",
    ACCESS_ISSUER: "https://synthetic.cloudflareaccess.com",
    ACCESS_AUDIENCE: "synthetic-audience",
    ENVIRONMENT: "local" as const,
    AUTH_LIMITER: { limit: async () => authLimit },
  };
  const request = (
    path = "/api/v1/me",
    headers: Record<string, string> = {
      "Cf-Access-Jwt-Assertion": "test-assertion",
    },
  ) => app.request(path, { headers }, env);
  return { dependencies, request };
}
describe("identity API", () => {
  it("rejects unauthenticated requests and forged email headers", async () => {
    const { request, dependencies } = fixture();
    expect(
      (
        await request("/api/v1/me", {
          "Cf-Access-Authenticated-User-Email": "admin@example.invalid",
        })
      ).status,
    ).toBe(401);
    expect(dependencies.findActor).not.toHaveBeenCalled();
  });
  it("rejects invalid JWT before reading D1", async () => {
    const { request, dependencies } = fixture();
    dependencies.verify.mockRejectedValue(new Error("private token detail"));
    const response = await request();
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("private");
    expect(dependencies.findActor).not.toHaveBeenCalled();
  });
  it("rate limits authentication before JWT verification", async () => {
    const { request, dependencies } = fixture(actor, { success: false });
    const response = await request();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(dependencies.verify).not.toHaveBeenCalled();
    expect(dependencies.findActor).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...actor, status: "suspended" as const },
    { ...actor, status: "inactive" as const },
    { ...actor, organizationId: "b" },
    { ...actor, roles: [] },
  ])("rejects unavailable identity %#", async (identity) => {
    const { request, dependencies } = fixture(identity);
    expect((await request()).status).toBe(401);
    expect(dependencies.audit).not.toHaveBeenCalled();
  });
  it("returns minimized identity and records audit", async () => {
    const { request, dependencies } = fixture();
    const response = await request();
    const payload = z
      .object({
        request_id: z.string(),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(await response.json());
    expect(response.status).toBe(200);
    expect(payload.data.displayName).toBe("Pengurus Uji");
    expect(payload.data.email).toBeUndefined();
    expect(payload.data.id).toBeUndefined();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe(payload.request_id);
    expect(dependencies.audit).toHaveBeenCalledOnce();
  });
  it("rejects foreign origin and unknown query fields", async () => {
    const { request } = fixture();
    expect(
      (await request("/api/v1/me", { Origin: "https://evil.example" })).status,
    ).toBe(403);
    expect((await request("/api/v1/me?organization_id=b")).status).toBe(422);
  });
  it("fails closed when audit persistence fails", async () => {
    const { request, dependencies } = fixture();
    dependencies.audit.mockRejectedValue(new Error("SQL private detail"));
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SQL");
  });
  it("fails closed when the stored timezone is invalid", async () => {
    const { request, dependencies } = fixture();
    dependencies.timezone.mockResolvedValue({ timezone: "Invalid/Timezone" });
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Invalid/Timezone");
  });
});
