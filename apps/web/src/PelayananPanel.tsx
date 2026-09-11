import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Layers,
  Pencil,
  Phone,
  Plus,
  Power,
  RotateCcw,
  Search,
  Shield,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";

export type ServantItem = {
  id: string;
  displayName: string;
  phoneNumber: string | null;
  title: "Diaken" | "Penatua" | "Staff" | null;
  status: "active" | "inactive" | "pending_review";
  isBackup: number | boolean;
  version: number;
  administrativeNote?: string | null;
};

export type ServiceRoleItem = {
  id: string;
  fieldId: string;
  code: string;
  name: string;
  slotsRequired: number;
  criticality: "normal" | "critical";
  active: number;
  version: number;
};

export type ServiceFieldItem = {
  id: string;
  code: string;
  name: string;
  active: number;
};

const STANDARD_ROLES_DEFINITION = [
  {
    name: "Pelayan Firman",
    code: "pelayan_firman",
    fieldCode: "liturgi",
    fieldName: "Firman & Liturgi",
    slots: 1,
    criticality: "critical" as const,
  },
  {
    name: "Pelayan Mimbar 2",
    code: "pelayan_mimbar_2",
    fieldCode: "liturgi",
    fieldName: "Firman & Liturgi",
    slots: 1,
    criticality: "normal" as const,
  },
  {
    name: "Kolektan dan Pelayan Pintu",
    code: "kolektan_pelayan_pintu",
    fieldCode: "diakonia",
    fieldName: "Diakonia & Pelayanan",
    slots: 4,
    criticality: "normal" as const,
  },
  {
    name: "Pelayan Persembahan",
    code: "pelayan_persembahan",
    fieldCode: "diakonia",
    fieldName: "Diakonia & Pelayanan",
    slots: 2,
    criticality: "normal" as const,
  },
  {
    name: "Pemain Keyboard/Piano",
    code: "pemain_keyboard_piano",
    fieldCode: "musik",
    fieldName: "Musik & Pujian",
    slots: 1,
    criticality: "critical" as const,
  },
  {
    name: "Kantoria",
    code: "kantoria",
    fieldCode: "musik",
    fieldName: "Musik & Pujian",
    slots: 2,
    criticality: "normal" as const,
  },
  {
    name: "Operator Multimedia",
    code: "operator_multimedia",
    fieldCode: "multimedia",
    fieldName: "Multimedia & IT",
    slots: 1,
    criticality: "normal" as const,
  },
  {
    name: "Operator Sound System",
    code: "operator_sound_system",
    fieldCode: "multimedia",
    fieldName: "Multimedia & IT",
    slots: 1,
    criticality: "critical" as const,
  },
];

