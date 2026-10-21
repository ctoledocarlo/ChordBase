import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Runs the real public/sw.js against a small pretend browser (an in-memory cache and a network that can be
 * switched off), to check what it keeps and what it serves when the connection is gone.
 */

type Listener = (event: unknown) => void;

function startWorker() {
  const code = readFileSync(join(__dirname, "../public/sw.js"), "utf8");
  const listeners: Record<string, Listener> = {};
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: Request | string) => (typeof r === "string" ? new URL(r, "https://church.test").toString() : r.url);
  const caches = {
    async open(name: string) {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        async match(request: Request | string) {
          return store.get(key(request))?.clone();
        },
        async put(request: Request | string, response: Response) {
          store.set(key(request), response);
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name: string) {
      return stores.delete(name);
    },
  };

  let online = true;
  const fetched: string[] = [];
  let answer: (url: string) => Response = () => new Response("fresh", { status: 200 });
  const fakeFetch = async (request: Request | string) => {
    const url = typeof request === "string" ? request : request.url;
    fetched.push(url);
    if (!online) throw new TypeError("Failed to fetch");
    const response = answer(url);
    // A browser marks a same-origin answer "basic"; a Response made in Node doesn't.
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  };

  const self = {
    location: { origin: "https://church.test" },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  runInNewContext(code, { self, caches, fetch: fakeFetch, Response, Request, URL, setTimeout, clearTimeout, Promise, console });

  /** Sends one request through the worker; resolves to its answer, or null if the worker left it to the browser. */
  async function ask(url: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) {
    const headers = new Headers(init.headers);
    // A stand-in for the browser's request: the real one can't be made with mode "navigate" from outside.
    const shown = { url: `https://church.test${url}`, method: init.method ?? "GET", mode: init.mode ?? "same-origin", headers } as unknown as Request;
    const answer: { promise: Promise<Response> | null } = { promise: null };
    listeners.fetch({ request: shown, respondWith: (p: Promise<Response>) => (answer.promise = p) });
    return answer.promise ? await answer.promise : null;
  }

  return {
    ask,
    stores,
    fetched,
    setOnline: (on: boolean) => (online = on),
    setAnswer: (fn: (url: string) => Response) => (answer = fn),
    activate: async () => {
      let done: Promise<unknown> = Promise.resolve();
      listeners.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
    },
    message: async (data: unknown) => {
      let done: Promise<unknown> = Promise.resolve();
      const replies: unknown[] = [];
      listeners.message({ data, ports: [{ postMessage: (m: unknown) => replies.push(m) }], waitUntil: (p: Promise<unknown>) => (done = p) });
      await done;
      return replies;
    },
  };
}

describe("the service worker", () => {
  it("keeps a page it fetched and shows that copy when the connection is gone", async () => {
    const sw = startWorker();
    sw.setAnswer(() => new Response("<html>the setlist</html>", { status: 200 }));
    expect(await (await sw.ask("/setlists/1", { mode: "navigate" }))!.text()).toBe("<html>the setlist</html>");
    sw.setOnline(false);
    const offline = await sw.ask("/setlists/1", { mode: "navigate" });
    expect(offline!.status).toBe(200);
    expect(await offline!.text()).toBe("<html>the setlist</html>");
  });

  it("shows an offline page for a page that was never opened", async () => {
    const sw = startWorker();
    sw.setOnline(false);
    const res = await sw.ask("/setlists/never", { mode: "navigate" });
    expect(res!.status).toBe(503);
    expect(res!.headers.get("content-type")).toContain("text/html");
    expect(await res!.text()).toContain("You're offline");
  });

  it("serves a page's data (not just the page) from the copy it kept", async () => {
    const sw = startWorker();
    sw.setAnswer(() => new Response("flight data", { status: 200 }));
    await sw.ask("/setlists/1?_rsc=abc", { headers: { RSC: "1" } });
    sw.setOnline(false);
    expect(await (await sw.ask("/setlists/1?_rsc=abc", { headers: { RSC: "1" } }))!.text()).toBe("flight data");
    // With nothing kept, the data request just fails rather than showing a page where data should be.
    expect((await sw.ask("/other?_rsc=x", { headers: { RSC: "1" } }))!.status).toBe(503);
  });

  it("uses the network while it is there, so pages are always up to date online", async () => {
    const sw = startWorker();
    sw.setAnswer(() => new Response("old", { status: 200 }));
    await sw.ask("/songs/1", { mode: "navigate" });
    sw.setAnswer(() => new Response("new", { status: 200 }));
    expect(await (await sw.ask("/songs/1", { mode: "navigate" }))!.text()).toBe("new");
    // ...and the newest copy is what is kept.
    sw.setOnline(false);
    expect(await (await sw.ask("/songs/1", { mode: "navigate" }))!.text()).toBe("new");
  });

  it("never keeps a redirect (usually 'sign in first') or an error as if it were the page", async () => {
    const sw = startWorker();
    const redirected = new Response("login", { status: 200 });
    Object.defineProperty(redirected, "redirected", { value: true });
    sw.setAnswer(() => redirected);
    await sw.ask("/setlists/2", { mode: "navigate" });
    sw.setAnswer(() => new Response("oops", { status: 500 }));
    await sw.ask("/setlists/3", { mode: "navigate" });
    sw.setOnline(false);
    expect((await sw.ask("/setlists/2", { mode: "navigate" }))!.status).toBe(503);
    expect((await sw.ask("/setlists/3", { mode: "navigate" }))!.status).toBe(503);
  });

  it("leaves saving, signing in and the browser's look-ahead requests alone", async () => {
    const sw = startWorker();
    expect(await sw.ask("/setlists/1", { method: "POST", mode: "same-origin" })).toBeNull();
    expect(await sw.ask("/login", { mode: "navigate" })).toBeNull();
    expect(await sw.ask("/auth/confirm?x=1", { mode: "navigate" })).toBeNull();
    expect(await sw.ask("/setlists/1?_rsc=a", { headers: { RSC: "1", "Next-Router-Prefetch": "1" } })).toBeNull();
    expect(await sw.ask("/api/other", { mode: "same-origin" })).toBeNull();
  });

  it("keeps built files for good and uses the kept copy first", async () => {
    const sw = startWorker();
    sw.setAnswer(() => new Response("chunk v1", { status: 200 }));
    expect(await (await sw.ask("/_next/static/chunks/app.js"))!.text()).toBe("chunk v1");
    sw.setAnswer(() => new Response("chunk v2", { status: 200 }));
    expect(await (await sw.ask("/_next/static/chunks/app.js"))!.text()).toBe("chunk v1");
    expect(sw.fetched.filter((u) => u.includes("app.js"))).toHaveLength(1);
  });

  it("keeps pages ahead of time when asked, and says how many", async () => {
    const sw = startWorker();
    sw.setAnswer((url) => new Response(`page ${url}`, { status: 200 }));
    const replies = await sw.message({ type: "cache-urls", urls: ["/setlists/9", "/setlists"] });
    expect(replies).toEqual([{ kept: 2 }]);
    sw.setOnline(false);
    expect(await (await sw.ask("/setlists/9", { mode: "navigate" }))!.text()).toContain("/setlists/9");
  });

  it("clears out older versions of its own caches when it takes over", async () => {
    const sw = startWorker();
    sw.stores.set("chordbase-pages-v0", new Map());
    sw.stores.set("someone-elses-cache", new Map());
    await sw.activate();
    expect([...sw.stores.keys()]).toContain("someone-elses-cache");
    expect([...sw.stores.keys()]).not.toContain("chordbase-pages-v0");
  });
});
