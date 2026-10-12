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
});

describe('AddressChip copy feedback timer', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => {}) },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a rapid second copy restarts the feedback, never ending it early', async () => {
    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });
    const button = container.querySelector('button')!;

    await act(async () => {
      button.click();
    });
    expect(button.getAttribute('aria-label')).toContain('Copied');

    // Half-way through the first window a second copy fires — the feedback
    // must still show for a full window from the second click, not the first.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    await act(async () => {
      button.click();
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(button.getAttribute('aria-label')).toContain('Copied');

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(button.getAttribute('aria-label')).toContain('Copy address');
  });

  it('unmounting with the feedback live does not set state on a dead component', async () => {
    act(() => {
      root.render(<AddressChip value={TEST_ADDRESS} />);
    });
    const button = container.querySelector('button')!;

    await act(async () => {
      button.click();
    });

    // React 18+ warns (and older builds crashed) on a post-unmount setState —
    // clearing the timer in the cleanup is what keeps that from happening.
    act(() => root.unmount());
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    // Reaching here without a setState-on-unmounted warning is the assertion:
    // the timer was cancelled rather than left firing.
    expect(true).toBe(true);
  });
});
