import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("@/lib/db");
});

describe("idempotency helpers", () => {
  it("returns replay response when active record exists", async () => {
    vi.doMock("@/lib/db", () => ({
      prisma: {
        idempotencyRecord: {
          findUnique: vi.fn(async () => ({
            id: "idem-1",
            userId: "user-1",
            endpoint: "/api/example",
            keyHash: "hash",
            statusCode: 200,
            responseBody: { value: "cached" },
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
          })),
          delete: vi.fn(async () => undefined),
          upsert: vi.fn(async () => undefined),
        },
      },
    }));

    const { getIdempotentReplayResponse } = await import("./idempotency");
    const replayed = await getIdempotentReplayResponse(
      "user-1",
      "/api/example",
      "demo-key",
    );

    expect(replayed).not.toBeNull();
    expect(replayed?.status).toBe(200);
    expect(replayed?.headers.get("Idempotency-Key")).toBe("demo-key");
    expect(replayed?.headers.get("Idempotency-Replayed")).toBe("true");
    await expect(replayed?.json()).resolves.toMatchObject({ value: "cached" });
  });

  it("deletes expired records and returns null", async () => {
    const deleteMock = vi.fn(async () => undefined);
    vi.doMock("@/lib/db", () => ({
      prisma: {
        idempotencyRecord: {
          findUnique: vi.fn(async () => ({
            id: "idem-expired",
            userId: "user-1",
            endpoint: "/api/example",
            keyHash: "hash",
            statusCode: 200,
            responseBody: { value: "old" },
            createdAt: new Date(Date.now() - 120_000),
            expiresAt: new Date(Date.now() - 60_000),
          })),
          delete: deleteMock,
          upsert: vi.fn(async () => undefined),
        },
      },
    }));

    const { getIdempotentResponse } = await import("./idempotency");
    const result = await getIdempotentResponse("user-1", "/api/example", "demo-key");

    expect(result).toBeNull();
    expect(deleteMock).toHaveBeenCalledOnce();
  });

  it("persists response snapshot and marks first response as non-replayed", async () => {
    const upsertMock = vi.fn(async () => ({
      id: "idem-new",
    }));
    vi.doMock("@/lib/db", () => ({
      prisma: {
        idempotencyRecord: {
          findUnique: vi.fn(async () => null),
          delete: vi.fn(async () => undefined),
          upsert: upsertMock,
        },
      },
    }));

    const { maybeSaveIdempotentResponse } = await import("./idempotency");
    const response = NextResponse.json(
      {
        created: true,
      },
      { status: 201 },
    );

    const saved = await maybeSaveIdempotentResponse(
      "user-1",
      "/api/example",
      "first-key",
      response,
    );

    expect(upsertMock).toHaveBeenCalledOnce();
    expect(saved.status).toBe(201);
    expect(saved.headers.get("Idempotency-Key")).toBe("first-key");
    expect(saved.headers.get("Idempotency-Replayed")).toBe("false");
    await expect(saved.json()).resolves.toMatchObject({ created: true });
  });
});
