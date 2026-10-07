/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buttonClasses } from './button-styles';
import { Field } from './ui';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('form control accessibility', () => {
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
  });

  it('describes a field with its hint and error together', () => {
    act(() => {
      root.render(
        <Field
          id="email"
          label="Email"
          hint="Use your account email."
          error="Enter a valid email."
        />,
      );
    });

    const input = container.querySelector('input');
    expect(input?.getAttribute('aria-describedby')).toBe('email-hint email-error');
    expect(container.querySelector('#email-hint')?.textContent).toBe('Use your account email.');
    expect(container.querySelector('#email-error')?.textContent).toBe('Enter a valid email.');
  });

  it('preserves a caller-provided description before generated descriptions', () => {
    act(() => {
      root.render(
        <Field
          id="amount"
          label="Amount"
          hint="Enter USDC."
          error="Amount is required."
          aria-describedby="currency-help"
        />,
      );
    });

    expect(container.querySelector('input')?.getAttribute('aria-describedby')).toBe(
      'currency-help amount-hint amount-error',
    );
  });

  it('provides visible keyboard focus styles for inputs and button-like controls', () => {
    act(() => {
      root.render(<Field id="name" label="Name" />);
    });

    expect(container.querySelector('input')?.className).toContain('focus-visible:ring-2');
    expect(buttonClasses()).toContain('focus-visible:ring-2');
  });
});
