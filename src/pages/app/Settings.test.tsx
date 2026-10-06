/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordSection } from './Settings';
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
} from '@/lib/auth/validation';
import * as authActions from '@/lib/auth/actions';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Settings PasswordSection', () => {
  it('rejects a password shorter than MIN_PASSWORD_LENGTH with the shared message', async () => {
    await act(async () => {
      root.render(<PasswordSection />);
    });

    const inputs = container.querySelectorAll('input[type="password"]');
    const newPasswordInput = inputs[0] as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      setInputValue(newPasswordInput, 'short');
    });

    expect(container.textContent).toContain(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    expect(submitButton.disabled).toBe(true);
  });

  it('rejects a >72-byte password with the exact message signup shows', async () => {
    await act(async () => {
      root.render(<PasswordSection />);
    });

    const inputs = container.querySelectorAll('input[type="password"]');
    const newPasswordInput = inputs[0] as HTMLInputElement;
    const confirmInput = inputs[1] as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    // 73 ASCII characters = 73 bytes (> 72 bytes)
    const longPassword = 'a'.repeat(MAX_PASSWORD_BYTES + 1);

    await act(async () => {
      setInputValue(newPasswordInput, longPassword);
      setInputValue(confirmInput, longPassword);
    });

    const expectedMessage =
      `Use at most ${MAX_PASSWORD_BYTES} bytes. Some characters use more than one, ` +
      `and anything beyond that would be ignored when your password is checked.`;

    expect(container.textContent).toContain(expectedMessage);
    expect(submitButton.disabled).toBe(true);
  });

  it('rejects confirmation mismatch', async () => {
    await act(async () => {
      root.render(<PasswordSection />);
    });

    const inputs = container.querySelectorAll('input[type="password"]');
    const newPasswordInput = inputs[0] as HTMLInputElement;
    const confirmInput = inputs[1] as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    await act(async () => {
      setInputValue(newPasswordInput, 'valid-password-123');
      setInputValue(confirmInput, 'different-password-456');
    });

    expect(container.textContent).toContain('The two passwords do not match.');
    expect(submitButton.disabled).toBe(true);
  });

  it('allows submit and updates password when policy is satisfied', async () => {
    const updateSpy = vi.spyOn(authActions, 'updatePassword').mockResolvedValue({ ok: true, data: undefined });
    const signOutSpy = vi.spyOn(authActions, 'signOutOtherSessions').mockResolvedValue(undefined);

    await act(async () => {
      root.render(<PasswordSection />);
    });

    const inputs = container.querySelectorAll('input[type="password"]');
    const newPasswordInput = inputs[0] as HTMLInputElement;
    const confirmInput = inputs[1] as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    const goodPassword = 'good-password-123';

    await act(async () => {
      setInputValue(newPasswordInput, goodPassword);
      setInputValue(confirmInput, goodPassword);
    });

    expect(submitButton.disabled).toBe(false);

    await act(async () => {
      submitButton.click();
    });

    expect(updateSpy).toHaveBeenCalledWith(goodPassword);
    expect(signOutSpy).toHaveBeenCalled();
  });
});
