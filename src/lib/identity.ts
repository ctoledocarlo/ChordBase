import { fullName } from "./ministries";
import type { Role } from "./roles";

/**
 * Who is signed in, as the header says it: "Friends of Jesus Christ Canada · Main" for a main account, and the
 * person's own name for everyone else ("Friends of Jesus Christ Canada · Maria Reyes", with "(Admin)" for an admin).
 * Someone who hasn't given a name yet is just shown with their church.
 */
export function identityLabel(who: { churchName: string; role: Role; firstName?: string | null; lastName?: string | null }): string {
  const name = fullName(who.firstName, who.lastName);
  const part = who.role === "church" ? "Main" : who.role === "admin" ? (name ? `${name} (Admin)` : "Admin") : name;
  return part ? `${who.churchName} · ${part}` : who.churchName;
}
