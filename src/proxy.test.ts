import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy request id handling", () => {
  it("generates x-request-id when missing", () => {
    const request = new NextRequest("http://localhost/api/health/live");
    const response = proxy(request);

    const requestId = response.headers.get("x-request-id");
    expect(requestId).toBeTruthy();
  });

  it("preserves incoming x-request-id", () => {
    const request = new NextRequest("http://localhost/api/health/live", {
      headers: {
        "x-request-id": "incoming-request-id",
      },
    });

    const response = proxy(request);
    expect(response.headers.get("x-request-id")).toBe("incoming-request-id");
  });
});
