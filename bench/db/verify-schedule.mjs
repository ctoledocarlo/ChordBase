// Checks the schedule rules against the real migrations in an in-process Postgres (PGlite), with row level
// security on: who can put people on a Sunday or an event, who can change the people list or import, how a
// person without an account is linked when they join, that every change reaches the change log, and that one
// church never sees or touches another's schedule.
//
//   node bench/db/verify-schedule.mjs

import { createBenchDb, CHURCH, OTHER_CHURCH, USER } from "./setup.mjs";

const { db } = await createBenchDb({ rows: 40 });

const ids = {
  main: USER,
  admin: "00000000-0000-4000-8000-0000000000d1",
  member: "00000000-0000-4000-8000-0000000000d2",
  other: "00000000-0000-4000-8000-0000000000d3",
  applicant: "00000000-0000-4000-8000-0000000000d4",
};
await db.exec(`
  update public.church_accounts set role = 'church' where user_id = '${ids.main}';
  insert into auth.users (id, email) values
    ('${ids.admin}', 'admin@example.com'), ('${ids.member}', 'maria@example.com'), ('${ids.other}', 'other@example.com'), ('${ids.applicant}', 'eli@example.com');
  update auth.users set email = 'main@example.com' where id = '${ids.main}';
  insert into public.church_accounts (user_id, church_id, role, first_name, last_name, ministries) values
    ('${ids.admin}', '${CHURCH}', 'admin', 'Tom', 'Okafor', array['stage:drums']),
    ('${ids.member}', '${CHURCH}', 'member', 'Maria', 'Reyes', array['stage:keys','stage:vocals']),
    ('${ids.other}', '${OTHER_CHURCH}', 'church', 'Olive', 'Other', array['media']);
`);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};
async function as(user, sql) {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : `set role anon; select set_config('request.jwt.claim.sub', '', false);`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}
const call = async (user, sql) => (await as(user, `select ${sql} as r`))[0].r;
const denied = async (user, sql) => {
  try {
    await as(user, sql);
    return false;
  } catch (e) {
    return /permission denied|violates row-level security/i.test(String(e.message));
  }
};
const lit = (s) => `'${s.replaceAll("'", "''")}'`;
const one = async (sql) => (await db.query(sql)).rows[0];

// The coming Sunday (in the database's own clock, which is what the functions use).
const sunday = (await one("select (current_date + ((7 - extract(dow from current_date)::int) % 7 + 7))::text as d")).d;
const monday = (await one(`select ('${sunday}'::date + 1)::text as d`)).d;
const person = async (name) => (await one(`select id from public.people where lower(btrim(first_name || ' ' || last_name)) = lower(${lit(name)}) and church_id = '${CHURCH}'`))?.id;

// ---- everyone with an account is on the people list ----------------------------------------------------------------
check("accounts became people", (await db.query(`select count(*)::int n from public.people where church_id = '${CHURCH}' and user_id is not null`)).rows[0].n === 3);
check("their names and ministries came with them", (await one(`select ministries from public.people where user_id = '${ids.member}'`)).ministries.join() === "stage:keys,stage:vocals");
const maria = await person("Maria Reyes");
const tom = await person("Tom Okafor");

// ---- Sundays and events -----------------------------------------------------------------------------------------------
check("only Sundays are Sundays", (await call(ids.member, `public.schedule_ensure_sunday('${monday}')`)).error?.includes("Sunday"));
check("a Sunday is made on demand, and only once", await (async () => {
  const a = await call(ids.member, `public.schedule_ensure_sunday('${sunday}')`);
  const b = await call(ids.admin, `public.schedule_ensure_sunday('${sunday}')`);
  return a.ok && b.ok && a.event_id === b.event_id && (await db.query(`select count(*)::int n from public.schedule_events where kind = 'sunday' and starts_on = '${sunday}'`)).rows[0].n === 1;
})());
const sundayId = (await call(ids.member, `public.schedule_ensure_sunday('${sunday}')`)).event_id;
check("a sign-out visitor can't use the schedule", await denied(null, `select public.schedule_ensure_sunday('${sunday}')`));
check("anyone in the church can add an event in between", (await call(ids.member, `public.schedule_add_event('  Youth   night ', '${monday}', '18:30', 'Hall', 'Bring snacks')`)).ok === true);
const youth = await one("select * from public.schedule_events where kind = 'event'");
check("the event is kept tidily", youth.title === "Youth night" && youth.starts_at === "18:30:00" && youth.location === "Hall");
check("bad events are refused", (await call(ids.member, `public.schedule_add_event('', '${monday}', '', '', '')`)).error !== undefined && (await call(ids.member, `public.schedule_add_event('X', '${monday}', '25:99', '', '')`)).error !== undefined && (await call(ids.member, "public.schedule_add_event('X', null, '', '', '')")).error !== undefined);

