import type { Actor } from "./access";

export const attendanceStatuses = [
  "present",
  "late",
  "absent",
  "replaced",
] as const;
export type AttendanceStatus = (typeof attendanceStatuses)[number];

export const noteCategories = [
  "operational",
  "subject_visible",
  "restricted",
] as const;
export type NoteCategory = (typeof noteCategories)[number];

export type ServiceNoteSummary = {
  id: string;
  organizationId: string;
  serviceId: string | null;
  servantId: string | null;
  category: NoteCategory;
  title: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  servantUserId?: string | null;
};

/**
 * Enforces access control for notes.
 * Crucial rule (RBAC-06):
 * Category 'restricted' is ONLY accessible by:
 * 1. Super Admin
 * 2. Creator of the note (createdBy)
 * 3. Users explicitly granted in service_notes_acl.
 * Administrators and coordinators WITHOUT an ACL grant are strictly forbidden.
 */
export function canReadNote(
  actor: Actor,
  note: {
    category: NoteCategory;
    createdBy: string;
    serviceId?: string | null;
    servantUserId?: string | null;
    fieldId?: string | null;
  },
  aclUserIds: string[] = [],
): boolean {
  if (actor.roles.includes("super_admin")) {
    return true;
  }

  if (note.createdBy === actor.id) {
    return true;
  }

  if (note.category === "restricted") {
    // Explicit ACL check. Notice: role "admin" alone does NOT grant access!
    return aclUserIds.includes(actor.id);
  }

  const isAdmin = actor.roles.includes("admin");
  if (isAdmin) {
    return true;
  }

  // Check if subject servant is the actor
  if (note.category === "subject_visible" && note.servantUserId === actor.id) {
    return true;
  }

  // Check coordinator scope if tied to service or field
  const isCoordinator =
    actor.roles.includes("worship_coordinator") ||
    actor.roles.includes("field_coordinator");

  if (isCoordinator) {
    const nowStr = new Date().toISOString();
    const hasServiceScope =
      Boolean(note.serviceId) &&
      actor.scopes.some(
        (s) =>
          s.type === "service" &&
          s.id === note.serviceId &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      );

    const hasFieldScope =
      Boolean(note.fieldId) &&
      actor.scopes.some(
        (s) =>
          s.type === "field" &&
          s.id === note.fieldId &&
          s.startsAt <= nowStr &&
          (!s.endsAt || s.endsAt > nowStr),
      );

    return hasServiceScope || hasFieldScope;
  }

  return false;
}

/**
 * Sanitizes a CSV cell to prevent formula injection (CSV injection).
 * If cell starts with '=', '+', '-', '@', '\t', or '\r', prefixes with a single quote (').
 * Also properly quotes cells containing commas, double-quotes, or newlines.
 */
export function sanitizeCsvCell(
  val: string | number | boolean | null | undefined,
): string {
  if (val === null || val === undefined) {
    return "";
  }

  let str = String(val);

  // Check for dangerous formula trigger prefixes
  if (/^[=+\-@\t\r]/u.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes and enclose if needed
  if (/[",\n\r]/u.test(str) || str.startsWith("'")) {
    return `"${str.replace(/"/gu, '""')}"`;
  }

  return str;
}

/**
 * Calculates percentage safely rounded to 1 decimal place.
 */
export function calculateRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}
