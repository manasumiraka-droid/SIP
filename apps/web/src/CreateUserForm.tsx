import { useRef, useState } from "react";
import { z } from "zod";
import { roles, type Role } from "../../../packages/domain/src/access";
import {
  createUserSchema,
  createdUserResponseSchema,
  type CreateUser,
} from "../../../packages/validation/src/users";
import { roleLabels } from "./role-labels";
export function CreateUserForm({
  onCreated,
  onCancel,
  onAccessChanged,
}: {
  onCreated: () => Promise<void>;
  onCancel: () => void;
  onAccessChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [chosen, setChosen] = useState<Role[]>([]);
  const [review, setReview] = useState<CreateUser | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const receipt = useRef<{ signature: string; key: string } | null>(null);
  function inspect() {
    const result = createUserSchema.safeParse({
      displayName: name,
      email,
      roles: chosen,
    });
    if (!result.success) {
      const next: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = String(issue.path[0]);
        next[field] =
          field === "email"
            ? "Masukkan email yang valid, maksimal 254 karakter."
            : field === "displayName"
              ? "Isi nama yang valid, maksimal 120 karakter."
              : "Pilih minimal satu peran pengurus.";
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setMessage("");
    setReview(result.data);
  }
  async function save() {
    if (!review || pending.current) return;
    pending.current = true;
    setSaving(true);
    setMessage("");
    const body = JSON.stringify({ ...review, roles: [...review.roles].sort() });
    if (receipt.current?.signature !== body)
      receipt.current = { signature: body, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": receipt.current.key,
        },
        body,
      });
      if (!response.ok) {
        if (response.status === 409)
          setMessage(
            "Akun belum dapat dibuat. Email mungkin sudah terdaftar atau data permintaan telah berubah. Periksa daftar pengguna.",
          );
        else if (response.status === 401 || response.status === 403) {
          setMessage("Akses Anda tidak lagi mengizinkan pembuatan akun.");
          onAccessChanged();
        } else if (response.status === 429)
          setMessage("Terlalu banyak perubahan. Coba lagi dalam satu menit.");
        else
          setMessage(
            "Akun belum dapat dibuat. Periksa isian dan coba kembali.",
          );
        return;
      }
      createdUserResponseSchema.parse(await response.json());
      await onCreated();
    } catch (error) {
      setMessage(
        error instanceof z.ZodError
          ? "Jawaban layanan belum dapat diverifikasi. Periksa daftar pengguna sebelum mencoba kembali."
          : "Hasil penyimpanan belum dapat dipastikan. Coba kembali dengan isian yang sama.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <form
      className="create-user-form"
      onSubmit={(event) => {
        event.preventDefault();
        inspect();
      }}
      noValidate
    >
      <h3>Tambah akun pengurus</h3>
      <p>
        Akun dibuat aktif dengan peran yang Anda pilih. Email juga harus
        diizinkan pada akses masuk resmi jemaat.
      </p>
      <fieldset disabled={saving || review !== null}>
        <legend>Identitas pengurus</legend>
        <label htmlFor="new-user-name">Nama tampilan</label>
        <input
          id="new-user-name"
          autoComplete="name"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby="new-name-error"
        />
        <p id="new-name-error" className="field-error">
          {errors.displayName}
        </p>
        <label htmlFor="new-user-email">Email akses</label>
        <input
          id="new-user-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby="new-email-error"
        />
        <p id="new-email-error" className="field-error">
          {errors.email}
        </p>
        <fieldset>
          <legend>Peran awal</legend>
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
          <p className="field-error" role="status">
            {errors.roles}
          </p>
        </fieldset>
      </fieldset>
      <p role="status">{message}</p>
      {review ? (
        <div className="confirmation">
          <h3>Konfirmasi akun baru</h3>
          <p>
            {review.displayName}
            <br />
            {review.email}
          </p>
          <p>
            Peran: {review.roles.map((role) => roleLabels[role]).join(", ")}
          </p>
          <p>
            Pastikan email milik pengurus yang dimaksud. Pembuatan akun dicatat
            dalam audit.
          </p>
          <button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Membuat akun…" : "Konfirmasi buat akun"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={() => {
              setReview(null);
              setMessage("");
            }}
          >
            Perbaiki isian
          </button>
        </div>
      ) : (
        <button type="submit">Tinjau akun baru</button>
      )}
      <button
        type="button"
        className="secondary"
        disabled={saving}
        onClick={onCancel}
      >
        Batal tambah pengurus
      </button>
    </form>
  );
}
