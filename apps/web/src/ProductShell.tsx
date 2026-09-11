import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AuditPanel } from "./AuditPanel";
import { UserAccess } from "./UserAccess";
import { ImportScheduleWizard } from "./ImportScheduleWizard";
import { TelegramActivationPanel } from "./TelegramActivationPanel";
import { IncidentPanel } from "./IncidentPanel";
import { PerformanceReportsPanel } from "./PerformanceReportsPanel";
import { AttendanceModal } from "./AttendanceModal";
import { MyTasksPanel } from "./MyTasksPanel";
import { ServiceDetailModal, type ServiceDetail } from "./ServiceDetailModal";
import { PelayananPanel } from "./PelayananPanel";

export const PREVIEW_PERSONAS = [
  {
    email: "manasumiraka@gmail.com",
    name: "Super Admin",
    role: "Super Admin",
    color: "#4f46e5",
  },
  {
    email: "budi.ibadah@spi-preview.invalid",
    name: "Budi Santoso",
    role: "Koordinator Ibadah",
    color: "#0284c7",
  },
  {
    email: "siti.media@spi-preview.invalid",
    name: "Siti Rahma",
    role: "Koordinator Multimedia",
    color: "#0d9488",
  },
  {
    email: "johan.pratama@spi-preview.invalid",
    name: "Johan Pratama",
    role: "Pelayan (Multimedia)",
    color: "#e11d48",
  },
  {
    email: "rina.kurnia@spi-preview.invalid",
    name: "Rina Kurnia",
    role: "Pelayan (Kolektan)",
    color: "#d97706",
  },
  {
    email: "dwi.hartono@spi-preview.invalid",
    name: "Dwi Hartono",
    role: "Pelayan (MC)",
    color: "#7c3aed",
  },
];

type ServiceSummary = {
  id: string;
  startsAt: string;
  location: string;
  status: string;
  theme: string | null;
  assignmentCount: number;
  confirmedCount: number;
};

type PendingAssignmentItem = {
  id: string;
  servantName: string;
  roleName: string;
  status: string;
};

type ActiveIncidentItem = {
  id: string;
  roleName: string;
  servantName: string;
  reason: string;
  urgency: string;
  status: string;
};

