/**
 * The upload/write/cleanup ordering for profile photos, as one operation.
 *
 * `uploadAvatar` deliberately does not remove anything: a failure between the
 * upload and the API write would leave the profile pointing at an object that
 * no longer exists. The order that avoids that — upload, write the path, then
 * remove what was replaced; and on a failed write, remove what was just
 * uploaded — is easy to get wrong when it lives inline in a screen, and this
 * module is where it lives once, covered by tests.
 */
import { removeAvatar, uploadAvatar, type AvatarOutcome, type AvatarProblem } from './avatar';

export type AvatarWrite = (path: string) => Promise<unknown>;

/**
 * Uploads a photo, points the profile at it, and removes the object it replaced.
 *
 * Failure at each step leaves the account exactly as it was: a failed upload
 * changes nothing; a failed profile write removes the just-uploaded object; the
 * superseded object is removed only after the write succeeded, and best-effort —
 * a photo that outlives its replacement is untidy, not broken. The original
 * write error is reported as `write-failed` so the caller renders a message
 * instead of swallowing the failure.
 */
export async function replaceAvatarPhoto(args: {
  readonly userId: string;
  readonly file: Blob;
  /** The profile's current avatar path, or `null` when it has none. */
  readonly currentPath: string | null;
  /** Applies `path` to the profile (the `PATCH /me` half of the operation). */
  readonly writePath: AvatarWrite;
}): Promise<AvatarOutcome<{ path: string }>> {
  const uploaded = await uploadAvatar(args.userId, args.file);
  if (!uploaded.ok) return uploaded;

  try {
    await args.writePath(uploaded.value.path);
  } catch {
    // The write is what makes the upload reachable. Without it the object is
    // already orphaned, so removing it here leaves no trace of the attempt.
    await removeAvatar(uploaded.value.path);
    return { ok: false, problem: 'write-failed' };
  }

  if (args.currentPath !== null) {
    // Best effort: the account now points at the new object, so a failed remove
    // only leaves an orphan, never a broken reference.
    await removeAvatar(args.currentPath);
  }

  return { ok: true, value: { path: uploaded.value.path } };
}

/**
 * Clears the profile's photo and removes the object.
 *
 * The reverse order of `replaceAvatarPhoto`, because the failure that matters is
 * the opposite one: a profile pointing at an object that no longer exists would
 * render as a broken image, while an object nothing points at is invisible.
 */
export async function clearAvatarPhoto(args: {
  readonly currentPath: string;
  /** Clears the profile's avatar path (the `PATCH /me` half). */
  readonly clearPath: () => Promise<unknown>;
}): Promise<AvatarOutcome<undefined>> {
  try {
    await args.clearPath();
  } catch {
    return { ok: false, problem: 'write-failed' as AvatarProblem };
  }

  await removeAvatar(args.currentPath);
  return { ok: true, value: undefined };
}
