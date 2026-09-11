import React, { useEffect, useState } from "react";
import {
  fetchServiceAttendance,
  submitServiceAttendance,
  type AttendanceStatus,
} from "./performance-client";

type Props = {
  serviceId: string;
  serviceTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type RowState = {
  assignmentId: string;
  servantId: string;
  servantName: string;
  roleName: string;
  status: AttendanceStatus;
  checkinTime: string;
  notes: string;
};

export const AttendanceModal: React.FC<Props> = ({
  serviceId,
  serviceTitle,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setErrorMessage(null);
    fetchServiceAttendance(serviceId)
      .then((data) => {
        setRows(
          data.map((item) => ({
            assignmentId: item.assignmentId,
            servantId: item.servantId,
            servantName: item.servantName,
            roleName: item.roleName,
            status: item.attendanceStatus || "present",
            checkinTime: item.checkinTime ? item.checkinTime.slice(11, 16) : "",
            notes: item.notes || "",
          })),
        );
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Gagal memuat presensi.";
        setErrorMessage(msg);
      })
      .finally(() => setLoading(false));
  }, [isOpen, serviceId]);

  if (!isOpen) return null;

  const handleStatusChange = (index: number, newStatus: AttendanceStatus) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, status: newStatus } : r)),
    );
  };

  const handleNotesChange = (index: number, text: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, notes: text } : r)),
    );
  };

  const handleTimeChange = (index: number, timeStr: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, checkinTime: timeStr } : r)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);

    const nowIsoPrefix = new Date().toISOString().slice(0, 10);
    const payload = rows.map((r) => ({
      assignmentId: r.assignmentId,
      servantId: r.servantId,
      status: r.status,
      checkinTime: r.checkinTime
        ? `${nowIsoPrefix}T${r.checkinTime}:00.000Z`
        : null,
      notes: r.notes.trim() ? r.notes.trim() : null,
    }));

    try {
      await submitServiceAttendance(serviceId, payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Gagal menyimpan presensi.";
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          width: "100%",
          maxWidth: "600px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#1e293b" }}>
              Presensi Kehadiran Pelayanan
            </h3>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.875rem",
                color: "#64748b",
              }}
            >
              {serviceTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "1.5rem",
              color: "#94a3b8",
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
            {errorMessage && (
              <div
                style={{
                  backgroundColor: "#fef2f2",
                  color: "#991b1b",
                  padding: "10px 14px",
                  borderRadius: "6px",
                  fontSize: "0.875rem",
                  marginBottom: "16px",
                  border: "1px solid #fecaca",
                }}
              >
                {errorMessage}
              </div>
            )}

            {loading ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 0",
                  color: "#64748b",
                }}
              >
                Memuat daftar penugasan...
              </div>
            ) : rows.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "32px 0",
                  color: "#64748b",
                }}
              >
                Belum ada pelayan yang ditugaskan pada ibadah ini.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {rows.map((row, idx) => (
                  <div
                    key={row.assignmentId}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "12px",
                      backgroundColor: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>
                        {row.servantName}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          backgroundColor: "#e0e7ff",
                          color: "#3730a3",
                          padding: "2px 8px",
                          borderRadius: "4px",
                        }}
                      >
                        {row.roleName}
                      </span>
                    </div>

                    {/* Status radio buttons */}
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "8px",
                      }}
                    >
                      {(
                        [
                          { key: "present", label: "Hadir", color: "#16a34a" },
                          { key: "late", label: "Terlambat", color: "#ca8a04" },
                          { key: "absent", label: "Absen", color: "#dc2626" },
                          {
                            key: "replaced",
                            label: "Digantikan",
                            color: "#475569",
                          },
                        ] as const
                      ).map((opt) => (
                        <label
                          key={opt.key}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            fontSize: "0.8125rem",
                            cursor: "pointer",
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border:
                              row.status === opt.key
                                ? `2px solid ${opt.color}`
                                : "1px solid #cbd5e1",
                            backgroundColor:
                              row.status === opt.key ? "#ffffff" : "#f1f5f9",
                            fontWeight: row.status === opt.key ? 600 : 400,
                          }}
                        >
                          <input
                            type="radio"
                            name={`status-${row.assignmentId}`}
                            value={opt.key}
                            checked={row.status === opt.key}
                            onChange={() => handleStatusChange(idx, opt.key)}
                            style={{ margin: 0 }}
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>

                    {/* Checkin time and notes */}
                    <div
                      style={{ display: "flex", gap: "8px", marginTop: "6px" }}
                    >
                      <input
                        type="time"
                        value={row.checkinTime}
                        onChange={(e) => handleTimeChange(idx, e.target.value)}
                        placeholder="Waktu"
                        style={{
                          width: "100px",
                          padding: "6px 8px",
                          fontSize: "0.8125rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      />
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => handleNotesChange(idx, e.target.value)}
                        placeholder="Catatan kehadiran (opsional)..."
                        style={{
                          flex: 1,
                          padding: "6px 8px",
                          fontSize: "0.8125rem",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "14px 20px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              backgroundColor: "#f8fafc",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "8px 16px",
                border: "1px solid #cbd5e1",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                color: "#334155",
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || rows.length === 0}
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: saving || rows.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Menyimpan..." : "Simpan Presensi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