// ---- putting people on --------------------------------------------------------------------------------------------------
check("a member can put themselves on", (await call(ids.member, `public.schedule_assign('${sundayId}', '${maria}', 'keys')`)).ok === true);
check("and put someone else on", (await call(ids.member, `public.schedule_assign('${sundayId}', '${tom}', 'drums')`)).ok === true);
check("putting the same person on twice changes nothing", (await call(ids.member, `public.schedule_assign('${sundayId}', '${tom}', 'drums')`)).already === true);
check("one person can have two roles", (await call(ids.member, `public.schedule_assign('${sundayId}', '${maria}', 'backup-singer')`)).ok === true);
check("a made-up role is refused", (await call(ids.member, `public.schedule_assign('${sundayId}', '${maria}', 'tambourine')`)).error !== undefined);
check("song leader and backup singers are roles", (await call(ids.admin, `public.schedule_assign('${sundayId}', '${tom}', 'song-leader')`)).ok === true);
check("a visitor from another church can't put anyone on", (await call(ids.other, `public.schedule_assign('${sundayId}', '${maria}', 'keys')`)).error !== undefined);
check("and can't reach another church's person with their own event", await (async () => {
  const mine = await call(ids.other, `public.schedule_ensure_sunday('${sunday}')`);
  return (await call(ids.other, `public.schedule_assign('${mine.event_id}', '${maria}', 'keys')`)).error !== undefined;
})());
check("nobody can write the tables directly", (await denied(ids.member, `insert into public.schedule_assignments (church_id, event_id, person_id, role) values ('${CHURCH}', '${sundayId}', '${maria}', 'bass')`)) && (await denied(ids.admin, `delete from public.schedule_events`)));
const keysRow = await one(`select id from public.schedule_assignments where person_id = '${maria}' and role = 'keys'`);
check("a member can take someone off", (await call(ids.member, `public.schedule_unassign('${keysRow.id}')`)).ok === true);
check("taking off something that's gone is refused", (await call(ids.member, `public.schedule_unassign('${keysRow.id}')`)).error !== undefined);
check("another church can't take someone off", (await call(ids.other, `public.schedule_unassign('${(await one(`select id from public.schedule_assignments where role = 'drums'`)).id}')`)).error !== undefined);

// ---- who may change an event ---------------------------------------------------------------------------------------------
check("a member can change an event they added", (await call(ids.member, `public.schedule_update_event('${youth.id}', 'Youth night!', '${monday}', '19:00', 'Hall', '')`)).ok === true);
check("a different member can't", (await call(ids.other, `public.schedule_update_event('${youth.id}', 'x', '${monday}', '', '', '')`)).error !== undefined);
const eventByAdmin = (await call(ids.admin, `public.schedule_add_event('Wedding', '${monday}', '', '', '')`)).event_id;
check("a member can't change an event an admin added", (await call(ids.member, `public.schedule_update_event('${eventByAdmin}', 'Mine', '${monday}', '', '', '')`)).error !== undefined);
check("an admin can change anyone's event", (await call(ids.admin, `public.schedule_update_event('${youth.id}', 'Youth night', '${monday}', '19:00', 'Hall', 'Snacks')`)).ok === true);
check("a member can't change the Sunday service, an admin can, and its date and name stay", (await call(ids.member, `public.schedule_update_event('${sundayId}', 'x', '${sunday}', '', '', '')`)).error !== undefined
  && (await call(ids.admin, `public.schedule_update_event('${sundayId}', 'Renamed', '${monday}', '10:00', 'Main hall', 'Communion')`)).ok === true
  && (await one(`select title, starts_on::text d from public.schedule_events where id = '${sundayId}'`)).title === "Sunday service");
check("Sundays can't be removed", (await call(ids.admin, `public.schedule_delete_event('${sundayId}')`)).error?.includes("always"));
check("a member can remove their own event, but not an admin's", (await call(ids.member, `public.schedule_delete_event('${eventByAdmin}')`)).error !== undefined && (await call(ids.member, `public.schedule_delete_event('${youth.id}')`)).ok === true);

