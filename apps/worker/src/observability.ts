export type RequestOutcome = {
  request_id: string;
  operation:
    | "identity.read"
    | "users.read"
    | "users.create"
    | "users.roles.replace"
    | "users.status.replace"
    | "audit.read"
    | "health.read"
    | "unmatched";
  status: number;
  duration_ms: number;
};
export function logRequestOutcome(outcome: RequestOutcome) {
  console.info(JSON.stringify(outcome));
}
export function operationName(
  method: string,
  path: string,
): RequestOutcome["operation"] {
  if (method === "GET" && path === "/api/v1/me") return "identity.read";
  if (method === "GET" && path === "/api/v1/users") return "users.read";
  if (method === "GET" && path === "/api/v1/audit-logs") return "audit.read";
  if (method === "GET" && path === "/api/v1/health") return "health.read";
  if (method === "POST" && path === "/api/v1/users") return "users.create";
  if (method === "PUT" && /^\/api\/v1\/users\/[^/]+\/roles$/.test(path))
    return "users.roles.replace";
  if (method === "PATCH" && /^\/api\/v1\/users\/[^/]+\/status$/.test(path))
    return "users.status.replace";
  return "unmatched";
}