export function ProductShell({
  name,
  email,
  roles = [],
  permissions = [],
  timezone,
  canManageRoles,
  canReadAudit,
  canImportSchedules,
  canManageServants,
  onAccessChanged,
  onSwitchPersona,
}: {
  name: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  timezone: string;
  canManageRoles: boolean;
  canReadAudit: boolean;
  canImportSchedules: boolean;
  canManageServants: boolean;
  onAccessChanged: () => void;
  onSwitchPersona?: (email: string) => void;
}) {
  const [section, setSection] = useState("Beranda");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [pendingAssignments, setPendingAssignments] = useState<
    PendingAssignmentItem[]
  >([]);
  const [activeIncidents, setActiveIncidents] = useState<ActiveIncidentItem[]>(
    [],
  );
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [attendanceTarget, setAttendanceTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceDetail | null>(
    null,
  );
  const [scheduleState, setScheduleState] = useState<
    "loading" | "ready" | "error"
  >("loading");

  useEffect(() => {
    const controller = new AbortController();

    // Fetch services list
    fetch("/api/v1/services?limit=20", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json() as Promise<{ data: ServiceSummary[] }>;
      })
      .then((payload) => {
        setServices(payload.data);
        setScheduleState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setScheduleState("error");
      });

    // Fetch awaiting confirmation assignments for dashboard
    fetch("/api/v1/assignments?status=awaiting_confirmation", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) return { data: [] };
        return res.json() as Promise<{ data: PendingAssignmentItem[] }>;
      })
      .then((payload) => {
        setPendingAssignments(payload.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPendingAssignments([]);
      });

    // Fetch active incidents for dashboard
    fetch("/api/v1/incidents?status=open", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) return { data: [] };
        return res.json() as Promise<{ data: ActiveIncidentItem[] }>;
      })
      .then((payload) => {
        setActiveIncidents(payload.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setActiveIncidents([]);
      });

    return () => controller.abort();
  }, [scheduleRevision]);

  const changeSection =
    (label: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setSection(label);
    };

  const handleOpenServiceDetail = (summary: ServiceSummary) => {
    setSelectedService({
      id: summary.id,
      startsAt: summary.startsAt,
      assemblyAt: summary.startsAt,
      endsAt: summary.startsAt,
      location: summary.location,
      status: summary.status,
      theme: summary.theme,
      version: 1,
    });
  };

  const initials =
    name
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "SP";

  const currentPersona = PREVIEW_PERSONAS.find((p) => p.email === email);
  const roleTitle = roles.includes("admin")
    ? "Super Admin"
    : roles.includes("coordinator")
      ? "Koordinator Ibadah"
      : "Pelayan Ibadah";

  const heroService =
    services.find((s) => s.status === "scheduled") ?? services[0] ?? null;

  const firstIncident = activeIncidents[0];

  let heroDay = "14";
  let heroMonth = "SEP";
  let heroTime = "17.00";
  if (heroService) {
    const d = new Date(heroService.startsAt);
    heroDay = String(d.getDate()).padStart(2, "0");
    heroMonth = d.toLocaleDateString("id-ID", { month: "short" }).toUpperCase();
    heroTime = d.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const currentDateFormatted = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date());
  const canAccessPelayanan =
    roles.includes("super_admin") ||
    roles.includes("admin") ||
    canManageServants;

  const currentNav = [
    [LayoutDashboard, "Beranda"],
    [CalendarDays, "Kalender"],
    [ClipboardCheck, "Tugas"],
    [AlertTriangle, "Insiden"],
    [BarChart3, "Laporan"],
    ...(canAccessPelayanan ? ([[Users, "Pelayanan"]] as const) : []),
    [MoreHorizontal, "Lainnya"],
  ] as const;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigasi utama">
        <a className="spi-mark" href="#beranda">
          <span>✦</span> SPI
        </a>
        <p>SISTEM PELAYANAN IBADAH</p>
        <nav>
          {currentNav.map(([Icon, label]) => (
            <a
              className={section === label ? "active" : ""}
              href={`#${label.toLowerCase()}`}
              onClick={changeSection(label)}
              key={label}
            >
              <Icon size={19} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div
            className="avatar"
            style={{
              backgroundColor: currentPersona?.color ?? "#475569",
              color: "#ffffff",
              fontWeight: 700,
            }}
          >
            {initials}
          </div>
          <span>
            <strong>{name}</strong>
            <small>{currentPersona?.role ?? roleTitle}</small>
          </span>
          <Menu size={18} />
        </div>
      </aside>
      <main className="workspace" id="beranda">
        <header className="app-topbar">
          <button className="icon-button" aria-label="Buka menu">
            <Menu size={21} />
          </button>
          <div
            className="top-actions"
            style={{ display: "flex", alignItems: "center", gap: "12px" }}
          >
            {onSwitchPersona && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  backgroundColor: "#ffffff",
                  padding: "4px 8px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#64748b",
                    fontWeight: 600,
                  }}
                >
                  Persona Preview:
                </span>
                <select
                  value={email || ""}
                  onChange={(e) => onSwitchPersona(e.target.value)}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f8fafc",
                    fontSize: "0.8125rem",
                    color: "#0f172a",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  aria-label="Ganti Persona Preview"
                >
                  {PREVIEW_PERSONAS.map((p) => (
                    <option key={p.email} value={p.email}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="icon-button" aria-label="Cari">
              <Search size={20} />
            </button>
            <button className="icon-button notify" aria-label="Notifikasi">
              <Bell size={20} />
              <i />
            </button>
            <div
              className="avatar small"
              style={{
                backgroundColor: currentPersona?.color ?? "#475569",
                color: "#ffffff",
                fontWeight: 700,
              }}
            >
              {initials}
            </div>
          </div>
        </header>

        {section === "Beranda" ? (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">{currentDateFormatted}</p>
                <h1>Selamat melayani, {name.split(" ")[0]}.</h1>
                <p>
                  Sistem Pelayanan Ibadah aktif untuk koordinasi dan kesiapan
                  tim pelayanan.
                </p>
              </div>
              <button
                className="primary-action"
                onClick={() => setSection("Kalender")}
              >
                <CalendarDays size={18} /> Lihat kalender
              </button>
            </div>

            {heroService ? (
              <section
                className="hero-service"
                style={{ cursor: "pointer" }}
                onClick={() => handleOpenServiceDetail(heroService)}
                role="button"
                tabIndex={0}
              >
                <div className="hero-date">
                  <b>{heroDay}</b>
                  <span>{heroMonth}</span>
                </div>
                <div className="hero-copy">
                  <span className={`status ${heroService.status}`}>
                    <CalendarDays size={14} />{" "}
                    {heroService.status === "scheduled"
                      ? "Terjadwal"
                      : heroService.status === "draft"
                        ? "Draf"
                        : "Selesai"}
                  </span>
                  <h2>{heroService.theme ?? "Ibadah Jemaat"}</h2>
                  <p>
                    {heroTime} WITA · {heroService.location}
                  </p>
                </div>
                <div className="readiness">
                  <span>Kesiapan tim</span>
                  <strong>
                    {heroService.confirmedCount} dari{" "}
                    {heroService.assignmentCount} peran
                  </strong>
                  <div className="progress">
                    <i
                      style={{
                        width: `${
                          heroService.assignmentCount > 0
                            ? Math.round(
                                (heroService.confirmedCount /
                                  heroService.assignmentCount) *
                                  100,
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div aria-label="Detail ibadah">
                  <ChevronRight />
                </div>
              </section>
            ) : (
              <section className="hero-service">
                <div className="hero-copy">
                  <h2>Belum ada jadwal ibadah</h2>
                  <p>
                    Buka tab Kalender untuk membuat jadwal ibadah atau impor
                    draf.
                  </p>
                </div>
              </section>
            )}

            <div className="dashboard-grid">
              {/* Card 1: Menunggu konfirmasi */}
              <section className="card assignments">
                <div className="card-head">
                  <div>
                    <span className="card-icon lavender">
                      <ClipboardCheck />
                    </span>
                    <h2>Menunggu konfirmasi</h2>
                  </div>
                  <a
                    href="#tugas"
                    onClick={(e) => {
                      e.preventDefault();
                      setSection(
                        roles.includes("servant") ? "Tugas" : "Kalender",
                      );
                    }}
                  >
                    Lihat semua
                  </a>
                </div>
                {pendingAssignments.length > 0 ? (
                  <>
                    <p className="muted">
                      {pendingAssignments.length} pelayan perlu menanggapi
                      tugasnya.
                    </p>
                    {pendingAssignments.slice(0, 3).map((item, idx) => {
                      const pInitials =
                        (item.servantName || "PL")
                          .split(" ")
                          .map((s) => s[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "PL";
                      const colorClass = idx % 2 === 0 ? "rose" : "gold";
                      return (
                        <div className="assignment-row" key={item.id}>
                          <div className={`person ${colorClass}`}>
                            {pInitials}
                          </div>
                          <div>
                            <strong>{item.servantName}</strong>
                            <span>{item.roleName}</span>
                          </div>
                          <span className="status waiting">Menunggu</span>
                        </div>
                      );
                    })}
                    <button
                      className="soft-action"
                      onClick={() =>
                        setSection(
                          roles.includes("servant") ? "Tugas" : "Kalender",
                        )
                      }
                    >
                      {roles.includes("servant")
                        ? "Buka Tugas Saya"
                        : "Buka Kalender & Kelola"}
                    </button>
                  </>
                ) : (
                  <p className="muted" style={{ marginTop: "12px" }}>
                    Semua penugasan saat ini telah terkonfirmasi.
                  </p>
                )}
              </section>

              {/* Card 2: Insiden aktif */}
              <section className="card incident-card" id="insiden">
                <div className="card-head">
                  <div>
                    <span className="card-icon critical">
                      <AlertTriangle />
                    </span>
                    <h2>Insiden aktif</h2>
                  </div>
                  {firstIncident && (
                    <span className="status critical-status">
                      {firstIncident.urgency === "critical"
                        ? "Kritis"
                        : "Terbuka"}
                    </span>
                  )}
                </div>
                {firstIncident ? (
                  <>
                    <h3>
                      Pengganti {firstIncident.roleName || "Pelayan"} diperlukan
                    </h3>
                    <p className="muted">
                      {firstIncident.servantName} berhalangan hadir:{" "}
                      {firstIncident.reason || "memerlukan pengganti segera"}.
                    </p>
                    <div className="deadline">
                      <span>⏱</span>
                      <strong>Tindakan diperlukan</strong>
                    </div>
                    <button
                      className="critical-action"
                      onClick={() => setSection("Insiden")}
                    >
                      Buka penggantian <ChevronRight size={17} />
                    </button>
                  </>
                ) : (
                  <p className="muted" style={{ marginTop: "12px" }}>
                    Tidak ada insiden aktif. Semua jadwal berjalan lancar.
                  </p>
                )}
              </section>

              {/* Card 3: Jadwal terdekat */}
              <section className="card calendar-card" id="kalender">
                <div className="card-head">
                  <div>
                    <span className="card-icon mint">
                      <CalendarDays />
                    </span>
                    <h2>Jadwal terdekat</h2>
                  </div>
                  <a
                    href="#kalender"
                    onClick={(e) => {
                      e.preventDefault();
                      setSection("Kalender");
                    }}
                  >
                    Kalender
                  </a>
                </div>
                {services.length === 0 ? (
                  <p className="muted" style={{ marginTop: "12px" }}>
                    Belum ada jadwal ibadah.
                  </p>
                ) : (
                  services.slice(0, 3).map((item) => {
                    const itemDate = new Date(item.startsAt);
                    const itemDay = itemDate.getDate();
                    const itemMonth = itemDate
                      .toLocaleDateString("id-ID", { month: "short" })
                      .toUpperCase();
                    const itemTime = itemDate.toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div
                        className="schedule-item"
                        key={item.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => handleOpenServiceDetail(item)}
                      >
                        <b>
                          <small>{itemMonth}</small>
                          {itemDay}
                        </b>
                        <span>
                          <strong>{item.theme ?? "Ibadah"}</strong>
                          <small>
                            {itemTime} WITA · {item.location}
                          </small>
                        </span>
                        <span className={`status ${item.status}`}>
                          {item.status === "scheduled"
                            ? "Terjadwal"
                            : item.status === "draft"
                              ? "Draf"
                              : "Selesai"}
                        </span>
                      </div>
                    );
                  })
                )}
              </section>

              {/* Card 4: Impor jadwal */}
              <section className="card import-card">
                <div>
                  <span className="card-icon lavender">
                    <FileSpreadsheet />
                  </span>
                  <h2>Impor jadwal</h2>
                  <p className="muted">
                    Format Excel resmi untuk mengimpor rangkaian jadwal ibadah
                    bulanan.
                  </p>
                </div>
                {canImportSchedules ? (
                  <>
                    <a
                      className="template-download"
                      href="/form-jadwal-ibadah.xlsx"
                      download="form-jadwal-ibadah.xlsx"
                    >
                      Unduh form jadwal ibadah.xlsx
                    </a>
                    <button
                      className="soft-action"
                      onClick={() => setSection("Lainnya")}
                    >
                      Lanjutkan impor
                    </button>
                  </>
                ) : (
                  <p className="muted">
                    Akses impor memerlukan peran Koordinator atau Admin.
                  </p>
                )}
              </section>
            </div>
          </>
        ) : section === "Kalender" ? (
          <ScheduleSection
            services={services}
            state={scheduleState}
            timezone={timezone}
            onCreated={() => setScheduleRevision((value) => value + 1)}
            onOpenAttendance={(id, title) => setAttendanceTarget({ id, title })}
            onSelectService={handleOpenServiceDetail}
          />
        ) : section === "Tugas" ? (
          <MyTasksPanel
            timezone={timezone}
            onTaskUpdated={() => setScheduleRevision((value) => value + 1)}
          />
        ) : section === "Insiden" ? (
          <IncidentPanel
            timezone={timezone}
            canManageReplacements={canManageRoles || canManageServants}
            onIncidentUpdated={() => setScheduleRevision((value) => value + 1)}
          />
        ) : section === "Laporan" ? (
          <PerformanceReportsPanel organizationId="" />
        ) : section === "Pelayanan" && canAccessPelayanan ? (
          <PelayananPanel canManage={canAccessPelayanan} />
        ) : section === "Lainnya" ? (
          <section className="section-preview">
            <p className="eyebrow">PENGELOLAAN</p>
            <h1>Pengaturan dan audit</h1>
            {canManageRoles ? (
              <UserAccess onAccessChanged={onAccessChanged} />
            ) : null}
            {canReadAudit ? (
              <AuditPanel
                onAccessChanged={onAccessChanged}
                timezone={timezone}
              />
            ) : null}
            {canImportSchedules ? <ImportScheduleWizard /> : null}
            {canManageServants ? <TelegramActivationPanel /> : null}
          </section>
        ) : (
          <SectionPreview section={section} />
        )}

        <section className="privacy-note">
          <ShieldCheck size={18} />
          <span>
            Data kontak dan catatan privat hanya ditampilkan sesuai peran dan
            cakupan pelayanan Anda.
          </span>
        </section>

        {attendanceTarget && (
          <AttendanceModal
            serviceId={attendanceTarget.id}
            serviceTitle={attendanceTarget.title}
            isOpen={true}
            onClose={() => setAttendanceTarget(null)}
            onSuccess={() => setScheduleRevision((value) => value + 1)}
          />
        )}

        {selectedService && (
          <ServiceDetailModal
            service={selectedService}
            timezone={timezone}
            isOpen={true}
            canManageServices={
              canManageRoles ||
              canManageServants ||
              roles.includes("coordinator") ||
              roles.includes("admin") ||
              permissions.includes("schedule.update")
            }
            onClose={() => setSelectedService(null)}
            onOpenAttendance={(id, title) => {
              setSelectedService(null);
              setAttendanceTarget({ id, title });
            }}
            onServiceUpdated={() => setScheduleRevision((v) => v + 1)}
          />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Navigasi ponsel">
        {currentNav.map(([Icon, label]) => (
          <a
            className={section === label ? "active" : ""}
            href={`#${label.toLowerCase()}`}
            onClick={changeSection(label)}
            key={label}
          >
            <Icon size={21} />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

function ScheduleSection({
  services,
  state,
  timezone,
  onCreated,
  onOpenAttendance,
  onSelectService,
}: {
  services: ServiceSummary[];
  state: "loading" | "ready" | "error";
  timezone: string;
  onCreated: () => void;
  onOpenAttendance: (id: string, title: string) => void;
  onSelectService: (service: ServiceSummary) => void;
}) {
  const formatter = new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  });

  return (
    <section className="section-preview">
      <p className="eyebrow">KALENDER</p>
      <h1>Jadwal ibadah</h1>
      <p>Data jadwal pelayanan dan penugasan tim ibadah.</p>
      <ServiceForm onCreated={onCreated} />
      {state === "loading" ? (
        <div className="preview-note">Memuat jadwal…</div>
      ) : state === "error" ? (
        <div className="preview-note">
          Jadwal gagal dimuat. Pastikan Worker lokal berjalan.
        </div>
      ) : services.length === 0 ? (
        <div className="preview-note">Belum ada jadwal dalam scope Anda.</div>
      ) : (
        <div className="preview-list">
          {services.map((service) => (
            <article
              key={service.id}
              style={{ cursor: "pointer" }}
              onClick={() => onSelectService(service)}
            >
              <span className="list-icon">
                <CalendarDays size={17} />
              </span>
              <div>
                <strong>{service.theme ?? "Ibadah"}</strong>
                <p>
                  {formatter.format(new Date(service.startsAt))} ·{" "}
                  {service.location}
                </p>
                <p>
                  {service.confirmedCount} dari {service.assignmentCount}{" "}
                  penugasan terkonfirmasi ·{" "}
                  <span style={{ fontWeight: 600 }}>
                    {service.status === "scheduled"
                      ? "Terjadwal"
                      : service.status === "draft"
                        ? "Draf"
                        : "Selesai"}
                  </span>
                </p>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAttendance(service.id, service.theme ?? "Ibadah");
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    backgroundColor: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Presensi
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectService(service);
                  }}
                  style={{
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    backgroundColor: "#2563eb",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    cursor: "pointer",
                  }}
                >
                  Kelola
                </button>
                <ChevronRight size={19} />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ServiceForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const wita = (field: string) =>
      new Date(`${String(form.get(field))}:00+08:00`).toISOString();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/services", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          theme: form.get("title"),
          location: form.get("location"),
          assemblyAt: wita("assemblyAt"),
          startsAt: wita("startsAt"),
          endsAt: wita("endsAt"),
        }),
      });
      if (!response.ok) throw new Error("Request failed");
      formElement.reset();
      setOpen(false);
      setMessage("Ibadah tersimpan sebagai draf.");
      onCreated();
    } catch {
      setMessage("Ibadah belum tersimpan. Periksa waktu dan coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="service-form-wrap">
      <button
        className="primary-action"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Tutup formulir" : "Tambah ibadah"}
      </button>
      {open ? (
        <form className="service-form" onSubmit={submit}>
          <label>
            Nama ibadah
            <input name="title" required maxLength={200} />
          </label>
          <label>
            Lokasi
            <input name="location" required maxLength={160} />
          </label>
          <label>
            Waktu hadir (WITA)
            <input name="assemblyAt" type="datetime-local" required />
          </label>
          <label>
            Waktu mulai (WITA)
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Perkiraan selesai (WITA)
            <input name="endsAt" type="datetime-local" required />
          </label>
          <button disabled={submitting}>
            {submitting ? "Menyimpan…" : "Simpan draf"}
          </button>
        </form>
      ) : null}
      {message ? (
        <p role="status" className="preview-note">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function SectionPreview({ section }: { section: string }) {
  return (
    <section className="section-preview">
      <p className="eyebrow">{section.toUpperCase()}</p>
      <h1>{section}</h1>
      <div className="preview-note">
        <ShieldCheck size={17} /> Modul {section} siap digunakan sesuai peran
        Anda.
      </div>
    </section>
  );
}