export function PelayananPanel({
  canManage = true,
}: {
  organizationId?: string;
  canManage?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"servants" | "roles" | "fields">(
    "servants",
  );

  // Servants state
  const [servants, setServants] = useState<ServantItem[]>([]);
  const [loadingServants, setLoadingServants] = useState(false);
  const [servantSearch, setServantSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState<
    "all" | "Penatua" | "Diaken" | "Staff" | "none"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Service roles state
  const [roles, setRoles] = useState<ServiceRoleItem[]>([]);
  const [fields, setFields] = useState<ServiceFieldItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [roleSearch, setRoleSearch] = useState("");
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [roleEligibilityFilter, setRoleEligibilityFilter] = useState<
    "all" | "staff_allowed" | "clergy_only"
  >("all");

  // Modals state
  const [servantModalOpen, setServantModalOpen] = useState(false);
  const [editingServant, setEditingServant] = useState<ServantItem | null>(
    null,
  );
  const [servantForm, setServantForm] = useState<{
    displayName: string;
    phoneNumber: string;
    title: "" | "Diaken" | "Penatua" | "Staff";
    status: "active" | "inactive";
    isBackup: boolean;
    administrativeNote: string;
  }>({
    displayName: "",
    phoneNumber: "",
    title: "",
    status: "active",
    isBackup: false,
    administrativeNote: "",
  });

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<ServiceRoleItem | null>(null);
  const [roleForm, setRoleForm] = useState<{
    name: string;
    code: string;
    fieldId: string;
    slotsRequired: number;
    criticality: "normal" | "critical";
    active: number;
    autoCode: boolean;
  }>({
    name: "",
    code: "",
    fieldId: "",
    slotsRequired: 1,
    criticality: "normal",
    active: 1,
    autoCode: true,
  });

  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [fieldForm, setFieldForm] = useState<{
    name: string;
    code: string;
  }>({
    name: "",
    code: "",
  });

  // Custom Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: "servant" | "role" | "field";
    id: string;
    name: string;
    extraNote?: string;
  }>({
    isOpen: false,
    type: "servant",
    id: "",
    name: "",
  });

  // Action status message
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  };

  const showStatus = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  const fetchServants = async () => {
    setLoadingServants(true);
    try {
      const res = await fetch("/api/v1/servants?limit=100", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Gagal mengambil data pelayan.");
      const json = (await res.json()) as { data: ServantItem[] };
      setServants(json.data ?? []);
    } catch (err) {
      console.error(err);
      showStatus("error", "Gagal memuat daftar pelayan.");
    } finally {
      setLoadingServants(false);
    }
  };

  const fetchRolesAndFields = async () => {
    setLoadingRoles(true);
    try {
      const [resRoles, resFields] = await Promise.all([
        fetch("/api/v1/service-roles?limit=100", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
        fetch("/api/v1/fields?limit=100", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        }),
      ]);
      if (resRoles.ok) {
        const jsonRoles = (await resRoles.json()) as {
          data: ServiceRoleItem[];
        };
        setRoles(jsonRoles.data ?? []);
      }
      if (resFields.ok) {
        const jsonFields = (await resFields.json()) as {
          data: ServiceFieldItem[];
        };
        setFields(jsonFields.data ?? []);
      }
    } catch (err) {
      console.error(err);
      showStatus("error", "Gagal memuat jenis peran pelayanan.");
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    fetchServants();
    fetchRolesAndFields();
  }, []);

  // Servant Handlers
  const handleOpenCreateServant = () => {
    setEditingServant(null);
    setServantForm({
      displayName: "",
      phoneNumber: "",
      title: "",
      status: "active",
      isBackup: false,
      administrativeNote: "",
    });
    setServantModalOpen(true);
  };

  const handleOpenEditServant = (servant: ServantItem) => {
    setEditingServant(servant);
    setServantForm({
      displayName: servant.displayName,
      phoneNumber: servant.phoneNumber ?? "",
      title: servant.title ?? "",
      status: servant.status === "inactive" ? "inactive" : "active",
      isBackup: Boolean(servant.isBackup),
      administrativeNote: servant.administrativeNote ?? "",
    });
    setServantModalOpen(true);
  };

  const handleSaveServant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!servantForm.displayName.trim()) {
      showStatus("error", "Nama pelayan wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const url = editingServant
        ? `/api/v1/servants/${editingServant.id}`
        : "/api/v1/servants";
      const method = editingServant ? "PUT" : "POST";

      const payload = {
        displayName: servantForm.displayName.trim(),
        phoneNumber: servantForm.phoneNumber.trim() || null,
        title: servantForm.title || null,
        isBackup: servantForm.isBackup,
        administrativeNote: servantForm.administrativeNote.trim() || undefined,
        ...(editingServant ? { status: servantForm.status } : {}),
      };

      // Optimistic UI update
      if (editingServant) {
        setServants((prev) =>
          prev.map((s) =>
            s.id === editingServant.id
              ? {
                  ...s,
                  displayName: servantForm.displayName.trim(),
                  phoneNumber: servantForm.phoneNumber.trim() || null,
                  title: servantForm.title || null,
                  status: servantForm.status,
                  isBackup: servantForm.isBackup,
                  administrativeNote:
                    servantForm.administrativeNote.trim() || null,
                }
              : s,
          ),
        );
      }

      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          errorData?.error?.message ?? "Gagal menyimpan data pelayan.",
        );
      }

      showStatus(
        "success",
        editingServant
          ? `Data pelayan "${servantForm.displayName}" berhasil diperbarui.`
          : `Pelayan baru "${servantForm.displayName}" berhasil ditambahkan.`,
      );
      setServantModalOpen(false);
      await fetchServants();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Penyimpanan gagal.",
      );
      // Revert / re-sync on failure
      await fetchServants();
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDeleteServant = (servant: ServantItem) => {
    setDeleteModal({
      isOpen: true,
      type: "servant",
      id: servant.id,
      name: servant.displayName,
      extraNote:
        "Data pelayan ini akan dihapus permanen jika belum ada riwayat tugas jadwal, atau dinonaktifkan secara otomatis bila sudah memiliki riwayat tugas agar integritas data tetap terjaga.",
    });
  };

  const handleOpenDeleteRole = (role: ServiceRoleItem) => {
    setDeleteModal({
      isOpen: true,
      type: "role",
      id: role.id,
      name: role.name,
      extraNote:
        "Peran pelayanan ini akan dihapus jika belum pernah digunakan pada jadwal ibadah, atau dinonaktifkan secara aman bila sudah tercatat pada jadwal sebelumnya.",
    });
  };

  const handleOpenDeleteField = (field: ServiceFieldItem) => {
    setDeleteModal({
      isOpen: true,
      type: "field",
      id: field.id,
      name: field.name,
      extraNote:
        "Pastikan tidak ada peran aktif yang masih terkait ke bidang pelayanan ini.",
    });
  };

  const handleExecuteDelete = async () => {
    if (!deleteModal.id) return;
    setSubmitting(true);
    try {
      if (deleteModal.type === "servant") {
        // Optimistic UI removal
        setServants((prev) => prev.filter((s) => s.id !== deleteModal.id));

        const res = await fetch(`/api/v1/servants/${deleteModal.id}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          const errorData = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            errorData?.error?.message ?? "Gagal menghapus data pelayan.",
          );
        }
        showStatus(
          "success",
          `Data pelayan "${deleteModal.name}" berhasil dihapus/dinonaktifkan.`,
        );
        await fetchServants();
      } else if (deleteModal.type === "role") {
        // Optimistic UI removal
        setRoles((prev) => prev.filter((r) => r.id !== deleteModal.id));

        const res = await fetch(`/api/v1/service-roles/${deleteModal.id}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          const errorData = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            errorData?.error?.message ?? "Gagal menghapus peran pelayanan.",
          );
        }
        showStatus(
          "success",
          `Peran pelayanan "${deleteModal.name}" berhasil dihapus/dinonaktifkan.`,
        );
        await fetchRolesAndFields();
      } else if (deleteModal.type === "field") {
        setFields((prev) => prev.filter((f) => f.id !== deleteModal.id));
        const res = await fetch(`/api/v1/fields/${deleteModal.id}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!res.ok) {
          const errorData = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(
            errorData?.error?.message ?? "Gagal menghapus bidang pelayanan.",
          );
        }
        showStatus(
          "success",
          `Bidang pelayanan "${deleteModal.name}" berhasil dihapus.`,
        );
        await fetchRolesAndFields();
      }
      setDeleteModal({ isOpen: false, type: "servant", id: "", name: "" });
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Gagal memproses penghapusan.",
      );
      if (deleteModal.type === "servant") await fetchServants();
      else await fetchRolesAndFields();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleServantStatus = async (
    servant: ServantItem,
    newStatus: "active" | "inactive",
  ) => {
    // Optimistic toggle
    setServants((prev) =>
      prev.map((s) => (s.id === servant.id ? { ...s, status: newStatus } : s)),
    );

    try {
      const res = await fetch(`/api/v1/servants/${servant.id}`, {
        method: newStatus === "inactive" ? "DELETE" : "PUT",
        credentials: "same-origin",
        headers:
          newStatus === "active"
            ? {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              }
            : undefined,
        body:
          newStatus === "active"
            ? JSON.stringify({ status: "active" })
            : undefined,
      });
      if (!res.ok) {
        throw new Error(
          `Gagal ${newStatus === "active" ? "mengaktifkan" : "menonaktifkan"} pelayan.`,
        );
      }
      showStatus(
        "success",
        `Pelayan "${servant.displayName}" berhasil di${newStatus === "active" ? "aktifkan" : "nonaktifkan"}.`,
      );
      await fetchServants();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Operasi status gagal.",
      );
      await fetchServants();
    }
  };

  // Role Handlers
  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setRoleForm({
      name: "",
      code: "",
      fieldId: fields[0]?.id ?? "",
      slotsRequired: 1,
      criticality: "normal",
      active: 1,
      autoCode: true,
    });
    setRoleModalOpen(true);
  };

  const handleOpenEditRole = (role: ServiceRoleItem) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      code: role.code,
      fieldId: role.fieldId,
      slotsRequired: role.slotsRequired,
      criticality: role.criticality,
      active: role.active,
      autoCode: false,
    });
    setRoleModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      showStatus("error", "Nama peran pelayanan wajib diisi.");
      return;
    }
    const finalCode = roleForm.code.trim().toLowerCase();
    if (!editingRole && !finalCode) {
      showStatus("error", "Kode peran pelayanan wajib diisi.");
      return;
    }
    if (!editingRole && !/^[a-z0-9_-]{1,64}$/.test(finalCode)) {
      showStatus(
        "error",
        "Kode sistem hanya boleh berisi huruf kecil, angka, garis bawah (_), atau strip (-).",
      );
      return;
    }
    if (!roleForm.fieldId) {
      showStatus("error", "Pilih bidang pelayanan.");
      return;
    }

    setSubmitting(true);
    try {
      const url = editingRole
        ? `/api/v1/service-roles/${editingRole.id}`
        : "/api/v1/service-roles";
      const method = editingRole ? "PUT" : "POST";

      const payload = editingRole
        ? {
            name: roleForm.name.trim(),
            fieldId: roleForm.fieldId,
            slotsRequired: Number(roleForm.slotsRequired),
            criticality: roleForm.criticality,
            active: Number(roleForm.active),
          }
        : {
            name: roleForm.name.trim(),
            code: finalCode,
            fieldId: roleForm.fieldId,
            slotsRequired: Number(roleForm.slotsRequired),
            criticality: roleForm.criticality,
          };

      // Optimistic update
      if (editingRole) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id === editingRole.id
              ? {
                  ...r,
                  name: roleForm.name.trim(),
                  fieldId: roleForm.fieldId,
                  slotsRequired: Number(roleForm.slotsRequired),
                  criticality: roleForm.criticality,
                  active: Number(roleForm.active),
                }
              : r,
          ),
        );
      }

      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          errorData?.error?.message ?? "Gagal menyimpan peran pelayanan.",
        );
      }

      showStatus(
        "success",
        editingRole
          ? `Peran pelayanan "${roleForm.name}" berhasil diperbarui.`
          : `Peran pelayanan "${roleForm.name}" berhasil ditambahkan.`,
      );
      setRoleModalOpen(false);
      await fetchRolesAndFields();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Penyimpanan peran gagal.",
      );
      await fetchRolesAndFields();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRoleStatus = async (
    role: ServiceRoleItem,
    newActive: number,
  ) => {
    // Optimistic toggle
    setRoles((prev) =>
      prev.map((r) => (r.id === role.id ? { ...r, active: newActive } : r)),
    );

    try {
      const res = await fetch(`/api/v1/service-roles/${role.id}`, {
        method: newActive === 0 ? "DELETE" : "PUT",
        credentials: "same-origin",
        headers:
          newActive === 1
            ? {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              }
            : undefined,
        body: newActive === 1 ? JSON.stringify({ active: 1 }) : undefined,
      });
      if (!res.ok) {
        throw new Error(
          `Gagal ${newActive === 1 ? "mengaktifkan" : "menonaktifkan"} peran.`,
        );
      }
      showStatus(
        "success",
        `Peran "${role.name}" berhasil di${newActive === 1 ? "aktifkan" : "nonaktifkan"}.`,
      );
      await fetchRolesAndFields();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Operasi status gagal.",
      );
      await fetchRolesAndFields();
    }
  };

  // Field Handlers
  const handleOpenCreateField = () => {
    setFieldForm({ name: "", code: "" });
    setFieldModalOpen(true);
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldForm.name.trim()) {
      showStatus("error", "Nama bidang pelayanan wajib diisi.");
      return;
    }
    const code = fieldForm.code.trim().toLowerCase() || slugify(fieldForm.name);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/fields", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: fieldForm.name.trim(),
          code,
        }),
      });
      if (!res.ok) {
        const errorData = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          errorData?.error?.message ?? "Gagal menambahkan bidang pelayanan.",
        );
      }
      showStatus(
        "success",
        `Bidang pelayanan "${fieldForm.name}" berhasil ditambahkan.`,
      );
      setFieldModalOpen(false);
      await fetchRolesAndFields();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Gagal menambahkan bidang.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Seed All Standard 8 Roles
  const handleSeedStandardRoles = async () => {
    if (
      !confirm(
        "Inisialisasi 8 Peran Pelayanan Standar PRD v1.2 (Firman, Mimbar 2, Kolektan, Persembahan, Keyboard, Kantoria, Multimedia, Sound)? Peran yang sudah ada akan dilewati.",
      )
    ) {
      return;
    }
    setSubmitting(true);
    try {
      // 1. Ensure required fields exist
      let currentFields = [...fields];
      const requiredFields = [
        { code: "liturgi", name: "Firman & Liturgi" },
        { code: "musik", name: "Musik & Pujian" },
        { code: "multimedia", name: "Multimedia & IT" },
        { code: "diakonia", name: "Diakonia & Pelayanan" },
      ];

      for (const rf of requiredFields) {
        const exists = currentFields.find(
          (f) =>
            f.code === rf.code ||
            f.name.toLowerCase() === rf.name.toLowerCase(),
        );
        if (!exists) {
          const resF = await fetch("/api/v1/fields", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify(rf),
          });
          if (resF.ok) {
            const dataF = (await resF.json()) as { data: { id: string } };
            currentFields.push({ id: dataF.data.id, ...rf, active: 1 });
          }
        }
      }

      // Refresh fields
      const resFList = await fetch("/api/v1/fields?limit=100", {
        credentials: "same-origin",
      });
      if (resFList.ok) {
        const jsonF = (await resFList.json()) as { data: ServiceFieldItem[] };
        currentFields = jsonF.data ?? currentFields;
        setFields(currentFields);
      }

      // 2. Create missing standard roles
      let createdCount = 0;
      for (const std of STANDARD_ROLES_DEFINITION) {
        const existingRole = roles.find(
          (r) =>
            r.code === std.code ||
            r.name.toLowerCase() === std.name.toLowerCase(),
        );
        if (!existingRole) {
          const targetField =
            currentFields.find((f) => f.code === std.fieldCode) ??
            currentFields[0];
          if (targetField) {
            const resR = await fetch("/api/v1/service-roles", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": crypto.randomUUID(),
              },
              body: JSON.stringify({
                name: std.name,
                code: std.code,
                fieldId: targetField.id,
                slotsRequired: std.slots,
                criticality: std.criticality,
              }),
            });
            if (resR.ok) createdCount++;
          }
        }
      }

      await fetchRolesAndFields();
      showStatus(
        "success",
        `Inisialisasi selesai. ${createdCount} peran standar berhasil ditambahkan.`,
      );
    } catch (err) {
      console.error(err);
      showStatus("error", "Gagal menginisialisasi peran standar.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered lists
  const filteredServants = useMemo(() => {
    return servants.filter((s) => {
      if (titleFilter === "none" && s.title !== null) return false;
      if (
        titleFilter !== "all" &&
        titleFilter !== "none" &&
        s.title !== titleFilter
      )
        return false;
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (servantSearch.trim()) {
        const query = servantSearch.toLowerCase();
        const matchName = s.displayName.toLowerCase().includes(query);
        const matchPhone = s.phoneNumber?.toLowerCase().includes(query);
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
  }, [servants, titleFilter, statusFilter, servantSearch]);

  const filteredRoles = useMemo(() => {
    return roles.filter((r) => {
      if (fieldFilter !== "all" && r.fieldId !== fieldFilter) return false;
      const isOperatorOrKantoria =
        r.code.startsWith("operator") ||
        r.code.includes("sound") ||
        r.code.includes("media") ||
        r.code === "kantoria" ||
        r.name.toLowerCase().includes("operator") ||
        r.name.toLowerCase().includes("kantoria");

      if (roleEligibilityFilter === "staff_allowed" && !isOperatorOrKantoria)
        return false;
      if (roleEligibilityFilter === "clergy_only" && isOperatorOrKantoria)
        return false;

      if (roleSearch.trim()) {
        const query = roleSearch.toLowerCase();
        return (
          r.name.toLowerCase().includes(query) ||
          r.code.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [roles, fieldFilter, roleEligibilityFilter, roleSearch]);

  const fieldMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fields) {
      map.set(f.id, f.name);
    }
    return map;
  }, [fields]);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1240px",
        margin: "0 auto",
        padding: "16px 0 32px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <p
            className="eyebrow"
            style={{
              letterSpacing: "0.08em",
              fontWeight: 700,
              fontSize: "0.78rem",
              color: "#6366f1",
              margin: "0 0 4px",
            }}
          >
            PENGELOLAAN PELAYANAN GEREJAWI
          </p>
          <h1
            style={{
              fontSize: "2rem",
              fontWeight: 800,
              color: "#0f172a",
              margin: "0 0 8px",
            }}
          >
            Pelayanan & Jabatan
          </h1>
          <p
            style={{
              color: "#64748b",
              fontSize: "0.95rem",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Kelola data pelayan jemaat, nomor telepon, dan jabatan gerejawi (
            <strong>Penatua</strong>, <strong>Diaken</strong>,{" "}
            <strong>Staff</strong>) serta konfigurasi jenis peran pelayanan.
          </p>
        </div>

        {canManage && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleSeedStandardRoles}
              disabled={submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid #c7d2fe",
                backgroundColor: "#eef2ff",
                color: "#4338ca",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
              title="Pastikan 8 peran pelayanan standar gereja terdaftar"
            >
              <Sparkles size={16} />
              <span>Inisialisasi 8 Peran Standar</span>
            </button>
          </div>
        )}
      </div>

      {/* Global Status Message Toast */}
      {statusMessage && (
        <div
          style={{
            padding: "10px 10px",
            marginBottom: "20px",
            borderRadius: "10px",
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor:
              statusMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${
              statusMessage.type === "success" ? "#a7f3d0" : "#fecaca"
            }`,
            color: statusMessage.type === "success" ? "#065f46" : "#991b1b",
            boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {statusMessage.type === "success" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertCircle size={18} />
            )}
            <span style={{ fontWeight: 500 }}>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              padding: "4px",
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "24px",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("servants")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 18px",
            borderBottom:
              activeTab === "servants"
                ? "2px solid #4f46e5"
                : "2px solid transparent",
            color: activeTab === "servants" ? "#4f46e5" : "#64748b",
            fontWeight: activeTab === "servants" ? 700 : 500,
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          <Users size={18} />
          <span>Data Pelayan ({servants.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roles")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 18px",
            borderBottom:
              activeTab === "roles"
                ? "2px solid #4f46e5"
                : "2px solid transparent",
            color: activeTab === "roles" ? "#4f46e5" : "#64748b",
            fontWeight: activeTab === "roles" ? 700 : 500,
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          <Briefcase size={18} />
          <span>Jenis Peran Pelayanan ({roles.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("fields")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 18px",
            borderBottom:
              activeTab === "fields"
                ? "2px solid #4f46e5"
                : "2px solid transparent",
            color: activeTab === "fields" ? "#4f46e5" : "#64748b",
            fontWeight: activeTab === "fields" ? 700 : 500,
            background: "none",
            borderTop: "none",
            borderLeft: "none",
            borderRight: "none",
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          <Layers size={18} />
          <span>Bidang Pelayanan ({fields.length})</span>
        </button>
      </div>

      {/* Tab 1: Servants Management */}
      {activeTab === "servants" && (
        <div>
          {/* Rules Banner */}
          <div
            style={{
              padding: "14px 18px",
              marginBottom: "20px",
              borderRadius: "10px",
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
            }}
          >
            <Shield
              size={20}
              color="#4f46e5"
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <div style={{ fontSize: "0.875rem", color: "#334155" }}>
              <strong style={{ color: "#0f172a" }}>
                Aturan Penugasan Berdasarkan Jabatan:
              </strong>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  marginTop: "6px",
                }}
              >
                <span>
                  👔 <strong>Penatua & Diaken:</strong> Berhak mengambil{" "}
                  <em>seluruh peran pelayanan</em> yang ada.
                </span>
                <span>
                  💼 <strong>Staff:</strong> Khusus untuk peran{" "}
                  <strong>Operator Multimedia</strong>,{" "}
                  <strong>Operator Sound System</strong>, dan{" "}
                  <strong>Kantoria</strong>.
                </span>
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                flex: "1 1 500px",
              }}
            >
              {/* Search */}
              <div
                style={{
                  position: "relative",
                  flex: "1 1 200px",
                  maxWidth: "320px",
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Cari nama atau telepon..."
                  value={servantSearch}
                  onChange={(e) => setServantSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Title Filter */}
              <select
                value={titleFilter}
                onChange={(e) =>
                  setTitleFilter(
                    e.target.value as
                      "all" | "Penatua" | "Diaken" | "Staff" | "none",
                  )
                }
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                }}
              >
                <option value="all">Semua Jabatan</option>
                <option value="Penatua">Penatua</option>
                <option value="Diaken">Diaken</option>
                <option value="Staff">Staff</option>
                <option value="none">Tanpa Jabatan</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "all" | "active" | "inactive",
                  )
                }
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                }}
              >
                <option value="all">Semua Status</option>
                <option value="active">Hanya Aktif</option>
                <option value="inactive">Nonaktif</option>
              </select>

              <button
                type="button"
                onClick={fetchServants}
                title="Muat Ulang"
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#64748b",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <RotateCcw
                  size={16}
                  className={loadingServants ? "animate-spin" : ""}
                />
              </button>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={handleOpenCreateServant}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(79, 70, 229, 0.3)",
                }}
              >
                <Plus size={16} />
                <span>Tambah Pelayan</span>
              </button>
            )}
          </div>

          {/* Servants Table */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflowX: "auto",
            }}
          >
            {loadingServants && servants.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <RotateCcw
                  size={24}
                  className="animate-spin"
                  style={{ margin: "0 auto 12px" }}
                />
                <p style={{ margin: 0 }}>Memuat data pelayan...</p>
              </div>
            ) : filteredServants.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <Users
                  size={36}
                  color="#94a3b8"
                  style={{ margin: "0 auto 12px" }}
                />
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: "0 0 4px",
                  }}
                >
                  Belum ada pelayan ditemukan
                </h3>
                <p style={{ fontSize: "0.9rem", margin: "0 0 16px" }}>
                  {servantSearch ||
                  titleFilter !== "all" ||
                  statusFilter !== "all"
                    ? "Coba ubah kata kunci pencarian atau filter di atas."
                    : "Mulai tambahkan pelayan jemaat untuk mengelola jadwal ibadah."}
                </p>
                {canManage && (
                  <button
                    type="button"
                    onClick={handleOpenCreateServant}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      backgroundColor: "#4f46e5",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Plus size={16} />
                    <span>Tambah Pelayan Baru</span>
                  </button>
                )}
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  minWidth: "750px",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      color: "#475569",
                      fontWeight: 600,
                    }}
                  >
                    <th style={{ padding: "10px 10px" }}>Nama Pelayan</th>
                    <th style={{ padding: "10px 10px" }}>No. Ponsel</th>
                    <th style={{ padding: "10px 10px" }}>Jabatan</th>
                    <th style={{ padding: "10px 10px" }}>Cakupan Peran</th>
                    <th style={{ padding: "10px 10px" }}>Status</th>
                    {canManage && (
                      <th
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          minWidth: "220px",
                        }}
                      >
                        Aksi Pengelolaan
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredServants.map((servant) => {
                    const isPenatua = servant.title === "Penatua";
                    const isDiaken = servant.title === "Diaken";
                    const isStaff = servant.title === "Staff";

                    return (
                      <tr
                        key={servant.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          opacity: servant.status === "active" ? 1 : 0.6,
                        }}
                      >
                        <td style={{ padding: "10px 10px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            <div
                              style={{
                                width: "34px",
                                height: "34px",
                                borderRadius: "50%",
                                backgroundColor: isPenatua
                                  ? "#6366f1"
                                  : isDiaken
                                    ? "#0d9488"
                                    : isStaff
                                      ? "#d97706"
                                      : "#64748b",
                                color: "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyItems: "center",
                                justifyContent: "center",
                                fontWeight: 700,
                                fontSize: "0.78rem",
                              }}
                            >
                              {servant.displayName
                                .split(" ")
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase()}
                            </div>
                            <div>
                              <strong
                                style={{
                                  display: "block",
                                  color: "#0f172a",
                                }}
                              >
                                {servant.displayName}
                              </strong>
                              {servant.isBackup ? (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    color: "#7c3aed",
                                    backgroundColor: "#f5f3ff",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    border: "1px solid #ddd6fe",
                                  }}
                                >
                                  Cadangan
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          {servant.phoneNumber ? (
                            <a
                              href={`tel:${servant.phoneNumber}`}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                color: "#2563eb",
                                textDecoration: "none",
                                fontWeight: 500,
                              }}
                            >
                              <Phone size={13} />
                              <span>{servant.phoneNumber}</span>
                            </a>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          {isPenatua ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#eef2ff",
                                color: "#4338ca",
                                border: "1px solid #c7d2fe",
                              }}
                            >
                              <UserCheck size={12} /> Penatua
                            </span>
                          ) : isDiaken ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#f0fdf4",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                              }}
                            >
                              <UserCheck size={12} /> Diaken
                            </span>
                          ) : isStaff ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                              }}
                            >
                              <Briefcase size={12} /> Staff
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                backgroundColor: "#f1f5f9",
                                color: "#64748b",
                              }}
                            >
                              Tanpa Jabatan
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: "10px 10px",
                            fontSize: "0.78rem",
                            color: "#475569",
                          }}
                        >
                          {isPenatua || isDiaken ? (
                            <span style={{ color: "#166534", fontWeight: 600 }}>
                              ✓ Semua Peran Pelayanan
                            </span>
                          ) : isStaff ? (
                            <span style={{ color: "#9a3412", fontWeight: 600 }}>
                              Operator Multimedia, Sound &amp; Kantoria
                            </span>
                          ) : (
                            <span style={{ color: "#64748b" }}>
                              Perlu Penyesuaian Jabatan
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          {servant.status === "active" ? (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#ecfdf5",
                                color: "#047857",
                              }}
                            >
                              Aktif
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#fef2f2",
                                color: "#b91c1c",
                              }}
                            >
                              Nonaktif
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td
                            style={{
                              padding: "10px 10px",
                              textAlign: "right",
                            }}
                          >
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                              }}
                            >
                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditServant(servant)}
                                title="Edit Data Pelayan"
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  backgroundColor: "#ffffff",
                                  color: "#334155",
                                  cursor: "pointer",
                                  fontSize: "0.78rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 500,
                                }}
                              >
                                <Pencil size={13} />
                                <span>Edit</span>
                              </button>

                              {/* Status Toggle Button */}
                              {servant.status === "active" ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleServantStatus(
                                      servant,
                                      "inactive",
                                    )
                                  }
                                  title="Nonaktifkan Pelayan"
                                  style={{
                                    padding: "5px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid #fed7aa",
                                    backgroundColor: "#fff7ed",
                                    color: "#c2410c",
                                    cursor: "pointer",
                                    fontSize: "0.78rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  <Power size={13} />
                                  <span>Nonaktifkan</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleServantStatus(servant, "active")
                                  }
                                  title="Aktifkan Kembali"
                                  style={{
                                    padding: "5px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid #bbf7d0",
                                    backgroundColor: "#f0fdf4",
                                    color: "#15803d",
                                    cursor: "pointer",
                                    fontSize: "0.78rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  <Power size={13} />
                                  <span>Aktifkan</span>
                                </button>
                              )}

                              {/* Explicit Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteServant(servant)}
                                title="Hapus Data Pelayan"
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #fecdd3",
                                  backgroundColor: "#fff1f2",
                                  color: "#be123c",
                                  cursor: "pointer",
                                  fontSize: "0.78rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 600,
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Service Roles Management */}
      {activeTab === "roles" && (
        <div>
          {/* Controls Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
                flex: "1 1 500px",
              }}
            >
              {/* Search */}
              <div
                style={{
                  position: "relative",
                  flex: "1 1 200px",
                  maxWidth: "320px",
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Cari peran pelayanan..."
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Field Filter */}
              <select
                value={fieldFilter}
                onChange={(e) => setFieldFilter(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                }}
              >
                <option value="all">Semua Bidang</option>
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>

              {/* Eligibility Filter */}
              <select
                value={roleEligibilityFilter}
                onChange={(e) =>
                  setRoleEligibilityFilter(
                    e.target.value as "all" | "staff_allowed" | "clergy_only",
                  )
                }
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                }}
              >
                <option value="all">Semua Cakupan Kelayakan</option>
                <option value="staff_allowed">Bisa Diambil Staff</option>
                <option value="clergy_only">Khusus Penatua / Diaken</option>
              </select>

              <button
                type="button"
                onClick={fetchRolesAndFields}
                title="Muat Ulang"
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  cursor: "pointer",
                  color: "#64748b",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <RotateCcw
                  size={16}
                  className={loadingRoles ? "animate-spin" : ""}
                />
              </button>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={handleOpenCreateRole}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 1px 3px rgba(79, 70, 229, 0.3)",
                }}
              >
                <Plus size={16} />
                <span>Tambah Peran Baru</span>
              </button>
            )}
          </div>

          {/* Roles Table */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflowX: "auto",
            }}
          >
            {loadingRoles && roles.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <RotateCcw
                  size={24}
                  className="animate-spin"
                  style={{ margin: "0 auto 12px" }}
                />
                <p style={{ margin: 0 }}>Memuat jenis peran pelayanan...</p>
              </div>
            ) : filteredRoles.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <Briefcase
                  size={36}
                  color="#94a3b8"
                  style={{ margin: "0 auto 12px" }}
                />
                <h3
                  style={{
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#0f172a",
                    margin: "0 0 4px",
                  }}
                >
                  Belum ada peran pelayanan
                </h3>
                <p style={{ fontSize: "0.9rem", margin: "0 0 16px" }}>
                  Klik tombol di bawah untuk menginisialisasi 8 peran standar
                  atau buat peran kustom.
                </p>
                {canManage && (
                  <button
                    type="button"
                    onClick={handleSeedStandardRoles}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      backgroundColor: "#4f46e5",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Sparkles size={16} />
                    <span>Inisialisasi 8 Peran Standar</span>
                  </button>
                )}
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  minWidth: "780px",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      color: "#475569",
                      fontWeight: 600,
                    }}
                  >
                    <th style={{ padding: "10px 10px" }}>Nama Peran</th>
                    <th style={{ padding: "10px 10px" }}>Kode Sistem</th>
                    <th style={{ padding: "10px 10px" }}>Bidang Pelayanan</th>
                    <th style={{ padding: "10px 10px" }}>Kebutuhan Slot</th>
                    <th style={{ padding: "10px 10px" }}>Kelayakan Jabatan</th>
                    <th style={{ padding: "10px 10px" }}>Status</th>
                    {canManage && (
                      <th
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          minWidth: "220px",
                        }}
                      >
                        Aksi Pengelolaan
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRoles.map((role) => {
                    const isOperatorOrKantoria =
                      role.code.startsWith("operator") ||
                      role.code.includes("sound") ||
                      role.code.includes("media") ||
                      role.code === "kantoria" ||
                      role.name.toLowerCase().includes("operator") ||
                      role.name.toLowerCase().includes("kantoria");

                    return (
                      <tr
                        key={role.id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          opacity: role.active ? 1 : 0.6,
                        }}
                      >
                        <td style={{ padding: "10px 10px" }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <strong
                              style={{
                                color: "#0f172a",
                              }}
                            >
                              {role.name}
                            </strong>
                            {role.criticality === "critical" && (
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 600,
                                  color: "#b91c1c",
                                  backgroundColor: "#fef2f2",
                                  padding: "1px 6px",
                                  borderRadius: "4px",
                                  border: "1px solid #fecaca",
                                }}
                              >
                                Kritis
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <code
                            style={{
                              backgroundColor: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.78rem",
                              color: "#475569",
                            }}
                          >
                            {role.code}
                          </code>
                        </td>
                        <td style={{ padding: "10px 10px", color: "#334155" }}>
                          {fieldMap.get(role.fieldId) ?? role.fieldId}
                        </td>
                        <td style={{ padding: "10px 10px", color: "#334155" }}>
                          <strong>{role.slotsRequired}</strong> orang
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          {isOperatorOrKantoria ? (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "6px",
                                backgroundColor: "#fffbeb",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                              }}
                            >
                              Semua Jabatan Termasuk Staff
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: "6px",
                                backgroundColor: "#f0fdf4",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                              }}
                            >
                              Hanya Penatua &amp; Diaken
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          {role.active ? (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#ecfdf5",
                                color: "#047857",
                              }}
                            >
                              Aktif
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: "#fef2f2",
                                color: "#b91c1c",
                              }}
                            >
                              Nonaktif
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td
                            style={{
                              padding: "10px 10px",
                              textAlign: "right",
                            }}
                          >
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                              }}
                            >
                              {/* Edit Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditRole(role)}
                                title="Edit Peran"
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  backgroundColor: "#ffffff",
                                  color: "#334155",
                                  cursor: "pointer",
                                  fontSize: "0.78rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 500,
                                }}
                              >
                                <Pencil size={13} />
                                <span>Edit</span>
                              </button>

                              {/* Status Toggle Button */}
                              {role.active === 1 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleRoleStatus(role, 0)
                                  }
                                  title="Nonaktifkan Peran"
                                  style={{
                                    padding: "5px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid #fed7aa",
                                    backgroundColor: "#fff7ed",
                                    color: "#c2410c",
                                    cursor: "pointer",
                                    fontSize: "0.78rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  <Power size={13} />
                                  <span>Nonaktifkan</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleToggleRoleStatus(role, 1)
                                  }
                                  title="Aktifkan Peran"
                                  style={{
                                    padding: "5px 8px",
                                    borderRadius: "6px",
                                    border: "1px solid #bbf7d0",
                                    backgroundColor: "#f0fdf4",
                                    color: "#15803d",
                                    cursor: "pointer",
                                    fontSize: "0.78rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  <Power size={13} />
                                  <span>Aktifkan</span>
                                </button>
                              )}

                              {/* Explicit Delete Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenDeleteRole(role)}
                                title="Hapus Peran"
                                style={{
                                  padding: "5px 8px",
                                  borderRadius: "6px",
                                  border: "1px solid #fecdd3",
                                  backgroundColor: "#fff1f2",
                                  color: "#be123c",
                                  cursor: "pointer",
                                  fontSize: "0.78rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  fontWeight: 600,
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Service Fields Management */}
      {activeTab === "fields" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#64748b" }}>
              Bidang pelayanan mengelompokkan berbagai jenis peran pelayanan
              dalam ibadah.
            </p>
            {canManage && (
              <button
                type="button"
                onClick={handleOpenCreateField}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 16px",
                  borderRadius: "8px",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={16} />
                <span>Tambah Bidang Baru</span>
              </button>
            )}
          </div>

          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              overflowX: "auto",
            }}
          >
            {fields.length === 0 ? (
              <div
                style={{
                  padding: "48px 24px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                <Layers
                  size={36}
                  color="#94a3b8"
                  style={{ margin: "0 auto 12px" }}
                />
                <p style={{ margin: 0 }}>Belum ada bidang pelayanan.</p>
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
                  minWidth: "650px",
                  borderCollapse: "collapse",
                  textAlign: "left",
                  fontSize: "0.875rem",
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: "#f8fafc",
                      borderBottom: "1px solid #e2e8f0",
                      color: "#475569",
                      fontWeight: 600,
                    }}
                  >
                    <th style={{ padding: "10px 10px" }}>Nama Bidang</th>
                    <th style={{ padding: "10px 10px" }}>Kode Sistem</th>
                    <th style={{ padding: "10px 10px" }}>
                      Jumlah Peran Terkait
                    </th>
                    <th style={{ padding: "10px 10px" }}>Status</th>
                    {canManage && (
                      <th
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                        }}
                      >
                        Aksi
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => {
                    const roleCount = roles.filter(
                      (r) => r.fieldId === f.id,
                    ).length;
                    return (
                      <tr
                        key={f.id}
                        style={{ borderBottom: "1px solid #f1f5f9" }}
                      >
                        <td style={{ padding: "10px 10px" }}>
                          <strong style={{ color: "#0f172a" }}>{f.name}</strong>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <code
                            style={{
                              backgroundColor: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.78rem",
                            }}
                          >
                            {f.code}
                          </code>
                        </td>
                        <td style={{ padding: "10px 10px", color: "#334155" }}>
                          {roleCount} Peran Pelayanan
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              backgroundColor: "#ecfdf5",
                              color: "#047857",
                            }}
                          >
                            Aktif
                          </span>
                        </td>
                        {canManage && (
                          <td
                            style={{
                              padding: "10px 10px",
                              textAlign: "right",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteField(f)}
                              title="Hapus Bidang"
                              style={{
                                padding: "5px 8px",
                                borderRadius: "6px",
                                border: "1px solid #fecdd3",
                                backgroundColor: "#fff1f2",
                                color: "#be123c",
                                cursor: "pointer",
                                fontSize: "0.78rem",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontWeight: 600,
                              }}
                            >
                              <Trash2 size={13} />
                              <span>Hapus</span>
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal: Tambah/Edit Pelayan */}
      {servantModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setServantModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 24px",
                borderBottom: "1px solid #e2e8f0",
                backgroundColor: "#f8fafc",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div
                  style={{
                    padding: "8px",
                    borderRadius: "10px",
                    backgroundColor: "#e0e7ff",
                    color: "#4338ca",
                  }}
                >
                  <Users size={20} />
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {editingServant ? "Edit Data Pelayan" : "Tambah Pelayan Baru"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setServantModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveServant} style={{ padding: "24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Nama Lengkap Pelayan{" "}
                  <span style={{ color: "#e11d48" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={servantForm.displayName}
                  onChange={(e) =>
                    setServantForm({
                      ...servantForm,
                      displayName: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  No. Ponsel (WhatsApp / SMS)
                </label>
                <input
                  type="tel"
                  placeholder="Contoh: 0812-3456-7890"
                  value={servantForm.phoneNumber}
                  onChange={(e) =>
                    setServantForm({
                      ...servantForm,
                      phoneNumber: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Jabatan Gerejawi
                </label>
                <select
                  value={servantForm.title}
                  onChange={(e) =>
                    setServantForm({
                      ...servantForm,
                      title: e.target.value as
                        "" | "Diaken" | "Penatua" | "Staff",
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="">-- Tanpa Jabatan Khusus --</option>
                  <option value="Penatua">
                    Penatua (Berhak Semua Peran Pelayanan)
                  </option>
                  <option value="Diaken">
                    Diaken (Berhak Semua Peran Pelayanan)
                  </option>
                  <option value="Staff">
                    Staff (Terbatas Operator Multimedia, Sound &amp; Kantoria)
                  </option>
                </select>
                <p
                  style={{
                    fontSize: "0.78rem",
                    color:
                      servantForm.title === "Staff" ? "#b45309" : "#64748b",
                    marginTop: "5px",
                    lineHeight: 1.4,
                  }}
                >
                  {servantForm.title === "Staff"
                    ? "⚠️ Catatan: Sesuai aturan gerejawi, Staff hanya dapat ditugaskan untuk Operator Multimedia, Sound System, dan Kantoria."
                    : servantForm.title === "Penatua" ||
                        servantForm.title === "Diaken"
                      ? "✓ Penatua dan Diaken dapat ditugaskan ke seluruh peran pelayanan ibadah."
                      : "Pilih jabatan untuk memberikan hak cakupan penugasan yang sesuai aturan."}
                </p>
              </div>

              {editingServant && (
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Status Keaktifan
                  </label>
                  <select
                    value={servantForm.status}
                    onChange={(e) =>
                      setServantForm({
                        ...servantForm,
                        status: e.target.value as "active" | "inactive",
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="active">Aktif (Dapat Ditugaskan)</option>
                    <option value="inactive">
                      Nonaktif (Sementara Tidak Bertugas)
                    </option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "0.875rem",
                    color: "#334155",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={servantForm.isBackup}
                    onChange={(e) =>
                      setServantForm({
                        ...servantForm,
                        isBackup: e.target.checked,
                      })
                    }
                    style={{ width: "18px", height: "18px" }}
                  />
                  <span>
                    Daftarkan sebagai <strong>Pelayan Cadangan</strong> (Standby
                    saat petugas utama berhalangan)
                  </span>
                </label>
              </div>

              {/* Administrative Note */}
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Catatan Administratif / Keterangan Khusus
                </label>
                <textarea
                  placeholder="Catatan tambahan pelayan (misal: domisili, preferensi jam ibadah, riwayat penahbisan)..."
                  rows={3}
                  value={servantForm.administrativeNote}
                  onChange={(e) =>
                    setServantForm({
                      ...servantForm,
                      administrativeNote: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "18px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => setServantModalOpen(false)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    backgroundColor: "#4f46e5",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {submitting ? "Menyimpan…" : "Simpan Data Pelayan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah/Edit Peran Pelayanan */}
      {roleModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setRoleModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "540px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 24px",
                borderBottom: "1px solid #e2e8f0",
                backgroundColor: "#f8fafc",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div
                  style={{
                    padding: "8px",
                    borderRadius: "10px",
                    backgroundColor: "#e0e7ff",
                    color: "#4338ca",
                  }}
                >
                  <Briefcase size={20} />
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {editingRole
                    ? "Edit Jenis Peran Pelayanan"
                    : "Tambah Peran Pelayanan Baru"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRole} style={{ padding: "24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Nama Peran Pelayanan{" "}
                  <span style={{ color: "#e11d48" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pelayan Firman"
                  value={roleForm.name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRoleForm((prev) => ({
                      ...prev,
                      name: val,
                      code:
                        prev.autoCode && !editingRole
                          ? slugify(val)
                          : prev.code,
                    }));
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {!editingRole && (
                <div style={{ marginBottom: "16px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Kode Sistem Peran{" "}
                    <span style={{ color: "#e11d48" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: pelayan_firman"
                    value={roleForm.code}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        code: e.target.value.toLowerCase(),
                        autoCode: false,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                      fontFamily: "monospace",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "0.78rem",
                      color: "#64748b",
                      marginTop: "4px",
                    }}
                  >
                    Gunakan huruf kecil, angka, dan garis bawah (_).
                  </p>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Bidang Pelayanan <span style={{ color: "#e11d48" }}>*</span>
                </label>
                <select
                  value={roleForm.fieldId}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, fieldId: e.target.value })
                  }
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="" disabled>
                    -- Pilih Bidang Pelayanan --
                  </option>
                  {fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "16px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Kebutuhan Slot (Orang)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={roleForm.slotsRequired}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        slotsRequired: Number(e.target.value) || 1,
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Tingkat Kepentingan
                  </label>
                  <select
                    value={roleForm.criticality}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        criticality: e.target.value as "normal" | "critical",
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="normal">Normal</option>
                    <option value="critical">Kritis (Wajib Terisi)</option>
                  </select>
                </div>
              </div>

              {editingRole && (
                <div style={{ marginBottom: "20px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Status Keaktifan
                  </label>
                  <select
                    value={roleForm.active}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        active: Number(e.target.value),
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                      boxSizing: "border-box",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value={1}>Aktif (Bisa Dipilih di Jadwal)</option>
                    <option value={0}>Nonaktif</option>
                  </select>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "18px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => setRoleModalOpen(false)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    backgroundColor: "#4f46e5",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {submitting ? "Menyimpan…" : "Simpan Peran Pelayanan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tambah Bidang Pelayanan */}
      {fieldModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => setFieldModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 24px",
                borderBottom: "1px solid #e2e8f0",
                backgroundColor: "#f8fafc",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <div
                  style={{
                    padding: "8px",
                    borderRadius: "10px",
                    backgroundColor: "#e0e7ff",
                    color: "#4338ca",
                  }}
                >
                  <Layers size={20} />
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  Tambah Bidang Pelayanan
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFieldModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveField} style={{ padding: "24px" }}>
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Nama Bidang Pelayanan{" "}
                  <span style={{ color: "#e11d48" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Musik & Pujian"
                  value={fieldForm.name}
                  onChange={(e) =>
                    setFieldForm({
                      ...fieldForm,
                      name: e.target.value,
                      code: fieldForm.code
                        ? fieldForm.code
                        : slugify(e.target.value),
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Kode Sistem Bidang
                </label>
                <input
                  type="text"
                  placeholder="Contoh: musik"
                  value={fieldForm.code}
                  onChange={(e) =>
                    setFieldForm({
                      ...fieldForm,
                      code: e.target.value.toLowerCase(),
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "18px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => setFieldModalOpen(false)}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    backgroundColor: "#4f46e5",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Menyimpan…" : "Simpan Bidang"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteModal.isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "16px",
          }}
          onClick={() =>
            setDeleteModal({ isOpen: false, type: "servant", id: "", name: "" })
          }
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "24px 24px 20px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "14px",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    backgroundColor: "#fee2e2",
                    color: "#b91c1c",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3
                    style={{
                      margin: "0 0 4px",
                      fontSize: "1.2rem",
                      fontWeight: 700,
                      color: "#0f172a",
                    }}
                  >
                    {deleteModal.type === "servant"
                      ? "Hapus Data Pelayan"
                      : deleteModal.type === "role"
                        ? "Hapus Jenis Peran Pelayanan"
                        : "Hapus Bidang Pelayanan"}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "#64748b",
                      fontSize: "0.9rem",
                    }}
                  >
                    Apakah Anda yakin ingin menghapus{" "}
                    <strong style={{ color: "#0f172a" }}>
                      "{deleteModal.name}"
                    </strong>
                    ?
                  </p>
                </div>
              </div>

              {deleteModal.extraNote && (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "8px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    fontSize: "0.825rem",
                    color: "#475569",
                    lineHeight: 1.5,
                    marginBottom: "20px",
                  }}
                >
                  🛡️ {deleteModal.extraNote}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setDeleteModal({
                      isOpen: false,
                      type: "servant",
                      id: "",
                      name: "",
                    })
                  }
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 500,
                    color: "#334155",
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleExecuteDelete}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "8px",
                    backgroundColor: "#dc2626",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    cursor: submitting ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    boxShadow: "0 1px 3px rgba(220, 38, 38, 0.4)",
                  }}
                >
                  <Trash2 size={16} />
                  <span>{submitting ? "Memproses…" : "Ya, Hapus Data"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
