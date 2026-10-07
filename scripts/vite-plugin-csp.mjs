/**
 * Vite plugin that injects the Content-Security-Policy as a `<meta
 * http-equiv>` tag into `index.html` at build time.
 *
 * Build-only (`apply: 'build'`): local dev stays frictionless, and the policy
 * only ever describes production output. The origins come from the same
 * `VITE_*` env the bundle is built with (`loadEnv`), so the policy is always
 * accurate for the deployment it ships with — which is exactly what a static
 * header in this repository cannot be, since the Supabase project URL differs
 * per deployment.
 *
 * The tag is inserted directly after `<meta charset>`. The policy string is
 * asserted to contain no double quotes, because it is interpolated into a
 * double-quoted `content` attribute.
 */

import { loadEnv } from 'vite';
import { buildCsp } from './csp.mjs';

const META_TAG_NAME = 'Content-Security-Policy';

export function cspMetaPlugin() {
  let mode = 'production';
  return {
    name: 'susu-csp-meta',
    apply: 'build',
    configResolved(config) {
      mode = config.mode;
    },
    transformIndexHtml(html) {
      const env = loadEnv(mode, process.cwd(), 'VITE_');
      const policy = buildCsp({
        supabaseUrl: env.VITE_SUPABASE_URL,
        rpcUrl: env.VITE_STELLAR_RPC_URL,
        apiBaseUrl: env.VITE_API_BASE_URL,
      });

      if (policy.includes('"')) {
        throw new Error(
          'susu-csp-meta: generated policy contains a double quote and cannot be placed in a content attribute',
        );
      }

      const tag = `<meta http-equiv="${META_TAG_NAME}" content="${policy}" />`;
      const anchor = /<meta charset[^>]*>/i;
      // Fail the build rather than ship without a policy: a missing anchor
      // means someone edited index.html, and a silently absent CSP is worse
      // than a broken build.
      if (!anchor.test(html)) {
        throw new Error(
          'susu-csp-meta: no <meta charset> anchor found in index.html; refusing to inject the Content-Security-Policy',
        );
      }
      return html.replace(anchor, (match) => `${match}\n    ${tag}`);
    },
  };
}
