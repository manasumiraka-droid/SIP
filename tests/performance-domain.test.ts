import { describe, expect, it } from "vitest";
import {
  calculateRate,
  canReadNote,
  sanitizeCsvCell,
} from "../packages/domain/src/performance";
import type { Actor } from "../packages/domain/src/access";

describe("Performance Domain Logic (Phase 4)", () => {
  describe("sanitizeCsvCell", () => {
    it("neutralizes dangerous formula injection characters", () => {
      expect(sanitizeCsvCell("=1+1")).toBe('"\'=1+1"');
      expect(sanitizeCsvCell("+cmd|' /C calc'!A0")).toBe(
        "\"'+cmd|' /C calc'!A0\"",
      );
      expect(sanitizeCsvCell("-5+2")).toBe('"\'-5+2"');
      expect(sanitizeCsvCell("@SUM(A1:B2)")).toBe('"\'@SUM(A1:B2)"');
      expect(sanitizeCsvCell("\tmalicious")).toBe('"\'\tmalicious"');
      expect(sanitizeCsvCell("\rmalicious")).toBe('"\'\rmalicious"');
    });

    it("leaves benign values safe and quotes only when necessary", () => {
      expect(sanitizeCsvCell("Budi Santoso")).toBe("Budi Santoso");
      expect(sanitizeCsvCell(123)).toBe("123");
      expect(sanitizeCsvCell(null)).toBe("");
      expect(sanitizeCsvCell(undefined)).toBe("");
      expect(sanitizeCsvCell("Nama, Lengkap")).toBe('"Nama, Lengkap"');
      expect(sanitizeCsvCell('Pdt. "John" Doe')).toBe('"Pdt. ""John"" Doe"');
    });
  });

  describe("canReadNote (RBAC-06)", () => {
    const superAdmin: Actor = {
      id: "u-super",
      organizationId: "org-1",
      displayName: "Super Admin",
      status: "active",
      roles: ["super_admin"],
      scopes: [],
    };

    const regularAdmin: Actor = {
      id: "u-admin",
      organizationId: "org-1",
      displayName: "Admin Sekretariat",
      status: "active",
      roles: ["admin"],
      scopes: [],
    };

    const authorCoordinator: Actor = {
      id: "u-coord-author",
      organizationId: "org-1",
      displayName: "Koordinator Pembuat",
      status: "active",
      roles: ["worship_coordinator"],
      scopes: [],
    };

    const grantedUser: Actor = {
      id: "u-pastor-granted",
      organizationId: "org-1",
      displayName: "Pendeta Pembina",
      status: "active",
      roles: ["worship_coordinator"],
      scopes: [],
    };

    const subjectServant: Actor = {
      id: "u-servant-subject",
      organizationId: "org-1",
      displayName: "Pelayan Ybs",
      status: "active",
      roles: ["servant"],
      scopes: [],
    };

    const otherServant: Actor = {
      id: "u-servant-other",
      organizationId: "org-1",
      displayName: "Pelayan Lain",
      status: "active",
      roles: ["servant"],
      scopes: [],
    };

    const restrictedNote = {
      category: "restricted" as const,
      createdBy: "u-coord-author",
      servantUserId: "u-servant-subject",
      serviceId: "srv-1",
    };

    it("allows super_admin and author to read restricted note", () => {
      expect(
        canReadNote(superAdmin, restrictedNote, ["u-pastor-granted"]),
      ).toBe(true);
      expect(
        canReadNote(authorCoordinator, restrictedNote, ["u-pastor-granted"]),
      ).toBe(true);
    });

    it("allows explicitly granted user in ACL to read restricted note", () => {
      expect(
        canReadNote(grantedUser, restrictedNote, ["u-pastor-granted"]),
      ).toBe(true);
    });

    it("STRICTLY DENIES regular admin from reading restricted note without ACL (RBAC-06)", () => {
      // Regular admin is NOT in ACL
      expect(
        canReadNote(regularAdmin, restrictedNote, ["u-pastor-granted"]),
      ).toBe(false);
    });

    it("denies subject servant from reading restricted note", () => {
      expect(
        canReadNote(subjectServant, restrictedNote, ["u-pastor-granted"]),
      ).toBe(false);
    });

    it("handles subject_visible notes properly", () => {
      const subjectNote = {
        category: "subject_visible" as const,
        createdBy: "u-coord-author",
        servantUserId: "u-servant-subject",
      };
      expect(canReadNote(subjectServant, subjectNote)).toBe(true);
      expect(canReadNote(otherServant, subjectNote)).toBe(false);
      expect(canReadNote(regularAdmin, subjectNote)).toBe(true);
    });

    it("handles operational notes properly", () => {
      const operationalNote = {
        category: "operational" as const,
        createdBy: "u-coord-author",
        serviceId: "srv-1",
      };
      expect(canReadNote(regularAdmin, operationalNote)).toBe(true);
      expect(canReadNote(otherServant, operationalNote)).toBe(false);
    });
  });

  describe("calculateRate", () => {
    it("calculates percentage accurately", () => {
      expect(calculateRate(8, 10)).toBe(80);
      expect(calculateRate(1, 3)).toBe(33.3);
      expect(calculateRate(0, 0)).toBe(0);
      expect(calculateRate(5, 0)).toBe(0);
    });
  });
});
