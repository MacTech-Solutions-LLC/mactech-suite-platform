export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: { requestId?: string; resolvedAt?: string };
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: { requestId?: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const HUB_AUTH_DENIED = "HUB_AUTH_DENIED";
export const VALIDATION_ERROR = "VALIDATION_ERROR";
export const HUB_UNAVAILABLE = "HUB_UNAVAILABLE";
