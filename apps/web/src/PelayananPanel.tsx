import React, { useEffect, useMemo, useState } from "react";
import {
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleServantStatus = async (
    servant: ServantItem,
    newStatus: "active" | "inactive",
  ) => {
    const actionName =
      newStatus === "active" ? "mengaktifkan" : "menonaktifkan";
    if (
      !confirm(
        `Apakah Anda yakin ingin ${actionName} pelayan "${servant.displayName}"?`,
      )
    ) {
      return;
    }
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
        throw new Error(`Gagal ${actionName} pelayan.`);
      }
      showStatus(
        "success",
        `Pelayan "${servant.displayName}" berhasil di${newStatus === "active" ? "aktifkan" : "nonaktifkan"}.`,
      );
      await fetchServants();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Operasi gagal.",
      );
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
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleRoleStatus = async (
    role: ServiceRoleItem,
    newActive: number,
  ) => {
    const actionName = newActive === 1 ? "mengaktifkan" : "menonaktifkan";
    if (
      !confirm(
        `Apakah Anda yakin ingin ${actionName} peran pelayanan "${role.name}"?`,
      )
    ) {
      return;
    }
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
        throw new Error(`Gagal ${actionName} peran.`);
      }
      showStatus(
        "success",
        `Peran "${role.name}" berhasil di${newActive === 1 ? "aktifkan" : "nonaktifkan"}.`,
      );
      await fetchRolesAndFields();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Operasi gagal.",
      );
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
      showStatus("error", "Nama bidang wajib diisi.");
      return;
    }
    const finalCode = (fieldForm.code || slugify(fieldForm.name))
      .trim()
      .toLowerCase();
    if (!/^[a-z0-9_-]{1,64}$/.test(finalCode)) {
      showStatus("error", "Kode bidang tidak valid.");
      return;
    }
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
          code: finalCode,
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
        maxWidth: "1140px",
        margin: "0 auto",
        padding: "24px 16px",
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
              fontSize: "0.8rem",
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
            padding: "12px 16px",
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
              <X size={18} />
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
              style={{ color: "#4f46e5", flexShrink: 0, marginTop: "2px" }}
            />
            <div style={{ fontSize: "0.85rem", color: "#334155" }}>
              <strong style={{ display: "block", marginBottom: "4px" }}>
                Aturan Penugasan Berdasarkan Jabatan:
              </strong>
              <span>
                • <strong>Penatua</strong> &amp; <strong>Diaken</strong>: Berhak
                mengambil seluruh peran pelayanan dalam ibadah raya &amp; ibadah
                kategorial.
              </span>
              <br />
              <span>
                • <strong>Staff</strong>: Dibatasi khusus untuk peran{" "}
                <strong>Operator Multimedia</strong>,{" "}
                <strong>Operator Sound System</strong>, dan{" "}
                <strong>Kantoria</strong>.
              </span>
            </div>
          </div>

          {/* Action Bar & Filters */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              {/* Search Bar */}
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "10px",
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Cari nama atau nomor HP…"
                  value={servantSearch}
                  onChange={(e) => setServantSearch(e.target.value)}
                  style={{
                    padding: "8px 12px 8px 34px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    width: "220px",
                  }}
                />
              </div>

              {/* Title Filter Chips */}
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  backgroundColor: "#f1f5f9",
                  padding: "3px",
                  borderRadius: "8px",
                }}
              >
                {(
                  [
                    ["all", "Semua"],
                    ["Penatua", "Penatua"],
                    ["Diaken", "Diaken"],
                    ["Staff", "Staff"],
                    ["none", "Tanpa Jabatan"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTitleFilter(key)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "6px",
                      border: "none",
                      fontSize: "0.8rem",
                      fontWeight: titleFilter === key ? 700 : 500,
                      backgroundColor:
                        titleFilter === key ? "#ffffff" : "transparent",
                      color: titleFilter === key ? "#0f172a" : "#64748b",
                      boxShadow:
                        titleFilter === key
                          ? "0 1px 2px rgba(0,0,0,0.08)"
                          : "none",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as "all" | "active" | "inactive",
                  )
                }
                style={{
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="all">Status: Semua</option>
                <option value="active">Status: Aktif</option>
                <option value="inactive">Status: Nonaktif</option>
              </select>
            </div>

            {canManage && (
              <button
                type="button"
                className="primary-action"
                onClick={handleOpenCreateServant}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.875rem",
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
              overflow: "hidden",
            }}
          >
            {loadingServants ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Memuat data pelayan…
              </div>
            ) : filteredServants.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Tidak ada data pelayan yang cocok dengan filter.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
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
                      <th style={{ padding: "12px 16px" }}>Nama Pelayan</th>
                      <th style={{ padding: "12px 16px" }}>No. Ponsel</th>
                      <th style={{ padding: "12px 16px" }}>Jabatan</th>
                      <th style={{ padding: "12px 16px" }}>Cakupan Peran</th>
                      <th style={{ padding: "12px 16px" }}>Status</th>
                      {canManage && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
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
                            opacity: servant.status === "inactive" ? 0.6 : 1,
                          }}
                        >
                          <td style={{ padding: "12px 16px" }}>
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
                                    ? "#4f46e5"
                                    : isDiaken
                                      ? "#0d9488"
                                      : isStaff
                                        ? "#d97706"
                                        : "#64748b",
                                  color: "#ffffff",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontWeight: 700,
                                  fontSize: "0.8rem",
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
                                    }}
                                  >
                                    Cadangan
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
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
                          <td style={{ padding: "12px 16px" }}>
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
                              padding: "12px 16px",
                              fontSize: "0.8rem",
                              color: "#475569",
                            }}
                          >
                            {isPenatua || isDiaken ? (
                              <span
                                style={{ color: "#166534", fontWeight: 600 }}
                              >
                                ✓ Semua Peran Pelayanan
                              </span>
                            ) : isStaff ? (
                              <span
                                style={{ color: "#9a3412", fontWeight: 600 }}
                              >
                                Operator Multimedia, Sound &amp; Kantoria
                              </span>
                            ) : (
                              <span style={{ color: "#64748b" }}>
                                Perlu Penyesuaian Jabatan
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
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
                                padding: "12px 16px",
                                textAlign: "right",
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: "6px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditServant(servant)}
                                  title="Edit Data Pelayan"
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    color: "#334155",
                                    cursor: "pointer",
                                    fontSize: "0.8rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  <Pencil size={13} />
                                  <span>Edit</span>
                                </button>
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
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: "1px solid #fecaca",
                                      backgroundColor: "#ffffff",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
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
                                      handleToggleServantStatus(
                                        servant,
                                        "active",
                                      )
                                    }
                                    title="Aktifkan Kembali Pelayan"
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: "1px solid #a7f3d0",
                                      backgroundColor: "#ecfdf5",
                                      color: "#047857",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    <RotateCcw size={13} />
                                    <span>Aktifkan</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Service Roles Management */}
      {activeTab === "roles" && (
        <div>
          {/* Action Bar & Filters */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "10px",
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Cari peran atau kode…"
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                  style={{
                    padding: "8px 12px 8px 34px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    width: "220px",
                  }}
                />
              </div>

              {/* Field Filter */}
              <select
                value={fieldFilter}
                onChange={(e) => setFieldFilter(e.target.value)}
                style={{
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  backgroundColor: "#ffffff",
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
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.85rem",
                  backgroundColor: "#ffffff",
                }}
              >
                <option value="all">Semua Kelayakan Jabatan</option>
                <option value="staff_allowed">Bisa Diambil Staff</option>
                <option value="clergy_only">Khusus Diaken &amp; Penatua</option>
              </select>
            </div>

            {canManage && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleOpenCreateRole}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.875rem",
                  }}
                >
                  <Plus size={16} />
                  <span>Tambah Peran Pelayanan</span>
                </button>
              </div>
            )}
          </div>

          {/* Roles Table */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              overflow: "hidden",
            }}
          >
            {loadingRoles ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Memuat jenis peran pelayanan…
              </div>
            ) : filteredRoles.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Tidak ada peran pelayanan ditemukan. Klik tombol "Inisialisasi 8
                Peran Standar" di atas untuk menambahkan daftar baku.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
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
                      <th style={{ padding: "12px 16px" }}>Nama Peran</th>
                      <th style={{ padding: "12px 16px" }}>Kode Sistem</th>
                      <th style={{ padding: "12px 16px" }}>Bidang Pelayanan</th>
                      <th style={{ padding: "12px 16px" }}>Kebutuhan Slot</th>
                      <th style={{ padding: "12px 16px" }}>
                        Kelayakan Jabatan
                      </th>
                      <th style={{ padding: "12px 16px" }}>Status</th>
                      {canManage && (
                        <th
                          style={{
                            padding: "12px 16px",
                            textAlign: "right",
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
                          <td style={{ padding: "12px 16px" }}>
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
                          <td style={{ padding: "12px 16px" }}>
                            <code
                              style={{
                                backgroundColor: "#f1f5f9",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "0.8rem",
                                color: "#475569",
                              }}
                            >
                              {role.code}
                            </code>
                          </td>
                          <td
                            style={{ padding: "12px 16px", color: "#334155" }}
                          >
                            {fieldMap.get(role.fieldId) ?? role.fieldId}
                          </td>
                          <td
                            style={{ padding: "12px 16px", color: "#334155" }}
                          >
                            <strong>{role.slotsRequired}</strong> orang
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            {isOperatorOrKantoria ? (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  backgroundColor: "#ecfdf5",
                                  color: "#047857",
                                }}
                              >
                                Diaken, Penatua &amp; Staff
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  backgroundColor: "#eef2ff",
                                  color: "#4338ca",
                                }}
                              >
                                Khusus Diaken &amp; Penatua
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
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
                                padding: "12px 16px",
                                textAlign: "right",
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: "6px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditRole(role)}
                                  title="Edit Peran"
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    color: "#334155",
                                    cursor: "pointer",
                                    fontSize: "0.8rem",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    fontWeight: 500,
                                  }}
                                >
                                  <Pencil size={13} />
                                  <span>Edit</span>
                                </button>
                                {role.active === 1 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleRoleStatus(role, 0)
                                    }
                                    title="Nonaktifkan Peran"
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: "1px solid #fecaca",
                                      backgroundColor: "#ffffff",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
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
                                    title="Aktifkan Kembali Peran"
                                    style={{
                                      padding: "6px 10px",
                                      borderRadius: "6px",
                                      border: "1px solid #a7f3d0",
                                      backgroundColor: "#ecfdf5",
                                      color: "#047857",
                                      cursor: "pointer",
                                      fontSize: "0.8rem",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      fontWeight: 600,
                                    }}
                                  >
                                    <RotateCcw size={13} />
                                    <span>Aktifkan</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Fields Management */}
      {activeTab === "fields" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <p style={{ color: "#64748b", margin: 0, fontSize: "0.9rem" }}>
              Kelola struktur bidang pelayanan gerejawi untuk mengelompokkan
              peran pelayanan dan koordinator bidang.
            </p>
            {canManage && (
              <button
                type="button"
                className="primary-action"
                onClick={handleOpenCreateField}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.875rem",
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
              overflow: "hidden",
            }}
          >
            {fields.length === 0 ? (
              <div
                style={{
                  padding: "40px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                Belum ada bidang pelayanan. Klik tombol "Tambah Bidang Baru".
              </div>
            ) : (
              <table
                style={{
                  width: "100%",
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
                    <th style={{ padding: "12px 16px" }}>Nama Bidang</th>
                    <th style={{ padding: "12px 16px" }}>Kode Sistem</th>
                    <th style={{ padding: "12px 16px" }}>
                      Jumlah Peran Terkait
                    </th>
                    <th style={{ padding: "12px 16px" }}>Status</th>
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
                        <td style={{ padding: "12px 16px" }}>
                          <strong style={{ color: "#0f172a" }}>{f.name}</strong>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <code
                            style={{
                              backgroundColor: "#f1f5f9",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                            }}
                          >
                            {f.code}
                          </code>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#334155" }}>
                          {roleCount} Peran Pelayanan
                        </td>
                        <td style={{ padding: "12px 16px" }}>
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
            backdropFilter: "blur(2px)",
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
              borderRadius: "14px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
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
              <button
                type="button"
                onClick={() => setServantModalOpen(false)}
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

            <form onSubmit={handleSaveServant} style={{ padding: "20px" }}>
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
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
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
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
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
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="">-- Tanpa Jabatan Khusus --</option>
                  <option value="Penatua">
                    Penatua (Semua Peran Pelayanan)
                  </option>
                  <option value="Diaken">Diaken (Semua Peran Pelayanan)</option>
                  <option value="Staff">
                    Staff (Terbatas Operator &amp; Kantoria)
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
                    ? "⚠️ Perhatian: Staff hanya dapat ditugaskan untuk Operator Multimedia, Sound System, dan Kantoria."
                    : servantForm.title === "Penatua" ||
                        servantForm.title === "Diaken"
                      ? "✓ Penatua dan Diaken berhak ditugaskan untuk seluruh peran pelayanan."
                      : "Pilih jabatan untuk memberikan hak cakupan penugasan yang sesuai."}
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
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Nonaktif</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: "20px" }}>
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
                    style={{ width: "16px", height: "16px" }}
                  />
                  <span>
                    Daftarkan sebagai <strong>Pelayan Cadangan</strong>{" "}
                    (Standby)
                  </span>
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => setServantModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={submitting}
                >
                  {submitting ? "Menyimpan…" : "Simpan Pelayan"}
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
            backdropFilter: "blur(2px)",
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
              borderRadius: "14px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {editingRole
                  ? "Edit Peran Pelayanan"
                  : "Tambah Peran Pelayanan Baru"}
              </h2>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
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

            <form onSubmit={handleSaveRole} style={{ padding: "20px" }}>
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
                    const newName = e.target.value;
                    setRoleForm({
                      ...roleForm,
                      name: newName,
                      code:
                        roleForm.autoCode && !editingRole
                          ? slugify(newName)
                          : roleForm.code,
                    });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {!editingRole && (
                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "6px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      Kode Sistem <span style={{ color: "#e11d48" }}>*</span>
                    </label>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "#64748b",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={roleForm.autoCode}
                        onChange={(e) =>
                          setRoleForm({
                            ...roleForm,
                            autoCode: e.target.checked,
                            code: e.target.checked
                              ? slugify(roleForm.name)
                              : roleForm.code,
                          })
                        }
                      />
                      <span>Auto dari nama</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: pelayan_firman"
                    value={roleForm.code}
                    disabled={roleForm.autoCode}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        code: e.target.value.toLowerCase(),
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                      backgroundColor: roleForm.autoCode
                        ? "#f8fafc"
                        : "#ffffff",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#64748b",
                      marginTop: "4px",
                    }}
                  >
                    Format: huruf kecil, angka, underscore (_) atau strip (-).
                  </p>
                </div>
              )}

              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <label
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      color: "#334155",
                    }}
                  >
                    Bidang Pelayanan <span style={{ color: "#e11d48" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleOpenCreateField}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#4f46e5",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    + Tambah Bidang Baru
                  </button>
                </div>
                <select
                  required
                  value={roleForm.fieldId}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, fieldId: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <option value="">-- Pilih Bidang Pelayanan --</option>
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
                  gap: "12px",
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
                    max={99}
                    required
                    value={roleForm.slotsRequired}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        slotsRequired: Number(e.target.value),
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
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
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
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
                    Status Keaktifan Peran
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
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <option value={1}>Aktif</option>
                    <option value={0}>Nonaktif</option>
                  </select>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => setRoleModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={submitting}
                >
                  {submitting ? "Menyimpan…" : "Simpan Peran"}
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
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "16px",
          }}
          onClick={() => setFieldModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "14px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                Tambah Bidang Pelayanan Baru
              </h2>
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

            <form onSubmit={handleSaveField} style={{ padding: "20px" }}>
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
                  placeholder="Contoh: Firman & Liturgi"
                  value={fieldForm.name}
                  onChange={(e) =>
                    setFieldForm({
                      ...fieldForm,
                      name: e.target.value,
                      code: fieldForm.code || slugify(e.target.value),
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
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
                  placeholder="Contoh: liturgi"
                  value={fieldForm.code}
                  onChange={(e) =>
                    setFieldForm({
                      ...fieldForm,
                      code: e.target.value.toLowerCase(),
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  borderTop: "1px solid #f1f5f9",
                  paddingTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => setFieldModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={submitting}
                >
                  {submitting ? "Menyimpan…" : "Simpan Bidang"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
