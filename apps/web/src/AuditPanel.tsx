import { useEffect, useState } from "react";
import {
  auditResponseSchema,
  type auditEntrySchema,
} from "../../../packages/validation/src/audit";
import type { z } from "zod";
type AuditEntry = z.infer<typeof auditEntrySchema>;
const actionLabels: Record<string, string> = {
  "identity.read": "Identitas dibaca",
  "user.create": "Akun dibuat",
  "user.roles.replace": "Peran diperbarui",
  "user.status.replace": "Status akun diperbarui",
  "organization.bootstrap": "Organisasi disiapkan",
};
export function AuditPanel({
  onAccessChanged,
  timezone,
}: {
  onAccessChanged: () => void;
  timezone: string;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  async function load(next?: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/audit-logs${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          onAccessChanged();
        throw new Error("Audit read failed");
      }
      const result = auditResponseSchema.parse(await response.json());
      setEntries((current) =>
        next ? [...current, ...result.data] : result.data,
      );
      setCursor(result.next_cursor);
    } catch {
      setMessage("Riwayat audit belum dapat dimuat. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section
      className="access-panel audit-panel"
      aria-labelledby="audit-heading"
    >
      <h2 id="audit-heading">Riwayat audit</h2>
      <p>
        Perubahan akses terbaru dalam jemaat. Isi pribadi tidak ditampilkan di
        sini.
      </p>
      <p role="status">{message || (loading ? "Memuat riwayat…" : "")}</p>
      {!loading && entries.length === 0 && !message && (
        <p>Belum ada perubahan yang tercatat.</p>
      )}
      <ol>
        {entries.map((entry) => (
          <li key={entry.id}>
            <strong>
              {actionLabels[entry.action] ?? "Aktivitas operasional"}
            </strong>
            <span>
              {new Intl.DateTimeFormat("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: timezone,
              }).format(new Date(entry.createdAt))}
            </span>
            <small>Referensi permintaan: {entry.requestId}</small>
          </li>
        ))}
      </ol>
      {cursor && (
        <button disabled={loading} onClick={() => void load(cursor)}>
          Muat riwayat berikutnya
        </button>
      )}
      <button
        className="secondary"
        disabled={loading}
        onClick={() => void load()}
      >
        Muat ulang riwayat
      </button>
    </section>
  );
}
