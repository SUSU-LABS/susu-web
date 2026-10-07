/**
 * Authentication actions.
 *
 * Every action has one shape: it calls the provider, translates whatever came
 * back into an `AuthOutcome`, and never throws. These tests pin that contract
 * for each action — the success path, a provider-reported failure, and a thrown
 * one — because a page renders an outcome and would show nothing at all if an
 * action threw instead of returning a failure.
 *
 * The provider and the environment are mocked: these are tests of the mapping
 * from the provider's vocabulary to ours, not of Supabase itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  resend: vi.fn(),
  getSupabaseClient: vi.fn(),
  getEnv: vi.fn(() => ({ VITE_APP_URL: 'http://localhost:5173' })),
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('@/lib/env', () => ({ getEnv: mocks.getEnv }));

import { AuthError } from './errors';
import {
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signOut,
  signOutOtherSessions,
  signUp,
  updatePassword,
} from './actions';

const auth = {
  signUp: mocks.signUp,
  signInWithPassword: mocks.signInWithPassword,
  signOut: mocks.signOut,
  resetPasswordForEmail: mocks.resetPasswordForEmail,
  getSession: mocks.getSession,
  updateUser: mocks.updateUser,
  resend: mocks.resend,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSupabaseClient.mockReturnValue({ auth });
});

describe('signUp', () => {
  it('reports that verification is needed when no session comes back', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });

    const result = await signUp({ email: 'ada@example.com', password: 'secret123' });

    expect(result).toEqual({ ok: true, data: { needsVerification: true } });
    // The confirmation link must return to the app, not the signup form.
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret123',
      options: { emailRedirectTo: 'http://localhost:5173/app' },
    });
  });

  it('reports no verification when a session comes back', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });

    const result = await signUp({ email: 'ada@example.com', password: 'secret123' });

    expect(result).toEqual({ ok: true, data: { needsVerification: false } });
  });

  it('maps a provider error instead of throwing', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null },
      error: { code: 'over_email_send_rate_limit', message: 'rate limited' },
    });

    const result = await signUp({ email: 'ada@example.com', password: 'secret123' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rate-limited');
  });

  it('maps a thrown network fault', async () => {
    mocks.signUp.mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await signUp({ email: 'ada@example.com', password: 'secret123' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('network');
  });
});

describe('signIn', () => {
  it('returns the user id on success', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    expect(await signIn({ email: 'ada@example.com', password: 'secret123' })).toEqual({
      ok: true,
      data: { userId: 'user-1' },
    });
  });

  it('treats a success without a user as a malformed response', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: null });

    const result = await signIn({ email: 'ada@example.com', password: 'secret123' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown');
  });

  it('maps an invalid-credentials failure', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    const result = await signIn({ email: 'ada@example.com', password: 'wrong' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-credentials');
  });
});

describe('signOut', () => {
  it('reports success', async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    expect(await signOut()).toEqual({ ok: true, data: undefined });
  });

  it('reports a provider failure', async () => {
    mocks.signOut.mockResolvedValue({ error: { message: 'network' } });

    const result = await signOut();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('network');
  });
});

describe('requestPasswordReset', () => {
  it('sends the recovery link back to the reset page', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });

    expect(await requestPasswordReset('ada@example.com')).toEqual({ ok: true, data: undefined });
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('ada@example.com', {
      redirectTo: 'http://localhost:5173/reset-password',
    });
  });

  it('reports a genuine failure', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({
      error: { code: 'over_request_rate_limit', message: 'slow down' },
    });

    const result = await requestPasswordReset('ada@example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('rate-limited');
  });
});

describe('updatePassword', () => {
  it('reports no-session rather than calling the provider without one', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });

    const result = await updatePassword('new-secret');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no-session');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password when a session exists', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    mocks.updateUser.mockResolvedValue({ error: null });

    expect(await updatePassword('new-secret')).toEqual({ ok: true, data: undefined });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'new-secret' });
  });

  it('reports a provider failure', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    mocks.updateUser.mockResolvedValue({
      error: { code: 'same_password', message: 'same password' },
    });

    const result = await updatePassword('same');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('same-password');
  });
});

describe('resendConfirmation', () => {
  it('redirects to the app and reports success', async () => {
    mocks.resend.mockResolvedValue({ error: null });

    expect(await resendConfirmation('ada@example.com')).toEqual({ ok: true, data: undefined });
    expect(mocks.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'ada@example.com',
      options: { emailRedirectTo: 'http://localhost:5173/app' },
    });
  });

  it('reports a provider failure', async () => {
    mocks.resend.mockResolvedValue({ error: { message: 'email not confirmed' } });

    const result = await resendConfirmation('ada@example.com');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(AuthError);
  });
});

describe('signOutOtherSessions', () => {
  it('revokes only the other sessions', async () => {
    mocks.signOut.mockResolvedValue({ error: null });

    expect(await signOutOtherSessions()).toEqual({ ok: true, data: undefined });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('reports a provider failure', async () => {
    mocks.signOut.mockResolvedValue({ error: { code: 'session_not_found', message: 'gone' } });

    const result = await signOutOtherSessions();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('no-session');
  });
});
