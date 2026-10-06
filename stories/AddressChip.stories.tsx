import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AddressChip } from '../src/components/ui';

/**
 * Addresses in this app are 56 characters and are read by people comparing two
 * of them. The chip shows the ends, which is enough to tell one from another,
 * while the whole value stays available three ways: it is the chip's
 * accessible name, it sits in `title` for the mouse user, and the copy
 * button hands it to everyone else. (#11)
 *
 * The values below are the Testnet deployments recorded in the project's own
 * configuration (`.env.example` and `susu-contracts/docs/TESTNET.md`). Contract
 * addresses are public — they are on the chain, and every node has them — so
 * there is nothing to redact, and a truncated-looking fake would hide how the
 * truncation actually behaves at the real length.
 */
const FACTORY = 'CCC7KAX4V4GJD6FVG6GSYQ4I2D2B3CWEOQMIX6YM4QBGXTA6INCGRUYC';
const USDC = 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const meta = {
  title: 'Primitives/AddressChip',
  component: AddressChip,
} satisfies Meta<typeof AddressChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Factory contract, as it appears above a link out to the explorer. */
export const ContractAddress: Story = {
  args: { value: FACTORY },
};

/** With a label, which is how a row of two or three of these stays readable. */
export const Labelled: Story = {
  args: {
    value: USDC,
    label: 'USDC',
  },
};

/**
 * Two chips side by side, which is the comparison the truncation exists for: a
 * six-and-four rendering of unrelated contracts shares no visible characters.
 */
export const Compared: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <AddressChip value={FACTORY} label="Factory" />
      <AddressChip value={USDC} label="USDC" />
    </div>
  ),
};

/**
 * The chip's contract with a screen reader, asserted in the catalogue itself:
 * the accessible name is the full 56-character address, not the fragment on
 * screen. If a future change ever regresses that, this story fails rather
 * than shipping. (#11)
 */
export const AccessibleName: Story = {
  args: { value: FACTORY },
  play: async ({ canvasElement }) => {
    const code = canvasElement.querySelector('code');
    expect(code?.getAttribute('aria-label')).toBe(FACTORY);
  },
};
