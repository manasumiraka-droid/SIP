import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";

type Servant = { id: string; displayName: string; status: string };
type DeliveryFailure = {
  id: string;
  servantName: string;
  attemptCount: number;
  errorCategory: string | null;
};

export function TelegramActivationPanel() {
  const [servants, setServants] = useState<Servant[]>([]);
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<DeliveryFailure[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [result, setResult] = useState<{
    servantId: string;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/servants?limit=100", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json() as Promise<{ data: Servant[] }>;
      })
      .then((payload) => setServants(payload.data))
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Daftar pelayan belum dapat dimuat.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    fetch("/api/v1/telegram-deliveries?limit=20", {
      signal: controller.signal,
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request failed");
        return response.json() as Promise<{ data: DeliveryFailure[] }>;
      })
      .then((payload) => setFailures(payload.data))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function createCode(servantId: string) {
    setActiveId(servantId);
    setMessage("");
    setResult(null);
    try {
      const response = await fetch(
        `/api/v1/servants/${encodeURIComponent(servantId)}/telegram-activation`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: "{}",
        },
      );
      if (!response.ok) throw new Error("Request failed");
      const payload = (await response.json()) as {
        data: { code: string; expiresAt: string };
      };
      setResult({ servantId, ...payload.data });
      setMessage(
        "Berikan kode hanya kepada pelayan yang dipilih. Kode tidak dapat dilihat kembali.",
      );
    } catch {
      setMessage("Kode aktivasi belum dapat dibuat. Silakan coba kembali.");
    } finally {
      setActiveId(null);
    }
  }
  return (
    <section className="telegram-panel" aria-labelledby="telegram-title">
      <div className="card-head">
        <div>
          <span className="card-icon lavender">
            <KeyRound aria-hidden="true" />
          </span>
          <h2 id="telegram-title">Aktivasi Telegram</h2>
        </div>
      </div>
      <p className="muted">
        Buat kode sekali pakai yang berlaku 15 menit dan maksimal lima
        percobaan.
      </p>
      {loading ? (
        <p className="preview-note">
          <LoaderCircle className="spin" aria-hidden="true" /> Memuat pelayan…
        </p>
      ) : servants.length === 0 ? (
        <p className="preview-note">Belum ada pelayan dalam cakupan Anda.</p>
      ) : (
        <div className="activation-list">
          {servants.map((servant) => (
            <div key={servant.id}>
              <span>
                <strong>{servant.displayName}</strong>
                <small>
                  {servant.status === "active" ? "Aktif" : "Belum aktif"}
                </small>
              </span>
              <button
                className="soft-action"
                disabled={servant.status !== "active" || activeId !== null}
                onClick={() => void createCode(servant.id)}
              >
                {activeId === servant.id ? "Membuat…" : "Buat kode"}
              </button>
            </div>
          ))}
        </div>
      )}
      {result ? (
        <div className="activation-code" role="status">
          <span>Kode aktivasi</span>
          <strong>{result.code}</strong>
          <small>
            Kedaluwarsa {new Date(result.expiresAt).toLocaleTimeString("id-ID")}
          </small>
        </div>
      ) : null}
      {message ? <p className="preview-note">{message}</p> : null}
      {failures.length ? (
        <div className="delivery-failures">
          <h3>Perlu tindak lanjut manual</h3>
          {failures.map((failure) => (
            <p key={failure.id}>
              <strong>{failure.servantName}</strong> · {failure.attemptCount}{" "}
              percobaan · {failure.errorCategory ?? "gagal"}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
