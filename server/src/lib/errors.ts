export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (code: string, message: string) => new AppError(400, code, message);
export const unauthorized = (message = "Sign in required") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed") => new AppError(403, "forbidden", message);
export const notFound = (message = "Not found") => new AppError(404, "not_found", message);
export const conflict = (code: string, message: string) => new AppError(409, code, message);
