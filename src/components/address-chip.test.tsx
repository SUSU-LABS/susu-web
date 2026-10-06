/**
 * @vitest-environment jsdom
 *
 * The acceptance criterion of SUSU-LABS/susu-web#11: assistive tech is
 * handed the full 56-character address, not the visible fragment, and the
 * copy affordance behaves the way its label promises. A real DOM is required
 * because "what assistive tech can reach" is a property of the rendered tree,
 * and the button's behaviour is only observable through events.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressChip } from './ui';

declare global {
  /** See the note in error-boundary.test.tsx. */
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** The Factory contract, as recorded in .env.example. */
const FACTORY = 'CCC7KAX4V4GJD6FVG6GSYQ4I2D2B3CWEOQMIX6YM4QBGXTA6INCGRUYC';

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

async function renderChip(label?: string): Promise<void> {
  await act(async () => {
    root.render(<AddressChip value={FACTORY} {...(label === undefined ? {} : { label })} />);
  });
}

function copyButton(): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Copy address"]');
  if (button === null) throw new Error('Expected a "Copy address" button in the chip.');
  return button;
}

describe('AddressChip', () => {
  it('exposes the full address as the accessible name, not the truncated fragment', async () => {
    await renderChip();

    const code = container.querySelector('code');
    // The accessible name is the whole address — 56 characters, exactly what
    // the chain knows, nothing abbreviated. Screen readers read this instead
    // of the six-and-four fragment, because identity-critical values (payout
    // order, group contracts, a linked wallet) cannot be guessed at. (#11)
    expect(code?.getAttribute('aria-label')).toBe(FACTORY);
    expect(code?.getAttribute('aria-label')).toHaveLength(56);

    // The fragment stays on screen, and is hidden from assistive tech so the
    // two never read as a contradiction.
    expect(code?.textContent).toBe(`${FACTORY.slice(0, 6)}…${FACTORY.slice(-4)}`);
    expect(code?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('still renders the label when one is given', async () => {
    await renderChip('Factory');
    expect(container.textContent).toContain('Factory');
    expect(container.querySelector('code')?.getAttribute('aria-label')).toBe(FACTORY);
  });

  it('copies the full address and announces the outcome', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await renderChip();
    await act(async () => {
      copyButton().click();
    });

    // What lands on the clipboard is the full value — the fragment would be a * trap for anyone pasting it into an explorer or a payout form.
    expect(writeText).toHaveBeenCalledWith(FACTORY);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Address copied to the clipboard.',
    );
  });

  it('says so when the clipboard refuses, instead of appearing to do nothing', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await renderChip();
    await act(async () => {
      copyButton().click();
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'The clipboard was not available.',
    );
  });
});
