/**
 * Global Vitest setup, wired through `setupFiles` in `vite.config.ts`.
 *
 * The component tests render real React trees with `react-dom/client` rather
 * than a test renderer, so `act` has to be told it is running in a test
 * environment. Setting it once here keeps every component test from repeating
 * the same two lines, and a setup file that is referenced but does not exist —
 * as this one was in `tsconfig.json` before — is a footgun: the config looks
 * like it enables something that never runs.
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export {};
