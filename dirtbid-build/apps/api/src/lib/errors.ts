export type ErrorCode = 'validation' | 'not_found' | 'unauthorized' | 'forbidden' | 'conflict' | 'rate_limited' | 'internal';

export class ApiError extends Error {
  constructor(public readonly code: ErrorCode, message: string, public readonly fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
  }
  get status(): number {
    switch (this.code) {
      case 'validation': return 400;
      case 'unauthorized': return 401;
      case 'forbidden': return 403;
      case 'not_found': return 404;
      case 'conflict': return 409;
      case 'rate_limited': return 429;
      default: return 500;
    }
  }
}
export const notFound = (what = 'Resource') => new ApiError('not_found', `${what} not found`);
export const forbidden = (msg = 'Forbidden') => new ApiError('forbidden', msg);
export const unauthorized = (msg = 'Authentication required') => new ApiError('unauthorized', msg);
export const validation = (msg: string, fields?: Record<string, string>) => new ApiError('validation', msg, fields);
export const conflict = (msg: string) => new ApiError('conflict', msg);
