import { ApplicationError } from "./errors";

export const incidentStatuses = [
  "open",
  "resolved",
  "escalated_manual",
  "cancelled",
] as const;
export type IncidentStatus = (typeof incidentStatuses)[number];

export const incidentUrgencies = ["standard", "critical"] as const;
export type IncidentUrgency = (typeof incidentUrgencies)[number];

export type ReplacementCase = {
  id: string;
  organizationId: string;
  serviceId: string;
  assignmentId: string;
  serviceRoleId: string;
  status: IncidentStatus;
  urgency: IncidentUrgency;
  reason: string;
  resolvedAssignmentId: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CandidateRecommendation = {
  servantId: string;
  displayName: string;
  isBackup: boolean;
  monthlyAssignmentsCount: number;
  roleApproved: boolean;
  explanation: string[];
};

const incidentTransitions: Record<IncidentStatus, readonly IncidentStatus[]> = {
  open: ["resolved", "escalated_manual", "cancelled"],
  escalated_manual: ["resolved", "cancelled"],
  resolved: [],
  cancelled: [],
};

export function assertIncidentTransition(
  from: IncidentStatus,
  to: IncidentStatus,
) {
  if (!incidentTransitions[from]?.includes(to)) {
    throw new ApplicationError(
      "CONFLICT",
      409,
      `Transisi status insiden dari '${from}' ke '${to}' tidak sah.`,
    );
  }
}

/** Evaluates whether an incident is critical (less than 60 minutes before service starts). */
export function calculateUrgency(
  serviceStartsAt: string | Date,
  now: Date = new Date(),
): IncidentUrgency {
  const targetTime =
    typeof serviceStartsAt === "string"
      ? Date.parse(serviceStartsAt)
      : serviceStartsAt.getTime();
  const diffMs = targetTime - now.getTime();
  // Less than 60 minutes (3,600,000 ms) or already past
  if (diffMs <= 60 * 60 * 1000) {
    return "critical";
  }
  return "standard";
}

/** Sorts candidates deterministically: backup first, lowest monthly workload second, displayName third. */
export function sortCandidates<
  T extends {
    isBackup: boolean | number;
    monthlyAssignmentsCount: number;
    displayName: string;
  },
>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    const aBackup = a.isBackup ? 1 : 0;
    const bBackup = b.isBackup ? 1 : 0;
    if (aBackup !== bBackup) return bBackup - aBackup; // 1 (backup) comes first

    if (a.monthlyAssignmentsCount !== b.monthlyAssignmentsCount) {
      return a.monthlyAssignmentsCount - b.monthlyAssignmentsCount; // lowest workload first
    }

    return a.displayName.localeCompare(b.displayName);
  });
}
