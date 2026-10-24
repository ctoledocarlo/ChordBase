/**
 * Who is what in a church:  Church (main)  ->  Admins  ->  Individual accounts.
 * What each role may do beyond managing people is still to be decided; until then, `can` is the one place to ask,
 * so each new permission is added here and not scattered through the pages.
 */

export type Role = "church" | "admin" | "member";

export const ROLES: Role[] = ["church", "admin", "member"];

/** A church normally has up to this many main accounts. */
export const MAX_MAIN_ACCOUNTS = 2;

export const ROLE_LABELS: Record<Role, string> = { church: "Church (main)", admin: "Admin", member: "Individual account" };

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as string[]).includes(value);

/** Higher is more trusted. */
const RANK: Record<Role, number> = { church: 2, admin: 1, member: 0 };

export const outranks = (a: Role, b: Role): boolean => RANK[a] > RANK[b];

export type Action = "manage-members" | "answer-applications" | "manage-schedule";

/** For now only the church account manages people. */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  switch (action) {
    case "manage-members":
    case "answer-applications":
      return role === "church";
    // Admins run the people list and the schedule's events and imports alongside the main accounts.
    case "manage-schedule":
      return role === "church" || role === "admin";
  }
}

/**
 * The roles a main account can give someone: admin or individual account, and main account while the church has fewer
 * than two. Never to a main account (its role is fixed here), and never as a way around the limit.
 */
export function rolesYouCanGive(actor: Role | null, target: Role, mainAccounts: number = MAX_MAIN_ACCOUNTS): Role[] {
  if (!can(actor, "manage-members") || target === "church") return [];
  const options: Role[] = mainAccounts < MAX_MAIN_ACCOUNTS ? ["church", "admin", "member"] : ["admin", "member"];
  return options.filter((r) => r !== target);
}

/** Whether the church account may remove this person. */
export const canRemove = (actor: Role | null, target: Role): boolean => can(actor, "manage-members") && target !== "church";
