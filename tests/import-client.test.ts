import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IMPORT_MESSAGES,
  commitSchedule,
  createPendingServant,
  excludeRow,
  fetchPreview,
  fetchServants,
  linkServant,
  reviewRow,
  uploadSchedule,
  validateSchedule,
} from "../apps/web/src/import-client";

type Call = { url: string; init: RequestInit };

/** Captures fetch calls and returns a stubbed JSON response. */
function stubFetch(payload: unknown, ok = true) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (url: string | URL | Request, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return {
        ok,
        status: ok ? 200 : 422,
        json: async () => payload,
      } as unknown as Response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

/** Returns the first captured call, failing loudly if fetch was never called. */
function first(calls: Call[]): Call {
  const call = calls[0];
  if (!call) throw new Error("fetch was not called");
  return call;
}

function headersOf(call: Call): Record<string, string> {
  const headers = call.init.headers;
  if (!headers) return {};
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return headers as Record<string, string>;
}

function bodyOf(call: Call): unknown {
  const body = call.init.body;
  if (typeof body !== "string") return undefined;
  return JSON.parse(body);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("import client request shape", () => {
  it("uploads the workbook as multipart without an idempotency key", async () => {
    const calls = stubFetch({
      data: { id: "b1", headers: ["Nomor"], mapping: { Nomor: "Nomor" } },
    });
    const file = new File(["x"], "jadwal.xlsx");
    const result = await uploadSchedule(file, "Jadwal Ibadah");
    expect(calls).toHaveLength(1);
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules");
    expect(call.init.method).toBe("POST");
    expect(call.init.credentials).toBe("same-origin");
    expect(call.init.body).toBeInstanceOf(FormData);
    expect(headersOf(call)["Idempotency-Key"]).toBeUndefined();
    expect(result.id).toBe("b1");
    expect(result.mapping).toEqual({ Nomor: "Nomor" });
  });

  it("validates with a POST, JSON body, and idempotency key", async () => {
    const calls = stubFetch({});
    await validateSchedule("b1", { Nomor: "Nomor" });
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/validate");
    expect(call.init.method).toBe("POST");
    const headers = headersOf(call);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Idempotency-Key"]).toMatch(/[0-9a-f-]{36}/);
    expect(bodyOf(call)).toEqual({
      mapping: { Nomor: "Nomor" },
      dateFormat: "dmy",
    });
  });

  it("commits with a POST and an empty JSON body", async () => {
    const calls = stubFetch({});
    await commitSchedule("b1");
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/commit");
    expect(call.init.method).toBe("POST");
    expect(bodyOf(call)).toEqual({});
  });

  it("excludes a row with a PUT to the row URL", async () => {
    const calls = stubFetch({});
    await excludeRow("b1", "r1");
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/rows/r1/exclude");
    expect(call.init.method).toBe("PUT");
  });

  it("links a servant with the field and servant id in the body", async () => {
    const calls = stubFetch({});
    await linkServant("b1", "r1", "mc", "s9");
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/rows/r1/resolution");
    expect(call.init.method).toBe("PUT");
    expect(bodyOf(call)).toEqual({ field: "mc", servantId: "s9" });
  });

  it("creates a pending servant with a POST and the field only", async () => {
    const calls = stubFetch({});
    await createPendingServant("b1", "r1", "preacher");
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/rows/r1/pending");
    expect(call.init.method).toBe("POST");
    expect(bodyOf(call)).toEqual({ field: "preacher" });
  });

  it("reviews a row with rowId merged into the change", async () => {
    const calls = stubFetch({});
    await reviewRow("b1", "r1", { acknowledgeWarnings: true });
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/resolutions");
    expect(call.init.method).toBe("PUT");
    expect(bodyOf(call)).toEqual({ rowId: "r1", acknowledgeWarnings: true });
  });

  it("fetches the preview with the requested limit and no idempotency key", async () => {
    const calls = stubFetch({ data: [] });
    await fetchPreview("b1", 50);
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/preview?limit=50");
    expect(call.init.method).toBeUndefined();
    expect(call.init.headers).toBeUndefined();
  });

  it("fetches servants and unwraps the data array", async () => {
    const calls = stubFetch({
      data: [{ id: "s1", displayName: "Pelayan A" }],
    });
    const servants = await fetchServants("b1");
    const call = first(calls);
    expect(call.url).toBe("/api/v1/imports/schedules/b1/servants");
    expect(servants).toEqual([{ id: "s1", displayName: "Pelayan A" }]);
  });
});

describe("import client failure branches", () => {
  it.each([
    ["upload", () => uploadSchedule(new File(["x"], "a.xlsx"), "Sheet")],
    ["validate", () => validateSchedule("b1", {})],
    ["commit", () => commitSchedule("b1")],
    ["exclude", () => excludeRow("b1", "r1")],
    ["link", () => linkServant("b1", "r1", "mc", "s9")],
    ["pending", () => createPendingServant("b1", "r1", "mc")],
    ["review", () => reviewRow("b1", "r1", { action: "skip" })],
    ["preview", () => fetchPreview("b1")],
    ["servants", () => fetchServants("b1")],
  ])("rejects when %s returns a non-OK response", async (_name, run) => {
    stubFetch({}, false);
    await expect(run()).rejects.toThrow();
  });

  it("surfaces the exact user-facing message for each failure", () => {
    expect(IMPORT_MESSAGES.uploadFailed).toContain("XLSX maksimal 5 MB");
    expect(IMPORT_MESSAGES.validateFailed).toContain("mapping");
    expect(IMPORT_MESSAGES.commitFailed).toContain("Commit diblokir");
    expect(IMPORT_MESSAGES.excludeFailed).toContain("Coba lagi");
    expect(IMPORT_MESSAGES.linkFailed).toContain("belum tersimpan");
    expect(IMPORT_MESSAGES.pendingFailed).toContain("pending review");
    expect(IMPORT_MESSAGES.reviewFailed).toContain("belum dapat disimpan");
  });
});
