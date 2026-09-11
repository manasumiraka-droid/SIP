import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  createIncident,
  escalateIncident,
  fetchIncidentDetail,
  fetchIncidents,
  resolveIncident,
  type CandidateRecommendation,
  type IncidentItem,
} from "./incident-client";

export function IncidentPanel({
  timezone,
  canManageReplacements,
  onIncidentUpdated,
}: {
  timezone: string;
  canManageReplacements: boolean;
  onIncidentUpdated?: () => void;
}) {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(
    null,
  );
  const [candidates, setCandidates] = useState<CandidateRecommendation[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Resolution modal state
  const [candidateToResolve, setCandidateToResolve] =
    useState<CandidateRecommendation | null>(null);
  const [submittingResolve, setSubmittingResolve] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Offline emergency checklist modal
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // Manual incident report modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [serviceIdInput, setServiceIdInput] = useState("");
  const [assignmentIdInput, setAssignmentIdInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadIncidents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchIncidents();
      setIncidents(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat insiden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const openDetail = async (incident: IncidentItem) => {
    setSelectedIncident(incident);
    setCandidates([]);
    if (incident.status === "open" || incident.status === "escalated_manual") {
      setLoadingCandidates(true);
      try {
        const detail = await fetchIncidentDetail(incident.id);
        setCandidates(detail.candidates);
      } catch {
        // Handled silently or empty candidates
      } finally {
        setLoadingCandidates(false);
      }
    }
  };

  const handleResolve = async () => {
    if (!selectedIncident || !candidateToResolve) return;
    setSubmittingResolve(true);
    setResolveError(null);
    try {
      await resolveIncident(selectedIncident.id, candidateToResolve.servantId);
      setCandidateToResolve(null);
      setSelectedIncident(null);
      await loadIncidents();
      onIncidentUpdated?.();
    } catch (err: unknown) {
      setResolveError(
        err instanceof Error ? err.message : "Gagal mengesahkan pengganti.",
      );
    } finally {
      setSubmittingResolve(false);
    }
  };

  const handleEscalate = async (incident: IncidentItem) => {
    if (
      !confirm(
        "Eskalasi kasus ini ke penanganan manual? Koordinator ibadah akan menerima notifikasi khusus.",
      )
    ) {
      return;
    }
    try {
      await escalateIncident(
        incident.id,
        "Eskalasi manual diminta oleh koordinator.",
      );
      await loadIncidents();
      if (selectedIncident?.id === incident.id) {
        setSelectedIncident(null);
      }
      onIncidentUpdated?.();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Gagal eskalasi insiden.");
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceIdInput || !assignmentIdInput || !reasonInput.trim()) {
      setCreateError("Harap isi semua kolom yang diperlukan.");
      return;
    }
    setSubmittingCreate(true);
    setCreateError(null);
    try {
      await createIncident(
        serviceIdInput.trim(),
        assignmentIdInput.trim(),
        reasonInput.trim(),
      );
      setShowCreateModal(false);
      setServiceIdInput("");
      setAssignmentIdInput("");
      setReasonInput("");
      await loadIncidents();
      onIncidentUpdated?.();
    } catch (err: unknown) {
      setCreateError(
        err instanceof Error ? err.message : "Gagal melaporkan insiden.",
      );
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Filtered list
  const filteredIncidents = incidents.filter((item) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "critical")
      return item.urgency === "critical" && item.status === "open";
    if (statusFilter === "open")
      return item.status === "open" || item.status === "escalated_manual";
    if (statusFilter === "resolved") return item.status === "resolved";
    return true;
  });

  const criticalCount = incidents.filter(
    (i) => i.status === "open" && i.urgency === "critical",
  ).length;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("id-ID", {
        timeZone: timezone || "Asia/Makassar",
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="incident-panel" style={{ padding: "1rem" }}>
      {/* Top Banner & Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              margin: 0,
              color: "#452B83",
            }}
          >
            Insiden Pelayanan & Penggantian Cepat
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0 0",
              color: "#666",
              fontSize: "0.9rem",
            }}
          >
            Kelola kasus pelayan berhalangan, darurat mendadak, dan pengesahan
            kandidat pengganti.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowChecklistModal(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 0.8rem",
              fontSize: "0.85rem",
            }}
          >
            <Printer size={16} /> Checklist Darurat
          </button>
          {canManageReplacements && (
            <button
              type="button"
              className="primary-button"
              onClick={() => setShowCreateModal(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.5rem 0.8rem",
                fontSize: "0.85rem",
              }}
            >
              <Plus size={16} /> Lapor Insiden Baru
            </button>
          )}
        </div>
      </div>

      {/* Critical Alert Banner */}
      {criticalCount > 0 && (
        <div
          style={{
            backgroundColor: "#FEE2E2",
            border: "1px solid #F87171",
            borderRadius: "8px",
            padding: "0.9rem 1.2rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.8rem",
            color: "#991B1B",
          }}
        >
          <ShieldAlert size={24} style={{ flexShrink: 0 }} />
          <div>
            <strong style={{ display: "block" }}>
              PERHATIAN: Ada {criticalCount} insiden berstatus KRITIS!
            </strong>
            <span style={{ fontSize: "0.85rem" }}>
              Ibadah berlangsung dalam waktu kurang dari 60 menit. Target batas
              respons pengesahan pengganti adalah 5 menit.
            </span>
          </div>
        </div>
      )}

      {/* Filter Tabs & Refresh */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #E5E7EB",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { id: "all", label: `Semua (${incidents.length})` },
            { id: "critical", label: `Kritis (${criticalCount})` },
            {
              id: "open",
              label: `Terbuka (${incidents.filter((i) => i.status === "open" || i.status === "escalated_manual").length})`,
            },
            {
              id: "resolved",
              label: `Selesai (${incidents.filter((i) => i.status === "resolved").length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom:
                  statusFilter === tab.id
                    ? "2px solid #6D4CC6"
                    : "2px solid transparent",
                color: statusFilter === tab.id ? "#6D4CC6" : "#6B7280",
                fontWeight: statusFilter === tab.id ? 600 : 500,
                padding: "0.6rem 0.8rem",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={loadIncidents}
          className="icon-button"
          title="Segarkan daftar"
          style={{ padding: "0.4rem" }}
        >
          <RefreshCw size={16} className={loading ? "spin" : ""} />
        </button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "#666" }}>
          Memuat data insiden...
        </div>
      ) : error ? (
        <div
          style={{
            padding: "1.5rem",
            backgroundColor: "#FEF2F2",
            color: "#991B1B",
            borderRadius: "8px",
          }}
        >
          {error}
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div
          style={{
            padding: "3rem 1rem",
            textAlign: "center",
            backgroundColor: "#F9FAFB",
            borderRadius: "8px",
            border: "1px dashed #D1D5DB",
          }}
        >
          <CheckCircle2
            size={40}
            style={{ color: "#10B981", margin: "0 auto 0.8rem auto" }}
          />
          <h3 style={{ margin: 0, fontWeight: 600, color: "#374151" }}>
            Tidak ada insiden pelayanan
          </h3>
          <p
            style={{
              color: "#6B7280",
              fontSize: "0.85rem",
              marginTop: "0.25rem",
            }}
          >
            Semua penugasan ibadah dalam keadaan normal dan siap bertugas.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {filteredIncidents.map((incident) => {
            const isCritical =
              incident.urgency === "critical" && incident.status === "open";
            return (
              <div
                key={incident.id}
                style={{
                  border: isCritical
                    ? "1.5px solid #EF4444"
                    : "1px solid #E5E7EB",
                  borderRadius: "8px",
                  backgroundColor: "#FFFFFF",
                  padding: "1rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        marginBottom: "0.4rem",
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: "#F2EEFF",
                          color: "#6D4CC6",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                        }}
                      >
                        {incident.roleName}
                      </span>
                      {isCritical && (
                        <span
                          style={{
                            backgroundColor: "#FEE2E2",
                            color: "#DC2626",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.2rem",
                          }}
                        >
                          <AlertTriangle size={12} /> KRITIS (&lt; 60m)
                        </span>
                      )}
                      <span
                        style={{
                          backgroundColor:
                            incident.status === "resolved"
                              ? "#D1FAE5"
                              : incident.status === "escalated_manual"
                                ? "#FEF3C7"
                                : "#F3F4F6",
                          color:
                            incident.status === "resolved"
                              ? "#065F46"
                              : incident.status === "escalated_manual"
                                ? "#92400E"
                                : "#374151",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.2rem 0.5rem",
                          borderRadius: "4px",
                        }}
                      >
                        {incident.status === "resolved"
                          ? "SELESAI"
                          : incident.status === "escalated_manual"
                            ? "ESKALASI MANUAL"
                            : "TERBUKA"}
                      </span>
                    </div>
                    <h3
                      style={{
                        margin: "0.2rem 0",
                        fontSize: "1.05rem",
                        fontWeight: 600,
                        color: "#1F2937",
                      }}
                    >
                      Pelayan Berhalangan:{" "}
                      <span style={{ color: "#DC2626" }}>
                        {incident.servantName}
                      </span>
                    </h3>
                    <p
                      style={{
                        margin: "0.2rem 0",
                        fontSize: "0.85rem",
                        color: "#4B5563",
                      }}
                    >
                      <strong>Alasan:</strong> {incident.reason}
                    </p>
                    <p
                      style={{
                        margin: "0.2rem 0",
                        fontSize: "0.85rem",
                        color: "#6B7280",
                      }}
                    >
                      <strong>Ibadah:</strong>{" "}
                      {formatDate(incident.serviceStartsAt)} —{" "}
                      {incident.serviceLocation}
                    </p>
                    {incident.status === "resolved" && (
                      <p
                        style={{
                          margin: "0.4rem 0 0 0",
                          fontSize: "0.85rem",
                          color: "#065F46",
                          fontWeight: 600,
                        }}
                      >
                        ✓ Digantikan oleh: {incident.resolvedServantName} (
                        {formatDate(incident.resolvedAt ?? "")})
                      </p>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.4rem",
                      minWidth: "120px",
                    }}
                  >
                    {(incident.status === "open" ||
                      incident.status === "escalated_manual") && (
                      <>
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => openDetail(incident)}
                          style={{
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.85rem",
                            textAlign: "center",
                          }}
                        >
                          Cari Pengganti
                        </button>
                        {incident.status === "open" &&
                          canManageReplacements && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => handleEscalate(incident)}
                              style={{
                                padding: "0.35rem 0.6rem",
                                fontSize: "0.75rem",
                                textAlign: "center",
                              }}
                            >
                              Eskalasi Manual
                            </button>
                          )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail / Candidates Recommendation Drawer/Modal */}
      {selectedIncident && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              maxWidth: "600px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.5rem",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h2
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "#452B83",
                }}
              >
                Rekomendasi Kandidat Pengganti
              </h2>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedIncident(null)}
              >
                <X size={20} />
              </button>
            </div>

            <div
              style={{
                backgroundColor: "#F9FAFB",
                padding: "0.8rem",
                borderRadius: "6px",
                marginBottom: "1rem",
                fontSize: "0.85rem",
              }}
            >
              <div>
                <strong>Peran:</strong> {selectedIncident.roleName}
              </div>
              <div>
                <strong>Ibadah:</strong>{" "}
                {formatDate(selectedIncident.serviceStartsAt)} (
                {selectedIncident.serviceLocation})
              </div>
              <div>
                <strong>Petugas Awal:</strong> {selectedIncident.servantName}
              </div>
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 600,
                color: "#374151",
                marginBottom: "0.5rem",
              }}
            >
              Daftar Rekomendasi Sistem (Terverifikasi & Ketersediaan Jelas):
            </h3>

            {loadingCandidates ? (
              <div
                style={{
                  padding: "1.5rem",
                  textAlign: "center",
                  color: "#666",
                }}
              >
                Menganalisis jadwal dan ketersediaan kandidat...
              </div>
            ) : candidates.length === 0 ? (
              <div
                style={{
                  padding: "1.5rem",
                  textAlign: "center",
                  backgroundColor: "#FEF3C7",
                  borderRadius: "6px",
                }}
              >
                <p style={{ margin: 0, color: "#92400E", fontWeight: 500 }}>
                  Tidak ada kandidat pengganti otomatis yang memenuhi seluruh
                  kriteria (bebas jadwal bentrok dan capability aktif).
                </p>
                <p
                  style={{
                    margin: "0.5rem 0 0 0",
                    fontSize: "0.8rem",
                    color: "#B45309",
                  }}
                >
                  Gunakan opsi Eskalasi Manual untuk menghubungi pelayan di luar
                  sistem.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: "0.8rem",
                  maxHeight: "350px",
                  overflowY: "auto",
                }}
              >
                {candidates.map((cand) => (
                  <div
                    key={cand.servantId}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "8px",
                      padding: "0.8rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      backgroundColor: cand.isBackup ? "#FDF8F6" : "#FFFFFF",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: "0.95rem",
                          color: "#1F2937",
                        }}
                      >
                        {cand.displayName}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "0.4rem",
                          flexWrap: "wrap",
                          marginTop: "0.3rem",
                        }}
                      >
                        {cand.isBackup && (
                          <span
                            style={{
                              backgroundColor: "#FEF3C7",
                              color: "#92400E",
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                            }}
                          >
                            Cadangan Utama
                          </span>
                        )}
                        <span
                          style={{
                            backgroundColor: "#E0E7FF",
                            color: "#3730A3",
                            fontSize: "0.7rem",
                            fontWeight: 500,
                            padding: "0.15rem 0.4rem",
                            borderRadius: "4px",
                          }}
                        >
                          {cand.monthlyAssignmentsCount} tugas bln ini
                        </span>
                        <span
                          style={{
                            backgroundColor: "#D1FAE5",
                            color: "#065F46",
                            fontSize: "0.7rem",
                            fontWeight: 500,
                            padding: "0.15rem 0.4rem",
                            borderRadius: "4px",
                          }}
                        >
                          Capability Disetujui
                        </span>
                      </div>
                    </div>
                    {canManageReplacements && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => setCandidateToResolve(cand)}
                        style={{
                          padding: "0.4rem 0.8rem",
                          fontSize: "0.85rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Pilih Pengganti
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Final Approval */}
      {candidateToResolve && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              maxWidth: "480px",
              width: "100%",
              padding: "1.5rem",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontSize: "1.15rem",
                fontWeight: 700,
                margin: "0 0 0.8rem 0",
                color: "#452B83",
              }}
            >
              Konfirmasi Pengesahan Pengganti
            </h3>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#374151",
                lineHeight: 1.5,
                margin: "0 0 1rem 0",
              }}
            >
              Apakah Anda yakin mengesahkan{" "}
              <strong>{candidateToResolve.displayName}</strong> untuk
              menggantikan <strong>{selectedIncident?.servantName}</strong>{" "}
              sebagai <strong>{selectedIncident?.roleName}</strong>?
            </p>
            <div
              style={{
                backgroundColor: "#FEF2F2",
                color: "#991B1B",
                padding: "0.6rem 0.8rem",
                borderRadius: "6px",
                fontSize: "0.8rem",
                marginBottom: "1rem",
              }}
            >
              Penugasan lama akan ditutup sebagai <code>ditugaskan_ulang</code>{" "}
              dan penugasan baru akan langsung diaktifkan secara atomik.
            </div>

            {resolveError && (
              <div
                style={{
                  color: "#DC2626",
                  fontSize: "0.85rem",
                  marginBottom: "0.8rem",
                }}
              >
                {resolveError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.6rem",
              }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCandidateToResolve(null)}
                disabled={submittingResolve}
              >
                Batal
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleResolve}
                disabled={submittingResolve}
              >
                {submittingResolve ? "Mengesahkan..." : "Ya, Sahkan Pengganti"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Report Modal */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              maxWidth: "480px",
              width: "100%",
              padding: "1.5rem",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <h3
                style={{
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  margin: 0,
                  color: "#452B83",
                }}
              >
                Laporkan Insiden Manual
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowCreateModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleCreateSubmit}
              style={{ display: "grid", gap: "0.8rem" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.2rem",
                  }}
                >
                  ID Ibadah (Service ID)
                </label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Contoh: s-2026-09-13"
                  value={serviceIdInput}
                  onChange={(e) => setServiceIdInput(e.target.value)}
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.2rem",
                  }}
                >
                  ID Penugasan (Assignment ID)
                </label>
                <input
                  type="text"
                  className="text-input"
                  placeholder="Contoh: a-preacher-01"
                  value={assignmentIdInput}
                  onChange={(e) => setAssignmentIdInput(e.target.value)}
                  required
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "0.2rem",
                  }}
                >
                  Alasan Berhalangan / Insiden
                </label>
                <textarea
                  className="text-input"
                  rows={3}
                  placeholder="Contoh: Sakit mendadak, sedang dalam perjalanan dinas luar kota..."
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  required
                />
              </div>

              {createError && (
                <div style={{ color: "#DC2626", fontSize: "0.85rem" }}>
                  {createError}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.6rem",
                  marginTop: "0.5rem",
                }}
              >
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submittingCreate}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingCreate}
                >
                  {submittingCreate ? "Menyimpan..." : "Buka Kasus Insiden"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Emergency Checklist Offline Modal (PRD §14) */}
      {showChecklistModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "12px",
              maxWidth: "650px",
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
              padding: "1.5rem",
              boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <FileText size={20} color="#452B83" />
                <h3
                  style={{
                    fontSize: "1.15rem",
                    fontWeight: 700,
                    margin: 0,
                    color: "#452B83",
                  }}
                >
                  Checklist Darurat Pelayanan (Siap Cetak / Offline)
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowChecklistModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <p
              style={{
                fontSize: "0.85rem",
                color: "#6B7280",
                margin: "0 0 1rem 0",
              }}
            >
              Sesuai PRD §14: Panduan tindakan darurat ini dapat dicetak atau
              disalin saat koneksi internet gereja tidak stabil.
            </p>

            <div
              style={{
                border: "1px solid #D1D5DB",
                borderRadius: "6px",
                padding: "1rem",
                fontSize: "0.85rem",
              }}
            >
              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "#1F2937",
                  borderBottom: "1px solid #E5E7EB",
                  paddingBottom: "0.3rem",
                }}
              >
                1. Standar Operasional Kondisi Kritis (&lt; 60 Menit)
              </h4>
              <ul
                style={{
                  paddingLeft: "1.2rem",
                  margin: "0 0 1rem 0",
                  lineHeight: 1.6,
                }}
              >
                <li>
                  Periksa apakah pelayan bersangkutan sudah hadir pada waktu
                  kumpul (<code>assembly_at</code>).
                </li>
                <li>
                  Jika belum hadir dan tidak merespons, hubungi kontak darurat
                  secara langsung (telepon/pribadi).
                </li>
                <li>
                  Prioritaskan pelayan yang berstatus{" "}
                  <strong>Pelayan Cadangan</strong> pada hari H.
                </li>
                <li>
                  Khusus <strong>Pelayan Firman</strong>, pengganti wajib
                  berasal dari daftar majelis/pengkhotbah yang telah
                  terverifikasi.
                </li>
              </ul>

              <h4
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "#1F2937",
                  borderBottom: "1px solid #E5E7EB",
                  paddingBottom: "0.3rem",
                }}
              >
                2. Daftar Kasus Insiden Terbuka Saat Ini
              </h4>
              {incidents.filter(
                (i) => i.status === "open" || i.status === "escalated_manual",
              ).length === 0 ? (
                <p style={{ color: "#10B981", margin: 0 }}>
                  Tidak ada kasus terbuka.
                </p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.8rem",
                    marginTop: "0.5rem",
                  }}
                >
                  <thead>
                    <tr
                      style={{ backgroundColor: "#F3F4F6", textAlign: "left" }}
                    >
                      <th
                        style={{
                          padding: "0.4rem",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        Ibadah
                      </th>
                      <th
                        style={{
                          padding: "0.4rem",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        Peran
                      </th>
                      <th
                        style={{
                          padding: "0.4rem",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        Pelayan Awal
                      </th>
                      <th
                        style={{
                          padding: "0.4rem",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        Urgensi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents
                      .filter(
                        (i) =>
                          i.status === "open" ||
                          i.status === "escalated_manual",
                      )
                      .map((i) => (
                        <tr key={i.id}>
                          <td
                            style={{
                              padding: "0.4rem",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            {formatDate(i.serviceStartsAt)}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            {i.roleName}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            {i.servantName}
                          </td>
                          <td
                            style={{
                              padding: "0.4rem",
                              border: "1px solid #E5E7EB",
                              color:
                                i.urgency === "critical"
                                  ? "#DC2626"
                                  : "#D97706",
                              fontWeight: 600,
                            }}
                          >
                            {i.urgency === "critical" ? "KRITIS" : "STANDAR"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "1rem",
              }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={() => window.print()}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Printer size={16} /> Cetak / Unduh PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
