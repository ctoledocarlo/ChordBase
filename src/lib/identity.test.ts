import { describe, expect, it } from "vitest";
import { identityLabel } from "./identity";

const church = "Friends of Jesus Christ Canada";

describe("who is signed in", () => {
  it("says Main for a main account, whatever name it has", () => {
    expect(identityLabel({ churchName: church, role: "church" })).toBe(`${church} · Main`);
    expect(identityLabel({ churchName: church, role: "church", firstName: "Ana", lastName: "Lopez" })).toBe(`${church} · Main`);
  });

  it("says the first and last name for an individual account", () => {
    expect(identityLabel({ churchName: church, role: "member", firstName: "Maria", lastName: "Reyes" })).toBe(`${church} · Maria Reyes`);
  });

  it("marks an admin", () => {
    expect(identityLabel({ churchName: church, role: "admin", firstName: "Tom", lastName: "Okafor" })).toBe(`${church} · Tom Okafor (Admin)`);
    expect(identityLabel({ churchName: church, role: "admin" })).toBe(`${church} · Admin`);
  });

  it("shows just the church until a name is given", () => {
    expect(identityLabel({ churchName: church, role: "member", firstName: "", lastName: "" })).toBe(church);
    expect(identityLabel({ churchName: church, role: "member" })).toBe(church);
  });
});