// ---- the people list ------------------------------------------------------------------------------------------------------
check("a member can't add people", (await call(ids.member, "public.people_add('Eli', 'Elder', array['stage:bass'])")).error !== undefined);
check("an admin can add a person with no account", (await call(ids.admin, "public.people_add('Eli', 'Elder', array['stage:bass'])")).ok === true);
check("the same name can't be added twice, whatever the case", (await call(ids.admin, "public.people_add('  ELI ', 'elder', array[]::text[])")).error?.includes("already"));
const eli = await person("Eli Elder");
check("a person without an account can be put on the schedule", (await call(ids.member, `public.schedule_assign('${sundayId}', '${eli}', 'bass')`)).ok === true);
check("an admin can change a person, and an account's details follow", (await call(ids.admin, `public.people_update('${maria}', 'Maria', 'Reyes-Cruz', array['stage:keys'])`)).ok === true && (await one(`select last_name from public.church_accounts where user_id = '${ids.member}'`)).last_name === "Reyes-Cruz");
check("a person with an account can't be deleted from the list", (await call(ids.admin, `public.people_delete('${maria}')`)).error?.includes("account"));
check("a member can't change or delete people", (await call(ids.member, `public.people_update('${eli}', 'Eli', 'X', array[]::text[])`)).error !== undefined && (await call(ids.member, `public.people_delete('${eli}')`)).error !== undefined);
check("a member's own profile edit renames them on the list", (await call(ids.member, "public.update_my_profile('Maria', 'Reyes', array['stage:keys','media'])")).ok === true && (await person("Maria Reyes")) === maria);

// ---- importing -----------------------------------------------------------------------------------------------------------------
const rows = (names) => JSON.stringify([{ date: sunday, title: "", time: "09:30", location: "", notes: "", assign: { keys: names, drums: ["Tom Okafor"], "song-leader": ["Nobody Known"] } }, { date: monday, title: "Rehearsal", assign: { bass: ["Eli Elder"] } }, { date: "nonsense", assign: {} }]);
check("a member can't import", (await call(ids.member, `public.schedule_import(${lit(rows(["Maria Reyes"]))}::jsonb)`)).error !== undefined);
const imp = await call(ids.admin, `public.schedule_import(${lit(rows(["Maria Reyes"]))}::jsonb)`);
check("an admin can import", imp.ok === true && imp.events === 2);
check("it adds what is new and leaves what exists (Tom was already on drums)", imp.assignments === 2 && (await db.query(`select count(*)::int n from public.schedule_assignments where event_id = '${sundayId}' and role = 'drums'`)).rows[0].n === 1);
check("it reports names it doesn't know, and bad rows", imp.unknown.join() === "Nobody Known" && imp.skipped_rows === 1);
const again = await call(ids.admin, `public.schedule_import(${lit(rows(["Maria Reyes"]))}::jsonb)`);
check("importing the same file again adds nothing", again.assignments === 0 && again.events === 2);
const made = await call(ids.admin, `public.schedule_import(${lit(rows(["Maria Reyes"]))}::jsonb, true)`);
check("unknown names can be added as people", made.created_people === 1 && (await person("Nobody Known")) !== undefined && made.unknown.length === 0);
check("an import with too many rows is refused", (await call(ids.admin, `public.schedule_import(${lit(JSON.stringify(Array.from({ length: 401 }, () => ({ date: sunday }))))}::jsonb)`)).error !== undefined);

