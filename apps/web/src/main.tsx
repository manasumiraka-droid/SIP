import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Church,
  ShieldCheck,
  RefreshCw,
  LockKeyhole,
  LoaderCircle,
} from "lucide-react";
import { meResponseSchema } from "../../../packages/validation/src/identity";
import "./styles.css";
import { ProductShell } from "./ProductShell";
type View =
  | { state: "loading" }
  | { state: "denied" | "error" }
  | {
      state: "ready";
      name: string;
      timezone: string;
      canManageRoles: boolean;
      canReadAudit: boolean;
      canImportSchedules: boolean;
      canManageServants: boolean;
    };
function App() {
  const preview = new URLSearchParams(window.location.search).has("preview");
  const [view, setView] = useState<View>(
    preview
      ? {
          state: "ready",
          name: "Maria",
          timezone: "Asia/Makassar",
          canManageRoles: false,
          canReadAudit: false,
          canImportSchedules: false,
          canManageServants: false,
        }
      : { state: "loading" },
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    async function loadIdentity() {
      setView((current) =>
        current.state === "ready" ? current : { state: "loading" },
      );
      try {
        const response = await fetch("/api/v1/me", {
          signal: controller.signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (response.status === 401 || response.status === 403) {
          setView({ state: "denied" });
          return;
        }
        if (!response.ok) throw new Error("Request failed");
        const identity = meResponseSchema.parse(await response.json());
        setView({
          state: "ready",
          name: identity.data.displayName,
          timezone: identity.data.timezone,
          canManageRoles:
            identity.data.permissions.includes("user.manage_role"),
          canReadAudit: identity.data.permissions.includes("audit.read"),
          canImportSchedules:
            identity.data.permissions.includes("import.schedule"),
          canManageServants: identity.data.permissions.includes(
            "servant.create_update",
          ),
        });
      } catch {
        if (!controller.signal.aborted) setView({ state: "error" });
      }
    }
    void loadIdentity();
    return () => controller.abort();
  }, [attempt, preview]);
  return (
    <>
      {view.state === "ready" ? (
        <ProductShell
          name={view.name}
          timezone={view.timezone}
          canManageRoles={view.canManageRoles}
          canReadAudit={view.canReadAudit}
          canImportSchedules={view.canImportSchedules}
          canManageServants={view.canManageServants}
          onAccessChanged={() => setAttempt((value) => value + 1)}
        />
      ) : (
        <>
          <header>
            <a
              className="brand"
              href="/"
              aria-label="Beranda Sistem Pelayanan Ibadah"
            >
              <Church aria-hidden="true" />
              <span>
                SPI<small>Sistem Pelayanan Ibadah</small>
              </span>
            </a>
            <span className="tag">
              <ShieldCheck size={16} aria-hidden="true" /> Akses pengurus
            </span>
          </header>
          <main>
            <p className="eyebrow">MELAYANI BERSAMA</p>
            <h1>
              Pelayanan yang tertata,
              <br />
              <em>ruang untuk sesama.</em>
            </h1>
            <p className="intro">
              Satu tempat untuk mempersiapkan ibadah dan mendukung setiap
              pelayan.
            </p>
            <section
              className="panel"
              aria-live="polite"
              aria-busy={view.state === "loading"}
            >
              {view.state === "loading" ? (
                <>
                  <LoaderCircle aria-hidden="true" className="spin" />
                  <h2>Memeriksa akses…</h2>
                  <p>Mohon tunggu sebentar.</p>
                </>
              ) : (
                <>
                  <LockKeyhole aria-hidden="true" />
                  <h2>
                    {view.state === "denied"
                      ? "Akses pengurus diperlukan"
                      : "Layanan belum dapat dihubungi"}
                  </h2>
                  <p>
                    {view.state === "denied"
                      ? "Buka aplikasi melalui akses resmi jemaat. Jika Anda belum memperoleh akses, hubungi administrator."
                      : "Periksa koneksi Anda, lalu coba kembali."}
                  </p>
                  <button onClick={() => setAttempt((value) => value + 1)}>
                    <RefreshCw size={18} aria-hidden="true" /> Periksa kembali
                  </button>
                </>
              )}
            </section>
            <aside>
              <span className="dot" aria-hidden="true" />
              <p>
                <strong>Tahap persiapan</strong>
                <br />
                Fitur jadwal dan penugasan belum tersedia.
              </p>
            </aside>
          </main>
          <footer>
            Sistem Pelayanan Ibadah{" "}
            <span>Dipakai bersama. Dikelola dengan tanggung jawab.</span>
          </footer>
        </>
      )}
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
