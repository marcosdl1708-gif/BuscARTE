# Working rules — BuscARTE web

- This independent repository is the canonical local web workspace as of 2026-09-05. Read README.md and ../BuscARTE-ORGANIZACION.md before work. Recheck current git/deploy state; recorded hashes are a dated baseline, not a perpetual claim.
- Work one user-requested block at a time. Preserve unrelated changes. Do not fold the pending Auth/data migration into mobile or visual fixes.
- Build with `npm run build` or `node scripts/build-site.mjs`. Publish only `dist/`, never the repository root. New public files must be explicitly reviewed in site-files.json. Functions remain in netlify/functions. Do not publish docs, archives, campaign data, credentials or Android keys.
- Local preparation does not authorize a production deploy, database migration, real-user email or test-data mutation. A preview may still connect to production services. Use isolated fixtures or an explicitly scoped test account/environment for mutation tests.
- Keep existing login, data contracts, URLs, manifest identity and Android asset links compatible. Do not switch on shadow Auth, change domains, Android package IDs, signing keys or scheduled email behavior as an incidental cleanup.
- The original ../BuscARTE remains linked to ../BuscARTE-android through its .git. Never move or delete either as casual cleanup. Existing Auth migrations, campaign automation and Android pending changes stay there until separately reconciled.
- Separate baseline recovery from functional fixes in commits. Check build output, relevant mobile behavior and regression risk before proposing release. `npm test` covers packaging only, not the application's functional flows.
