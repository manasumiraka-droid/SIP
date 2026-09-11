export type ImportMapping = Record<string, string | null>;
export type ImportServant = { id: string; displayName: string };
export type ImportAction = "skip" | "merge_assignments" | "create_separate";
export type ImportReviewChange = {
  action?: ImportAction;
  acknowledgeWarnings?: true;
  startsAt?: string;
};
export type ImportCandidate = { servantId: string; displayName: string };
export type ImportPreviewRow = {
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
    locationNormalized?: string;
    candidates?: Partial<Record<"preacher" | "mc", ImportCandidate[]>>;
  };
};
export type ImportPreview = {
  batch: { id: string; status: string; sheet_name: string; version?: number };
  summary: {
    total: number;
    valid: number;
    warnings: number;
    errors: number;
    excluded: number;
    duplicates: number;
    [key: string]: number;
  };
  data: ImportPreviewRow[];
};

export const IMPORT_MESSAGES = {
  uploaded: "File diterima. Konfirmasikan format tanggal sebelum validasi.",
  uploadFailed:
    "File ditolak atau belum dapat diproses. Gunakan XLSX maksimal 5 MB.",
  validated:
    "Pratinjau siap. Error harus dikeluarkan atau diperbaiki sebelum commit.",
  validateFailed:
    "Validasi belum berhasil. Periksa mapping dan format tanggal.",
  committed:
    "Batch berhasil di-commit sebagai draf. Periksa hasil sebelum publikasi.",
  commitFailed: "Commit diblokir: masih ada error atau batch sudah berubah.",
  excluded: "Baris dikeluarkan dari batch dan tidak akan di-commit.",
  excludeFailed: "Baris belum dapat dikeluarkan. Coba lagi.",
  linked: "Resolusi tersimpan. Jalankan validasi kembali.",
  linkFailed: "Resolusi belum tersimpan. Coba lagi.",
  pendingCreated:
    "Profil pending review dibuat. Validasi ulang sebelum commit.",
  pendingFailed: "Profil pending review belum dapat dibuat.",
  reviewed: "Perubahan baris tersimpan. Jalankan validasi kembali.",
  reviewFailed: "Perubahan baris belum dapat disimpan.",
} as const;

/** Sends a JSON mutation with the idempotency key the import API requires. */
async function sendJson(method: "POST" | "PUT", path: string, body: unknown) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`${method} ${path} failed`);
  return response;
}

/** Fetches the current preview page for a batch. */
export async function fetchPreview(batch: string, limit = 100) {
  const response = await fetch(
    `/api/v1/imports/schedules/${batch}/preview?limit=${limit}`,
    { credentials: "same-origin" },
  );
  if (!response.ok) throw new Error("preview failed");
  return (await response.json()) as ImportPreview;
}

/** Fetches the active servants offered as resolution targets. */
export async function fetchServants(batch: string) {
  const response = await fetch(`/api/v1/imports/schedules/${batch}/servants`, {
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("servants failed");
  return ((await response.json()) as { data: ImportServant[] }).data;
}

/** Uploads an XLSX workbook and returns the created batch metadata. */
export async function uploadSchedule(
  file: File,
  sheet: string,
): Promise<{ id: string; headers: string[]; mapping: ImportMapping }> {
  const form = new FormData();
  form.set("file", file);
  form.set("sheet", sheet);
  const response = await fetch("/api/v1/imports/schedules", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  if (!response.ok) throw new Error("upload failed");
  const body = (await response.json()) as {
    data: { id: string; headers: string[]; mapping: ImportMapping };
  };
  return body.data;
}

/** Validates the batch mapping and date format. */
export async function validateSchedule(
  batch: string,
  mapping: ImportMapping,
  dateFormat: "dmy" | "mdy" = "dmy",
) {
  await sendJson("POST", `/api/v1/imports/schedules/${batch}/validate`, {
    mapping,
    dateFormat,
  });
}

/** Commits a fully-validated batch as draft services. */
export async function commitSchedule(batch: string) {
  await sendJson("POST", `/api/v1/imports/schedules/${batch}/commit`, {});
}

/** Excludes a single row from the batch. */
export async function excludeRow(batch: string, rowId: string) {
  await sendJson(
    "PUT",
    `/api/v1/imports/schedules/${batch}/rows/${rowId}/exclude`,
    {},
  );
}

/** Links a row's role slot to an existing servant. */
export async function linkServant(
  batch: string,
  rowId: string,
  field: "preacher" | "mc",
  servantId: string,
) {
  await sendJson(
    "PUT",
    `/api/v1/imports/schedules/${batch}/rows/${rowId}/resolution`,
    { field, servantId },
  );
}

/** Creates a pending-review servant profile for an unresolved name. */
export async function createPendingServant(
  batch: string,
  rowId: string,
  field: "preacher" | "mc",
) {
  await sendJson(
    "POST",
    `/api/v1/imports/schedules/${batch}/rows/${rowId}/pending`,
    { field },
  );
}

/** Saves a row-level review change (action, warning ack, or time override). */
export async function reviewRow(
  batch: string,
  rowId: string,
  change: ImportReviewChange,
) {
  await sendJson("PUT", `/api/v1/imports/schedules/${batch}/resolutions`, {
    rowId,
    ...change,
  });
}
