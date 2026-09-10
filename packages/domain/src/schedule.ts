import { ApplicationError } from "./errors";

export const assignmentStatuses = [
  "draft",
  "awaiting_confirmation",
  "accepted",
  "unavailable",
  "needs_replacement",
  "reassigned",
  "absent",
  "completed",
  "cancelled",
] as const;
export type AssignmentStatus = (typeof assignmentStatuses)[number];
export const serviceStatuses = [
  "draft",
  "scheduled",
  "completed",
  "postponed",
  "cancelled",
] as const;
export type ServiceStatus = (typeof serviceStatuses)[number];
const assignmentTransitions: Record<
  AssignmentStatus,
  readonly AssignmentStatus[]
> = {
  draft: ["awaiting_confirmation", "cancelled"],
  awaiting_confirmation: [
    "accepted",
    "unavailable",
    "needs_replacement",
    "cancelled",
  ],
  accepted: [
    "unavailable",
    "needs_replacement",
    "absent",
    "completed",
    "cancelled",
  ],
  unavailable: ["needs_replacement", "cancelled"],
  needs_replacement: ["reassigned", "cancelled"],
  reassigned: [],
  absent: ["completed"],
  completed: [],
  cancelled: [],
};
const serviceTransitions: Record<ServiceStatus, readonly ServiceStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["completed", "postponed", "cancelled"],
  postponed: ["scheduled", "cancelled"],
  completed: [],
  cancelled: [],
};
export function assertAssignmentTransition(
  from: AssignmentStatus,
  to: AssignmentStatus,
) {
  if (!assignmentTransitions[from].includes(to))
    throw new ApplicationError(
      "INVALID_TRANSITION",
      409,
      "Perubahan status penugasan tidak diizinkan.",
    );
}
export function assertServiceTransition(
  from: ServiceStatus,
  to: ServiceStatus,
) {
  if (!serviceTransitions[from].includes(to))
    throw new ApplicationError(
      "INVALID_TRANSITION",
      409,
      "Perubahan status ibadah tidak diizinkan.",
    );
}

export function attendanceWindowsOverlap(
  first: { assemblyAt: string; endsAt: string },
  second: { assemblyAt: string; endsAt: string },
) {
  return (
    Date.parse(first.assemblyAt) < Date.parse(second.endsAt) &&
    Date.parse(first.endsAt) > Date.parse(second.assemblyAt)
  );
}

export function exceedsMonthlyAssignmentLimit(
  activeAssignments: number,
  limit: number | null,
) {
  return limit !== null && activeAssignments >= limit;
}
