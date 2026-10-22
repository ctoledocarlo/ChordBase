import { describe, expect, it } from "vitest";
import { churchNameProblem, isAccountType, passwordProblem, tidyChurchName } from "./account-type";

describe("account types", () => {
  it("are individual or church", () => {
    expect(isAccountType("individual")).toBe(true);
    expect(isAccountType("church")).toBe(true);
    expect(isAccountType("admin")).toBe(false);
    expect(isAccountType(undefined)).toBe(false);
  });

  it("need a password of 8 or more that is typed twice the same", () => {
    expect(passwordProblem("short", "short")).toContain("8");
    expect(passwordProblem("longenough", "different1")).toContain("match");
    expect(passwordProblem("longenough", "longenough")).toBeNull();
  });

  it("tidy a church's name", () => {
    expect(tidyChurchName("  Grace   Chapel ")).toBe("Grace Chapel");
  });

  it("need a church name of a sensible length", () => {
    expect(churchNameProblem(" ")).not.toBeNull();
    expect(churchNameProblem("A")).not.toBeNull();
    expect(churchNameProblem("Grace Chapel")).toBeNull();
    expect(churchNameProblem("x".repeat(81))).not.toBeNull();
  });
});
