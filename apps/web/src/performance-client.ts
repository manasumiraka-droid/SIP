import type {
  AttendanceStatus,
  NoteCategory,
  ServiceNoteSummary,
} from "../../../packages/domain/src/performance";

export type { AttendanceStatus, NoteCategory, ServiceNoteSummary };

export type AttendanceItem = {
  id: string;
  organizationId: string;
  serviceId: string;
  assignmentId: string;
  servantId: string;
  servantName: string;
  roleCode: string;
  roleName: string;
  assignmentStatus: string;
  attendanceStatus: AttendanceStatus;
  checkinTime: string | null;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
};

export type OrganizationReportData = {
  summary: {
    totalServices: number;
    completedServices: number;
    totalAssignments: number;
    acceptedAssignments: number;
    confirmationRate: number;
    attendanceRate: number;
    attendanceBreakdown: {
      present: number;
      late: number;
      absent: number;
      replaced: number;
    };
    incidentCount: number;
    criticalIncidentCount: number;
  };
  workloadDistribution: {
    minAssignments: number;
    maxAssignments: number;
    avgAssignments: number;
    servantsCount: number;
    unassignedSlots: number;
  };
  roleBreakdown: Array<{
    roleCode: string;
    roleName: string;
    totalAssignments: number;
  }>;
};

export type ServantReportData = {
  servantId: string;
  displayName: string;
  totalAssignments: number;
  acceptedAssignments: number;
  confirmationRate: number;
  attendanceRate: number;
  attendanceBreakdown: {
    present: number;
    late: number;
    absent: number;
    replaced: number;
  };
  backupDutiesAccepted: number;
  rolesServed: Array<{
    roleCode: string;
    roleName: string;
    count: number;
  }>;
};

export async function fetchServiceAttendance(
  serviceId: string,
): Promise<AttendanceItem[]> {
  const response = await fetch(
    `/api/v1/services/${encodeURIComponent(serviceId)}/attendance`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error("Gagal memuat data presensi ibadah.");
  const payload = (await response.json()) as { data: AttendanceItem[] };
  return payload.data ?? [];
}

export async function submitServiceAttendance(
  serviceId: string,
  items: Array<{
    assignmentId: string;
    servantId: string;
    status: AttendanceStatus;
    checkinTime?: string | null;
    notes?: string | null;
  }>,
): Promise<{ recordedCount: number }> {
  const response = await fetch(
    `/api/v1/services/${encodeURIComponent(serviceId)}/attendance`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ items }),
    },
  );
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      errorBody.error?.message ?? "Gagal menyimpan presensi kehadiran.",
    );
  }
  return (await response.json()) as { recordedCount: number };
}

export async function fetchOrganizationReport(query?: {
  startDate?: string;
  endDate?: string;
}): Promise<OrganizationReportData> {
  const params = new URLSearchParams();
  if (query?.startDate) params.set("startDate", query.startDate);
  if (query?.endDate) params.set("endDate", query.endDate);

  const url = `/api/v1/reports/organization${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error("Gagal memuat rekapitulasi kinerja organisasi.");
  const payload = (await response.json()) as { data: OrganizationReportData };
  return payload.data;
}

export async function fetchServantReport(
  servantId: string,
): Promise<ServantReportData> {
  const response = await fetch(
    `/api/v1/reports/servants/${encodeURIComponent(servantId)}`,
    {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  );
  if (!response.ok) throw new Error("Gagal memuat statistik pelayan.");
  const payload = (await response.json()) as { data: ServantReportData };
  return payload.data;
}

export async function fetchNotes(filter?: {
  serviceId?: string;
  servantId?: string;
  category?: NoteCategory;
}): Promise<ServiceNoteSummary[]> {
  const params = new URLSearchParams();
  if (filter?.serviceId) params.set("serviceId", filter.serviceId);
  if (filter?.servantId) params.set("servantId", filter.servantId);
  if (filter?.category) params.set("category", filter.category);

  const url = `/api/v1/notes${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Gagal memuat daftar catatan pelayanan.");
  const payload = (await response.json()) as { data: ServiceNoteSummary[] };
  return payload.data ?? [];
}

export async function createNote(data: {
  category: NoteCategory;
  title: string;
  content: string;
  serviceId?: string | null;
  servantId?: string | null;
  grantedUserIds?: string[];
}): Promise<{ id: string }> {
  const response = await fetch("/api/v1/notes", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(
      errorBody.error?.message ?? "Gagal menyimpan catatan pelayanan.",
    );
  }
  return (await response.json()) as { id: string };
}

export async function downloadAttendanceCsv(query?: {
  startDate?: string;
  endDate?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  if (query?.startDate) params.set("startDate", query.startDate);
  if (query?.endDate) params.set("endDate", query.endDate);

  const url = `/api/v1/reports/export${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Gagal mengunduh file ekspor CSV.");

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = `laporan-pelayanan-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(downloadUrl);
  a.remove();
}
