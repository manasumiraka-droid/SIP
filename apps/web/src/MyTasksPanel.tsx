import React, { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export type MyAssignment = {
  id: string;
  serviceId: string;
  theme: string | null;
  startsAt: string;
  assemblyAt: string;
  endsAt: string;
  location: string;
  serviceStatus: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  slotNumber: number;
  status: string;
  version: number;
  servantId: string;
  servantName: string;
};

export function MyTasksPanel({
  timezone,
  onTaskUpdated,
}: {
  timezone: string;
  onTaskUpdated?: () => void;
}) {
  const [tasks, setTasks] = useState<MyAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal for declining task
  const [declineTarget, setDeclineTarget] = useState<MyAssignment | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [submittingDecline, setSubmittingDecline] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/assignments/my", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Gagal memuat daftar tugas pelayanan.");
      const payload = (await response.json()) as { data: MyAssignment[] };
      setTasks(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tugas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleConfirm = async (task: MyAssignment) => {
    setConfirmingId(task.id);
    try {
      const response = await fetch(`/api/v1/assignments/${task.id}/status`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": `"${task.version}"`,
        },
        body: JSON.stringify({
          status: "accepted",
          version: task.version,
        }),
      });
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(err?.error?.message ?? "Gagal mengonfirmasi tugas.");
      }
      await loadTasks();
      onTaskUpdated?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Konfirmasi gagal.");
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDeclineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declineTarget || !declineReason.trim()) return;

    setSubmittingDecline(true);
    try {
      const response = await fetch(
        `/api/v1/assignments/${declineTarget.id}/status`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
            "If-Match": `"${declineTarget.version}"`,
          },
          body: JSON.stringify({
            status: "unavailable",
            version: declineTarget.version,
            reason: declineReason.trim(),
          }),
        },
      );
      if (!response.ok) {
        const err = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(
          err?.error?.message ?? "Gagal melaporkan ketidakhadiran.",
        );
      }

      setDeclineTarget(null);
      setDeclineReason("");
      await loadTasks();
      onTaskUpdated?.();
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Pengajuan berhalangan gagal.",
      );
    } finally {
      setSubmittingDecline(false);
    }
  };

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
    <section className="section-preview" aria-label="Daftar tugas pelayanan">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <p className="eyebrow">TUGAS SAYA</p>
          <h1 style={{ margin: 0 }}>Jadwal Pelayanan Saya</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Konfirmasikan kehadiran Anda atau laporkan jika berhalangan agar
            koordinator dapat menyiapkan pengganti.
          </p>
        </div>
        <button
          type="button"
          onClick={loadTasks}
          className="soft-action"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Segarkan
        </button>
      </div>

      {loading ? (
        <div className="preview-note">Memuat jadwal tugas pelayanan Anda…</div>
      ) : error ? (
        <div className="preview-note" style={{ color: "#dc2626" }}>
          {error}
        </div>
      ) : tasks.length === 0 ? (
        <div
          className="preview-note"
          style={{
            textAlign: "center",
            padding: "2.5rem 1rem",
            backgroundColor: "#f8fafc",
            borderRadius: "12px",
            border: "1px dashed #cbd5e1",
          }}
        >
          <CheckCircle2
            size={36}
            style={{ color: "#16a34a", margin: "0 auto 8px" }}
          />
          <h3 style={{ margin: "0 0 4px", fontSize: "1.1rem" }}>
            Tidak ada tugas pelayanan aktif
          </h3>
          <p className="muted" style={{ margin: 0, fontSize: "0.875rem" }}>
            Anda belum memiliki penugasan ibadah mendatang. Hubungi koordinator
            jika Anda bersedia melayani.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {tasks.map((task) => {
            const startsDate = new Date(task.startsAt);
            const assemblyDate = new Date(task.assemblyAt);
            const isWaiting = task.status === "awaiting_confirmation";
            const isAccepted = task.status === "accepted";
            const isUnavailable = task.status === "unavailable";

            return (
              <article
                key={task.id}
                className="card"
                style={{
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  borderRadius: "14px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                  border: isWaiting
                    ? "1.5px solid #f59e0b"
                    : isAccepted
                      ? "1.5px solid #10b981"
                      : "1px solid #e2e8f0",
                  backgroundColor: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "#6366f1",
                        marginBottom: "4px",
                      }}
                    >
                      <User size={13} /> {task.roleName}
                    </div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "1.2rem",
                        fontWeight: 700,
                        color: "#1e1b4b",
                      }}
                    >
                      {task.theme ?? "Ibadah"}
                    </h3>
                  </div>

                  <div>
                    {isWaiting ? (
                      <span className="status waiting">
                        Menunggu Konfirmasi
                      </span>
                    ) : isAccepted ? (
                      <span
                        className="status scheduled"
                        style={{ color: "#065f46" }}
                      >
                        <CheckCircle2 size={13} /> Terkonfirmasi Hadir
                      </span>
                    ) : isUnavailable ? (
                      <span className="status critical-status">
                        <XCircle size={13} /> Berhalangan Hadir
                      </span>
                    ) : (
                      <span className="status draft">{task.status}</span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "10px",
                    fontSize: "0.875rem",
                    color: "#475569",
                    backgroundColor: "#f8fafc",
                    padding: "10px 14px",
                    borderRadius: "8px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <CalendarDays size={16} style={{ color: "#6366f1" }} />
                    <span>{dateFormatter.format(startsDate)}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Clock size={16} style={{ color: "#6366f1" }} />
                    <span>
                      Hadir: <b>{timeFormatter.format(assemblyDate)} WITA</b> ·
                      Mulai: {timeFormatter.format(startsDate)} WITA
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <MapPin size={16} style={{ color: "#6366f1" }} />
                    <span>{task.location}</span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    alignItems: "center",
                    gap: "10px",
                    marginTop: "4px",
                    flexWrap: "wrap",
                  }}
                >
                  {isWaiting && (
                    <>
                      <button
                        type="button"
                        className="soft-action"
                        style={{ color: "#dc2626", borderColor: "#fecaca" }}
                        onClick={() => setDeclineTarget(task)}
                        disabled={confirmingId === task.id}
                      >
                        Berhalangan Hadir
                      </button>
                      <button
                        type="button"
                        className="primary-action"
                        style={{
                          backgroundColor: "#16a34a",
                          color: "#ffffff",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                        onClick={() => handleConfirm(task)}
                        disabled={confirmingId === task.id}
                      >
                        <CheckCircle2 size={16} />
                        {confirmingId === task.id
                          ? "Menyimpan…"
                          : "Konfirmasi Hadir"}
                      </button>
                    </>
                  )}

                  {isAccepted && (
                    <button
                      type="button"
                      className="soft-action"
                      style={{ fontSize: "0.8rem", color: "#64748b" }}
                      onClick={() => setDeclineTarget(task)}
                    >
                      Ubah status (Berhalangan)
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Lapor Berhalangan */}
      {declineTarget && (
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
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <span
                style={{
                  backgroundColor: "#fee2e2",
                  color: "#dc2626",
                  padding: "8px",
                  borderRadius: "10px",
                }}
              >
                <AlertTriangle size={20} />
              </span>
              <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#1e1b4b" }}>
                Lapor Berhalangan Hadir
              </h3>
            </div>

            <p
              style={{
                fontSize: "0.875rem",
                color: "#475569",
                margin: "0 0 14px",
              }}
            >
              Anda akan membatalkan kesediaan melayani sebagai{" "}
              <b>{declineTarget.roleName}</b> pada{" "}
              <b>{declineTarget.theme ?? "Ibadah"}</b>. Koordinator akan segera
              mencari pelayan pengganti.
            </p>

            <form onSubmit={handleDeclineSubmit}>
              <label
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  marginBottom: "6px",
                  color: "#334155",
                }}
              >
                Alasan berhalangan (Wajib)
                <textarea
                  required
                  rows={3}
                  placeholder="Contoh: Sedang sakit / Tugas mendesak ke luar kota…"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    marginTop: "6px",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontFamily: "inherit",
                    fontSize: "0.875rem",
                  }}
                />
              </label>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "1.25rem",
                }}
              >
                <button
                  type="button"
                  className="soft-action"
                  onClick={() => {
                    setDeclineTarget(null);
                    setDeclineReason("");
                  }}
                  disabled={submittingDecline}
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  className="critical-action"
                  disabled={submittingDecline || !declineReason.trim()}
                >
                  {submittingDecline
                    ? "Menyimpan…"
                    : "Kirim Laporan Berhalangan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
