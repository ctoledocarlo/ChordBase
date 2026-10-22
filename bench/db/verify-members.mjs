// Checks the church membership rules against the real migrations in an in-process Postgres (PGlite), with
// row level security on, the way Supabase runs them: who can apply, who can answer, who can change roles,
// and that nobody can reach around the functions to change the tables directly.
//
//   node bench/db/verify-members.mjs

import { createBenchDb, CHURCH, OTHER_CHURCH, USER } from "./setup.mjs";

const { db } = await createBenchDb({ rows: 60 });

const ids = {
  church: USER,
  applicant: "00000000-0000-4000-8000-0000000000b1",
  second: "00000000-0000-4000-8000-0000000000b2",
  otherChurch: "00000000-0000-4000-8000-0000000000b3",
};
await db.exec(`
  update public.church_accounts set role = 'church';
  insert into auth.users (id, email) values
    ('${ids.applicant}', 'maria@example.com'),
    ('${ids.second}', 'tom@example.com'),
    ('${ids.otherChurch}', 'other@example.com');
  update auth.users set email = 'church@example.com' where id = '${ids.church}';
  insert into public.church_accounts (user_id, church_id, role) values ('${ids.otherChurch}', '${OTHER_CHURCH}', 'church');
`);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
};

/** Runs a statement as a signed-in person (or as nobody), then goes back to the table owner. */
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

// ---- finding a church -------------------------------------------------------------------------------------
check("searching needs two letters", (await as(ids.applicant, "select * from public.search_churches('b')")).length === 0);
check("searching finds a church by part of its name", (await as(ids.applicant, "select * from public.search_churches('ench')")).some((r) => r.id === CHURCH));
check("a wildcard in the search is just a character", (await as(ids.applicant, "select * from public.search_churches('%%')")).length === 0);
check("searching shows only names", Object.keys((await as(ids.applicant, "select * from public.search_churches('bench')"))[0]).sort().join() === "id,name");
check("searching is for signed-in people", await denied(null, "select * from public.search_churches('bench')"));

// ---- applying -----------------------------------------------------------------------------------------------
const apply = (user, church, first, last, ministries) =>
  call(user, `public.apply_to_church('${church}', ${lit(first)}, ${lit(last)}, ${ministries})`);
check("a name is needed", (await apply(ids.applicant, CHURCH, "", "Reyes", "array['media']")).error?.includes("name"));
check("a ministry is needed", (await apply(ids.applicant, CHURCH, "Maria", "Reyes", "array[]::text[]")).error?.includes("ministry"));
check("a made-up ministry is refused", (await apply(ids.applicant, CHURCH, "Maria", "Reyes", "array['stage:kazoo']")).error?.includes("ministry"));
check("an unknown church is refused", (await apply(ids.applicant, "00000000-0000-4000-8000-00000000ffff", "Maria", "Reyes", "array['media']")).error?.includes("wasn't found"));
check("a member can't apply to a church", (await apply(ids.church, CHURCH, "A", "B", "array['media']")).error?.includes("already belongs"));
check("anonymous visitors can't apply", await denied(null, `select public.apply_to_church('${CHURCH}', 'A', 'B', array['media'])`));

check("a good application is accepted", (await apply(ids.applicant, CHURCH, "  Maria ", "Reyes", "array['stage:keys','stage:vocals','stage:keys']")).ok === true);
check("only one waiting application at a time", (await apply(ids.applicant, OTHER_CHURCH, "Maria", "Reyes", "array['media']")).error?.includes("already have"));
let mine = await call(ids.applicant, "public.my_application()");
check("the application is kept with trimmed names and sorted, unique ministries", mine.status === "pending" && mine.first_name === "Maria" && mine.church_name === "Bench church" && mine.ministries.join() === "stage:keys,stage:vocals");
await as(ids.applicant, "select public.cancel_application()");
check("cancelling removes the waiting application", (await call(ids.applicant, "public.my_application()")) === null);
await apply(ids.applicant, CHURCH, "Maria", "Reyes", "array['stage:keys','stage:vocals']");
await apply(ids.second, CHURCH, "Tom", "Okafor", "array['media']");

// ---- who sees the requests --------------------------------------------------------------------------------------
check("an applicant can't see requests", (await as(ids.applicant, "select * from public.church_requests()")).length === 0);
check("another church can't see requests", (await as(ids.otherChurch, "select * from public.church_requests()")).length === 0);
const requests = await as(ids.church, "select * from public.church_requests()");
check("the church account sees both requests, with email", requests.length === 2 && requests[0].email === "maria@example.com");
check("an applicant can read their own application row but no one else's", (await as(ids.applicant, "select * from public.church_applications")).length === 1);
check("the church account can read its church's application rows", (await as(ids.church, "select * from public.church_applications")).length === 2);
const app = requests.find((r) => r.user_id === ids.applicant);

check("an applicant can't approve themselves", (await call(ids.applicant, `public.decide_application('${app.id}', true)`)).error !== undefined);
check("another church can't answer it", (await call(ids.otherChurch, `public.decide_application('${app.id}', true)`)).error !== undefined);
check("an applicant can't see the church's songs yet", (await as(ids.applicant, "select count(*) n from public.songs"))[0].n === 0);

