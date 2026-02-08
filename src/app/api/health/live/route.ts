import { NextRequest } from "next/server";
import { ok } from "@/lib/http";

export async function GET(request: NextRequest) {
  return ok(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    200,
    request,
  );
}
