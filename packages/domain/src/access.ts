export const roles = [
  "super_admin",
  "admin",
  "worship_coordinator",
  "field_coordinator",
  "servant",
] as const;
export type Role = (typeof roles)[number];
export type Scope = {
  type: "service" | "field";
  id: string;
  startsAt: string;
  endsAt: string | null;
};
export type Actor = {
  id: string;
  organizationId: string;
  displayName: string;
  status: "active" | "inactive" | "suspended";
  roles: Role[];
  scopes: Scope[];
};

// Initial permissions only. Add each operational permission with its service and tests.
export const permissions = [
  "user.read",
  "user.manage_role",
  "organization.read",
  "organization.update",
  "audit.read",
  "service.create_update",
  "service.publish",
  "service.change_status",
  "assignment.read",
  "assignment.create_update",
  "assignment.respond",
  "servant.read",
  "servant.create_update",
  "servant.manage_capability",
  "import.schedule",
  "incident.read_manage",
  "replacement.manage",
  "attendance.record",
  "notes.manage",
  "reports.read",
  "reports.export",
] as const;
export type Permission = (typeof permissions)[number];
const grants: Record<Role, readonly Permission[]> = {
  super_admin: permissions,
  admin: [
    "user.read",
    "organization.read",
    "audit.read",
    "service.create_update",
    "service.publish",
    "service.change_status",
    "assignment.read",
    "assignment.create_update",
    "servant.read",
    "servant.create_update",
    "servant.manage_capability",
    "import.schedule",
    "incident.read_manage",
    "replacement.manage",
    "attendance.record",
    "notes.manage",
    "reports.read",
    "reports.export",
  ],
  worship_coordinator: [
    "user.read",
    "organization.read",
    "service.create_update",
    "service.publish",
    "service.change_status",
    "assignment.read",
    "assignment.create_update",
    "servant.read",
    "servant.manage_capability",
    "incident.read_manage",
    "replacement.manage",
    "attendance.record",
    "notes.manage",
    "reports.read",
    "reports.export",
  ],
  field_coordinator: [
    "user.read",
    "organization.read",
    "assignment.read",
    "assignment.create_update",
    "servant.read",
    "servant.manage_capability",
    "incident.read_manage",
    "replacement.manage",
    "attendance.record",
    "notes.manage",
    "reports.read",
    "reports.export",
  ],
  servant: [
    "user.read",
    "assignment.read",
    "assignment.respond",
    "servant.read",
    "servant.create_update",
    "incident.read_manage",
    "replacement.manage",
    "reports.read",
  ],
};
export function effectivePermissions(actor: Actor): Permission[] {
  return actor.status === "active"
    ? permissions.filter((permission) =>
        actor.roles.some((role) => grants[role].includes(permission)),
      )
    : [];
}
export function canAccess(
  actor: Actor,
  permission: Permission,
  resource: {
    organizationId: string;
    ownerId?: string;
    serviceId?: string;
    fieldId?: string;
  },
  now: Date,
): boolean {
  if (
    actor.organizationId !== resource.organizationId ||
    !effectivePermissions(actor).includes(permission)
  )
    return false;
  return actor.roles.some((role) => {
    if (!grants[role].includes(permission)) return false;
    if (role === "super_admin" || role === "admin") return true;
    if (role === "servant")
      return (
        [
          "user.read",
          "assignment.read",
          "assignment.respond",
          "servant.read",
          "servant.create_update",
          "incident.read_manage",
          "replacement.manage",
        ].includes(permission) && resource.ownerId === actor.id
      );
    return actor.scopes.some((scope) => {
      const active =
        Date.parse(scope.startsAt) <= now.getTime() &&
        (scope.endsAt === null || now.getTime() < Date.parse(scope.endsAt));
      return (
        active &&
        (role === "worship_coordinator"
          ? scope.type === "service" && scope.id === resource.serviceId
          : scope.type === "field" && scope.id === resource.fieldId)
      );
    });
  });
}
