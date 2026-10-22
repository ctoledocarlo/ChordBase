import { describe, expect, it } from "vitest";
import { MAX_MAIN_ACCOUNTS, ROLE_LABELS, can, canRemove, isRole, outranks, rolesYouCanGive } from "./roles";

describe("roles", () => {
  it("run Church, then Admins, then Individual accounts", () => {
    expect(outranks("church", "admin")).toBe(true);
    expect(outranks("admin", "member")).toBe(true);
    expect(outranks("member", "admin")).toBe(false);
    expect(outranks("admin", "admin")).toBe(false);
    expect(ROLE_LABELS.member).toBe("Individual account");
    expect(ROLE_LABELS.church).toBe("Church (main)");
  });

  it("recognises only real roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("owner")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("lets only the church account manage people, for now", () => {
    expect(can("church", "manage-members")).toBe(true);
    expect(can("church", "answer-applications")).toBe(true);
    expect(can("admin", "manage-members")).toBe(false);
    expect(can("member", "answer-applications")).toBe(false);
    expect(can(null, "manage-members")).toBe(false);
  });

  it("offers the roles the church account can give", () => {
    // With two main accounts already, only admin and individual account can be given.
    expect(rolesYouCanGive("church", "member", 2)).toEqual(["admin"]);
    expect(rolesYouCanGive("church", "admin", 2)).toEqual(["member"]);
    expect(rolesYouCanGive("church", "church", 1)).toEqual([]);
    // With room, a main account can be made too.
    expect(rolesYouCanGive("church", "member", 1)).toEqual(["church", "admin"]);
    expect(rolesYouCanGive("church", "admin", 1)).toEqual(["church", "member"]);
    expect(MAX_MAIN_ACCOUNTS).toBe(2);
    expect(rolesYouCanGive("admin", "member")).toEqual([]);
    expect(rolesYouCanGive(null, "member")).toEqual([]);
  });

  it("lets the church account remove anyone but itself", () => {
    expect(canRemove("church", "member")).toBe(true);
    expect(canRemove("church", "admin")).toBe(true);
    expect(canRemove("church", "church")).toBe(false);
    expect(canRemove("admin", "member")).toBe(false);
  });
});
