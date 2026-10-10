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
    act(() => root.unmount());
    container.remove();
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

  it('resets timer window upon a rapid second copy without premature dismissal', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      act(() => {
        root.render(<AddressChip value={TEST_ADDRESS} />);
      });

      const copyBtn = container.querySelector('button');

      // First click
      await act(async () => {
        copyBtn?.click();
      });
      expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

      // Advance by 1500ms (500ms remaining on first timer)
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

      // Second click: resets window to 2000ms
      await act(async () => {
        copyBtn?.click();
      });

      // Advance 1000ms (original timer would have expired at 2000ms, but reset gives 2000ms from 2nd click)
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(copyBtn?.getAttribute('aria-label')).toMatch(/copied/i);

      // Advance remaining 1000ms: now resets to copy
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(copyBtn?.getAttribute('aria-label')).toMatch(/copy/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears copy-feedback timer when unmounted', async () => {
    vi.useFakeTimers();
    try {
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

      // Advancing timer after unmount should not throw or cause warning
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
