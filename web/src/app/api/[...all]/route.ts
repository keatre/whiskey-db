// web/src/app/api/[...all]/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE || "http://api:8000";

const HOP = new Set([
  "connection",
  "transfer-encoding",
  "content-length",
  "content-encoding",
  "host",
]);

function copyReqHeaders(src: Headers) {
  const h = new Headers();
  src.forEach((v, k) => {
    if (!HOP.has(k.toLowerCase())) h.set(k, v);
  });
  return h;
}
function copyResHeaders(src: Headers) {
  const h = new Headers();
  src.forEach((v, k) => {
    if (k.toLowerCase() !== "content-length") h.append(k, v);
  });
  h.set("cache-control", "no-store");
  return h;
}

async function handler(req: NextRequest, ctx: { params: { all?: string[] } }) {
  console.log(`[Proxy] ENTER method=${req.method} url=${req.url}`);
  const parts = ctx.params?.all ?? [];
  const upstreamUrl = `${API_BASE}/${parts.map(encodeURIComponent).join("/")}`;

  console.log(
    `[Proxy] ${req.method} ${req.url} -> ${upstreamUrl}`
  );

  let body: BodyInit | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    console.log(`[Proxy] Request body length: ${text.length}`);
    body = text;
  }

  const headers = copyReqHeaders(req.headers);
  const sawCloudflare =
    ['cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ew-via'].some((h) =>
      req.headers.has(h)
    );
  if (sawCloudflare) {
    headers.set('x-whiskey-via', 'cloudflare');
  }
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort("upstream_timeout"), 15000);

  try {
    const res = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: ac.signal,
      cache: "no-store",
    });

    console.log(`[Proxy] Upstream responded: ${res.status}`);

    const resHeaders = copyResHeaders(res.headers);
    const ab = await res.arrayBuffer();
    const uint8 = new Uint8Array(ab);
    return new NextResponse(uint8, { status: res.status, headers: resHeaders });
  } catch (err: any) {
    console.error(
      `[Proxy ERROR] ${req.method} ${upstreamUrl}: ${err?.message || err}`
    );
    return NextResponse.json(
      {
        error: "upstream_error",
        upstream: upstreamUrl,
        message: String(err?.message || err),
      },
      { status: 502 }
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
