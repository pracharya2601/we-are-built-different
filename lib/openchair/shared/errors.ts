export class OpenChairError extends Error {
  readonly code: string;
  readonly status: 400 | 403 | 404 | 409 | 422 | 500;

  constructor(
    code: string,
    message: string,
    status: OpenChairError["status"],
  ) {
    super(message);
    this.name = "OpenChairError";
    this.code = code;
    this.status = status;
  }
}
