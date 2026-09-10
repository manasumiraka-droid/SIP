export class ApplicationError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VERSION_CONFLICT"
      | "INVALID_TRANSITION"
      | "CONFLICT"
      | "VALIDATION_FAILED"
      | "RATE_LIMITED",
    public readonly status: 403 | 404 | 409 | 422 | 429,
    message: string,
  ) {
    super(message);
  }
}
