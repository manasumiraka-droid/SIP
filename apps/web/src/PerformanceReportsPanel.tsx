import React, { useEffect, useState } from "react";
import {
  createNote,
  downloadAttendanceCsv,
  fetchMyReport,
  fetchNotes,
  fetchOrganizationReport,
  type NoteCategory,
  type OrganizationReportData,
  type ServantReportData,
  type ServiceNoteSummary,
} from "./performance-client";

type Props = {
  organizationId: string;
};

export const PerformanceReportsPanel: React.FC<Props> = () => {
  const [activeTab, setActiveTab] = useState<"overview" | "personal" | "notes">(
    "overview",
  );
  const [report, setReport] = useState<OrganizationReportData | null>(null);
  const [servantReport, setServantReport] = useState<ServantReportData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Notes state
  const [notes, setNotes] = useState<ServiceNoteSummary[]>([]);
  const [noteCategoryFilter, setNoteCategoryFilter] = useState<
    NoteCategory | "all"
  >("all");
  const [showCreateNote, setShowCreateNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteCategory, setNewNoteCategory] =
    useState<NoteCategory>("operational");
  const [newNoteGrantedUsers, setNewNoteGrantedUsers] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);

  const loadReport = () => {
    setLoading(true);
    setErrorMessage(null);
    fetchOrganizationReport()
      .then((data) => {
        setReport(data);
      })
      .catch(async () => {
        // Fallback for servant role who only has access to personal report
        try {
          const myData = await fetchMyReport();
          setServantReport(myData);
          setActiveTab("personal");
        } catch (myErr: unknown) {
          setErrorMessage(
            myErr instanceof Error
              ? myErr.message
              : "Gagal memuat rekap laporan.",
          );
        }
      })
      .finally(() => setLoading(false));
  };

  const loadPersonalReport = () => {
    setLoading(true);
    setErrorMessage(null);
    fetchMyReport()
      .then((myData) => {
        setServantReport(myData);
      })
      .catch((myErr: unknown) => {
        setErrorMessage(
          myErr instanceof Error
            ? myErr.message
            : "Gagal memuat laporan pelayanan pribadi.",
        );
      })
      .finally(() => setLoading(false));
  };

  const loadNotes = () => {
    fetchNotes(
      noteCategoryFilter === "all"
        ? undefined
        : { category: noteCategoryFilter },
    )
      .then(setNotes)
      .catch((err: unknown) => {
        setErrorMessage(
          err instanceof Error ? err.message : "Gagal memuat catatan.",
        );
      });
  };

  useEffect(() => {
    if (activeTab === "overview") {
      loadReport();
    } else if (activeTab === "personal") {
      loadPersonalReport();
    } else if (activeTab === "notes") {
      loadNotes();
    }
  }, [activeTab, noteCategoryFilter]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await downloadAttendanceCsv();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal mengekspor CSV.");
    } finally {
      setExporting(false);
    }
  };

  const handleCreateNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;
    setNoteSaving(true);
    try {
      const grantedUserIds =
        newNoteCategory === "restricted" && newNoteGrantedUsers.trim()
          ? newNoteGrantedUsers
              .split(",")
              .map((u) => u.trim())
              .filter(Boolean)
          : undefined;

      await createNote({
        title: newNoteTitle.trim(),
        content: newNoteContent.trim(),
        category: newNoteCategory,
        grantedUserIds,
      });

      setShowCreateNote(false);
      setNewNoteTitle("");
      setNewNoteContent("");
      setNewNoteGrantedUsers("");
      loadNotes();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal membuat catatan.");
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <div style={{ padding: "16px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>
            Laporan Kinerja & Presensi Ibadah
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: "0.875rem",
              color: "#64748b",
            }}
          >
            Rekapitulasi kehadiran faktual, konfirmasi penugasan, dan catatan
            pastoral.
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            style={{
              padding: "8px 14px",
              backgroundColor: "#0284c7",
              color: "#ffffff",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: exporting ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {exporting ? "Mengekspor..." : "📥 Ekspor Laporan CSV"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #e2e8f0",
          marginBottom: "20px",
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontSize: "0.875rem",
            fontWeight: activeTab === "overview" ? 600 : 400,
            color: activeTab === "overview" ? "#2563eb" : "#64748b",
            borderBottom:
              activeTab === "overview" ? "2px solid #2563eb" : "none",
            cursor: "pointer",
          }}
        >
          Ringkasan Organisasi
        </button>
        <button
          onClick={() => setActiveTab("personal")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontSize: "0.875rem",
            fontWeight: activeTab === "personal" ? 600 : 400,
            color: activeTab === "personal" ? "#2563eb" : "#64748b",
            borderBottom:
              activeTab === "personal" ? "2px solid #2563eb" : "none",
            cursor: "pointer",
          }}
        >
          Laporan Pelayanan Saya
        </button>
        <button
          onClick={() => setActiveTab("notes")}
          style={{
            padding: "10px 18px",
            border: "none",
            background: "none",
            fontSize: "0.875rem",
            fontWeight: activeTab === "notes" ? 600 : 400,
            color: activeTab === "notes" ? "#2563eb" : "#64748b",
            borderBottom: activeTab === "notes" ? "2px solid #2563eb" : "none",
            cursor: "pointer",
          }}
        >
          Catatan Evaluasi & Pastoral (ACL)
        </button>
      </div>

      {errorMessage && (
        <div
          style={{
            backgroundColor: "#fef2f2",
            color: "#991b1b",
            padding: "12px 16px",
            borderRadius: "8px",
            fontSize: "0.875rem",
            marginBottom: "16px",
            border: "1px solid #fecaca",
          }}
        >
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
          Memuat data statistik...
        </div>
      ) : activeTab === "overview" && report ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Tingkat Kehadiran
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#16a34a",
                  marginTop: "4px",
                }}
              >
                {report.summary.attendanceRate}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                {report.summary.attendanceBreakdown.present} hadir,{" "}
                {report.summary.attendanceBreakdown.late} terlambat
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Tingkat Konfirmasi
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#2563eb",
                  marginTop: "4px",
                }}
              >
                {report.summary.confirmationRate}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                {report.summary.acceptedAssignments} dari{" "}
                {report.summary.totalAssignments} tugas
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Total Insiden Penggantian
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color:
                    report.summary.criticalIncidentCount > 0
                      ? "#dc2626"
                      : "#475569",
                  marginTop: "4px",
                }}
              >
                {report.summary.incidentCount}
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                {report.summary.criticalIncidentCount} berstatus kritis (&le; 1
                jam)
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Pemerataan Beban Pelayan
              </span>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginTop: "4px",
                }}
              >
                {report.workloadDistribution.avgAssignments}{" "}
                <span
                  style={{
                    fontSize: "0.875rem",
                    fontWeight: 400,
                    color: "#64748b",
                  }}
                >
                  rata-rata
                </span>
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Min: {report.workloadDistribution.minAssignments} | Max:{" "}
                {report.workloadDistribution.maxAssignments} tugas
              </span>
            </div>
          </div>

          {/* Charts Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
            }}
          >
            {/* Composition chart */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <h4
                style={{
                  margin: "0 0 16px",
                  fontSize: "1rem",
                  color: "#0f172a",
                }}
              >
                Komposisi Presensi Kehadiran
              </h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  {
                    label: "Hadir Tepat Waktu",
                    count: report.summary.attendanceBreakdown.present,
                    color: "#16a34a",
                  },
                  {
                    label: "Terlambat",
                    count: report.summary.attendanceBreakdown.late,
                    color: "#ca8a04",
                  },
                  {
                    label: "Absen / Berhalangan",
                    count: report.summary.attendanceBreakdown.absent,
                    color: "#dc2626",
                  },
                  {
                    label: "Digantikan",
                    count: report.summary.attendanceBreakdown.replaced,
                    color: "#64748b",
                  },
                ].map((item) => {
                  const total =
                    report.summary.attendanceBreakdown.present +
                    report.summary.attendanceBreakdown.late +
                    report.summary.attendanceBreakdown.absent +
                    report.summary.attendanceBreakdown.replaced;
                  const pct =
                    total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8125rem",
                          marginBottom: "4px",
                        }}
                      >
                        <span style={{ color: "#334155" }}>{item.label}</span>
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          backgroundColor: "#f1f5f9",
                          borderRadius: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            backgroundColor: item.color,
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roles breakdown chart */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <h4
                style={{
                  margin: "0 0 16px",
                  fontSize: "1rem",
                  color: "#0f172a",
                }}
              >
                Distribusi Penugasan per Peran
              </h4>
              {report.roleBreakdown.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
                  Belum ada data peran.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {report.roleBreakdown.map((r) => {
                    const maxAsg = Math.max(
                      ...report.roleBreakdown.map((x) => x.totalAssignments),
                      1,
                    );
                    const pct = Math.round((r.totalAssignments / maxAsg) * 100);
                    return (
                      <div key={r.roleCode}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.8125rem",
                            marginBottom: "4px",
                          }}
                        >
                          <span style={{ color: "#334155" }}>{r.roleName}</span>
                          <span style={{ fontWeight: 600, color: "#0f172a" }}>
                            {r.totalAssignments} tugas
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: "8px",
                            backgroundColor: "#f1f5f9",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              backgroundColor: "#3b82f6",
                              borderRadius: "4px",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "overview" && !report ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
          <p style={{ margin: 0, fontWeight: 500 }}>
            Belum ada data laporan organisasi atau akun Anda memiliki akses
            terbatas.
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "0.875rem",
              color: "#94a3b8",
            }}
          >
            Silakan beralih ke tab <strong>Laporan Pelayanan Saya</strong>.
          </p>
        </div>
      ) : activeTab === "personal" && servantReport ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              backgroundColor: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: "10px",
              padding: "16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#166534",
                  fontWeight: 600,
                }}
              >
                STATISTIK PELAYANAN PRIBADI
              </span>
              <h3
                style={{
                  margin: "4px 0 0",
                  color: "#14532d",
                  fontSize: "1.25rem",
                }}
              >
                {servantReport.displayName}
              </h3>
            </div>
            <span
              style={{
                backgroundColor: "#dcfce7",
                color: "#15803d",
                padding: "4px 10px",
                borderRadius: "20px",
                fontSize: "0.8125rem",
                fontWeight: 600,
              }}
            >
              Pelayan Aktif
            </span>
          </div>

          {/* Personal Summary Cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Total Penugasan
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#0f172a",
                  marginTop: "4px",
                }}
              >
                {servantReport.totalAssignments}
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Jadwal pelayanan terdaftar
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Konfirmasi Kehadiran
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#2563eb",
                  marginTop: "4px",
                }}
              >
                {servantReport.confirmationRate <= 1
                  ? (servantReport.confirmationRate * 100).toFixed(0)
                  : servantReport.confirmationRate.toFixed(0)}
                %
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                {servantReport.acceptedAssignments} dari{" "}
                {servantReport.totalAssignments} dikonfirmasi
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Tingkat Kehadiran Faktual
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#16a34a",
                  marginTop: "4px",
                }}
              >
                {servantReport.attendanceRate <= 1
                  ? (servantReport.attendanceRate * 100).toFixed(0)
                  : servantReport.attendanceRate.toFixed(0)}
                %
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Berdasarkan presensi ibadah
              </span>
            </div>

            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "#64748b",
                  fontWeight: 500,
                }}
              >
                Tugas Pengganti
              </span>
              <div
                style={{
                  fontSize: "1.75rem",
                  fontWeight: 700,
                  color: "#0891b2",
                  marginTop: "4px",
                }}
              >
                {servantReport.backupDutiesAccepted}
              </div>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                Menolong saat rekan berhalangan
              </span>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
            }}
          >
            {/* Presensi Breakdown */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <h4
                style={{
                  margin: "0 0 16px",
                  fontSize: "1rem",
                  color: "#0f172a",
                }}
              >
                Rincian Kehadiran Faktual
              </h4>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  {
                    label: "Hadir Tepat Waktu",
                    count: servantReport.attendanceBreakdown.present,
                    color: "#16a34a",
                  },
                  {
                    label: "Terlambat",
                    count: servantReport.attendanceBreakdown.late,
                    color: "#ca8a04",
                  },
                  {
                    label: "Izin / Berhalangan",
                    count: servantReport.attendanceBreakdown.absent,
                    color: "#dc2626",
                  },
                  {
                    label: "Digantikan",
                    count: servantReport.attendanceBreakdown.replaced,
                    color: "#64748b",
                  },
                ].map((item) => {
                  const total =
                    servantReport.attendanceBreakdown.present +
                    servantReport.attendanceBreakdown.late +
                    servantReport.attendanceBreakdown.absent +
                    servantReport.attendanceBreakdown.replaced;
                  const pct =
                    total > 0 ? Math.round((item.count / total) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "0.8125rem",
                          marginBottom: "4px",
                        }}
                      >
                        <span style={{ color: "#334155" }}>{item.label}</span>
                        <span style={{ fontWeight: 600, color: "#0f172a" }}>
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          backgroundColor: "#f1f5f9",
                          borderRadius: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            backgroundColor: item.color,
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Roles Breakdown */}
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                padding: "20px",
              }}
            >
              <h4
                style={{
                  margin: "0 0 16px",
                  fontSize: "1rem",
                  color: "#0f172a",
                }}
              >
                Peran yang Dilayani
              </h4>
              {servantReport.rolesServed.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
                  Belum ada catatan riwayat peran.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  {servantReport.rolesServed.map((r) => {
                    const maxAsg = Math.max(
                      ...servantReport.rolesServed.map((x) => x.count),
                      1,
                    );
                    const pct = Math.round((r.count / maxAsg) * 100);
                    return (
                      <div key={r.roleCode}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.8125rem",
                            marginBottom: "4px",
                          }}
                        >
                          <span style={{ color: "#334155" }}>{r.roleName}</span>
                          <span style={{ fontWeight: 600, color: "#0f172a" }}>
                            {r.count} kali
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: "8px",
                            backgroundColor: "#f1f5f9",
                            borderRadius: "4px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              backgroundColor: "#3b82f6",
                              borderRadius: "4px",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "personal" && !servantReport ? (
        <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
          Tidak ada data laporan pelayanan pribadi untuk akun ini.
        </div>
      ) : (
        /* Notes Tab */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              {(
                ["all", "operational", "subject_visible", "restricted"] as const
              ).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setNoteCategoryFilter(cat)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border:
                      noteCategoryFilter === cat
                        ? "2px solid #2563eb"
                        : "1px solid #cbd5e1",
                    backgroundColor:
                      noteCategoryFilter === cat ? "#eff6ff" : "#ffffff",
                    color: noteCategoryFilter === cat ? "#1d4ed8" : "#475569",
                    fontSize: "0.8125rem",
                    fontWeight: noteCategoryFilter === cat ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {cat === "all"
                    ? "Semua"
                    : cat === "operational"
                      ? "Operasional"
                      : cat === "subject_visible"
                        ? "Terbuka"
                        : "Terbatas (ACL)"}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCreateNote(!showCreateNote)}
              style={{
                padding: "6px 14px",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {showCreateNote ? "Tutup Form" : "+ Buat Catatan Baru"}
            </button>
          </div>

          {/* Form Create Note */}
          {showCreateNote && (
            <form
              onSubmit={handleCreateNoteSubmit}
              style={{
                backgroundColor: "#f8fafc",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <h4
                style={{ margin: 0, fontSize: "0.9375rem", color: "#0f172a" }}
              >
                Tambah Catatan Pelayanan Baru
              </h4>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Judul Catatan
                </label>
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Misal: Evaluasi Ibadah Raya 15 Sep"
                  required
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Tingkat Privasi / Kategori
                </label>
                <select
                  value={newNoteCategory}
                  onChange={(e) =>
                    setNewNoteCategory(e.target.value as NoteCategory)
                  }
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                  }}
                >
                  <option value="operational">
                    Operasional (Koordinator & Admin)
                  </option>
                  <option value="subject_visible">
                    Terbuka untuk Pelayan yang Bersangkutan
                  </option>
                  <option value="restricted">
                    Terbatas / Pastoral (Wajib ACL Eksplisit)
                  </option>
                </select>
              </div>

              {newNoteCategory === "restricted" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.8125rem",
                      color: "#475569",
                      marginBottom: "4px",
                    }}
                  >
                    Daftar User ID yang Diberi Akses ACL (Pisahkan dengan koma)
                  </label>
                  <input
                    type="text"
                    value={newNoteGrantedUsers}
                    onChange={(e) => setNewNoteGrantedUsers(e.target.value)}
                    placeholder="u-pastor, u-pendamping"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.875rem",
                    }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    *Sesuai RBAC-06: Admin/Koordinator lain tidak otomatis dapat
                    membaca catatan terbatas ini tanpa dicantumkan di sini.
                  </span>
                </div>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.8125rem",
                    color: "#475569",
                    marginBottom: "4px",
                  }}
                >
                  Isi Catatan
                </label>
                <textarea
                  value={newNoteContent}
                  onChange={(e) => setNewNoteContent(e.target.value)}
                  rows={4}
                  placeholder="Tuliskan catatan evaluasi atau pastoral..."
                  required
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.875rem",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowCreateNote(false)}
                  disabled={noteSaving}
                  style={{
                    padding: "8px 14px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#ffffff",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={noteSaving}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#16a34a",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    cursor: noteSaving ? "not-allowed" : "pointer",
                  }}
                >
                  {noteSaving ? "Menyimpan..." : "Simpan Catatan"}
                </button>
              </div>
            </form>
          )}

          {/* Notes List */}
          {notes.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "32px", color: "#64748b" }}
            >
              Tidak ada catatan pelayanan dalam kategori ini.
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    padding: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "8px",
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          margin: 0,
                          fontSize: "0.9375rem",
                          color: "#0f172a",
                        }}
                      >
                        {note.title}
                      </h4>
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                        {new Date(note.createdAt).toLocaleString("id-ID", {
                          timeZone: "Asia/Makassar",
                        })}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: 600,
                        backgroundColor:
                          note.category === "restricted"
                            ? "#fef2f2"
                            : note.category === "subject_visible"
                              ? "#eff6ff"
                              : "#f1f5f9",
                        color:
                          note.category === "restricted"
                            ? "#b91c1c"
                            : note.category === "subject_visible"
                              ? "#1d4ed8"
                              : "#475569",
                      }}
                    >
                      {note.category === "restricted"
                        ? "Terbatas (ACL)"
                        : note.category === "subject_visible"
                          ? "Terbuka bagi Pelayan"
                          : "Operasional"}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.875rem",
                      color: "#334155",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {note.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
