import { ConflictError } from '../../core/fs/file-store';
import { ValidationError } from '../../core/fs/paths';
import { ApiError, type IpcResult } from '../../shared/types';

/** Turns a thrown error into a result with a code the renderer knows how to handle. */
export function errorToIpcResult(e: unknown): IpcResult<never> {
  if (e instanceof ConflictError) return { ok: false, error: { code: 'conflict', message: e.message, data: { current: e.current } } };
  if (e instanceof ValidationError) return { ok: false, error: { code: 'invalid', message: e.message } };
  if (e instanceof ApiError) return { ok: false, error: { code: e.code, message: e.message, data: e.data } };
  const errno = (e as NodeJS.ErrnoException)?.code;
  if (errno === 'ENOENT') return { ok: false, error: { code: 'missing', message: 'The file or folder no longer exists.' } };
  if (errno === 'EACCES' || errno === 'EPERM') return { ok: false, error: { code: 'permission', message: 'No permission to write here.' } };
  return { ok: false, error: { code: 'error', message: e instanceof Error ? e.message : String(e) } };
}
