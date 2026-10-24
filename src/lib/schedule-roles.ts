/**
 * What a person can be scheduled as at a service or event. The song leader and (optional) backup singers come first,
 * then the band by instrument, then media. The ids are what the database stores.
 */

export type ScheduleRole = "song-leader" | "backup-singer" | "keys" | "acoustic-guitar" | "electric-guitar" | "bass" | "drums" | "other" | "media";

export type RoleInfo = {
  id: ScheduleRole;
  label: string;
  /** What a heading says when there can be several ("Backup singers"). */
  plural: string;
  group: "vocals" | "band" | "media";
  /** The ministries (see lib/ministries.ts) whose people are the likely ones for this role. */
  ministries: string[];
  /** Left blank unless someone is chosen (backup singers are optional; a song leader and the band are expected). */
  optional?: boolean;
};

export const SCHEDULE_ROLES: RoleInfo[] = [
  { id: "song-leader", label: "Song leader", plural: "Song leader", group: "vocals", ministries: ["stage:vocals"] },
  { id: "backup-singer", label: "Backup singer", plural: "Backup singers", group: "vocals", ministries: ["stage:vocals"], optional: true },
  { id: "keys", label: "Keys", plural: "Keys", group: "band", ministries: ["stage:keys"] },
  { id: "acoustic-guitar", label: "Acoustic guitar", plural: "Acoustic guitar", group: "band", ministries: ["stage:acoustic-guitar"] },
  { id: "electric-guitar", label: "Electric guitar", plural: "Electric guitar", group: "band", ministries: ["stage:electric-guitar"] },
  { id: "bass", label: "Bass", plural: "Bass", group: "band", ministries: ["stage:bass"] },
  { id: "drums", label: "Drums", plural: "Drums", group: "band", ministries: ["stage:drums"] },
  { id: "other", label: "Other instrument", plural: "Other instruments", group: "band", ministries: ["stage:other"], optional: true },
  { id: "media", label: "Media", plural: "Media", group: "media", ministries: ["media"] },
];

export const SCHEDULE_ROLE_IDS = SCHEDULE_ROLES.map((r) => r.id);

export const isScheduleRole = (value: unknown): value is ScheduleRole => typeof value === "string" && (SCHEDULE_ROLE_IDS as string[]).includes(value);

export const roleInfo = (id: string): RoleInfo | undefined => SCHEDULE_ROLES.find((r) => r.id === id);

export const roleLabel = (id: string): string => roleInfo(id)?.label ?? id;

/** Whether someone's ministries make them a likely choice for a role. */
export const suitsRole = (role: ScheduleRole, ministries: readonly string[]): boolean => (roleInfo(role)?.ministries ?? []).some((m) => ministries.includes(m));

/** The groups in the order they are shown, each with its roles. */
export const ROLE_GROUPS: { id: RoleInfo["group"]; title: string; roles: RoleInfo[] }[] = [
  { id: "vocals", title: "Vocals", roles: SCHEDULE_ROLES.filter((r) => r.group === "vocals") },
  { id: "band", title: "Band", roles: SCHEDULE_ROLES.filter((r) => r.group === "band") },
  { id: "media", title: "Media", roles: SCHEDULE_ROLES.filter((r) => r.group === "media") },
];