// ---- approving ---------------------------------------------------------------------------------------------------
check("the church account approves", (await call(ids.church, `public.decide_application('${app.id}', true)`)).ok === true);
check("an answered application can't be answered again", (await call(ids.church, `public.decide_application('${app.id}', false)`)).error?.includes("already answered"));
const row = (await db.query(`select role, first_name, last_name, ministries from public.church_accounts where user_id = '${ids.applicant}'`)).rows[0];
check("the new member is an individual account with the details they gave", row?.role === "member" && row.first_name === "Maria" && row.ministries.join() === "stage:keys,stage:vocals");
check("a member can now see the church's songs", (await as(ids.applicant, "select count(*) n from public.songs"))[0].n > 0);
check("but not another church's", (await as(ids.applicant, `select count(*) n from public.songs where church_id = '${OTHER_CHURCH}'`))[0].n === 0);
check("the second request can be declined", (await call(ids.church, `public.decide_application('${requests.find((r) => r.user_id === ids.second).id}', false)`)).ok === true);
check("a declined applicant is shown as declined and still has no access", (await call(ids.second, "public.my_application()")).status === "declined" && (await as(ids.second, "select count(*) n from public.songs"))[0].n === 0);
check("a declined applicant can apply again", (await apply(ids.second, CHURCH, "Tom", "Okafor", "array['media']")).ok === true);

// ---- the individual cannot do the church's job -------------------------------------------------------------------
const secondApp = (await as(ids.church, "select * from public.church_requests()"))[0];
check("a member can't approve requests", (await call(ids.applicant, `public.decide_application('${secondApp.id}', true)`)).error !== undefined);
check("a member can't change anyone's role", (await call(ids.applicant, `public.set_member_role('${ids.church}', 'member')`)).error !== undefined);
check("a member can't make themselves an admin", (await call(ids.applicant, `public.set_member_role('${ids.applicant}', 'admin')`)).error !== undefined);
check("a member can't remove anyone", (await call(ids.applicant, `public.remove_member('${ids.church}')`)).error !== undefined);
check("a member can't list the members", (await as(ids.applicant, "select * from public.church_members()")).length === 0);
check("a member can't write the tables directly", (await denied(ids.applicant, `update public.church_accounts set role = 'church' where user_id = '${ids.applicant}'`)) && (await denied(ids.applicant, `insert into public.church_applications (user_id, church_id, first_name, last_name, ministries) values ('${ids.applicant}', '${CHURCH}', 'a', 'b', array['media'])`)));
check("the role can't be set to anything else", (await call(ids.church, `public.set_member_role('${ids.applicant}', 'church')`)).error !== undefined);

// ---- a member's own details ----------------------------------------------------------------------------------------
check("a member can change their ministries", (await call(ids.applicant, "public.update_my_profile('Maria', 'Reyes', array['media','stage:drums'])")).ok === true);
check("and sees the change", (await db.query(`select ministries from public.church_accounts where user_id = '${ids.applicant}'`)).rows[0].ministries.join() === "media,stage:drums");
check("an empty or invalid choice is refused", (await call(ids.applicant, "public.update_my_profile('Maria', 'Reyes', array[]::text[])")).error !== undefined && (await call(ids.applicant, "public.update_my_profile('Maria', 'Reyes', array['x'])")).error !== undefined);
check("changing the profile never changes the role", (await db.query(`select role from public.church_accounts where user_id = '${ids.applicant}'`)).rows[0].role === "member");
check("someone outside any church has no profile to change", (await call(ids.second, "public.update_my_profile('Tom', 'Okafor', array['media'])")).error !== undefined);

// ---- the church account's powers -------------------------------------------------------------------------------------
const members = await as(ids.church, "select * from public.church_members()");
check("the church account lists its members, itself first", members.length === 2 && members[0].role === "church" && members.some((m) => m.email === "maria@example.com"));
check("another church sees only its own members", (await as(ids.otherChurch, "select * from public.church_members()")).every((m) => m.user_id === ids.otherChurch));
check("elevate to administrator", (await call(ids.church, `public.set_member_role('${ids.applicant}', 'admin')`)).ok === true && (await db.query(`select role from public.church_accounts where user_id = '${ids.applicant}'`)).rows[0].role === "admin");
check("an administrator can't answer requests, change roles or remove people (for now)", (await call(ids.applicant, `public.decide_application('${secondApp.id}', true)`)).error !== undefined && (await call(ids.applicant, `public.set_member_role('${ids.church}', 'member')`)).error !== undefined && (await call(ids.applicant, `public.remove_member('${ids.church}')`)).error !== undefined);
check("an administrator still sees the church's songs", (await as(ids.applicant, "select count(*) n from public.songs"))[0].n > 0);
check("demote back to an individual account", (await call(ids.church, `public.set_member_role('${ids.applicant}', 'member')`)).ok === true && (await db.query(`select role from public.church_accounts where user_id = '${ids.applicant}'`)).rows[0].role === "member");
check("the church account can't change or remove itself", (await call(ids.church, `public.set_member_role('${ids.church}', 'member')`)).error !== undefined && (await call(ids.church, `public.remove_member('${ids.church}')`)).error !== undefined);
check("another church can't touch this church's members", (await call(ids.otherChurch, `public.set_member_role('${ids.applicant}', 'admin')`)).error !== undefined && (await call(ids.otherChurch, `public.remove_member('${ids.applicant}')`)).error !== undefined);
check("a made-up person is refused", (await call(ids.church, "public.remove_member('00000000-0000-4000-8000-00000000ffff')")).error !== undefined);

check("remove a member", (await call(ids.church, `public.remove_member('${ids.applicant}')`)).ok === true);
check("a removed member loses access at once", (await as(ids.applicant, "select count(*) n from public.songs"))[0].n === 0);
check("and can apply again", (await apply(ids.applicant, CHURCH, "Maria", "Reyes", "array['media']")).ok === true);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
