import { useState } from "react";
import readXlsxFile from "read-excel-file/browser";
type Preview = {
  batch: { id: string; status: string; sheet_name: string };
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    excluded: number;
    duplicates: number;
  };
  data: Array<{
    id: string;
    row_number: number;
    source_number: string | null;
    status: string;
    errors: string[];
    warnings: string[];
    proposed_action: string;
    duplicate_service_id: string | null;
    warnings_acknowledged_at: string | null;
    normalized: {
      date: string;
      location: string;
      preacher: string;
      mc: string;
      startsAt: string | null;
      candidates?: Partial<
        Record<
          "preacher" | "mc",
          Array<{ servantId: string; displayName: string }>
        >
      >;
    };
  }>;
};
type Mapping = Record<string, string | null>;
const importColumns = [
  "Nomor",
  "tanggal",
  "Tempat Kebaktian/Ibadah",
  "Pelayan Firman",
  "MC",
  "Pelayan Persembahan",
] as const;
const key = () => crypto.randomUUID();
export function ImportScheduleWizard() {
  const [file, setFile] = useState<File | null>(null),
    [batch, setBatch] = useState<string | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [servants, setServants] = useState<
      Array<{ id: string; displayName: string }>
    >([]),
    [headers, setHeaders] = useState<string[]>([]),
    [mapping, setMapping] = useState<Mapping>({}),
    [sheetNames, setSheetNames] = useState<string[]>([]),
    [selectedSheet, setSelectedSheet] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sheet", selectedSheet);
      const response = await fetch("/api/v1/imports/schedules", {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as {
        data: { id: string; headers: string[]; mapping: Mapping };
      };
      setBatch(body.data.id);
      setHeaders(body.data.headers);
      setMapping(body.data.mapping);
      setMessage(
        "File diterima. Konfirmasikan format tanggal sebelum validasi.",
      );
    } catch {
      setMessage(
        "File ditolak atau belum dapat diproses. Gunakan XLSX maksimal 5 MB.",
      );
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      let response = await fetch(
        `/api/v1/imports/schedules/${batch}/validate`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key(),
          },
          body: JSON.stringify({ mapping, dateFormat: "dmy" }),
        },
      );
      if (!response.ok) throw new Error();
      response = await fetch(
        `/api/v1/imports/schedules/${batch}/preview?limit=100`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error();
      setPreview(await response.json());
      const servantResponse = await fetch(
        `/api/v1/imports/schedules/${batch}/servants`,
        { credentials: "same-origin" },
      );
      if (servantResponse.ok)
        setServants(
          (
            (await servantResponse.json()) as {
              data: Array<{ id: string; displayName: string }>;
            }
          ).data,
        );
      setMessage(
        "Pratinjau siap. Error harus dikeluarkan atau diperbaiki sebelum commit.",
      );
    } catch {
      setMessage(
        "Validasi belum berhasil. Periksa mapping dan format tanggal.",
      );
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/imports/schedules/${batch}/commit`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key(),
          },
          body: "{}",
        },
      );
      if (!response.ok) throw new Error();
      setMessage(
        "Batch berhasil di-commit sebagai draf. Periksa hasil sebelum publikasi.",
      );
    } catch {
      setMessage("Commit diblokir: masih ada error atau batch sudah berubah.");
    } finally {
      setBusy(false);
    }
  };
  const exclude = async (rowId: string) => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/imports/schedules/${batch}/rows/${rowId}/exclude`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key(),
          },
          body: "{}",
        },
      );
      if (!response.ok) throw new Error();
      const refreshed = await fetch(
        `/api/v1/imports/schedules/${batch}/preview?limit=100`,
        { credentials: "same-origin" },
      );
      if (!refreshed.ok) throw new Error();
      setPreview(await refreshed.json());
      setMessage("Baris dikeluarkan dari batch dan tidak akan di-commit.");
    } catch {
      setMessage("Baris belum dapat dikeluarkan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };
  const link = async (
    rowId: string,
    field: "preacher" | "mc",
    servantId: string,
  ) => {
    if (!batch || !servantId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/imports/schedules/${batch}/rows/${rowId}/resolution`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key(),
          },
          body: JSON.stringify({ field, servantId }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Resolusi tersimpan. Jalankan validasi kembali.");
    } catch {
      setMessage("Resolusi belum tersimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };
  const createPending = async (rowId: string, field: "preacher" | "mc") => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/imports/schedules/${batch}/rows/${rowId}/pending`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key(),
          },
          body: JSON.stringify({ field }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage(
        "Profil pending review dibuat. Validasi ulang sebelum commit.",
      );
    } catch {
      setMessage("Profil pending review belum dapat dibuat.");
    } finally {
      setBusy(false);
    }
  };
  const review = async (
    rowId: string,
    change: {
      action?: "skip" | "merge_assignments" | "create_separate";
      acknowledgeWarnings?: true;
      startsAt?: string;
    },
  ) => {
    if (!batch) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/imports/schedules/${batch}/resolutions`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key(),
          },
          body: JSON.stringify({ rowId, ...change }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage("Perubahan baris tersimpan. Jalankan validasi kembali.");
    } catch {
      setMessage("Perubahan baris belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="import-wizard" aria-labelledby="import-title">
      <p className="eyebrow">IMPOR JADWAL</p>
      <h2 id="import-title">XLSX → mapping → pratinjau</h2>
      <p className="muted">
        Maks. 5 MB/5.000 baris. Zona tetap Asia/Makassar, default 17.00 WITA,
        dan nama jamak memakai titik koma.
      </p>
      <a
        className="template-download"
        href="/form-jadwal-ibadah.xlsx"
        download="form-jadwal-ibadah.xlsx"
      >
        Unduh form jadwal ibadah.xlsx
      </a>
      <label className="file-control">
        Pilih file XLSX
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setBatch(null);
            setPreview(null);
            setSheetNames([]);
            setSelectedSheet("");
            if (selected)
              void readXlsxFile(selected)
                .then((sheets) => {
                  const names = sheets.map((sheet) => sheet.sheet);
                  setSheetNames(names);
                  setSelectedSheet(names[0] ?? "");
                })
                .catch(() =>
                  setMessage("Daftar sheet tidak dapat dibaca dari file ini."),
                );
          }}
        />
      </label>
      {sheetNames.length ? (
        <label className="file-control">
          Sheet yang akan diimpor
          <select
            value={selectedSheet}
            onChange={(event) => setSelectedSheet(event.target.value)}
          >
            {sheetNames.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="preview-toolbar">
        <button
          className="soft-action"
          disabled={!file || !selectedSheet || busy}
          onClick={() => void upload()}
        >
          {busy ? "Memproses…" : "1. Upload"}
        </button>
        <button
          className="soft-action"
          disabled={!batch || busy}
          onClick={() => void validate()}
        >
          2. Validasi d/m/yyyy
        </button>
        <button
          className="primary-action"
          disabled={!preview || preview.batch.status !== "ready" || busy}
          onClick={() => void commit()}
        >
          3. Commit draf
        </button>
      </div>
      {batch ? (
        <fieldset className="import-mapping" disabled={busy}>
          <legend>2. Periksa pemetaan kolom</legend>
          {importColumns.map((target) => (
            <label key={target}>
              {target}
              <select
                value={mapping[target] ?? ""}
                onChange={(event) =>
                  setMapping((current) => ({
                    ...current,
                    [target]: event.target.value || null,
                  }))
                }
              >
                <option value="">Tidak dipetakan</option>
                {headers.map((header) => (
                  <option value={header} key={header}>
                    {header}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      ) : null}
      {message ? (
        <p className="preview-note" role="status">
          {message}
        </p>
      ) : null}
      {preview ? (
        <>
          <p className="preview-note">
            Total {preview.summary.total} · valid {preview.summary.valid} ·
            warning {preview.summary.warnings} · error {preview.summary.errors}{" "}
            · duplikat {preview.summary.duplicates} · dikeluarkan{" "}
            {preview.summary.excluded}
          </p>
          <div className="preview-list">
            {preview.data.map((row) => (
              <article key={row.row_number}>
                <span
                  className={`list-icon ${row.status === "error" ? "warn" : ""}`}
                >
                  {row.row_number}
                </span>
                <div>
                  <strong>
                    {row.normalized.date || "Tanggal tidak valid"} ·{" "}
                    {row.normalized.location || "Lokasi kosong"}
                  </strong>
                  <p>
                    {row.normalized.preacher || "Pelayan Firman belum diisi"} ·{" "}
                    {row.status} ·{" "}
                    {row.normalized.startsAt
                      ? new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Makassar",
                        }).format(new Date(row.normalized.startsAt))
                      : "waktu belum valid"}{" "}
                    WITA
                  </p>
                  {[...row.errors, ...row.warnings].join(", ")}
                  {row.normalized.candidates?.preacher?.length ? (
                    <p className="muted">
                      Kandidat nama:{" "}
                      {row.normalized.candidates.preacher
                        .map((candidate) => candidate.displayName)
                        .join(", ")}
                      . Pilih manual untuk mengonfirmasi.
                    </p>
                  ) : null}
                  {row.status === "error" && row.normalized.preacher ? (
                    <>
                      <label className="resolution-select">
                        Tautkan Pelayan Firman
                        <select
                          defaultValue=""
                          disabled={busy}
                          onChange={(event) =>
                            void link(row.id, "preacher", event.target.value)
                          }
                        >
                          <option value="">Pilih pelayan aktif</option>
                          {servants.map((servant) => (
                            <option value={servant.id} key={servant.id}>
                              {servant.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="soft-action"
                        disabled={busy}
                        onClick={() => void createPending(row.id, "preacher")}
                      >
                        Buat profil pending review
                      </button>
                    </>
                  ) : null}
                  {row.status === "error" && row.normalized.mc ? (
                    <>
                      <label className="resolution-select">
                        Tautkan MC
                        <select
                          defaultValue=""
                          disabled={busy}
                          onChange={(event) =>
                            void link(row.id, "mc", event.target.value)
                          }
                        >
                          <option value="">Pilih pelayan aktif</option>
                          {servants.map((servant) => (
                            <option value={servant.id} key={servant.id}>
                              {servant.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="soft-action"
                        disabled={busy}
                        onClick={() => void createPending(row.id, "mc")}
                      >
                        Buat MC pending review
                      </button>
                    </>
                  ) : null}
                  {row.duplicate_service_id ? (
                    <label className="resolution-select">
                      Aksi jadwal duplikat
                      <select
                        value={row.proposed_action}
                        disabled={busy}
                        onChange={(event) =>
                          void review(row.id, {
                            action: event.target.value as
                              "skip" | "merge_assignments" | "create_separate",
                          })
                        }
                      >
                        <option value="skip">Lewati (default)</option>
                        <option value="merge_assignments">
                          Gabungkan slot kosong
                        </option>
                        <option value="create_separate">
                          Buat jadwal terpisah
                        </option>
                      </select>
                    </label>
                  ) : null}
                  <label className="resolution-select">
                    Override mulai (WITA)
                    <input
                      type="datetime-local"
                      disabled={busy}
                      onChange={(event) => {
                        if (event.target.value)
                          void review(row.id, {
                            startsAt: new Date(
                              `${event.target.value}:00+08:00`,
                            ).toISOString(),
                          });
                      }}
                    />
                  </label>
                  {row.status === "warning" && !row.warnings_acknowledged_at ? (
                    <button
                      className="soft-action"
                      disabled={busy}
                      onClick={() =>
                        void review(row.id, { acknowledgeWarnings: true })
                      }
                    >
                      Saya memahami warning
                    </button>
                  ) : null}
                  {row.status === "error" ? (
                    <button
                      className="row-exclude"
                      disabled={busy}
                      onClick={() => void exclude(row.id)}
                    >
                      Keluarkan baris ini
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
