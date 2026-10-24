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
  tags: i % 4 === 0 ? ["Easter"] : i % 5 === 0 ? ["slow", "communion"] : [],
  ...(withBody ? { body: body() } : {}),
});

/** @param {{ port: number, latencyMs: number, songs?: number }} options */
export function startStub({ port, latencyMs, songs = 1397 }) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "bench", alg: "ES256", use: "sig" };

  const log = [];
  const church = { id: IDS.church, name: "Bench church", slug: "bench" };
  const futureDate = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

  const fullSong = {
    ...songRow(0, true),
    id: IDS.song,
    church_id: IDS.church,
    default_capo: 0,
    time_signature: "4/4",
    ccli_number: "",
    tags: ["Easter", "slow"],
    melody_low: "E3",
    melody_high: "D4",
    links: [
      { label: "Studio recording", url: "https://example.com/song", kind: "recording" },
      { label: "Chart", url: "https://example.com/chart.pdf", kind: "sheet" },
    ],
    updated_at: new Date().toISOString(),
  };
  const setlistItems = Array.from({ length: 14 }, (_, i) => ({
    id: randomUUID(),
    song_id: randomUUID(),
    position: i,
    settings: { semitones: 0, capo: 0, spelling: "auto", showChords: true, fontSize: 0, style: "original" },
    body_override: null,
    transition_mode: "auto",
    transition_chords: "",
    singer_id: i === 0 ? "00000000-0000-4000-8000-0000000000d1" : null,
    songs: { ...songRow(i, true), default_capo: 0, time_signature: "4/4", melody_low: "E3", melody_high: "D4", links: [] },
  }));
  const views = [
    { id: "00000000-0000-4000-8000-0000000000e1", name: "Everyone", kind: "all", show_chords: true, position: 0 },
    { id: "00000000-0000-4000-8000-0000000000e2", name: "Drums", kind: "instrument", show_chords: false, position: 1 },
    { id: "00000000-0000-4000-8000-0000000000e3", name: "Keys", kind: "instrument", show_chords: true, position: 2 },
  ];
  const notes = [
    { id: randomUUID(), item_id: setlistItems[0].id, view_id: views[0].id, body: "Start on the 2nd verse", updated_at: new Date().toISOString() },
    { id: randomUUID(), item_id: setlistItems[0].id, view_id: views[1].id, body: "Brushes until the chorus", updated_at: new Date().toISOString() },
  ];
  const tasks = [
    { id: randomUUID(), view_id: null, label: "Sound check done", done: true, done_by: "Media", position: 0 },
    { id: randomUUID(), view_id: null, label: "Slides and lyrics ready", done: false, done_by: null, position: 1 },
    { id: randomUUID(), view_id: views[1].id, label: "Kit tuned", done: false, done_by: null, position: 2 },
  ];
  const singers = [
    { id: "00000000-0000-4000-8000-0000000000d1", name: "Maria", range_low: "G3", range_high: "D5" },
    { id: "00000000-0000-4000-8000-0000000000d2", name: "Tom", range_low: "C3", range_high: "A4" },
  ];
  // Joining a church: whether the signed-in login is in one, its application, and who is waiting.
  const join = {
    linked: true,
    type: "individual",
    application: null,
    requests: [{ id: "00000000-0000-4000-8000-0000000000f1", user_id: "00000000-0000-4000-8000-0000000000f2", email: "maria@example.com", first_name: "Maria", last_name: "Reyes", ministries: ["stage:keys", "stage:vocals"], created_at: new Date().toISOString() }],
    members: [
      { user_id: IDS.user, email: "bench@example.com", first_name: "", last_name: "", ministries: [], role: "church", joined_at: new Date().toISOString() },
      { user_id: "00000000-0000-4000-8000-0000000000f3", email: "tom@example.com", first_name: "Tom", last_name: "Okafor", ministries: ["media"], role: "member", joined_at: new Date().toISOString() },
    ],
  };
  // The schedule: people, events with who is on them, and the change log.
  const nextSunday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const starter = [
    ["song-leader", "Song leader", "Vocals", false], ["keys", "Keys", "Band", false], ["drums", "Drums", "Band", false],
    ["bass", "Bass", "Band", false], ["electric-guitar", "Electric guitar", "Band", false], ["acoustic-guitar", "Acoustic guitar", "Band", false],
    ["audio", "Audio", "Sound booth", false], ["projection", "Projection", "Sound booth", false], ["camera", "Camera", "Sound booth", false],
  ].map(([key, label, section, optional], i) => ({ id: `c-${key}`, key, label, kind: "people", section, options: [], ministries: { "song-leader": ["stage:vocals"], keys: ["stage:keys"], drums: ["stage:drums"], bass: ["stage:bass"], "electric-guitar": ["stage:electric-guitar"], audio: ["media:audio"], projection: ["media:sound-booth"], camera: ["media:camera"] }[key] ?? [], optional, position: (i + 1) * 10, archived: false }));
  starter.push({ id: "c-type-of-sunday", key: "type-of-sunday", label: "Type of Sunday", kind: "choice", section: "", options: ["Communion Sunday", "Canada Sunday", "Israel Sunday"], ministries: [], optional: false, position: 5, archived: false });
  const PID = (n) => `00000000-0000-4000-8000-00000000a${n}`;
  const sched = {
    people: [
      { id: PID(1), first_name: "Ana", last_name: "Lopez", ministries: ["stage:drums"], user_id: IDS.user },
      { id: PID(2), first_name: "Maria", last_name: "Reyes", ministries: ["stage:keys", "stage:vocals"], user_id: "00000000-0000-4000-8000-0000000000f2" },
      { id: PID(3), first_name: "Tom", last_name: "Okafor", ministries: ["stage:electric-guitar"], user_id: null },
      { id: PID(4), first_name: "Eli", last_name: "Elder", ministries: ["stage:bass", "media"], user_id: null },
    ],
    events: [
      {
        id: "00000000-0000-4000-8000-0000000000e9", kind: "sunday", title: "Sunday service", starts_on: nextSunday, starts_at: "09:30:00", location: "Main hall", notes: "Communion Sunday", created_by: null, fields: { "type-of-sunday": "Communion Sunday" },
        schedule_assignments: [
          { id: "00000000-0000-4000-8000-0000000000aa1", person_id: PID(2), role: "song-leader", note: "" },
          { id: "00000000-0000-4000-8000-0000000000aa2", person_id: PID(1), role: "drums", note: "" },
          { id: "00000000-0000-4000-8000-0000000000aa3", person_id: PID(3), role: "electric-guitar", note: "" },
        ],
      },
      { id: "00000000-0000-4000-8000-0000000000e8", kind: "event", title: "Youth night", starts_on: futureDate(4), starts_at: "18:30:00", location: "Hall", notes: "", created_by: IDS.user, fields: {}, schedule_assignments: [] },
    ],
    columns: starter,
    log: [
      { id: randomUUID(), actor_name: "Maria Reyes", action: "assigned", summary: "put Tom Okafor on electric guitar for Sunday, Oct 25", created_at: new Date(Date.now() - 36e5).toISOString(), event_id: null },
      { id: randomUUID(), actor_name: "Ana Lopez", action: "event_added", summary: "added the event “Youth night” on Monday, Oct 26", created_at: new Date(Date.now() - 864e5).toISOString(), event_id: null },
    ],
  };
  // What the phone remote changes: kept so a later read shows it.
  const setlistState = { event_id: null, remote_pin: null, remote_started_at: null, remote_expires_at: null, active_item_id: null, timer_ends_at: null };
  const taskDone = new Map();
  const failures = new Map();
  const bodyAt = (n) => fullSong.body.split("\n").slice(0, 8 + n).join("\n");
  const versions = Array.from({ length: 3 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000f00${i}`,
    song_id: IDS.song,
    saved_at: new Date(Date.now() - (i + 1) * 36e5).toISOString(),
    title: fullSong.title,
    artist: fullSong.artist,
    original_key: i === 1 ? "A" : fullSong.original_key,
    default_capo: 0,
    tempo: fullSong.tempo,
    time_signature: "4/4",
    ccli_number: "",
    tags: fullSong.tags,
    melody_low: "E3",
    melody_high: "D4",
    links: fullSong.links,
    body: bodyAt(i * 2),
  }));
  const setlistRow = (i) => ({ id: i === 0 ? IDS.setlist : randomUUID(), name: `Sunday ${i}`, service_date: futureDate(i - 10), expires_at: futureDate(20), active_item_id: null, timer_ends_at: null, setlist_items: [{ count: 14 }] });
  const setlists = Array.from({ length: 60 }, (_, i) => setlistRow(i));
  const listPage = Array.from({ length: 25 }, (_, i) => songRow(i, false));
  const searchPage = Array.from({ length: 25 }, (_, i) => songRow(i, true));
  const messages = Array.from({ length: 40 }, (_, i) => ({ id: randomUUID(), sender_role: "media", sender: "tab", body: `message ${i}`, created_at: new Date().toISOString() }));
  const facets = {
    keys: ["A", "Am", "Bb", "C", "D", "Em", "G"],
    artists: Array.from({ length: 120 }, (_, i) => `${pick(WORDS)} band ${i}`),
    time_signatures: ["4/4", "6/8"],
    capos: [0, 1, 2, 3],
    tags: ["Easter", "communion", "slow"],
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

    // For looking at the app by hand: the signed-in cookie, readable from the page being tested.
    if (url.pathname === "/__session") {
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end(JSON.stringify({ cookie: sessionCookie(), setlist: IDS.setlist, song: IDS.song }));
    }

    // For trying the join screen: /__linked?on=0 makes the signed-in login belong to no church.
    if (url.pathname === "/__linked") {
      join.linked = url.searchParams.get("on") !== "0";
      join.type = url.searchParams.get("type") === "church" ? "church" : "individual";
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      return res.end(JSON.stringify({ linked: join.linked }));
    }

    // The signed-in person, as the app asks for it when they belong to no church yet.
    if (url.pathname === "/auth/v1/user") {
      return send(200, { id: IDS.user, aud: "authenticated", role: "authenticated", email: "bench@example.com", app_metadata: {}, user_metadata: { account_type: join.type, church_name: join.type === "church" ? "Grace Chapel" : undefined }, created_at: new Date().toISOString() });
    }

    if (url.pathname === "/auth/v1/.well-known/jwks.json") {
      // The signing keys are read once per server, not per request.
      return send(200, { keys: [jwk] });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    const object = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const select = url.searchParams.get("select") ?? "";

    // The filter choices (a database function, so a POST).
    if (table === "rpc/song_facets") {
      for await (const chunk of req) void chunk;
      return send(200, facets);
    }

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
      let sent = "";
      for await (const chunk of req) sent += chunk;
      let parsed = {};
      try {
        parsed = JSON.parse(sent || "{}");
      } catch {
        // Not JSON.
      }
      // The login guard's counters (the phone remote's PIN guesses use them too).
      if (table === "rpc/login_gate") {
        const locked = (parsed.p_keys ?? []).filter((k) => (failures.get(k) ?? 0) >= 900).map((k) => ({ key: k, seconds: 900 }));
        return send(200, { locked, had_fails: false });
      }
      if (table === "rpc/login_failed") {
        const locked = [];
        (parsed.p_keys ?? []).forEach((k, i) => {
          const n = (failures.get(k) ?? 0) + 1;
          failures.set(k, n >= (parsed.p_limits?.[i] ?? 5) ? 900 : n);
          if (n >= (parsed.p_limits?.[i] ?? 5)) locked.push({ key: k, seconds: 900 });
        });
        return send(200, { locked });
      }
      if (table === "rpc/login_ok") return send(204);
      if (table === "rpc/search_churches") return send(200, String(parsed.p_q ?? "").toLowerCase().includes("bench") ? [{ id: IDS.church, name: "Bench church" }] : []);
      if (table === "rpc/my_application") return send(200, join.application);
      if (table === "rpc/apply_to_church") {
        join.application = { id: randomUUID(), status: "pending", church_id: parsed.p_church, church_name: "Bench church", first_name: parsed.p_first, last_name: parsed.p_last, ministries: parsed.p_ministries, created_at: new Date().toISOString() };
        return send(200, { ok: true });
      }
      if (table === "rpc/cancel_application") {
        join.application = null;
        return send(204);
      }
      if (table === "rpc/register_church") {
        join.linked = true;
        return send(200, { ok: true, church_id: IDS.church, name: parsed.p_name });
      }
      // The schedule's functions.
      if (table === "rpc/schedule_ensure_sunday") {
        let ev = sched.events.find((e) => e.kind === "sunday" && e.starts_on === parsed.p_date);
        if (!ev) {
          ev = { id: randomUUID(), kind: "sunday", title: "Sunday service", starts_on: parsed.p_date, starts_at: null, location: "", notes: "", created_by: IDS.user, fields: {}, schedule_assignments: [] };
          sched.events.push(ev);
        }
        return send(200, { ok: true, event_id: ev.id });
      }
      if (table === "rpc/schedule_assign") {
        const ev = sched.events.find((e) => e.id === parsed.p_event);
        if (!ev) return send(200, { error: "That event isn't there any more." });
        const elsewhere = ev.schedule_assignments.find((a) => a.person_id === parsed.p_person && a.role !== parsed.p_role);
        if (elsewhere) return send(200, { error: `That person is already on ${elsewhere.role} that day. Take them off first.` });
        ev.schedule_assignments = ev.schedule_assignments.filter((a) => a.role !== parsed.p_role);
        const made = { id: randomUUID(), person_id: parsed.p_person, role: parsed.p_role, note: "" };
        ev.schedule_assignments.push(made);
        const who = sched.people.find((p) => p.id === parsed.p_person);
        sched.log.unshift({ id: randomUUID(), actor_name: "Ana Lopez", action: "assigned", summary: `put ${who?.first_name} ${who?.last_name} on ${parsed.p_role} for ${ev.title}`, created_at: new Date().toISOString(), event_id: ev.id });
        return send(200, { ok: true, id: made.id });
      }
      if (table === "rpc/schedule_unassign") {
        for (const ev of sched.events) ev.schedule_assignments = ev.schedule_assignments.filter((a) => a.id !== parsed.p_id);
        return send(200, { ok: true });
      }
      if (table === "rpc/schedule_add_event") {
        const ev = { id: randomUUID(), kind: "event", title: parsed.p_title, starts_on: parsed.p_date, starts_at: parsed.p_time ? `${parsed.p_time}:00` : null, location: parsed.p_location ?? "", notes: parsed.p_notes ?? "", created_by: IDS.user, fields: {}, schedule_assignments: [] };
        sched.events.push(ev);
        sched.log.unshift({ id: randomUUID(), actor_name: "Ana Lopez", action: "event_added", summary: `added the event “${ev.title}”`, created_at: new Date().toISOString(), event_id: ev.id });
        return send(200, { ok: true, event_id: ev.id });
      }
      if (table === "rpc/people_add") {
        const made = { id: randomUUID(), first_name: parsed.p_first, last_name: parsed.p_last, ministries: parsed.p_ministries ?? [], user_id: null };
        sched.people.push(made);
        return send(200, { ok: true, person_id: made.id });
      }
      if (table === "rpc/setlist_link_event") {
        const sun = parsed.p_event ? sched.events.find((e) => e.id === parsed.p_event) : sched.events.find((e) => e.kind === "sunday");
        setlistState.event_id = sun?.id ?? null;
        return send(200, { ok: true, event_id: setlistState.event_id });
      }
      if (table === "rpc/setlist_unlink_event") {
        setlistState.event_id = null;
        return send(200, { ok: true });
      }
      if (table === "rpc/schedule_set_field") {
        const ev = sched.events.find((e) => e.id === parsed.p_event);
        if (!ev) return send(200, { error: "That event isn't there any more." });
        ev.fields = { ...ev.fields };
        if (parsed.p_value) ev.fields[parsed.p_key] = parsed.p_value;
        else delete ev.fields[parsed.p_key];
        return send(200, { ok: true });
      }
      if (table === "rpc/schedule_column_add") {
        const key = String(parsed.p_label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const made = { id: randomUUID(), key, label: parsed.p_label, kind: parsed.p_kind, section: parsed.p_section ?? "", options: parsed.p_options ?? [], ministries: parsed.p_ministries ?? [], optional: !!parsed.p_optional, position: 500 + sched.columns.length, archived: false };
        sched.columns.push(made);
        return send(200, { ok: true, key, id: made.id });
      }
      if (table === "rpc/schedule_column_update") {
        const c = sched.columns.find((x) => x.id === parsed.p_id);
        if (c) Object.assign(c, { label: parsed.p_label, section: parsed.p_section, options: parsed.p_options ?? [], ministries: parsed.p_ministries ?? [], optional: !!parsed.p_optional });
        return send(200, { ok: true });
      }
      if (table === "rpc/schedule_column_archive") {
        const c = sched.columns.find((x) => x.id === parsed.p_id);
        if (c) c.archived = !!parsed.p_archived;
        return send(200, { ok: true });
      }
      if (table === "rpc/schedule_column_move") return send(200, { ok: true });
      if (table === "rpc/schedule_column_delete") {
        sched.columns = sched.columns.filter((c) => c.id !== parsed.p_id);
        return send(200, { ok: true });
      }
      if (table === "rpc/schedule_columns_apply") {
        const created = [];
        for (const n of parsed.p_new ?? []) {
          const key = String(n.label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          if (!sched.columns.some((c) => c.key === key)) sched.columns.push({ id: randomUUID(), key, label: n.label, kind: n.kind, section: n.section ?? "", options: n.options ?? [], ministries: [], optional: false, position: 500 + sched.columns.length, archived: false });
          created.push({ ref: n.ref, key });
        }
        let hidden = 0;
        if (parsed.p_keep) for (const c of sched.columns) if (!c.archived && !parsed.p_keep.includes(c.key) && !created.some((x) => x.key === c.key) && !sched.events.some((e) => e.schedule_assignments.some((a) => a.role === c.key))) { c.archived = true; hidden++; }
        return send(200, { ok: true, created, hidden });
      }
      if (table === "rpc/schedule_import") return send(200, { ok: true, events: parsed.p_rows?.length ?? 0, assignments: 3, created_people: 0, unknown: [], skipped_rows: 0 });
      if (table === "rpc/church_requests") return send(200, join.requests);
      if (table === "rpc/church_members") return send(200, join.members);
      if (table === "rpc/decide_application") {
        const r = join.requests.find((x) => x.id === parsed.p_id);
        join.requests = join.requests.filter((x) => x.id !== parsed.p_id);
        if (r && parsed.p_approve) join.members.push({ user_id: r.user_id, email: r.email, first_name: r.first_name, last_name: r.last_name, ministries: r.ministries, role: "member", joined_at: new Date().toISOString() });
        return send(200, { ok: true });
      }
      if (table === "rpc/set_member_role") {
        const m = join.members.find((x) => x.user_id === parsed.p_user);
        if (m) m.role = parsed.p_role;
        return send(200, { ok: true });
      }
      if (table === "rpc/remove_member") {
        join.members = join.members.filter((x) => x.user_id !== parsed.p_user);
        return send(200, { ok: true });
      }
      if (table === "rpc/update_my_profile") return send(200, { ok: true });
      if (table === "rpc/merge_songs") return send(204);
      if (req.method === "PATCH" && table === "setlists" && !url.searchParams.has("church_id")) {
        for (const k of Object.keys(setlistState)) if (k in parsed) setlistState[k] = parsed[k];
        if (!(req.headers.prefer ?? "").includes("return=representation")) return send(204);
        return send(200, object ? { ...setlistState } : [{ ...setlistState }]);
      }
      if (req.method === "PATCH" && table === "setlist_tasks" && "done" in parsed) {
        taskDone.set((url.searchParams.get("id") ?? "").replace("eq.", ""), parsed);
        return send(200, [{ id: "ok" }]);
      }
      if (req.method === "PATCH" && table === "songs") {
        // The database keeps how the song was before a change.
        const before = { ...fullSong };
        for (const k of ["id", "church_id", "updated_at"]) delete before[k];
        versions.unshift({ id: randomUUID(), song_id: IDS.song, saved_at: new Date().toISOString(), ...before });
        Object.assign(fullSong, parsed);
        return send(200, [{ id: IDS.song }]);
      }
      if (!(req.headers.prefer ?? "").includes("return=representation")) return send(204);
      let body = {};
      try {
        body = JSON.parse(sent || "{}");
      } catch {
        // Not JSON; echo nothing.
      }
      const echo = (b) => ({ id: randomUUID(), ...b });
      const row =
        table === "setlist_messages"
          ? { id: randomUUID(), sender_role: "media", sender: "tab", body: "hello", created_at: new Date().toISOString() }
          : table === "setlist_items"
            ? setlistItems[0]
            : Array.isArray(body)
              ? body.map(echo)
              : echo(body);
      if (Array.isArray(row)) return send(201, row);
      return send(201, object ? row : [row]);
    }

    if (table === "church_accounts") {
      if (!join.linked) return send(200, object ? null : []);
      const profile = { first_name: "Ana", last_name: "Lopez", ministries: ["stage:drums"], role: "church" };
      const own = select.includes("church:") ? { role: "church", first_name: profile.first_name, last_name: profile.last_name, church } : select.includes("first_name") ? profile : { role: "church", church };
      return send(200, object ? own : [own]);
    }
    if (table === "church_applications") return send(200, [], { "content-range": `*/${join.requests.length}` });
    if (table === "people") {
      const uid = (url.searchParams.get("user_id") ?? "").replace("eq.", "");
      const rows = uid ? sched.people.filter((p) => p.user_id === uid) : sched.people;
      return send(200, rows);
    }
    if (table === "schedule_events") {
      const wanted = (url.searchParams.get("id") ?? "").replace("eq.", "");
      return send(200, wanted ? sched.events.filter((e) => e.id === wanted) : sched.events);
    }
    if (table === "schedule_log") return send(200, sched.log);
    if (table === "schedule_columns") return send(200, sched.columns);
    if (table === "rpc/song_facets") return send(200, facets);
    if (table === "chord_shortcuts") return send(200, [{ id: randomUUID(), chord: "G" }, { id: randomUUID(), chord: "D" }]);
    if (table === "setlist_messages") return send(200, messages);
    if (table === "setlist_views") {
      const wanted = (url.searchParams.get("id") ?? "").replace("eq.", "");
      return send(200, wanted ? views.filter((v) => v.id === wanted) : views);
    }
    if (table === "setlist_notes") return send(200, notes);
    if (table === "setlist_tasks") return send(200, tasks.map((t) => (taskDone.has(t.id) ? { ...t, ...taskDone.get(t.id) } : t)));
    if (table === "song_versions") {
      const wanted = (url.searchParams.get("id") ?? "").replace("eq.", "");
      if (wanted) {
        const v = versions.find((x) => x.id === wanted);
        return send(200, object ? (v ?? null) : v ? [v] : []);
      }
      return send(200, versions);
    }
    if (table === "singers") return send(200, singers);
    if (table === "song_history") {
      const plays = listPage.slice(0, 12).flatMap((s, i) => [
        { song_id: s.id, played_on: futureDate(-7 * (i % 6) - 2), setlist_name: "Sunday Service" },
        ...(i < 3 ? [{ song_id: s.id, played_on: futureDate(-7 * (i + 6) - 2), setlist_name: "Sunday Service" }] : []),
      ]);
      return send(200, url.searchParams.has("song_id") ? plays.slice(0, 4) : plays);
    }
    if (table === "songs") {
      if (url.searchParams.has("id")) return send(200, object ? fullSong : [fullSong]);
      const rows = select.includes("body") ? searchPage : listPage;
      return send(200, rows, { "content-range": `0-24/${songs}` });
    }
    if (table === "setlists") {
      if (req.method === "DELETE") return send(204);
      if (url.searchParams.has("id")) {
        const row = { ...setlistRow(0), ...setlistState, church_id: IDS.church };
        return send(200, object ? row : [row]);
      }
      // The schedule asks for the setlists that are linked to an event.
      if (url.searchParams.has("event_id")) return send(200, setlistState.event_id ? [{ id: IDS.setlist, name: "Sunday set", service_date: null, event_id: setlistState.event_id }] : []);
      return send(200, setlists);
    }
    if (table === "setlist_items") {
      const wanted = (url.searchParams.get("id") ?? "").replace("eq.", "");
      return send(200, wanted ? setlistItems.filter((i) => i.id === wanted) : setlistItems);
    }
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
