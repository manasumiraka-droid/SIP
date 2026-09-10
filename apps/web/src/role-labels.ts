import type { Role } from "../../../packages/domain/src/access";
export const roleLabels: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin/Sekretariat",
  worship_coordinator: "Koordinator Ibadah",
  field_coordinator: "Koordinator Bidang",
  servant: "Pelayan",
};
