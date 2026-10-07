/**
 * Builds the Content-Security-Policy served with the app.
 *
 * The policy is injected as a `<meta http-equiv>` tag into `index.html` at
 * build time (see `vite-plugin-csp.mjs`), not set as a response header, for one
 * reason: the origins it must allow are per-deployment. The Supabase project
 * URL and the optional API base come from `VITE_*` environment variables, so no
 * static header written in this repository can name them. A meta tag generated
 * from the same env the bundle is built with is always accurate for the
 * deployment it ships with, and it rides on `index.html`, which every
 * deployment target (Docker/nginx, Vercel, Render) serves for all routes.
 *
 * What the app actually fetches, verified against `src`:
 * - Supabase (`VITE_SUPABASE_URL`): auth REST, storage API, and signed avatar
 *   URLs all live on the project origin. No realtime channels are used, so no
 *   `wss:` allowance is needed; adding one would widen the policy for a feature
 *   that does not exist.
 * - Soroban RPC (`VITE_STELLAR_RPC_URL`): transaction simulation/submission.
 * - susu-api (`VITE_API_BASE_URL`, optional): invite codes and notifications.
 * - Everything else (bundle, icons, styles) is same-origin.
 *
 * Deliberately not in the policy:
 * - The block explorer (`VITE_EXPLORER_BASE_URL`) is link-only — the app builds
 *   `href`s to it and never fetches it, and links need no CSP allowance.
 * - Freighter needs no allowance either. Its content script runs in the
 *   extension's isolated world, which page CSP does not govern; the page-side
 *   adapter is same-origin script and postMessage, both already covered.
 *
 * `style-src 'unsafe-inline'` is the one compromise, and it is load-bearing:
 * React sets inline `style` attributes, framer-motion writes them at runtime,
 * and the `<noscript>` fallback in `index.html` is an inline `<style>` block.
 * A hash or nonce cannot cover runtime-written styles, and a nonce is
 * impossible in a static meta tag. Style-only injection cannot execute script,
 * so this is accepted and recorded rather than papered over.
 *
 * Usage: buildCsp({ supabaseUrl, rpcUrl, apiBaseUrl }) -> string
 * Missing or invalid values are skipped, never interpolated: a build without a
 * populated env still succeeds (env is validated lazily at runtime by
 * `src/lib/env.ts`), and the policy simply covers fewer origins.
 */

const SELF = "'self'";
const UNSAFE_INLINE = "'unsafe-inline'";

/**
 * Reduces a URL to its origin (`https://example.com`), or undefined when the
 * value is missing or not a URL. Never throws: build-time robustness matters
 * more here than strictness, because `src/lib/env.ts` is the strict gate.
 *
 * Opaque origins (the string `"null"`, e.g. from `data:` or custom-scheme
 * URLs) are rejected too: interpolating the literal word `null` into the
 * policy would grant nothing and confuse anyone reading the header.
 */
export function originOf(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    const origin = new URL(value.trim()).origin;
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

/** Deduplicates while preserving first-seen order. */
export function dedupe(values) {
  return [...new Set(values)];
}

/**
 * Assembles the policy from validated environment values.
 *
 * @param {object} env
 * @param {string} [env.supabaseUrl] - VITE_SUPABASE_URL
 * @param {string} [env.rpcUrl] - VITE_STELLAR_RPC_URL
 * @param {string} [env.apiBaseUrl] - VITE_API_BASE_URL (optional)
 * @returns {string} the policy value for the meta tag's `content` attribute.
 */
export function buildCsp({ supabaseUrl, rpcUrl, apiBaseUrl } = {}) {
  const supabaseOrigin = originOf(supabaseUrl);
  const rpcOrigin = originOf(rpcUrl);
  const apiOrigin = originOf(apiBaseUrl);

  const connect = dedupe(
    [SELF, supabaseOrigin, rpcOrigin, apiOrigin].filter((v) => v !== undefined),
  );
  const img = dedupe([SELF, supabaseOrigin].filter((v) => v !== undefined));

  const directives = [
    `default-src ${SELF}`,
    `script-src ${SELF}`,
    // See the note at the top of this file: runtime-written styles and the
    // noscript fallback leave no alternative in a static meta tag.
    `style-src ${SELF} ${UNSAFE_INLINE}`,
    `img-src ${img.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    `font-src ${SELF}`,
    `object-src 'none'`,
    `base-uri ${SELF}`,
    `form-action ${SELF}`,
  ];

  return directives.join('; ');
}
