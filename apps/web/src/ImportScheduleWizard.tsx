import { useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import { importColumns } from "../../../packages/validation/src/imports";
import {
  IMPORT_MESSAGES,
  commitSchedule,
  createPendingServant,
  excludeRow,
  fetchPreview,
  fetchServants,
  linkServant,
  reviewRow,
  uploadSchedule,
  validateSchedule,
  type ImportMapping as Mapping,
  type ImportPreview as Preview,
  type ImportReviewChange as ReviewChange,
  type ImportServant as Servant,
} from "./import-client";
type PreviewRowData = Preview["data"][number];
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
      const result = await uploadSchedule(file, selectedSheet);
      setBatch(result.id);
      setHeaders(result.headers);
      setMapping(result.mapping);
      setMessage(IMPORT_MESSAGES.uploaded);
    } catch {
      setMessage(IMPORT_MESSAGES.uploadFailed);
    } finally {
      setBusy(false);
    }
  };
  const validate = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      await validateSchedule(batch, mapping);
      setPreview(await fetchPreview(batch));
      setServants(await fetchServants(batch));
      setMessage(IMPORT_MESSAGES.validated);
    } catch {
      setMessage(IMPORT_MESSAGES.validateFailed);
    } finally {
      setBusy(false);
    }
  };
  const commit = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      await commitSchedule(batch);
      setMessage(IMPORT_MESSAGES.committed);
    } catch {
      setMessage(IMPORT_MESSAGES.commitFailed);
    } finally {
      setBusy(false);
    }
  };
  const exclude = async (rowId: string) => {
    if (!batch) return;
    setBusy(true);
    try {
      await excludeRow(batch, rowId);
      setPreview(await fetchPreview(batch));
      setMessage(IMPORT_MESSAGES.excluded);
    } catch {
      setMessage(IMPORT_MESSAGES.excludeFailed);
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
      await linkServant(batch, rowId, field, servantId);
      setMessage(IMPORT_MESSAGES.linked);
    } catch {
      setMessage(IMPORT_MESSAGES.linkFailed);
    } finally {
      setBusy(false);
    }
  };
  const createPending = async (rowId: string, field: "preacher" | "mc") => {
    if (!batch) return;
    setBusy(true);
    try {
      await createPendingServant(batch, rowId, field);
      setMessage(IMPORT_MESSAGES.pendingCreated);
    } catch {
      setMessage(IMPORT_MESSAGES.pendingFailed);
    } finally {
      setBusy(false);
    }
  };
  const review = async (rowId: string, change: ReviewChange) => {
    if (!batch) return;
    setBusy(true);
    try {
      await reviewRow(batch, rowId, change);
      setMessage(IMPORT_MESSAGES.reviewed);
    } catch {
      setMessage(IMPORT_MESSAGES.reviewFailed);
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
              <PreviewRow
                key={row.row_number}
                row={row}
                servants={servants}
                busy={busy}
                onLink={link}
                onCreatePending={createPending}
                onReview={review}
                onExclude={exclude}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
/** Builds the "Tautkan <role>" label, select, and pending-review button. */
function ResolutionSelect({
  rowId,
  field,
  label,
  buttonLabel,
  servants,
  busy,
  onLink,
  onCreatePending,
}: {
  rowId: string;
  field: "preacher" | "mc";
  label: string;
  buttonLabel: string;
  servants: Servant[];
  busy: boolean;
  onLink: (rowId: string, field: "preacher" | "mc", servantId: string) => void;
  onCreatePending: (rowId: string, field: "preacher" | "mc") => void;
}) {
  return (
    <>
      <label className="resolution-select">
        {label}
        <select
          defaultValue=""
          disabled={busy}
          onChange={(event) => onLink(rowId, field, event.target.value)}
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
        onClick={() => onCreatePending(rowId, field)}
      >
        {buttonLabel}
      </button>
    </>
  );
}

function PreviewRow({
  row,
  servants,
  busy,
  onLink,
  onCreatePending,
  onReview,
  onExclude,
}: {
  row: PreviewRowData;
  servants: Servant[];
  busy: boolean;
  onLink: (rowId: string, field: "preacher" | "mc", servantId: string) => void;
  onCreatePending: (rowId: string, field: "preacher" | "mc") => void;
  onReview: (rowId: string, change: ReviewChange) => void;
  onExclude: (rowId: string) => void;
}) {
  const roleControls = (
    [
      ["preacher", "Tautkan Pelayan Firman", "Buat profil pending review"],
      ["mc", "Tautkan MC", "Buat MC pending review"],
    ] as const
  ).map(([field, label, buttonLabel]) =>
    row.status === "error" && row.normalized[field] ? (
      <ResolutionSelect
        key={field}
        rowId={row.id}
        field={field}
        label={label}
        buttonLabel={buttonLabel}
        servants={servants}
        busy={busy}
        onLink={onLink}
        onCreatePending={onCreatePending}
      />
    ) : null,
  );

  return (
    <article>
      <span className={`list-icon ${row.status === "error" ? "warn" : ""}`}>
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
        {roleControls}
        {row.duplicate_service_id ? (
          <label className="resolution-select">
            Aksi jadwal duplikat
            <select
              value={row.proposed_action}
              disabled={busy}
              onChange={(event) =>
                onReview(row.id, {
                  action: event.target.value as
                    "skip" | "merge_assignments" | "create_separate",
                })
              }
            >
              <option value="skip">Lewati (default)</option>
              <option value="merge_assignments">Gabungkan slot kosong</option>
              <option value="create_separate">Buat jadwal terpisah</option>
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
                onReview(row.id, {
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
            onClick={() => onReview(row.id, { acknowledgeWarnings: true })}
          >
            Saya memahami warning
          </button>
        ) : null}
        {row.status === "error" ? (
          <button
            className="row-exclude"
            disabled={busy}
            onClick={() => onExclude(row.id)}
          >
            Keluarkan baris ini
          </button>
        ) : null}
      </div>
    </article>
  );
}
