/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buttonClasses } from './button-styles';
import { Field, SelectField } from './ui';

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

  it('generates distinct collision-free ids for fields with identical labels', () => {
    act(() => {
      root.render(
        <form>
          <Field label="Password" hint="At least 8 characters." />
          <Field label="Password" error="Passwords must match." />
        </form>,
      );
    });

    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(2);
    const input1 = inputs[0];
    const input2 = inputs[1];
    expect(input1).toBeDefined();
    expect(input2).toBeDefined();
    if (!input1 || !input2) return;

    const id1 = input1.getAttribute('id');
    const id2 = input2.getAttribute('id');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);

    const labels = container.querySelectorAll('label');
    const label1 = labels[0];
    const label2 = labels[1];
    expect(label1).toBeDefined();
    expect(label2).toBeDefined();
    if (!label1 || !label2) return;

    expect(label1.htmlFor).toBe(id1);
    expect(label2.htmlFor).toBe(id2);

    expect(input1.getAttribute('aria-describedby')).toBe(`${id1}-hint`);
    expect(input2.getAttribute('aria-describedby')).toBe(`${id2}-error`);
  });

  it('generates distinct collision-free ids for SelectField with identical labels', () => {
    act(() => {
      root.render(
        <form>
          <SelectField label="Role" hint="Primary role">
            <option value="admin">Admin</option>
          </SelectField>
          <SelectField label="Role" hint="Secondary role">
            <option value="member">Member</option>
          </SelectField>
        </form>,
      );
    });

    const selects = container.querySelectorAll('select');
    expect(selects).toHaveLength(2);
    const select1 = selects[0];
    const select2 = selects[1];
    expect(select1).toBeDefined();
    expect(select2).toBeDefined();
    if (!select1 || !select2) return;

    const id1 = select1.getAttribute('id');
    const id2 = select2.getAttribute('id');

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);

    const labels = container.querySelectorAll('label');
    const label1 = labels[0];
    const label2 = labels[1];
    expect(label1).toBeDefined();
    expect(label2).toBeDefined();
    if (!label1 || !label2) return;

    expect(label1.htmlFor).toBe(id1);
    expect(label2.htmlFor).toBe(id2);

    expect(select1.getAttribute('aria-describedby')).toBe(`${id1}-hint`);
    expect(select2.getAttribute('aria-describedby')).toBe(`${id2}-hint`);
  });

  it('preserves explicitly provided id or name attributes', () => {
    act(() => {
      root.render(
        <form>
          <Field id="custom-id" label="Explicit ID" />
          <Field name="custom-name" label="Explicit Name" />
        </form>,
      );
    });

    const inputs = container.querySelectorAll('input');
    const input1 = inputs[0];
    const input2 = inputs[1];
    expect(input1).toBeDefined();
    expect(input2).toBeDefined();
    if (!input1 || !input2) return;

    expect(input1.getAttribute('id')).toBe('custom-id');
    expect(input2.getAttribute('id')).toBe('custom-name');
  });
});
