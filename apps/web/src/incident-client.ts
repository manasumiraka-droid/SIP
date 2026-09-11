import type {
  CandidateRecommendation,
  IncidentStatus,
  IncidentUrgency,
  ReplacementCase,
} from "../../../packages/domain/src/incidents";

export type {
  CandidateRecommendation,
  IncidentStatus,
  IncidentUrgency,
  ReplacementCase,
};

export type IncidentItem = {
  id: string;
  organizationId: string;
  serviceId: string;
  assignmentId: string;
  serviceRoleId: string;
  roleCode: string;
  roleName: string;
  serviceStartsAt: string;
  serviceLocation: string;
  servantId: string;
  servantName: string;
  status: IncidentStatus;
  urgency: IncidentUrgency;
  reason: string;
  resolvedAssignmentId: string | null;
  resolvedServantName: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const INCIDENT_MESSAGES = {
  createFailed: "Gagal melaporkan insiden. Periksa koneksi dan coba lagi.",
  resolveFailed:
    "Pengesahan pengganti gagal: kandidat mungkin tidak memenuhi syarat atau jadwal bentrok.",
  escalateFailed: "Gagal mengesahkan eskalasi manual. Coba lagi.",
  fetchFailed: "Gagal memuat daftar insiden pelayanan.",
} as const;

export async function fetchIncidents(
  status?: IncidentStatus,
  serviceId?: string,
): Promise<IncidentItem[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (serviceId) params.set("serviceId", serviceId);

  const url = `/api/v1/incidents${params.toString() ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(INCIDENT_MESSAGES.fetchFailed);
  const payload = (await response.json()) as { data: IncidentItem[] };
  return payload.data;
}

export async function fetchIncidentDetail(
  id: string,
): Promise<{ data: IncidentItem; candidates: CandidateRecommendation[] }> {
  const response = await fetch(`/api/v1/incidents/${id}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Gagal memuat rincian insiden.");
  return (await response.json()) as {
    data: IncidentItem;
    candidates: CandidateRecommendation[];
  };
}

export async function createIncident(
  serviceId: string,
  assignmentId: string,
  reason: string,
): Promise<{ id: string; status: IncidentStatus }> {
  const response = await fetch("/api/v1/incidents", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ serviceId, assignmentId, reason }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(err?.error?.message ?? INCIDENT_MESSAGES.createFailed);
  }
  const payload = (await response.json()) as {
    data: { id: string; status: IncidentStatus };
  };
  return payload.data;
}

export async function resolveIncident(
  caseId: string,
  replacementServantId: string,
): Promise<{ id: string; status: IncidentStatus; newAssignmentId: string }> {
  const response = await fetch(`/api/v1/incidents/${caseId}/resolve`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ replacementServantId }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(err?.error?.message ?? INCIDENT_MESSAGES.resolveFailed);
  }
  const payload = (await response.json()) as {
    data: { id: string; status: IncidentStatus; newAssignmentId: string };
  };
  return payload.data;
}

export async function escalateIncident(
  caseId: string,
  reason?: string,
): Promise<{ id: string; status: IncidentStatus }> {
  const response = await fetch(`/api/v1/incidents/${caseId}/escalate`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ reason }),
  });
  if (!response.ok) {
    const err = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(err?.error?.message ?? INCIDENT_MESSAGES.escalateFailed);
  }
  const payload = (await response.json()) as {
    data: { id: string; status: IncidentStatus };
  };
  return payload.data;
}
