export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message = "Authentication required"): HttpError =>
  new HttpError(401, message);
export const forbidden = (message = "Not allowed"): HttpError => new HttpError(403, message);
export const notFound = (message = "Not found"): HttpError => new HttpError(404, message);
export const badRequest = (message = "Bad request"): HttpError => new HttpError(400, message);
export const conflict = (message = "Conflict"): HttpError => new HttpError(409, message);
export const locked = (message = "This object is locked and cannot be edited"): HttpError => new HttpError(423, message);
