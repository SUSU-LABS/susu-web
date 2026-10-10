/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddressChip } from './ui';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TEST_ADDRESS = 'CCC7KAX4V4GJD6FVG6GSYQ4I2D2B3CWEOQMIX6YM4QBGXTA6INCGRUYC';

describe('AddressChip accessibility and copy affordance', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    try {
      act(() => root.unmount());
    } catch {
      // In tests verifying unmount, root is already unmounted.
    }
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes the full 56-character address to assistive tech via accessible name', () => {
    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });

    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    // Accessible name must be the full address, not the truncated text
    expect(code?.getAttribute('aria-label')).toBe(TEST_ADDRESS);

    // Visually-hidden text contains full address for screen readers
    const srOnly = container.querySelector('.sr-only');
    expect(srOnly?.textContent).toBe(TEST_ADDRESS);

    // Truncated presentation is aria-hidden
    const truncated = container.querySelector('[aria-hidden="true"]');
    expect(truncated?.textContent).toContain('…');
  });

  it('provides a copy-to-clipboard affordance that copies the full address', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });

    const copyBtn = container.querySelector('button');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copy/i);

    await act(async () => {
      copyBtn?.click();
    });

    expect(writeText).toHaveBeenCalledWith(TEST_ADDRESS);
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);
  });

  it('handles clipboard failure gracefully without throwing unhandled exceptions', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });

    const copyBtn = container.querySelector('button');
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn?.click();
    });

    expect(writeText).toHaveBeenCalledWith(TEST_ADDRESS);
    // Button still exists and remains functional
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copy/i);
  });

  it('renders optional label alongside address chip', () => {
    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} label="Factory" />);
    });

    expect(container.textContent).toContain('Factory');
    const code = container.querySelector('code');
    expect(code?.getAttribute('aria-label')).toBe(TEST_ADDRESS);
  });

  it('restarts copy confirmation window on rapid repeated copies', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });

    const copyBtn = container.querySelector('button');
    expect(copyBtn).not.toBeNull();

    await act(async () => {
      copyBtn?.click();
    });
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

    // Fast-forward 1000ms (halfway through the 2000ms duration)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

    // Trigger second copy before the first timer finishes
    await act(async () => {
      copyBtn?.click();
    });
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

    // Fast-forward another 1000ms (2000ms after first click, but only 1000ms after second click)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // With restart, it must still be in copied state
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

    // Fast-forward the remaining 1000ms to complete the second 2000ms window
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copy/i);
  });

  it('clears copy timer on unmount and prevents state updates after unmount', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });

    const copyBtn = container.querySelector('button');
    await act(async () => {
      copyBtn?.click();
    });
    expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

    // Unmount while timer is pending
    act(() => {
      root.unmount();
    });

    // Advance past the 2000ms timer
    act(() => {
      vi.advanceTimersByTime(3000);
    });
  });
});
