/**
 * Free Cloudflare Worker that reverse-proxies math.<your-domain> -> Cloud Run.
 *
 * Why: Cloud Run's own hosts (*.run.app, ghs.googlehosted.com) are blocked in mainland
 * China, while Cloudflare's edge is reachable. The Worker rewrites the URL host to the
 * run.app origin, so Cloud Run sees its own hostname and no domain mapping is needed.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = new URL(env.ORIGIN); // e.g. https://math-sprout-xxxx-de.a.run.app
    url.hostname = origin.hostname;
    url.protocol = "https:";
    url.port = "";

    const headers = new Headers(request.headers);
    headers.set("x-forwarded-host", new URL(request.url).hostname);
    headers.set("x-forwarded-proto", "https");

    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    // Rewrite any absolute redirects back to the public hostname.
    const resHeaders = new Headers(upstream.headers);
    const loc = resHeaders.get("location");
    if (loc && loc.includes(origin.hostname)) {
      resHeaders.set("location", loc.replace(origin.hostname, new URL(request.url).hostname));
    }
    return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
  },
};
