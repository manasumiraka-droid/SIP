import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  History,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { roles, type Role } from "../../../packages/domain/src/access";
import {
  usersResponseSchema,
  type ManagedUser,
} from "../../../packages/validation/src/users";
import { roleLabels } from "./role-labels";
import { CreateUserForm } from "./CreateUserForm";
import { AccountStatusForm } from "./AccountStatusForm";
import { AuditPanel } from "./AuditPanel";
import { TelegramActivationPanel } from "./TelegramActivationPanel";
import { ImportScheduleWizard } from "./ImportScheduleWizard";

const ROLE_COLORS: Record<Role, { bg: string; text: string; border: string }> =
  {
    super_admin: { bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
    admin: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
    worship_coordinator: { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" },
    field_coordinator: { bg: "#f0fdfa", text: "#0f766e", border: "#99f6e4" },
    servant: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
  };

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: "Akses penuh organisasi, kelola akun, dan penetapan role.",
  admin: "Operasional jadwal, data pelayan, presensi, dan pelaporan gereja.",
  worship_coordinator:
    "Perencanaan draf liturgi, penugasan, dan eskalasi jadwal ibadah.",
  field_coordinator:
    "Penugasan tim spesifik bidang (Musik, Multimedia, Kolektan).",
  servant: "Akses konfirmasi tugas pribadi, pelaporan kendala, dan presensi.",
};

export function SettingsPanel({
  timezone = "Asia/Makassar",
  onAccessChanged,
}: {
  timezone?: string;
  onAccessChanged: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "users" | "org" | "telegram" | "audit" | "import"
  >("users");

  // Users State
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive" | "suspended"
  >("all");
  const [message, setMessage] = useState("");

  // Modals
  const [selectedUserForRole, setSelectedUserForRole] =
    useState<ManagedUser | null>(null);
  const [chosenRoles, setChosenRoles] = useState<Role[]>([]);
  const [confirmingRole, setConfirmingRole] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const [roleConflict, setRoleConflict] = useState(false);

  const [creatingUser, setCreatingUser] = useState(false);
  const [statusUser, setStatusUser] = useState<ManagedUser | null>(null);

  const pending = useRef(false);
  const submission = useRef<{ signature: string; key: string } | null>(null);

  async function loadUsers(next?: string) {
    setLoadingUsers(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/users${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          onAccessChanged();
        }
        throw new Error("Gagal membaca daftar pengguna");
      }
      const result = usersResponseSchema.parse(await response.json());
      setUsers((current) =>
        next ? [...current, ...result.data] : result.data,
      );
      setCursor(result.next_cursor);
    } catch {
      setMessage("Daftar pengguna belum dapat dimuat. Silakan coba lagi.");
    } finally {
      setLoadingUsers(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function handleEditRoles(user: ManagedUser) {
    setSelectedUserForRole(user);
    setChosenRoles(user.roles);
    setConfirmingRole(false);
    setRoleConflict(false);
    setMessage("");
    submission.current = null;
  }

  async function handleSaveRoles() {
    if (!selectedUserForRole || pending.current || roleConflict) return;
    pending.current = true;
    setSavingRole(true);
    setMessage("");

    const body = JSON.stringify({
      roles: [...chosenRoles].sort(),
      version: selectedUserForRole.version,
    });
    const signature = `${selectedUserForRole.id}:${body}`;
    if (submission.current?.signature !== signature) {
      submission.current = { signature, key: crypto.randomUUID() };
    }

    try {
      const response = await fetch(
        `/api/v1/users/${encodeURIComponent(selectedUserForRole.id)}/roles`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": submission.current.key,
            "If-Match": `"${selectedUserForRole.version}"`,
          },
          body,
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          setRoleConflict(true);
          setMessage(
            "Perubahan ditolak. Pastikan organisasi tetap memiliki minimal 1 Super Admin aktif, atau data telah diperbarui.",
          );
        } else if (response.status === 401 || response.status === 403) {
          setMessage("Akses Anda telah berubah.");
          onAccessChanged();
        } else {
          setMessage("Gagal memperbarui peran pengguna.");
        }
        return;
      }

      setSelectedUserForRole(null);
      setConfirmingRole(false);
      submission.current = null;
      await loadUsers();
      setMessage("Peran pengguna berhasil diperbarui.");
      onAccessChanged();
    } catch {
      setMessage("Terjadi kesalahan jaringan saat menyimpan peran.");
    } finally {
      pending.current = false;
      setSavingRole(false);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.id.toLowerCase().includes(userSearch.toLowerCase());

      const matchesRole =
        roleFilter === "all" ? true : u.roles.includes(roleFilter);

      const matchesStatus =
        statusFilter === "all" ? true : u.status === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, userSearch, roleFilter, statusFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#6d28d9",
            fontWeight: 700,
            fontSize: "0.8125rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "4px",
          }}
        >
          <Shield size={16} /> PUSAT PENGATURAN SISTEM (SUPER ADMIN)
        </div>
        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 800,
            color: "#0f172a",
            margin: "0 0 6px 0",
          }}
        >
          Pengaturan & Hak Akses
        </h1>
        <p
          style={{
            fontSize: "0.9375rem",
            color: "#64748b",
            margin: 0,
            maxWidth: "760px",
          }}
        >
          Kelola seluruh role pengguna (Super Admin, Admin, Koordinator,
          Pelayan), status akun, profil organisasi, integrasi bot Telegram,
          audit log keamanan, dan impor data awal.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid #e2e8f0",
          gap: "8px",
          overflowX: "auto",
        }}
      >
        <button
          onClick={() => setActiveTab("users")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "none",
            background: "none",
            borderBottom:
              activeTab === "users"
                ? "2px solid #6d28d9"
                : "2px solid transparent",
            marginBottom: "-2px",
            fontWeight: activeTab === "users" ? 700 : 500,
            color: activeTab === "users" ? "#6d28d9" : "#64748b",
            cursor: "pointer",
            fontSize: "0.9375rem",
          }}
        >
          <UserCog size={18} />
          Pengguna & Role ({users.length})
        </button>

        <button
          onClick={() => setActiveTab("org")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "none",
            background: "none",
            borderBottom:
              activeTab === "org"
                ? "2px solid #6d28d9"
                : "2px solid transparent",
            marginBottom: "-2px",
            fontWeight: activeTab === "org" ? 700 : 500,
            color: activeTab === "org" ? "#6d28d9" : "#64748b",
            cursor: "pointer",
            fontSize: "0.9375rem",
          }}
        >
          <Building2 size={18} />
          Organisasi & Kebijakan
        </button>

        <button
          onClick={() => setActiveTab("telegram")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "none",
            background: "none",
            borderBottom:
              activeTab === "telegram"
                ? "2px solid #6d28d9"
                : "2px solid transparent",
            marginBottom: "-2px",
            fontWeight: activeTab === "telegram" ? 700 : 500,
            color: activeTab === "telegram" ? "#6d28d9" : "#64748b",
            cursor: "pointer",
            fontSize: "0.9375rem",
          }}
        >
          <Send size={18} />
          Integrasi Telegram
        </button>

        <button
          onClick={() => setActiveTab("audit")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "none",
            background: "none",
            borderBottom:
              activeTab === "audit"
                ? "2px solid #6d28d9"
                : "2px solid transparent",
            marginBottom: "-2px",
            fontWeight: activeTab === "audit" ? 700 : 500,
            color: activeTab === "audit" ? "#6d28d9" : "#64748b",
            cursor: "pointer",
            fontSize: "0.9375rem",
          }}
        >
          <History size={18} />
          Audit Log & Keamanan
        </button>

        <button
          onClick={() => setActiveTab("import")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 16px",
            border: "none",
            background: "none",
            borderBottom:
              activeTab === "import"
                ? "2px solid #6d28d9"
                : "2px solid transparent",
            marginBottom: "-2px",
            fontWeight: activeTab === "import" ? 700 : 500,
            color: activeTab === "import" ? "#6d28d9" : "#64748b",
            cursor: "pointer",
            fontSize: "0.9375rem",
          }}
        >
          <FileSpreadsheet size={18} />
          Impor Jadwal Excel
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#f5f3ff",
            border: "1px solid #ddd6fe",
            borderRadius: "8px",
            color: "#5b21b6",
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <CheckCircle2 size={16} />
          {message}
        </div>
      )}

      {/* TAB 1: USERS & ROLE MANAGEMENT */}
      {activeTab === "users" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Action & Filter Bar */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "12px",
                flex: "1 1 300px",
              }}
            >
              {/* Search */}
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  flex: "1 1 240px",
                  maxWidth: "360px",
                }}
              >
                <Search
                  size={16}
                  style={{
                    position: "absolute",
                    left: "12px",
                    color: "#94a3b8",
                  }}
                />
                <input
                  type="text"
                  placeholder="Cari nama atau email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px 8px 36px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                    backgroundColor: "#ffffff",
                  }}
                />
              </div>

              {/* Filter Status */}
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as
                      "all" | "active" | "inactive" | "suspended",
                  )
                }
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.875rem",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="suspended">Ditangguhkan</option>
                <option value="inactive">Nonaktif</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => void loadUsers()}
                disabled={loadingUsers}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <RefreshCw
                  size={15}
                  className={loadingUsers ? "animate-spin" : ""}
                />
                Muat Ulang
              </button>
              <button
                onClick={() => {
                  setCreatingUser(true);
                  setMessage("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#6d28d9",
                  color: "#ffffff",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={16} />
                Tambah Pengguna
              </button>
            </div>
          </div>

          {/* Role Filter Chips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#64748b",
                marginRight: "4px",
              }}
            >
              Filter Role:
            </span>
            <button
              onClick={() => setRoleFilter("all")}
              style={{
                padding: "4px 10px",
                borderRadius: "20px",
                fontSize: "0.75rem",
                fontWeight: 600,
                border: "1px solid",
                borderColor: roleFilter === "all" ? "#6d28d9" : "#e2e8f0",
                backgroundColor: roleFilter === "all" ? "#6d28d9" : "#f8fafc",
                color: roleFilter === "all" ? "#ffffff" : "#64748b",
                cursor: "pointer",
              }}
            >
              Semua ({users.length})
            </button>
            {roles.map((r) => {
              const count = users.filter((u) => u.roles.includes(r)).length;
              const isSelected = roleFilter === r;
              return (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "20px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    border: "1px solid",
                    borderColor: isSelected ? "#6d28d9" : "#e2e8f0",
                    backgroundColor: isSelected ? "#6d28d9" : "#f8fafc",
                    color: isSelected ? "#ffffff" : "#64748b",
                    cursor: "pointer",
                  }}
                >
                  {roleLabels[r]} ({count})
                </button>
              );
            })}
          </div>

          {/* User List Table */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(200px, 1.5fr) minmax(220px, 2fr) 100px 180px",
                padding: "12px 16px",
                backgroundColor: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              <div>Nama & Email</div>
              <div>Peran Sistem (Roles)</div>
              <div>Status</div>
              <div style={{ textAlign: "right" }}>Aksi Pengaturan</div>
            </div>

            {loadingUsers && users.length === 0 ? (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "0.875rem",
                }}
              >
                Memuat daftar pengguna...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div
                style={{
                  padding: "32px",
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: "0.875rem",
                }}
              >
                Tidak ada pengguna yang cocok dengan kriteria pencarian/filter.
              </div>
            ) : (
              filteredUsers.map((user) => {
                const initials =
                  user.displayName
                    .split(" ")
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase() || "US";

                return (
                  <div
                    key={user.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(200px, 1.5fr) minmax(220px, 2fr) 100px 180px",
                      padding: "14px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      alignItems: "center",
                      transition: "background-color 0.15s",
                    }}
                  >
                    {/* User Info */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          backgroundColor: user.roles.includes("super_admin")
                            ? "#6d28d9"
                            : user.roles.includes("admin")
                              ? "#2563eb"
                              : "#64748b",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "0.8125rem",
                          flexShrink: 0,
                        }}
                      >
                        {initials}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color: "#0f172a",
                            fontSize: "0.9375rem",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {user.displayName}
                        </div>
                        <div
                          style={{
                            fontSize: "0.8125rem",
                            color: "#64748b",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ID: {user.id}
                        </div>
                      </div>
                    </div>

                    {/* Roles Badges */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "4px",
                        alignItems: "center",
                      }}
                    >
                      {user.roles.length === 0 ? (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "#94a3b8",
                            fontStyle: "italic",
                          }}
                        >
                          Tanpa Peran (Akses Ditolak)
                        </span>
                      ) : (
                        user.roles.map((r) => {
                          const config = ROLE_COLORS[r] || {
                            bg: "#f1f5f9",
                            text: "#475569",
                            border: "#cbd5e1",
                          };
                          return (
                            <span
                              key={r}
                              style={{
                                fontSize: "0.75rem",
                                fontWeight: 600,
                                backgroundColor: config.bg,
                                color: config.text,
                                border: `1px solid ${config.border}`,
                                padding: "2px 8px",
                                borderRadius: "6px",
                              }}
                            >
                              {roleLabels[r]}
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Status Badge */}
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "12px",
                          backgroundColor:
                            user.status === "active"
                              ? "#ecfdf5"
                              : user.status === "suspended"
                                ? "#fef2f2"
                                : "#f1f5f9",
                          color:
                            user.status === "active"
                              ? "#047857"
                              : user.status === "suspended"
                                ? "#b91c1c"
                                : "#64748b",
                          border: `1px solid ${
                            user.status === "active"
                              ? "#a7f3d0"
                              : user.status === "suspended"
                                ? "#fecaca"
                                : "#cbd5e1"
                          }`,
                        }}
                      >
                        {user.status === "active"
                          ? "Aktif"
                          : user.status === "suspended"
                            ? "Ditangguhkan"
                            : "Nonaktif"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "6px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleEditRoles(user)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          backgroundColor: "#f8fafc",
                          color: "#334155",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Atur Peran
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStatusUser(user);
                          setMessage("");
                        }}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid #e2e8f0",
                          backgroundColor: "#ffffff",
                          color: "#64748b",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Status
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {cursor && (
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <button
                onClick={() => void loadUsers(cursor)}
                disabled={loadingUsers}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Muat Pengguna Berikutnya
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ORGANISASI & KEBIJAKAN */}
      {activeTab === "org" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "24px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0f172a",
                margin: "0 0 16px 0",
              }}
            >
              Konfigurasi Organisasi Gereja
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Zona Waktu Operasional
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <Clock size={16} color="#6d28d9" />
                  {timezone} (WITA · UTC+08:00)
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "#64748b",
                    marginTop: "6px",
                  }}
                >
                  Waktu ibadah, pengingat jadwal, dan jam tenang Telegram
                  dievaluasi berdasarkan zona waktu ini.
                </div>
              </div>

              <div
                style={{
                  padding: "16px",
                  backgroundColor: "#f8fafc",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                    marginBottom: "4px",
                  }}
                >
                  Arsitektur Otorisasi
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  <ShieldCheck size={16} color="#047857" />
                  RBAC Server-Side (PRD v1.2)
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "#64748b",
                    marginTop: "6px",
                  }}
                >
                  Model relasi User–Role Many-to-Many terisolasi per organisasi
                  dengan verifikasi token server-side.
                </div>
              </div>
            </div>
          </div>

          {/* Retention Policies Card */}
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "24px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#0f172a",
                margin: "0 0 16px 0",
              }}
            >
              Kebijakan Retensi Data & Privasi Gerejawi (PRD v1.2 Poin 11)
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#fafafa",
                }}
              >
                <strong>File Mentah Excel</strong>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.8125rem",
                    color: "#64748b",
                  }}
                >
                  Maksimal 24 jam pasca-commit / 7 hari saat review.
                </p>
              </div>
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#fafafa",
                }}
              >
                <strong>Data Staging Impor</strong>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.8125rem",
                    color: "#64748b",
                  }}
                >
                  Dibersihkan otomatis 30 hari pasca-commit.
                </p>
              </div>
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#fafafa",
                }}
              >
                <strong>Audit Log & Ringkasan</strong>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.8125rem",
                    color: "#64748b",
                  }}
                >
                  Disimpan 5 tahun sebagai jejak audit operasional.
                </p>
              </div>
              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  backgroundColor: "#fafafa",
                }}
              >
                <strong>Catatan Pembinaan (ACL)</strong>
                <p
                  style={{
                    margin: "4px 0 0 0",
                    fontSize: "0.8125rem",
                    color: "#64748b",
                  }}
                >
                  Tinjauan tahunan; maksimal 3 tahun pasca nonaktif.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TELEGRAM INTEGRATION */}
      {activeTab === "telegram" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <TelegramActivationPanel />
        </div>
      )}

      {/* TAB 4: AUDIT LOG & KEAMANAN */}
      {activeTab === "audit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <AuditPanel onAccessChanged={onAccessChanged} timezone={timezone} />
        </div>
      )}

      {/* TAB 5: IMPOR JADWAL EXCEL */}
      {activeTab === "import" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <ImportScheduleWizard />
        </div>
      )}

      {/* MODAL: ATUR PERAN PENGGUNA */}
      {selectedUserForRole && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingRole) {
              setSelectedUserForRole(null);
            }
          }}
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              maxWidth: "520px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    color: "#6d28d9",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Pengaturan Role Sistem
                </div>
                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: "2px 0 0 0",
                  }}
                >
                  {selectedUserForRole.displayName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUserForRole(null)}
                disabled={savingRole}
                style={{
                  border: "none",
                  background: "none",
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: "0.875rem", color: "#64748b" }}>
              Pilih satu atau beberapa role yang diberikan kepada pengguna ini
              sesuai tanggung jawab operasional gereja.
            </p>

            <fieldset
              disabled={savingRole || confirmingRole}
              style={{
                border: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {roles.map((role) => {
                const isChecked = chosenRoles.includes(role);
                const colorConfig = ROLE_COLORS[role];
                return (
                  <label
                    key={role}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "10px",
                      border: `1.5px solid ${isChecked ? colorConfig.border : "#e2e8f0"}`,
                      backgroundColor: isChecked ? colorConfig.bg : "#ffffff",
                      cursor: savingRole ? "default" : "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        setChosenRoles((curr) =>
                          e.target.checked
                            ? [...curr, role]
                            : curr.filter((r) => r !== role),
                        );
                      }}
                      style={{ marginTop: "3px" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: "0.875rem",
                          color: isChecked ? colorConfig.text : "#0f172a",
                        }}
                      >
                        {roleLabels[role]}
                      </div>
                      <div
                        style={{
                          fontSize: "0.75rem",
                          color: "#64748b",
                          marginTop: "2px",
                        }}
                      >
                        {ROLE_DESCRIPTIONS[role]}
                      </div>
                    </div>
                  </label>
                );
              })}
            </fieldset>

            {confirmingRole ? (
              <div
                style={{
                  padding: "14px",
                  backgroundColor: "#fef3c7",
                  border: "1px solid #fde68a",
                  borderRadius: "10px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontWeight: 700,
                    color: "#92400e",
                    fontSize: "0.875rem",
                  }}
                >
                  <AlertTriangle size={16} /> Konfirmasi Perubahan Akses
                </div>
                <div style={{ fontSize: "0.8125rem", color: "#78350f" }}>
                  Role Baru:{" "}
                  <strong>
                    {chosenRoles.map((r) => roleLabels[r]).join(", ") ||
                      "Tanpa Peran (Akses Ditolak)"}
                  </strong>
                </div>
                <div style={{ fontSize: "0.75rem", color: "#78350f" }}>
                  Perubahan akan segera berlaku pada request berikutnya dan
                  dicatat dalam audit log.
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <button
                    type="button"
                    disabled={savingRole}
                    onClick={() => void handleSaveRoles()}
                    style={{
                      flex: 1,
                      padding: "8px",
                      borderRadius: "6px",
                      backgroundColor: "#b45309",
                      color: "#ffffff",
                      border: "none",
                      fontWeight: 700,
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    {savingRole ? "Menyimpan..." : "Ya, Simpan Perubahan"}
                  </button>
                  <button
                    type="button"
                    disabled={savingRole}
                    onClick={() => setConfirmingRole(false)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      backgroundColor: "#ffffff",
                      color: "#78350f",
                      border: "1px solid #fde68a",
                      fontWeight: 600,
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedUserForRole(null)}
                  disabled={savingRole}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    color: "#64748b",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRole(true)}
                  disabled={savingRole}
                  style={{
                    padding: "8px 18px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: "#6d28d9",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Tinjau & Simpan Peran
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH PENGGUNA */}
      {creatingUser && (
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
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              maxWidth: "520px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <CreateUserForm
              onCancel={() => setCreatingUser(false)}
              onCreated={async () => {
                setCreatingUser(false);
                await loadUsers();
                setMessage("Akun pengguna berhasil didaftarkan.");
              }}
              onAccessChanged={onAccessChanged}
            />
          </div>
        </div>
      )}

      {/* MODAL: UBAH STATUS AKUN */}
      {statusUser && (
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
        >
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              maxWidth: "480px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <AccountStatusForm
              user={statusUser}
              onCancel={() => setStatusUser(null)}
              onAccessChanged={onAccessChanged}
              onSaved={async () => {
                setStatusUser(null);
                await loadUsers();
                setMessage("Status akun pengguna berhasil diperbarui.");
                onAccessChanged();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
