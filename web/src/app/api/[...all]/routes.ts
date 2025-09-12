import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE || "http://api:8000";

// Remove hop-by-hop headers; browsers/Node will handle compression/chunking.
function cleanHeaders(h: Headers) {
  const out = new Headers();
  h.forEach((v, k) => {
    const key = k.toLowerCase();
    if (
      key === "host" ||
      key === "content-length" ||
      key === "content-encoding" ||
      key === "transfer-encoding" ||
      key === "connection"
    ) return;
    out.set(k, v);
  });
  return out;
}

async function handler(req: NextRequest, ctx: { params: { all?: string[] } }) {
  const tail = (ctx.params.all ?? []).join("/");
  const target = `${API_BASE}/${tail}${req.nextUrl.search || ""}`;

  // Buffer request body for non-GET/HEAD (prevents hanging streams)
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
  }

  const headers = cleanHeaders(req.headers);

  // Safety timeout so the client never hangs forever
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 15000);

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: ac.signal,
    });

    // Buffer upstream body fully; then reply once (avoids pending fetches)
    const text = await upstream.text();

    const res = new NextResponse(text, {
      status: upstream.status,
      statusText: upstream.statusText,
    });

    // Content type fallback so the browser knows how to parse it
    res.headers.set(
      "content-type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    );
    res.headers.set("cache-control", "no-store");
    res.headers.set("x-proxy", "next");

    // Forward ALL Set-Cookie headers (critical!)
    // Node/undici exposes getSetCookie(); fall back to single header if needed.
    const anyUp: any = upstream;
    const cookieArr: string[] | undefined = anyUp?.headers?.getSetCookie?.();
    if (Array.isArray(cookieArr) && cookieArr.length) {
      for (const c of cookieArr) res.headers.append("set-cookie", c);
    } else {
      const sc = upstream.headers.get("set-cookie");
      if (sc) res.headers.set("set-cookie", sc);
    }

    return res;
  } catch (err: any) {
    // Surface a clean error so the client fetch resolves
    return NextResponse.json(
      { error: "proxy_upstream_error", message: String(err?.message || err) },
      { status: 502, headers: { "cache-control": "no-store" } }
    );
  } finally {
    clearTimeout(t);
  }
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
