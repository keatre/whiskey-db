import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // If you see this JSON in the browser, the Next app route is wired correctly.
  return NextResponse.json({ ok: true, from: "next-app-route" }, { headers: { "cache-control": "no-store" } });
}
