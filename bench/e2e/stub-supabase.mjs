// A stand-in for the parts of Supabase the app talks to, so the real Next.js server can be
// measured end to end without an account or a network. It answers the app's requests with
// realistic amounts of data after a fixed delay (the round trip to the database), and keeps a
// log of every request so a run can say how many were made and how many waited on another.

import { createServer } from "node:http";
import { createPublicKey, generateKeyPairSync, sign, randomUUID } from "node:crypto";

export const IDS = {
  user: "00000000-0000-4000-8000-0000000000aa",
  church: "00000000-0000-4000-8000-000000000001",
  setlist: "00000000-0000-4000-8000-0000000000b1",
  song: "00000000-0000-4000-8000-0000000000c1",
};

const b64url = (buf) => Buffer.from(buf).toString("base64url");

let seed = 11;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const WORDS = "light love grace mercy river mountain fire water heaven earth king lord praise worship glory holy hope faith peace joy".split(" ");
const CHORDS = ["G", "C", "D", "Em", "Am", "F"];
const pick = (l) => l[Math.floor(rand() * l.length)];
function body() {
  const out = [];
  for (let s = 0; s < 5; s++) {
    out.push(`{start_of_verse: Verse ${s + 1}}`);
    for (let l = 0; l < 6; l++) {
      out.push(Array.from({ length: 7 }, (_, i) => (i % 3 === 0 ? `[${pick(CHORDS)}]${pick(WORDS)}` : pick(WORDS))).join(" "));
    }
    out.push("{end_of_verse}", "");
  }
  return out.join("\n");
}

const songRow = (i, withBody = false) => ({
  id: i === 0 ? IDS.song : randomUUID(),
  title: `${pick(WORDS)} ${pick(WORDS)} ${i}`,
  artist: `${pick(WORDS)} band`,
  original_key: pick(["G", "C", "D", "Em", "A"]),
  tempo: 70 + Math.floor(rand() * 60),
  ...(withBody ? { body: body() } : {}),
});

/** @param {{ port: number, latencyMs: number, songs?: number }} options */
export function startStub({ port, latencyMs, songs = 1397 }) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "bench", alg: "ES256", use: "sig" };

  const log = [];
  const church = { id: IDS.church, name: "Bench church", slug: "bench" };
  const futureDate = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

  const fullSong = { ...songRow(0, true), id: IDS.song, church_id: IDS.church, default_capo: 0, time_signature: "4/4", ccli_number: "", tags: [], updated_at: new Date().toISOString() };
  const setlistItems = Array.from({ length: 14 }, (_, i) => ({
    id: randomUUID(),
    song_id: randomUUID(),
    position: i,
    settings: { semitones: 0, capo: 0, spelling: "auto", showChords: true, fontSize: 0, style: "original" },
    body_override: null,
    transition_mode: "auto",
    transition_chords: "",
    songs: { ...songRow(i, true), default_capo: 0 },
  }));
  const setlistRow = (i) => ({ id: i === 0 ? IDS.setlist : randomUUID(), name: `Sunday ${i}`, service_date: futureDate(i - 10), expires_at: futureDate(20), active_item_id: null, setlist_items: [{ count: 14 }] });
  const setlists = Array.from({ length: 60 }, (_, i) => setlistRow(i));
  const listPage = Array.from({ length: 25 }, (_, i) => songRow(i, false));
  const searchPage = Array.from({ length: 25 }, (_, i) => songRow(i, true));
  const messages = Array.from({ length: 40 }, (_, i) => ({ id: randomUUID(), sender_role: "media", sender: "tab", body: `message ${i}`, created_at: new Date().toISOString() }));
  const facets = {
    keys: ["A", "Am", "Bb", "C", "D", "Em", "G"],
    artists: Array.from({ length: 120 }, (_, i) => `${pick(WORDS)} band ${i}`),
    time_signatures: ["4/4", "6/8"],
    capos: [0, 1, 2, 3],
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const started = performance.now();
    const entry = { method: req.method, path: url.pathname.replace("/rest/v1/", ""), start: started, end: 0 };
    log.push(entry);

    const send = async (status, data, headers = {}) => {
      await new Promise((r) => setTimeout(r, latencyMs));
      entry.end = performance.now();
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };

    if (url.pathname === "/auth/v1/.well-known/jwks.json") {
      // The signing keys are read once per server, not per request.
      return send(200, { keys: [jwk] });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    const object = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const select = url.searchParams.get("select") ?? "";

    // The song list's database function: a page of songs, each with the total.
    if (table === "rpc/songs_page") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const withBody = raw.includes('"p_with_body":true');
      const rows = (withBody ? searchPage : listPage).map((r) => ({ ...r, body: withBody ? r.body : null, total: songs }));
      return send(200, rows);
    }

    // Writes: take the body, then answer like PostgREST (nothing back, or the row if asked).
    if (req.method === "POST" || req.method === "PATCH") {
      for await (const chunk of req) void chunk;
      if (!(req.headers.prefer ?? "").includes("return=representation")) return send(204);
      const row =
        table === "setlist_messages"
          ? { id: randomUUID(), sender_role: "media", sender: "tab", body: "hello", created_at: new Date().toISOString() }
          : table === "setlist_items"
            ? setlistItems[0]
            : {};
      return send(201, object ? row : [row]);
    }

    if (table === "church_accounts") return send(200, object ? { church } : [{ church }]);
    if (table === "rpc/song_facets") return send(200, facets);
    if (table === "chord_shortcuts") return send(200, [{ id: randomUUID(), chord: "G" }, { id: randomUUID(), chord: "D" }]);
    if (table === "setlist_messages") return send(200, messages);
    if (table === "songs") {
      if (url.searchParams.has("id")) return send(200, object ? fullSong : [fullSong]);
      const rows = select.includes("body") ? searchPage : listPage;
      return send(200, rows, { "content-range": `0-24/${songs}` });
    }
    if (table === "setlists") {
      if (req.method === "DELETE") return send(204);
      if (url.searchParams.has("id")) return send(200, object ? setlistRow(0) : [setlistRow(0)]);
      return send(200, setlists);
    }
    if (table === "setlist_items") return send(200, setlistItems);
    return send(404, { message: `stub has no ${table}` });
  });

  const jwt = () => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "bench" }));
    const claims = b64url(
      JSON.stringify({ iss: `http://127.0.0.1:${port}/auth/v1`, sub: IDS.user, aud: "authenticated", role: "authenticated", exp: now + 86400, iat: now, email: "bench@example.com" }),
    );
    const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
    return `${header}.${claims}.${b64url(signature)}`;
  };

  /** The cookie the app's Supabase library reads the signed-in session from. */
  const sessionCookie = () => {
    const access = jwt();
    const session = {
      access_token: access,
      refresh_token: "bench-refresh",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user: { id: IDS.user, aud: "authenticated", role: "authenticated", email: "bench@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    };
    return `sb-127-auth-token=base64-${b64url(JSON.stringify(session))}`;
  };

  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        log,
        sessionCookie,
        close: () => new Promise((r) => server.close(r)),
      }),
    ),
  );
}

void createPublicKey;
