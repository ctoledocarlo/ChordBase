/**
 * Who is what in a church:  Church (main)  ->  Admins  ->  Individual accounts.
 * What each role may do beyond managing people is still to be decided; until then, `can` is the one place to ask,
 * so each new permission is added here and not scattered through the pages.
 */

export type Role = "church" | "admin" | "member";

export const ROLES: Role[] = ["church", "admin", "member"];

export const ROLE_LABELS: Record<Role, string> = { church: "Church", admin: "Admin", member: "Individual account" };

export const isRole = (value: unknown): value is Role => typeof value === "string" && (ROLES as string[]).includes(value);

/** Higher is more trusted. */
const RANK: Record<Role, number> = { church: 2, admin: 1, member: 0 };

export const outranks = (a: Role, b: Role): boolean => RANK[a] > RANK[b];

export type Action = "manage-members" | "answer-applications";

/** For now only the church account manages people. */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  switch (action) {
    case "manage-members":
    case "answer-applications":
      return role === "church";
  }
}

/** The roles the church account can give someone: never "church", and never to the church account itself. */
export function rolesYouCanGive(actor: Role | null, target: Role): Role[] {
  if (!can(actor, "manage-members") || target === "church") return [];
  return (["admin", "member"] as Role[]).filter((r) => r !== target);
}

/** Whether the church account may remove this person. */
export const canRemove = (actor: Role | null, target: Role): boolean => can(actor, "manage-members") && target !== "church";
