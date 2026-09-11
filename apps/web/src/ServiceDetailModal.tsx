import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  X,
} from "lucide-react";

export type ServiceAssignment = {
  id: string;
  serviceId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  slotNumber: number;
  status: string;
  version: number;
  servantId: string;
  servantName: string;
};

export type ServiceDetail = {
  id: string;
  startsAt: string;
  assemblyAt: string;
  endsAt: string;
  location: string;
  status: string;
  theme: string | null;
  version: number;
};

export function ServiceDetailModal({
  service,
  timezone,
  isOpen,
  canManageServices,
  onClose,
  onOpenAttendance,
  onServiceUpdated,
}: {
  service: ServiceDetail | null;
  timezone: string;
  isOpen: boolean;
  canManageServices: boolean;
  onClose: () => void;
  onOpenAttendance: (id: string, title: string) => void;
  onServiceUpdated: () => void;
}) {
  const [assignments, setAssignments] = useState<ServiceAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // New assignment state
  const [showAddForm, setShowAddForm] = useState(false);
  const [roles, setRoles] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [servants, setServants] = useState<
    Array<{
      id: string;
      displayName: string;
      title: string | null;
      phoneNumber: string | null;
    }>
  >([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedServantId, setSelectedServantId] = useState("");
  const [submittingAssignment, setSubmittingAssignment] = useState(false);

  const loadAssignments = async () => {
    if (!service) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/assignments?serviceId=${service.id}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Gagal memuat penugasan.");
      const payload = (await res.json()) as { data: ServiceAssignment[] };
      setAssignments(payload.data);
    } catch {
      // Ignored or handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && service) {
      loadAssignments();
      if (canManageServices) {
        fetch("/api/v1/service-roles", { credentials: "same-origin" })
          .then(
            (r) =>
              r.json() as Promise<{
                data: Array<{ id: string; code: string; name: string }>;
              }>,
          )
          .then((d) => setRoles(d.data ?? []))
          .catch(() => {});
        fetch("/api/v1/servants", { credentials: "same-origin" })
          .then(
            (r) =>
              r.json() as Promise<{
                data: Array<{
                  id: string;
                  displayName: string;
                  title: string | null;
                  phoneNumber: string | null;
                }>;
              }>,
          )
          .then((d) => setServants(d.data ?? []))
          .catch(() => {});
      }
    }
  }, [isOpen, service?.id]);

  if (!isOpen || !service) return null;

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/v1/services/${service.id}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": `"${service.version}"`,
        },
        body: JSON.stringify({
          status: "scheduled",
          version: service.version,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Gagal mempublikasikan ibadah.");
      }
      onServiceUpdated();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Publikasi gagal.");
    } finally {
      setPublishing(false);
    }
  };

  const handleAddAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRoleId || !selectedServantId) return;

    const selectedRole = roles.find((r) => r.id === selectedRoleId);
    const selectedServant = servants.find((s) => s.id === selectedServantId);

    const isOperatorOrKantoria = selectedRole
      ? selectedRole.code.startsWith("operator") ||
        selectedRole.code.includes("sound") ||
        selectedRole.code.includes("media") ||
        selectedRole.code === "kantoria"
      : false;

    if (selectedServant?.title === "Staff" && !isOperatorOrKantoria) {
      alert(
        `Pelayan ${selectedServant.displayName} berjabatan Staff dan hanya dapat ditugaskan untuk peran Operator Multimedia, Operator Sound System, atau Kantoria.`,
      );
      return;
    }

    setSubmittingAssignment(true);
    try {
      const res = await fetch("/api/v1/assignments", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          serviceId: service.id,
          serviceRoleId: selectedRoleId,
          servantId: selectedServantId,
          slotNumber: 1,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Gagal menambahkan penugasan.");
      }
      setSelectedRoleId("");
      setSelectedServantId("");
      setShowAddForm(false);
      await loadAssignments();
      onServiceUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menambahkan tugas.");
    } finally {
      setSubmittingAssignment(false);
    }
  };

  const startsDate = new Date(service.startsAt);
  const assemblyDate = new Date(service.assemblyAt);
  const endsDate = new Date(service.endsAt);

  const dateFormatter = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  });

  const timeFormatter = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          padding: "1.5rem",
          maxWidth: "640px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1rem",
          }}
        >
          <div>
            <span
              className={`status ${service.status === "scheduled" ? "scheduled" : service.status === "completed" ? "completed" : "draft"}`}
            >
              {service.status === "scheduled"
                ? "Terjadwal"
                : service.status === "completed"
                  ? "Selesai"
                  : "Draf"}
            </span>
            <h2
              style={{
                margin: "6px 0 0",
                fontSize: "1.4rem",
                color: "#1e1b4b",
              }}
            >
              {service.theme ?? "Ibadah"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="icon-button"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* Waktu & Lokasi */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            borderRadius: "10px",
            padding: "12px 16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
            fontSize: "0.875rem",
            color: "#334155",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CalendarDays size={16} style={{ color: "#6366f1" }} />
            <span>{dateFormatter.format(startsDate)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Clock size={16} style={{ color: "#6366f1" }} />
            <span>
              {timeFormatter.format(startsDate)} –{" "}
              {timeFormatter.format(endsDate)} WITA (Hadir:{" "}
              {timeFormatter.format(assemblyDate)})
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <MapPin size={16} style={{ color: "#6366f1" }} />
            <span>{service.location}</span>
          </div>
        </div>

        {/* Slot Pelayan & Penugasan */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "10px",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "1rem", color: "#1e1b4b" }}>
              Slot Pelayanan ({assignments.length} Peran)
            </h4>
            {canManageServices && !showAddForm && (
              <button
                type="button"
                className="soft-action"
                style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                onClick={() => setShowAddForm(true)}
              >
                <Plus size={14} /> Tambah Pelayan
              </button>
            )}
          </div>

          {showAddForm && (
            <form
              onSubmit={handleAddAssignment}
              style={{
                backgroundColor: "#f1f5f9",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "12px",
              }}
            >
              {(() => {
                const selectedRole = roles.find((r) => r.id === selectedRoleId);
                const isOperatorOrKantoria = selectedRole
                  ? selectedRole.code.startsWith("operator") ||
                    selectedRole.code.includes("sound") ||
                    selectedRole.code.includes("media") ||
                    selectedRole.code === "kantoria"
                  : false;

                return (
                  <>
                    <div
                      style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                    >
                      <select
                        required
                        value={selectedRoleId}
                        onChange={(e) => setSelectedRoleId(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: "160px",
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.85rem",
                          backgroundColor: "#ffffff",
                        }}
                      >
                        <option value="">Pilih Peran Pelayanan…</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>

                      <select
                        required
                        value={selectedServantId}
                        onChange={(e) => setSelectedServantId(e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: "180px",
                          padding: "8px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "0.85rem",
                          backgroundColor: "#ffffff",
                        }}
                      >
                        <option value="">Pilih Pelayan…</option>
                        {servants.map((s) => {
                          const isStaff = s.title === "Staff";
                          const isDisabled = Boolean(
                            selectedRoleId && isStaff && !isOperatorOrKantoria,
                          );
                          const titleBadge = s.title ? `[${s.title}] ` : "";
                          const note = isDisabled
                            ? " (Khusus Operator/Kantoria)"
                            : "";

                          return (
                            <option
                              key={s.id}
                              value={s.id}
                              disabled={isDisabled}
                            >
                              {titleBadge}
                              {s.displayName}
                              {note}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {selectedRole && (
                      <div
                        style={{
                          fontSize: "0.78rem",
                          marginTop: "6px",
                          color: isOperatorOrKantoria ? "#047857" : "#4338ca",
                        }}
                      >
                        {isOperatorOrKantoria
                          ? "✓ Peran ini terbuka untuk semua jabatan: Penatua, Diaken, dan Staff."
                          : "ℹ️ Peran liturgi/firman/pintu/persembahan khusus untuk Penatua dan Diaken."}
                      </div>
                    )}
                  </>
                );
              })()}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "10px",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                  onClick={() => setShowAddForm(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  style={{ fontSize: "0.8rem", padding: "4px 10px" }}
                  disabled={submittingAssignment}
                >
                  {submittingAssignment ? "Menyimpan…" : "Simpan Penugasan"}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="muted">Memuat penugasan…</p>
          ) : assignments.length === 0 ? (
            <p className="muted" style={{ fontStyle: "italic" }}>
              Belum ada pelayan yang ditugaskan pada ibadah ini.
            </p>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {assignments.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", fontSize: "0.875rem" }}>
                      {a.servantName}
                    </strong>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                      {a.roleName}
                    </span>
                  </div>
                  <div>
                    {a.status === "accepted" ? (
                      <span
                        className="status scheduled"
                        style={{ color: "#065f46" }}
                      >
                        <CheckCircle2 size={12} /> Terkonfirmasi
                      </span>
                    ) : a.status === "awaiting_confirmation" ? (
                      <span className="status waiting">Menunggu</span>
                    ) : a.status === "unavailable" ? (
                      <span className="status critical-status">
                        Berhalangan
                      </span>
                    ) : (
                      <span className="status draft">{a.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "10px",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "1rem",
          }}
        >
          <button
            type="button"
            className="soft-action"
            onClick={() => {
              onClose();
              onOpenAttendance(service.id, service.theme ?? "Ibadah");
            }}
          >
            Buka Presensi
          </button>

          <div style={{ display: "flex", gap: "10px" }}>
            {canManageServices && service.status === "draft" && (
              <button
                type="button"
                className="primary-action"
                style={{ backgroundColor: "#16a34a" }}
                onClick={handlePublish}
                disabled={publishing}
              >
                {publishing ? "Menerbitkan…" : "Terbitkan Jadwal"}
              </button>
            )}
            <button type="button" className="soft-action" onClick={onClose}>
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
