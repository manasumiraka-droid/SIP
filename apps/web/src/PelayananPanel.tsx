import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  Pencil,
  Phone,
  Plus,
  Search,
  Shield,
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

export function PelayananPanel({
  canManage = true,
}: {
  organizationId?: string;
  canManage?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"servants" | "roles">("servants");

  // Servants state
  const [servants, setServants] = useState<ServantItem[]>([]);
  const [loadingServants, setLoadingServants] = useState(false);
  const [servantSearch, setServantSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState<
    "all" | "Penatua" | "Diaken" | "Staff"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Service roles state
  const [roles, setRoles] = useState<ServiceRoleItem[]>([]);
  const [fields, setFields] = useState<ServiceFieldItem[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [roleSearch, setRoleSearch] = useState("");

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
  }>({
    displayName: "",
    phoneNumber: "",
    title: "",
    status: "active",
    isBackup: false,
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
  }>({
    name: "",
    code: "",
    fieldId: "",
    slotsRequired: 1,
    criticality: "normal",
    active: 1,
  });

  // Action status message
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const showStatus = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 5000);
  };

  // Servant Handlers
  const handleOpenCreateServant = () => {
    setEditingServant(null);
    setServantForm({
      displayName: "",
      phoneNumber: "",
      title: "",
      status: "active",
      isBackup: false,
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
          ? `Data pelayan ${servantForm.displayName} berhasil diperbarui.`
          : `Pelayan baru ${servantForm.displayName} berhasil ditambahkan.`,
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

  const handleDeleteServant = async (servant: ServantItem) => {
    const actionText =
      servant.status === "active" ? "menonaktifkan" : "menghapus";
    if (
      !confirm(
        `Apakah Anda yakin ingin ${actionText} pelayan "${servant.displayName}"?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/servants/${servant.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error("Gagal menonaktifkan pelayan.");
      }
      showStatus(
        "success",
        `Pelayan ${servant.displayName} berhasil dinonaktifkan.`,
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
    });
    setRoleModalOpen(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name.trim()) {
      showStatus("error", "Nama peran pelayanan wajib diisi.");
      return;
    }
    if (!editingRole && !roleForm.code.trim()) {
      showStatus("error", "Kode peran pelayanan wajib diisi.");
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
            code: roleForm.code.trim().toLowerCase(),
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

  const handleDeleteRole = async (role: ServiceRoleItem) => {
    if (
      !confirm(
        `Apakah Anda yakin ingin menonaktifkan peran pelayanan "${role.name}"?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/service-roles/${role.id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error("Gagal menonaktifkan peran.");
      }
      showStatus("success", `Peran ${role.name} berhasil dinonaktifkan.`);
      await fetchRolesAndFields();
    } catch (err) {
      showStatus(
        "error",
        err instanceof Error ? err.message : "Operasi gagal.",
      );
    }
  };

  // Filtered lists
  const filteredServants = useMemo(() => {
    return servants.filter((s) => {
      if (titleFilter !== "all" && s.title !== titleFilter) return false;
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
      if (roleSearch.trim()) {
        const query = roleSearch.toLowerCase();
        return (
          r.name.toLowerCase().includes(query) ||
          r.code.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [roles, roleSearch]);

  const fieldMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of fields) {
      map.set(f.id, f.name);
    }
    return map;
  }, [fields]);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <p
          className="eyebrow"
          style={{
            letterSpacing: "0.08em",
            fontWeight: 700,
            fontSize: "0.8rem",
            color: "#6366f1",
          }}
        >
          PENGELOLAAN PELAYANAN GEREJAWI
        </p>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            color: "#0f172a",
            margin: "4px 0 8px",
          }}
        >
          Pelayanan & Jabatan
        </h1>
        <p style={{ color: "#64748b", fontSize: "0.95rem", lineHeight: 1.5 }}>
          Kelola data pelayan jemaat, nomor telepon, dan jabatan gerejawi (
          <strong>Penatua</strong>, <strong>Diaken</strong>,{" "}
          <strong>Staff</strong>) serta konfigurasi jenis peran pelayanan.
        </p>
      </div>

      {/* Global Status Message Toast */}
      {statusMessage && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: "20px",
            borderRadius: "8px",
            fontSize: "0.9rem",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backgroundColor:
              statusMessage.type === "success" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${
              statusMessage.type === "success" ? "#a7f3d0" : "#fecaca"
            }`,
            color: statusMessage.type === "success" ? "#065f46" : "#991b1b",
          }}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <X size={18} />
          )}
          <span>{statusMessage.text}</span>
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
                          Aksi
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
                                  width: "32px",
                                  height: "32px",
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
                                Belum Ditentukan
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
                              <span style={{ color: "#166534" }}>
                                ✓ Semua Peran Pelayanan
                              </span>
                            ) : isStaff ? (
                              <span style={{ color: "#9a3412" }}>
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
                                  padding: "2px 8px",
                                  borderRadius: "4px",
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
                                  padding: "2px 8px",
                                  borderRadius: "4px",
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
                                  title="Edit Pelayan"
                                  style={{
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    color: "#475569",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                                {servant.status === "active" && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteServant(servant)}
                                    title="Nonaktifkan Pelayan"
                                    style={{
                                      padding: "6px",
                                      borderRadius: "6px",
                                      border: "1px solid #fecaca",
                                      backgroundColor: "#ffffff",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Trash2 size={14} />
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
          {/* Action Bar */}
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
                  width: "240px",
                }}
              />
            </div>

            {canManage && (
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
                Tidak ada peran pelayanan ditemukan.
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
                          Aksi
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
                        role.code === "kantoria";

                      return (
                        <tr
                          key={role.id}
                          style={{
                            borderBottom: "1px solid #f1f5f9",
                            opacity: role.active ? 1 : 0.5,
                          }}
                        >
                          <td style={{ padding: "12px 16px" }}>
                            <strong
                              style={{
                                display: "block",
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
                                }}
                              >
                                Kritis
                              </span>
                            )}
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
                                  padding: "2px 8px",
                                  borderRadius: "4px",
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
                                  padding: "2px 8px",
                                  borderRadius: "4px",
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
                                    padding: "6px",
                                    borderRadius: "6px",
                                    border: "1px solid #cbd5e1",
                                    backgroundColor: "#ffffff",
                                    color: "#475569",
                                    cursor: "pointer",
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                                {role.active === 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRole(role)}
                                    title="Nonaktifkan Peran"
                                    style={{
                                      padding: "6px",
                                      borderRadius: "6px",
                                      border: "1px solid #fecaca",
                                      backgroundColor: "#ffffff",
                                      color: "#dc2626",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Trash2 size={14} />
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
              maxWidth: "500px",
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
                  Nama Pelayan <span style={{ color: "#e11d48" }}>*</span>
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
                  <option value="Penatua">Penatua (Semua Peran)</option>
                  <option value="Diaken">Diaken (Semua Peran)</option>
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
                      ? "✓ Penatua dan Diaken dapat ditugaskan untuk seluruh peran pelayanan."
                      : "Pilih jabatan untuk memberikan hak akses penugasan yang sesuai."}
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
                  />
                  <span>Tandai sebagai Pelayan Cadangan (Backup)</span>
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
                  {submitting ? "Menyimpan…" : "Simpan Data"}
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
              maxWidth: "500px",
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
                  Nama Peran <span style={{ color: "#e11d48" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Pelayan Mimbar 2"
                  value={roleForm.name}
                  onChange={(e) =>
                    setRoleForm({ ...roleForm, name: e.target.value })
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
                    Kode Teknis Sistem{" "}
                    <span style={{ color: "#e11d48" }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: mimbar_2 atau operator_sound"
                    value={roleForm.code}
                    onChange={(e) =>
                      setRoleForm({
                        ...roleForm,
                        code: e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_-]/g, ""),
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
                      boxSizing: "border-box",
                      fontFamily: "monospace",
                    }}
                  />
                  <p
                    style={{
                      fontSize: "0.75rem",
                      color: "#64748b",
                      marginTop: "4px",
                    }}
                  >
                    Gunakan huruf kecil, angka, garis bawah atau strip (tanpa
                    spasi).
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
                    Kebutuhan Slot
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
                    <option value="critical">Kritis</option>
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
                    Status Peran
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
    </div>
  );
}
