import { useRef, useState } from "react";
import type { ManagedUser } from "../../../packages/validation/src/users";
const labels = {
  active: "Aktif",
  inactive: "Nonaktif",
  suspended: "Ditangguhkan",
} as const;
export function AccountStatusForm({
  user,
  onCancel,
  onSaved,
  onAccessChanged,
}: {
  user: ManagedUser;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onAccessChanged: () => void;
}) {
  const [status, setStatus] = useState<ManagedUser["status"]>(user.status);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  async function save() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    const body = JSON.stringify({ status, version: user.version });
    if (receipt.current?.signature !== body)
      receipt.current = { signature: body, key: crypto.randomUUID() };
    try {
      const response = await fetch(
        `/api/v1/users/${encodeURIComponent(user.id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": receipt.current.key,
            "If-Match": `"${user.version}"`,
          },
          body,
        },
      );
      if (!response.ok) {
        if (response.status === 409)
          setMessage(
            "Status tidak dapat diubah. Data mungkin telah berubah atau akun ini adalah Super Admin aktif terakhir. Muat ulang daftar.",
          );
        else if (response.status === 401 || response.status === 403) {
          setMessage("Akses Anda berubah. Periksa kembali akun.");
          onAccessChanged();
        } else if (response.status === 429)
          setMessage("Terlalu banyak perubahan. Coba lagi dalam satu menit.");
        else setMessage("Status belum tersimpan. Silakan coba lagi.");
        return;
      }
      receipt.current = null;
      await onSaved();
    } catch {
      setMessage(
        "Hasil penyimpanan belum dapat dipastikan. Coba kembali dengan pilihan yang sama.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setConfirming(true);
      }}
    >
      <h3>Status akun {user.displayName}</h3>
      <p>
        Pengguna nonaktif atau ditangguhkan langsung kehilangan seluruh akses
        pada permintaan berikutnya.
      </p>
      <fieldset disabled={saving || confirming}>
        <legend>Pilih status</legend>
        {(["active", "inactive", "suspended"] as const).map((value) => (
          <label className="role-option" key={value}>
            <input
              type="radio"
              name="account-status"
              checked={status === value}
              onChange={() => setStatus(value)}
            />
            {labels[value]}
          </label>
        ))}
      </fieldset>
      <p role="status">{message}</p>
      {confirming ? (
        <div className="confirmation">
          <h3>Konfirmasi perubahan status</h3>
          <p>Status baru: {labels[status]}</p>
          <p>Perubahan akses berlaku segera dan dicatat dalam audit.</p>
          <button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Menyimpan…" : "Konfirmasi dan simpan"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => setConfirming(false)}
          >
            Perbaiki pilihan
          </button>
        </div>
      ) : (
        <button type="submit" disabled={status === user.status}>
          Tinjau perubahan status
        </button>
      )}
      <button
        type="button"
        className="secondary"
        disabled={saving}
        onClick={onCancel}
      >
        Kembali ke daftar
      </button>
    </form>
  );
}
