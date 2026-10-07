# Content-Security-Policy

The app serves a Content-Security-Policy on every page. It is injected at build
time as a `<meta http-equiv="Content-Security-Policy">` tag in `index.html`
rather than set as a response header, because the origins it must name are
per-deployment: the Supabase project URL and the optional API base come from
`VITE_*` environment variables, so no static header in this repository could
name them correctly. The tag is generated from the same env the bundle is built
with (`scripts/csp.mjs`, wired in via `scripts/vite-plugin-csp.mjs`), and it
rides on `index.html`, which all three deployment targets (Docker/nginx,
Vercel, Render) serve for every route.

## The policy

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' https://<supabase-project>;
connect-src 'self' https://<supabase-project> https://<rpc> [https://<api>];
font-src 'self';
object-src 'none';
base-uri 'self';
form-action 'self'
```

Directive rationale, verified against `src`:

- `script-src 'self'` — the bundle is the only script. No inline scripts, no
  `eval`.
- `style-src 'self' 'unsafe-inline'` — required: React sets inline `style`
  attributes, framer-motion writes them at runtime, and the `<noscript>`
  fallback in `index.html` is an inline `<style>` block. Style-only injection
  cannot execute script.
- `connect-src` — Supabase (auth REST, storage API), the Soroban RPC endpoint,
  and the optional susu-api. No `wss:` allowance: the app uses no realtime
  channels, so none is granted.
- `img-src` — same-origin icons plus signed Supabase Storage URLs for avatars.
- The block explorer is link-only (`href`, never fetched) and needs no
  allowance. Freighter needs none either: its content script runs in the
  extension's isolated world, which page CSP does not govern, and the page-side
  adapter is same-origin script plus `postMessage`.

`frame-ancestors` cannot be set in a meta tag; framing is still denied by the
`X-Frame-Options: DENY` header every target already sends. `report-uri` /
`report-to` are likewise unavailable via meta; no reporting endpoint is
configured.

## Residual risk

This policy raises the cost of token exfiltration — an injected script can no
longer phone home to an arbitrary origin — but it does not remove it.
`persistSession: true` keeps the Supabase refresh token in `localStorage`, and
any script that manages to execute within the allowed origins can still read
it. Removing that residual risk properly means httpOnly cookies issued by a
backend, and this repository is a static site with no server component by
design (see `render.yaml`). The session persistence strategy is therefore
unchanged, and this limitation is recorded here rather than silently accepted.
