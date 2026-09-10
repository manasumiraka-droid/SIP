import { useEffect, useRef, useState } from "react";
import { roles, type Role } from "../../../packages/domain/src/access";
import {
  usersResponseSchema,
  type ManagedUser,
} from "../../../packages/validation/src/users";
import { z } from "zod";
import { roleLabels } from "./role-labels";
import { CreateUserForm } from "./CreateUserForm";
import { AccountStatusForm } from "./AccountStatusForm";
const errorSchema = z.object({ error: z.object({ code: z.string() }) });
export function UserAccess({
  onAccessChanged,
}: {
  onAccessChanged: () => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [chosen, setChosen] = useState<Role[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusUser, setStatusUser] = useState<ManagedUser | null>(null);
  const pending = useRef(false);
  const submission = useRef<{ signature: string; key: string } | null>(null);
  async function load(next?: string) {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/users${next ? `?cursor=${encodeURIComponent(next)}` : ""}`,
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403)
          onAccessChanged();
        throw new Error("Read failed");
      }
      const result = usersResponseSchema.parse(await response.json());
      setUsers((current) =>
        next ? [...current, ...result.data] : result.data,
      );
      setCursor(result.next_cursor);
    } catch {
      setMessage("Daftar pengguna belum dapat dimuat. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit(user: ManagedUser) {
    setSelected(user);
    setChosen(user.roles);
    setConfirming(false);
    setConflicted(false);
    setMessage("");
    submission.current = null;
  }
  async function save() {
    if (!selected || pending.current || conflicted) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    const body = JSON.stringify({
      roles: [...chosen].sort(),
      version: selected.version,
    });
    const signature = `${selected.id}:${body}`;
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    try {
      const response = await fetch(
        `/api/v1/users/${encodeURIComponent(selected.id)}/roles`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": submission.current.key,
            "If-Match": `"${selected.version}"`,
          },
          body,
        },
      );
      if (!response.ok) {
        const error = errorSchema.safeParse(await response.json());
        const code = error.success ? error.data.error.code : "";
        if (code === "VERSION_CONFLICT") {
          setConflicted(true);
          setMessage(
            "Data berubah saat Anda mengedit. Muat ulang pengguna sebelum melanjutkan.",
          );
        } else if (response.status === 409)
          setMessage(
            "Perubahan tidak dapat diterapkan. Pertahankan minimal satu Super Admin aktif, atau muat ulang data.",
          );
        else if (response.status === 429)
          setMessage("Terlalu banyak perubahan. Coba lagi dalam satu menit.");
        else if (response.status === 401 || response.status === 403) {
          setMessage("Akses Anda berubah. Periksa kembali akses akun.");
          onAccessChanged();
        } else setMessage("Perubahan belum tersimpan. Silakan coba lagi.");
        return;
      }
      setSelected(null);
      setConfirming(false);
      submission.current = null;
      await load();
      setMessage("Peran pengguna berhasil diperbarui.");
      onAccessChanged();
    } catch {
      setMessage(
        "Hasil penyimpanan belum dapat dipastikan. Coba simpan kembali dengan pilihan yang sama.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="access-panel" aria-labelledby="access-heading">
      <h2 id="access-heading">Akses pengguna</h2>
      <p>
        Atur peran sesuai tanggung jawab pelayanan. Koordinator tetap memerlukan
        cakupan tugas yang ditetapkan.
      </p>
      <p role="status">{message || (loading ? "Memuat pengguna…" : "")}</p>
      {creating && (
        <CreateUserForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await load();
            setMessage("Akun pengurus berhasil dibuat.");
          }}
          onAccessChanged={onAccessChanged}
        />
      )}
      {statusUser && (
        <AccountStatusForm
          user={statusUser}
          onCancel={() => setStatusUser(null)}
          onAccessChanged={onAccessChanged}
          onSaved={async () => {
            setStatusUser(null);
            await load();
            setMessage("Status akun berhasil diperbarui.");
            onAccessChanged();
          }}
        />
      )}
      {!selected && !creating && !statusUser && (
        <>
          <button
            disabled={loading}
            onClick={() => {
              setCreating(true);
              setMessage("");
            }}
          >
            Tambah pengurus
          </button>
          <button disabled={loading} onClick={() => void load()}>
            Muat ulang pengguna
          </button>
          {!loading && users.length === 0 && !message && (
            <p>Belum ada pengguna untuk ditampilkan.</p>
          )}
          <ul className="user-list">
            {users.map((user) => (
              <li key={user.id}>
                <div>
                  <strong>{user.displayName}</strong>
                  <p>
                    {user.roles.map((role) => roleLabels[role]).join(", ") ||
                      "Tanpa peran"}
                  </p>
                  <small>
                    {user.status === "active"
                      ? "Aktif"
                      : user.status === "suspended"
                        ? "Ditangguhkan"
                        : "Nonaktif"}
                  </small>
                </div>
                <button
                  onClick={() => edit(user)}
                  aria-label={`Atur peran ${user.displayName}`}
                >
                  Atur peran
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setStatusUser(user);
                    setMessage("");
                  }}
                  aria-label={`Ubah status ${user.displayName}`}
                >
                  Ubah status
                </button>
              </li>
            ))}
          </ul>
          {cursor && (
            <button disabled={loading} onClick={() => void load(cursor)}>
              Muat pengguna berikutnya
            </button>
          )}
        </>
      )}
      {selected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
        >
          <h3>Peran untuk {selected.displayName}</h3>
          <fieldset disabled={saving || confirming || conflicted}>
            <legend>Pilih satu atau beberapa peran</legend>
            {roles.map((role) => (
              <label className="role-option" key={role}>
                <input
                  type="checkbox"
                  checked={chosen.includes(role)}
                  onChange={(event) =>
                    setChosen((current) =>
                      event.target.checked
                        ? [...current, role]
                        : current.filter((value) => value !== role),
                    )
                  }
                />
                {roleLabels[role]}
              </label>
            ))}
          </fieldset>
          {confirming && (
            <div className="confirmation">
              <h3>Konfirmasi perubahan akses</h3>
              <p>
                Peran baru:{" "}
                {chosen.map((role) => roleLabels[role]).join(", ") ||
                  "Tanpa peran. Pengguna tidak dapat mengakses aplikasi."}
              </p>
              <p>
                Perubahan berlaku pada permintaan berikutnya dan dicatat dalam
                riwayat audit.
              </p>
              <button
                type="button"
                disabled={saving || conflicted}
                onClick={() => void save()}
              >
                {saving ? "Menyimpan…" : "Konfirmasi dan simpan"}
              </button>
            </div>
          )}
          {!confirming && (
            <button type="submit" disabled={saving || conflicted}>
              Tinjau perubahan
            </button>
          )}
          <button
            className="secondary"
            type="button"
            disabled={saving}
            onClick={() => {
              setSelected(null);
              setConfirming(false);
              void load();
            }}
          >
            Kembali ke daftar
          </button>
        </form>
      )}
    </section>
  );
}