// ---- a person without an account joins -----------------------------------------------------------------------------------------
await db.exec(`insert into public.church_applications (user_id, church_id, first_name, last_name, ministries) values ('${ids.applicant}', '${CHURCH}', 'Eli', 'Elder', array['stage:bass','media'])`);
const app = (await one(`select id from public.church_applications where user_id = '${ids.applicant}'`)).id;
check("linking to someone who has an account is refused", (await call(ids.main, `public.decide_application('${app}', true, '${maria}')`)).error !== undefined);
check("linking to a person from another church is refused", (await call(ids.main, `public.decide_application('${app}', true, '${(await one(`select id from public.people where church_id = '${OTHER_CHURCH}' limit 1`)).id}')`)).error !== undefined);
const peopleBefore = (await one(`select count(*)::int n from public.people where church_id = '${CHURCH}'`)).n;
check("the main account links the applicant to the person already scheduled", (await call(ids.main, `public.decide_application('${app}', true, '${eli}')`)).ok === true);
check("no second person was made", (await one(`select count(*)::int n from public.people where church_id = '${CHURCH}'`)).n === peopleBefore);
check("the person is now linked to the account, keeping their scheduled roles", (await one(`select user_id from public.people where id = '${eli}'`)).user_id === ids.applicant && (await db.query(`select 1 from public.schedule_assignments where person_id = '${eli}' and role = 'bass'`)).rows.length >= 1);
check("and can see the schedule", (await as(ids.applicant, "select count(*)::int n from public.schedule_events"))[0].n > 0);
await call(ids.main, `public.remove_member('${ids.applicant}')`);
check("removing them from the church keeps the person and their history, unlinked", (await one(`select user_id from public.people where id = '${eli}'`)).user_id === null && (await db.query(`select 1 from public.schedule_assignments where person_id = '${eli}'`)).rows.length >= 1);

// ---- a new member with no matching person gets one ---------------------------------------------------------------------------------
const second = "00000000-0000-4000-8000-0000000000d5";
await db.exec(`insert into auth.users (id, email) values ('${second}', 'new@example.com'); insert into public.church_applications (user_id, church_id, first_name, last_name, ministries) values ('${second}', '${CHURCH}', 'Nia', 'New', array['media'])`);
await call(ids.main, `public.decide_application('${(await one(`select id from public.church_applications where user_id = '${second}'`)).id}', true)`);
check("approving without a link makes a person for them", (await person("Nia New")) !== undefined && (await one(`select user_id from public.people where first_name = 'Nia'`)).user_id === second);

// ---- the change log ---------------------------------------------------------------------------------------------------------------------
const log = await as(ids.member, "select actor_name, action, summary from public.schedule_log order by created_at");
check("every kind of change was logged", ["event_added", "assigned", "unassigned", "event_changed", "event_removed", "person_added", "person_changed", "imported"].every((a) => log.some((l) => l.action === a)));
check("the log names who did it and what", log.some((l) => l.actor_name === "Maria Reyes" && /put Maria Reyes on keys/.test(l.summary)) && log.some((l) => l.actor_name === "Tom Okafor" && l.action === "person_added"));
check("another church can't read this church's log, people, events or assignments", (await as(ids.other, "select (select count(*) from public.schedule_log where church_id <> '" + OTHER_CHURCH + "')::int + (select count(*) from public.people where church_id <> '" + OTHER_CHURCH + "')::int + (select count(*) from public.schedule_events where church_id <> '" + OTHER_CHURCH + "')::int + (select count(*) from public.schedule_assignments where church_id <> '" + OTHER_CHURCH + "')::int as n"))[0].n === 0);
check("the log can't be written or edited directly", (await denied(ids.admin, `insert into public.schedule_log (church_id, summary, action) values ('${CHURCH}', 'x', 'x')`)) && (await denied(ids.admin, "delete from public.schedule_log")));

// ---- a setlist's team ----------------------------------------------------------------------------------------------------------------------
await db.exec(`update public.setlists set service_date = '${sunday}' where id = (select id from public.setlists where church_id = '${CHURCH}' order by name limit 1)`);
const setlistId = (await one(`select id from public.setlists where church_id = '${CHURCH}' order by name limit 1`)).id;
const linked = await call(ids.member, `public.setlist_link_event('${setlistId}')`);
check("a setlist finds the event on its service date", linked.ok === true && linked.event_id === sundayId && (await one(`select event_id from public.setlists where id = '${setlistId}'`)).event_id === sundayId);
const noDate = (await one(`select id from public.setlists where church_id = '${CHURCH}' and id <> '${setlistId}' order by name limit 1`)).id;
await db.exec(`update public.setlists set service_date = '${(await one(`select (current_date + 200)::text d`)).d}' where id = '${noDate}'`);
check("a setlist with no event on its date gets none, unless asked to make one", (await call(ids.member, `public.setlist_link_event('${noDate}')`)).event_id === null && (await call(ids.member, `public.setlist_link_event('${noDate}', null, true)`)).event_id !== null);
check("another church can't link its setlist to this church's event", (await call(ids.other, `public.setlist_link_event('${setlistId}', '${sundayId}')`)).error !== undefined);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
void ids.main;
