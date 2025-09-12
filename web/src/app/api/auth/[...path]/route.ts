// /web/src/app/api/auth/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE || "http://api:8000";

function copyHeaders(src: Headers) {
  const dst = new Headers();
  src.forEach((v, k) => {
    if (k.toLowerCase() === "host") return; // don't forward browser Host
    dst.set(k, v);
  });
  if (!dst.has("content-type")) dst.set("content-type", "application/json");
  return dst;
}

async function forward(req: NextRequest, ctx: { params: { path?: string[] } }) {
  const tail = (ctx.params.path ?? []).join("/");
  const url = `${API_BASE}/auth/${tail}${req.nextUrl.search || ""}`;

  const headers = copyHeaders(req.headers);

  // Read incoming body as text (safe for Edge/Node)
  let body: string | undefined = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
  }

  // Safety timeout => no more “hangs”
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);

  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: ac.signal,
    });

    // ⬇️ Buffer the body instead of streaming it through
    const ct = upstream.headers.get("content-type") || "application/json; charset=utf-8";
    const text = await upstream.text();

    const res = new NextResponse(text, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    // Propagate cookies and content-type, but avoid content-encoding/length
    res.headers.set("content-type", ct);
    const setCookie = upstream.headers.get("set-cookie");
    if (setCookie) res.headers.set("set-cookie", setCookie);
    res.headers.set("cache-control", "no-store");

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { error: "upstream_error", message: String(err?.message || err) },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
