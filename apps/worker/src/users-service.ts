import type { Actor } from "../../../packages/domain/src/access";
import { canAccess } from "../../../packages/domain/src/access";
import { ApplicationError } from "../../../packages/domain/src/errors";
import type { RoleUpdate } from "../../../packages/validation/src/users";
import { listManagedUsers, replaceUserRoles } from "./users-repository";
import {
  createUserSchema,
  type CreateUser,
} from "../../../packages/validation/src/users";
import { persistNewUser } from "./create-user-repository";
import type { AccountStatusUpdate } from "../../../packages/validation/src/users";
import { replaceAccountStatus } from "./account-status-repository";
export async function createUser(
  db: D1Database,
  actor: Actor,
  input: CreateUser,
  key: string,
  requestId: string,
) {
  requireRoleManagement(actor);
  return persistNewUser(
    db,
    actor,
    createUserSchema.parse(input),
    key,
    requestId,
  );
}
export function requireRoleManagement(actor: Actor) {
  if (
    !canAccess(
      actor,
      "user.manage_role",
      { organizationId: actor.organizationId },
      new Date(),
    )
  )
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
}
export async function readUsers(
  db: D1Database,
  actor: Actor,
  cursor: string,
  limit: number,
) {
  if (
    !canAccess(
      actor,
      "user.read",
      { organizationId: actor.organizationId, ownerId: actor.id },
      new Date(),
    )
  )
    throw new ApplicationError("FORBIDDEN", 403, "Akses tidak diizinkan.");
  const organizationWide =
    actor.roles.includes("super_admin") || actor.roles.includes("admin");
  return listManagedUsers(
    db,
    actor.organizationId,
    cursor,
    limit,
    organizationWide ? null : actor.id,
  );
}
export async function changeRoles(
  db: D1Database,
  actor: Actor,
  userId: string,
  update: RoleUpdate,
  key: string,
  requestId: string,
) {
  requireRoleManagement(actor);
  return replaceUserRoles(db, actor, userId, update, key, requestId);
}
export async function changeAccountStatus(
  db: D1Database,
  actor: Actor,
  userId: string,
  update: AccountStatusUpdate,
  key: string,
  requestId: string,
) {
  requireRoleManagement(actor);
  return replaceAccountStatus(db, actor, userId, update, key, requestId);
}
