import { useEffect, useState } from "react";
import {
  AlertTriangle,
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
} from "lucide-react";
import { AuditPanel } from "./AuditPanel";
import { UserAccess } from "./UserAccess";
import { ImportScheduleWizard } from "./ImportScheduleWizard";
import { TelegramActivationPanel } from "./TelegramActivationPanel";

const nav = [
  [LayoutDashboard, "Beranda"],
  [CalendarDays, "Kalender"],
  [ClipboardCheck, "Tugas"],
  [AlertTriangle, "Insiden"],
  [MoreHorizontal, "Lainnya"],
] as const;

type ServiceSummary = {
  id: string;
  startsAt: string;
  location: string;
  status: string;
  theme: string | null;
  assignmentCount: number;
  confirmedCount: number;
};
export function ProductShell({
  name,
  timezone,
  canManageRoles,
  canReadAudit,
  canImportSchedules,
  canManageServants,
  onAccessChanged,
}: {
  name: string;
  timezone: string;
  canManageRoles: boolean;
  canReadAudit: boolean;
  canImportSchedules: boolean;
  canManageServants: boolean;
  onAccessChanged: () => void;
}) {
  const [section, setSection] = useState("Beranda");
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [scheduleRevision, setScheduleRevision] = useState(0);
  const [scheduleState, setScheduleState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  useEffect(() => {
    const controller = new AbortController();
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
    return () => controller.abort();
  }, [scheduleRevision]);
  const changeSection =
    (label: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      setSection(label);
    };
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigasi utama">
        <a className="spi-mark" href="#beranda">
          <span>✦</span> SPI
        </a>
        <p>SISTEM PELAYANAN IBADAH</p>
        <nav>
          {nav.map(([Icon, label]) => (
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
          <div className="avatar">MS</div>
          <span>
            <strong>{name}</strong>
            <small>Koordinator Ibadah</small>
          </span>
          <Menu size={18} />
        </div>
      </aside>
      <main className="workspace" id="beranda">
        <header className="app-topbar">
          <button className="icon-button" aria-label="Buka menu">
            <Menu size={21} />
          </button>
          <div className="top-actions">
            <button className="icon-button" aria-label="Cari">
              <Search size={20} />
            </button>
            <button className="icon-button notify" aria-label="Notifikasi">
              <Bell size={20} />
              <i />
            </button>
            <div className="avatar small">MS</div>
          </div>
        </header>
        {section === "Beranda" ? (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">SELASA, 9 SEPTEMBER 2026</p>
                <h1>Selamat pagi, {name.split(" ")[0]}.</h1>
                <p>Persiapan ibadah minggu ini sudah hampir lengkap.</p>
              </div>
              <button
                className="primary-action"
                onClick={() => setSection("Kalender")}
              >
                <CalendarDays size={18} /> Lihat kalender
              </button>
            </div>
            <section className="hero-service">
              <div className="hero-date">
                <b>14</b>
                <span>SEP</span>
              </div>
              <div className="hero-copy">
                <span className="status scheduled">
                  <CalendarDays size={14} /> Terjadwal
                </span>
                <h2>Ibadah Minggu Raya</h2>
                <p>17.00 WITA · Gereja Ebenhaezer · Ruang Utama</p>
              </div>
              <div className="readiness">
                <span>Kesiapan tim</span>
                <strong>7 dari 8 peran</strong>
                <div className="progress">
                  <i />
                </div>
              </div>
              <a href="#detail" aria-label="Detail ibadah">
                <ChevronRight />
              </a>
            </section>
            <div className="dashboard-grid">
              <section className="card assignments">
                <div className="card-head">
                  <div>
                    <span className="card-icon lavender">
                      <ClipboardCheck />
                    </span>
                    <h2>Menunggu konfirmasi</h2>
                  </div>
                  <a href="#tugas">Lihat semua</a>
                </div>
                <p className="muted">2 pelayan perlu menanggapi tugasnya.</p>
                <div className="assignment-row">
                  <div className="person rose">JP</div>
                  <div>
                    <strong>Johan Pratama</strong>
                    <span>Operator Multimedia</span>
                  </div>
                  <span className="status waiting">Menunggu</span>
                </div>
                <div className="assignment-row">
                  <div className="person gold">RK</div>
                  <div>
                    <strong>Rina Kurnia</strong>
                    <span>Pelayan Persembahan</span>
                  </div>
                  <span className="status waiting">Menunggu</span>
                </div>
                <button className="soft-action">Kirim pengingat</button>
              </section>
              <section className="card incident-card" id="insiden">
                <div className="card-head">
                  <div>
                    <span className="card-icon critical">
                      <AlertTriangle />
                    </span>
                    <h2>Insiden aktif</h2>
                  </div>
                  <span className="status critical-status">Kritis</span>
                </div>
                <h3>Pengganti MC diperlukan</h3>
                <p className="muted">
                  Dwi Hartono berhalangan hadir. Batas respons kandidat pukul
                  15.30 WITA.
                </p>
                <div className="deadline">
                  <span>⏱</span>
                  <strong>00:18:42</strong>
                  <small>tersisa</small>
                </div>
                <button className="critical-action">
                  Buka penggantian <ChevronRight size={17} />
                </button>
              </section>
              <section className="card calendar-card" id="kalender">
                <div className="card-head">
                  <div>
                    <span className="card-icon mint">
                      <CalendarDays />
                    </span>
                    <h2>Jadwal terdekat</h2>
                  </div>
                  <a href="#kalender">Kalender</a>
                </div>
                <div className="schedule-item">
                  <b>
                    <small>SEP</small>14
                  </b>
                  <span>
                    <strong>Ibadah Minggu Raya</strong>
                    <small>17.00 WITA · Ruang Utama</small>
                  </span>
                  <span className="status scheduled">Terjadwal</span>
                </div>
                <div className="schedule-item">
                  <b>
                    <small>SEP</small>17
                  </b>
                  <span>
                    <strong>Doa Tengah Minggu</strong>
                    <small>19.00 WITA · Kapel</small>
                  </span>
                  <span className="status draft">Draf</span>
                </div>
              </section>
              <section className="card import-card">
                <div>
                  <span className="card-icon lavender">
                    <FileSpreadsheet />
                  </span>
                  <h2>Impor jadwal</h2>
                  <p className="muted">
                    Lanjutkan batch Excel September sebelum dipublikasikan.
                  </p>
                </div>
                <div className="import-step">
                  <span>Pratinjau</span>
                  <strong>4 dari 6</strong>
                  <div className="progress pale">
                    <i />
                  </div>
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
                  <p className="muted">Akses impor memerlukan peran Admin.</p>
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
          />
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
      </main>
      <nav className="mobile-nav" aria-label="Navigasi ponsel">
        {nav.map(([Icon, label]) => (
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
}: {
  services: ServiceSummary[];
  state: "loading" | "ready" | "error";
  timezone: string;
  onCreated: () => void;
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
      <p>Data berikut dibaca dari database D1 lokal sesuai scope akun.</p>
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
            <article key={service.id}>
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
                  penugasan terkonfirmasi · {service.status}
                </p>
              </div>
              <ChevronRight size={19} />
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
  const detail: Record<
    string,
    { title: string; intro: string; chips: string[]; action: string }
  > = {
    Kalender: {
      title: "Kalender pelayanan",
      intro:
        "Tampilan bulan untuk pengurus dan daftar ringkas yang nyaman di ponsel.",
      chips: [
        "14 Sep · Ibadah Minggu Raya",
        "17 Sep · Doa Tengah Minggu",
        "21 Sep · Ibadah Minggu",
      ],
      action: "Tambah ibadah",
    },
    Tugas: {
      title: "Tugas saya",
      intro:
        "Setiap kartu punya satu aksi utama agar konfirmasi cepat dan jelas.",
      chips: [
        "Operator Multimedia · Menunggu konfirmasi",
        "Pelayan Persembahan · Bersedia",
        "MC · Perlu pengganti",
      ],
      action: "Buka Telegram",
    },
    Insiden: {
      title: "Penggantian & insiden",
      intro:
        "Kandidat disarankan berdasarkan ketersediaan dan kompetensi; keputusan tetap oleh koordinator.",
      chips: [
        "Kritis · MC · respons 5 menit",
        "Normal · Operator · kandidat tersedia",
        "Eskalasi manual · tanpa respons",
      ],
      action: "Tinjau kandidat",
    },
    Lainnya: {
      title: "Pengelolaan",
      intro:
        "Area sesuai izin untuk pelayan, laporan, impor jadwal, dan pengaturan organisasi.",
      chips: [
        "Pelayan · capability & availability",
        "Laporan · filter periode dan peran",
        "Impor Excel · 4/6 Pratinjau",
      ],
      action: "Lanjutkan impor",
    },
  };
  const current = detail[section] ?? {
    title: "Pengelolaan",
    intro:
      "Area sesuai izin untuk pelayan, laporan, impor jadwal, dan pengaturan organisasi.",
    chips: [
      "Pelayan · capability & availability",
      "Laporan · filter periode dan peran",
      "Impor Excel · 4/6 Pratinjau",
    ],
    action: "Lanjutkan impor",
  };
  return (
    <section className="section-preview">
      <p className="eyebrow">{section.toUpperCase()}</p>
      <h1>{current.title}</h1>
      <p>{current.intro}</p>
      <div className="preview-toolbar">
        <button className="soft-action">September 2026</button>
        <button className="soft-action">Semua peran</button>
        <button className="primary-action">{current.action}</button>
      </div>
      <div className="preview-list">
        {current.chips.map((item, index) => (
          <article key={item}>
            <span className={`list-icon ${index === 2 ? "warn" : ""}`}>
              {index + 1}
            </span>
            <div>
              <strong>{item}</strong>
              <p>Status dan detail hanya tampil sesuai hak akses Anda.</p>
            </div>
            <ChevronRight size={19} />
          </article>
        ))}
      </div>
      <div className="preview-note">
        <ShieldCheck size={17} /> Status selalu dijelaskan dengan teks dan
        ikon—bukan warna saja.
      </div>
    </section>
  );
}
