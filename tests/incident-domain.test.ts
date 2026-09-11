import { describe, expect, it } from "vitest";
import {
  assertIncidentTransition,
  calculateUrgency,
  sortCandidates,
} from "../packages/domain/src/incidents";

describe("Incident Domain Logic (Phase 3)", () => {
  describe("assertIncidentTransition", () => {
    it("allows valid transitions from open", () => {
      expect(() => assertIncidentTransition("open", "resolved")).not.toThrow();
      expect(() =>
        assertIncidentTransition("open", "escalated_manual"),
      ).not.toThrow();
      expect(() => assertIncidentTransition("open", "cancelled")).not.toThrow();
    });

    it("allows valid transitions from escalated_manual", () => {
      expect(() =>
        assertIncidentTransition("escalated_manual", "resolved"),
      ).not.toThrow();
      expect(() =>
        assertIncidentTransition("escalated_manual", "cancelled"),
      ).not.toThrow();
    });

    it("rejects invalid transitions from terminal states", () => {
      expect(() => assertIncidentTransition("resolved", "open")).toThrow(
        /tidak sah/u,
      );
      expect(() => assertIncidentTransition("cancelled", "resolved")).toThrow(
        /tidak sah/u,
      );
      expect(() =>
        assertIncidentTransition("resolved", "escalated_manual"),
      ).toThrow(/tidak sah/u);
    });
  });

  describe("calculateUrgency", () => {
    it("classifies services starting in less than 60 minutes as critical", () => {
      const now = new Date("2026-09-13T16:15:00Z");
      // 45 minutes until start
      const startsAt = "2026-09-13T17:00:00Z";
      expect(calculateUrgency(startsAt, now)).toBe("critical");
    });

    it("classifies services starting in more than 60 minutes as standard", () => {
      const now = new Date("2026-09-13T15:00:00Z");
      // 120 minutes until start
      const startsAt = "2026-09-13T17:00:00Z";
      expect(calculateUrgency(startsAt, now)).toBe("standard");
    });

    it("classifies services starting exactly at 60 minutes as critical", () => {
      const now = new Date("2026-09-13T16:00:00Z");
      const startsAt = "2026-09-13T17:00:00Z";
      expect(calculateUrgency(startsAt, now)).toBe("critical");
    });

    it("classifies past services as critical", () => {
      const now = new Date("2026-09-13T17:15:00Z");
      const startsAt = "2026-09-13T17:00:00Z";
      expect(calculateUrgency(startsAt, now)).toBe("critical");
    });
  });

  describe("sortCandidates", () => {
    it("prioritizes backup servants, then lowest monthly assignments, then alphabetical", () => {
      const candidates = [
        {
          servantId: "s1",
          displayName: "Budi Santoso",
          isBackup: false,
          monthlyAssignmentsCount: 1,
        },
        {
          servantId: "s2",
          displayName: "Agus Pratama",
          isBackup: true,
          monthlyAssignmentsCount: 3,
        },
        {
          servantId: "s3",
          displayName: "Citra Lestari",
          isBackup: true,
          monthlyAssignmentsCount: 1,
        },
        {
          servantId: "s4",
          displayName: "Andi Wijaya",
          isBackup: false,
          monthlyAssignmentsCount: 0,
        },
      ];

      const sorted = sortCandidates(candidates);

      // Backups come first: s3 (1 task) then s2 (3 tasks)
      expect(sorted[0]?.servantId).toBe("s3");
      expect(sorted[1]?.servantId).toBe("s2");
      // Non-backups: s4 (0 tasks) then s1 (1 task)
      expect(sorted[2]?.servantId).toBe("s4");
      expect(sorted[3]?.servantId).toBe("s1");
    });

    it("uses alphabetical order when backup status and workload are tied", () => {
      const candidates = [
        {
          servantId: "s1",
          displayName: "Zul",
          isBackup: true,
          monthlyAssignmentsCount: 2,
        },
        {
          servantId: "s2",
          displayName: "Alfa",
          isBackup: true,
          monthlyAssignmentsCount: 2,
        },
      ];

      const sorted = sortCandidates(candidates);
      expect(sorted[0]?.displayName).toBe("Alfa");
      expect(sorted[1]?.displayName).toBe("Zul");
    });
  });
});
