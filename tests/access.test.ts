import { describe, expect, it } from "vitest";
import {
  canAccess,
  effectivePermissions,
  type Actor,
  roles,
} from "../packages/domain/src/access";
const now = new Date("2026-09-08T09:00:00Z");
const actor: Actor = {
  id: "u1",
  organizationId: "a",
  displayName: "Test",
  status: "active",
  roles: ["servant"],
  scopes: [],
};
describe("deny by default and scope isolation", () => {
  it.each(roles)("rejects cross-organization reads for %s", (role) => {
    expect(
      canAccess(
        { ...actor, roles: [role] },
        "user.read",
        { organizationId: "b", ownerId: "u1" },
        now,
      ),
    ).toBe(false);
  });
  it.each(["inactive", "suspended"] as const)(
    "rejects %s super admin",
    (status) => {
      expect(
        effectivePermissions({ ...actor, roles: ["super_admin"], status }),
      ).toEqual([]);
    },
  );
  it("allows servant own identity but not another identity", () => {
    expect(
      canAccess(
        actor,
        "user.read",
        { organizationId: "a", ownerId: "u1" },
        now,
      ),
    ).toBe(true);
    expect(
      canAccess(
        actor,
        "user.read",
        { organizationId: "a", ownerId: "u2" },
        now,
      ),
    ).toBe(false);
  });
  it("does not grant coordinator organization-wide access", () => {
    expect(
      canAccess(
        { ...actor, roles: ["worship_coordinator"] },
        "user.read",
        { organizationId: "a", serviceId: "s1" },
        now,
      ),
    ).toBe(false);
  });
  it("checks scope type, target and expiry", () => {
    const coordinator: Actor = {
      ...actor,
      roles: ["field_coordinator"],
      scopes: [
        {
          type: "field",
          id: "f1",
          startsAt: "2026-09-01T00:00:00Z",
          endsAt: "2026-09-09T00:00:00Z",
        },
      ],
    };
    expect(
      canAccess(
        coordinator,
        "user.read",
        { organizationId: "a", fieldId: "f1" },
        now,
      ),
    ).toBe(true);
    expect(
      canAccess(
        coordinator,
        "user.read",
        { organizationId: "a", fieldId: "f2" },
        now,
      ),
    ).toBe(false);
    expect(
      canAccess(
        coordinator,
        "user.read",
        { organizationId: "a", serviceId: "f1" },
        now,
      ),
    ).toBe(false);
    expect(
      canAccess(
        coordinator,
        "user.read",
        { organizationId: "a", fieldId: "f1" },
        new Date("2026-09-09T00:00:00Z"),
      ),
    ).toBe(false);
  });
  it("combines grants without granting admin role management", () => {
    expect(
      effectivePermissions({ ...actor, roles: ["admin", "servant"] }),
    ).not.toContain("user.manage_role");
    expect(
      effectivePermissions({ ...actor, roles: ["super_admin", "servant"] }),
    ).toContain("user.manage_role");
  });
});
