import { astro, FetchState } from "astro/fetch";

export default {
  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/empty") {
      return new Response(null, { status: 204 });
    }
    if (pathname.startsWith("/api/")) {
      return new Response("from-fetch", {
        status: 242,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return astro(new FetchState(request));
  },
};
