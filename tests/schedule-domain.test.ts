import { describe, expect, it } from "vitest";
import {
  assertAssignmentTransition,
  assertServiceTransition,
  attendanceWindowsOverlap,
  exceedsMonthlyAssignmentLimit,
} from "../packages/domain/src/schedule";

describe("schedule state machines", () => {
  it("allows explicit scheduling transitions", () => {
    expect(() => assertServiceTransition("draft", "scheduled")).not.toThrow();
    expect(() =>
      assertAssignmentTransition("awaiting_confirmation", "accepted"),
    ).not.toThrow();
  });
  it("treats touching attendance windows as non-overlapping", () => {
    expect(
      attendanceWindowsOverlap(
        { assemblyAt: "2026-09-10T08:00:00Z", endsAt: "2026-09-10T09:00:00Z" },
        { assemblyAt: "2026-09-10T09:00:00Z", endsAt: "2026-09-10T10:00:00Z" },
      ),
    ).toBe(false);
    expect(
      attendanceWindowsOverlap(
        { assemblyAt: "2026-09-10T08:00:00Z", endsAt: "2026-09-10T09:01:00Z" },
        { assemblyAt: "2026-09-10T09:00:00Z", endsAt: "2026-09-10T10:00:00Z" },
      ),
    ).toBe(true);
    expect(exceedsMonthlyAssignmentLimit(2, 2)).toBe(true);
    expect(exceedsMonthlyAssignmentLimit(2, null)).toBe(false);
  });

  it("rejects terminal and skipped assignment transitions", () => {
    expect(() => assertServiceTransition("completed", "scheduled")).toThrow(
      "Perubahan status",
    );
    expect(() => assertAssignmentTransition("draft", "accepted")).toThrow(
      "Perubahan status",
    );
  });
});
