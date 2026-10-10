import { describe, expect, it, vi } from 'vitest';
import { clearAvatarPhoto, replaceAvatarPhoto } from './avatar-ops';

/**
 * The upload/write/cleanup ordering for profile photos.
 *
 * `./avatar` is mocked at the storage boundary, so the tests assert the
 * *ordering contract*: what is removed when a step fails, and what is never
 * removed while the profile still points at it.
 */

const uploadMock = vi.fn();
const removeMock = vi.fn();

vi.mock('./avatar', () => ({
  uploadAvatar: (...args: unknown[]) => uploadMock(...args),
  removeAvatar: (...args: unknown[]) => removeMock(...args),
}));

const USER = '11111111-1111-1111-1111-111111111111';
const UPLOADED = `users/${USER}/avatar/aaaa.png`;
const PREVIOUS = `users/${USER}/avatar/bbbb.png`;
const file = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]);

function uploadedOk(path = UPLOADED) {
  return { ok: true, value: { path, kind: 'png' as const } };
}

describe('replaceAvatarPhoto', () => {
  it('removes the superseded object after a successful write', async () => {
    uploadMock.mockResolvedValue(uploadedOk());
    removeMock.mockResolvedValue({ ok: true, value: undefined });
    const writePath = vi.fn().mockResolvedValue({});

    const result = await replaceAvatarPhoto({
      userId: USER,
      file,
      currentPath: PREVIOUS,
      writePath,
    });

    expect(result).toEqual({ ok: true, value: { path: UPLOADED } });
    expect(writePath).toHaveBeenCalledWith(UPLOADED);
    // The write must land before anything is removed.
    expect(uploadMock).toHaveBeenCalledBefore(writePath);
    expect(writePath).toHaveBeenCalledBefore(removeMock);
    expect(removeMock).toHaveBeenCalledWith(PREVIOUS);
  });

  it('removes the just-uploaded object when the write fails', async () => {
    uploadMock.mockResolvedValue(uploadedOk());
    removeMock.mockResolvedValue({ ok: true, value: undefined });
    const writePath = vi.fn().mockRejectedValue(new Error('PATCH /me 500'));

    const result = await replaceAvatarPhoto({
      userId: USER,
      file,
      currentPath: PREVIOUS,
      writePath,
    });

    expect(result).toEqual({ ok: false, problem: 'write-failed' });
    // The orphan from the failed attempt is cleaned up...
    expect(removeMock).toHaveBeenCalledWith(UPLOADED);
    // ...and the superseded object is untouched: the profile still points at it.
    expect(removeMock).not.toHaveBeenCalledWith(PREVIOUS);
  });

  it('does not remove anything when the upload itself fails', async () => {
    uploadMock.mockResolvedValue({ ok: false, problem: 'upload-failed' });
    const writePath = vi.fn();

    const result = await replaceAvatarPhoto({
      userId: USER,
      file,
      currentPath: PREVIOUS,
      writePath,
    });

    expect(result).toEqual({ ok: false, problem: 'upload-failed' });
    expect(writePath).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('removes nothing on success when there was no previous photo', async () => {
    uploadMock.mockResolvedValue(uploadedOk());
    removeMock.mockResolvedValue({ ok: true, value: undefined });
    const writePath = vi.fn().mockResolvedValue({});

    const result = await replaceAvatarPhoto({
      userId: USER,
      file,
      currentPath: null,
      writePath,
    });

    expect(result).toEqual({ ok: true, value: { path: UPLOADED } });
    expect(removeMock).not.toHaveBeenCalled();
  });
});

describe('clearAvatarPhoto', () => {
  it('removes the object after the profile write succeeds', async () => {
    removeMock.mockResolvedValue({ ok: true, value: undefined });
    const clearPath = vi.fn().mockResolvedValue({});

    const result = await clearAvatarPhoto({ currentPath: PREVIOUS, clearPath });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(clearPath).toHaveBeenCalledBefore(removeMock);
    expect(removeMock).toHaveBeenCalledWith(PREVIOUS);
  });

  it('leaves the object in place when the profile write fails', async () => {
    removeMock.mockResolvedValue({ ok: true, value: undefined });
    const clearPath = vi.fn().mockRejectedValue(new Error('PATCH /me 500'));

    const result = await clearAvatarPhoto({ currentPath: PREVIOUS, clearPath });

    expect(result).toEqual({ ok: false, problem: 'write-failed' });
    expect(removeMock).not.toHaveBeenCalled();
  });
});
