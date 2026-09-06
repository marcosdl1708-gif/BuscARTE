# buscARTE browser client foundation

This directory contains the additive browser-client layer for the Supabase Auth
migration. It is intentionally passive in the committed production defaults:

- `mode` is `shadow`.
- `networkEnabled` is `false`.
- loading the scripts does not create a Supabase client;
- loading the scripts does not read or write `localStorage`;
- loading the scripts does not perform a network request;
- the integrated login, home navigation, and own-ad manager remain on their
  legacy branches unless an approved localhost runtime enables Auth mode.

## Load order

When integration begins, load the classic scripts in this order:

1. `/assets/vendor/supabase-2.112.3.min.js`
2. `/assets/js/buscarte-config.js`
3. `/assets/js/buscarte-auth.js`
4. `/assets/js/buscarte-api.js`

The SDK exposes `window.supabase`. The BuscARTE scripts expose the frozen,
non-writable globals `window.BuscARTEConfig`, `window.BuscARTEAuth`, and
`window.BuscARTEApi`.

## Local runtime injection

A generated localhost-only copy can define this object before loading
`buscarte-config.js`:

```html
<script>
window.__BUSCARTE_RUNTIME_CONFIG__ = {
  environment: 'local-test',
  mode: 'auth',
  networkEnabled: true,
  supabase: {
    url: 'http://127.0.0.1:54321',
    publishableKey: '<local-anon-or-publishable-key>'
  },
  auth: {
    syncLegacyCache: true
  }
};
</script>
```

Overrides are ignored unless the page hostname is `localhost`, `127.0.0.1`, or
the IPv6 loopback. An overridden Supabase URL must also point to loopback. A
`service_role` JWT or `sb_secret_` key is rejected.

The committed production URL and legacy anon key are public client defaults,
not secrets. Authorization must always come from JWT validation and RLS.

## `BuscARTEAuth`

The Auth client is lazy. In committed shadow mode, `ready` resolves to the
shadow state and network-capable methods throw `NETWORK_DISABLED`.

- `ready`: lazy promise alias for `start()`.
- `getState()`: immutable state snapshot with no access or refresh token.
- `getClient()`: lazy Supabase client; blocked while networking is disabled.
- `start()` / `stop()`: start or stop Auth observation.
- `reconcile()`: validate the user with `auth.getUser()` and resolve its mapped
  profile through the RLS-filtered `mi_perfil` view. The browser neither selects
  nor filters on the private Auth mapping column.
- `requireProfile()`: return the validated Auth/profile state or throw.
- `signInWithPassword(email, password)`.
- `signUp({ email, password, captchaToken, emailRedirectTo,
  profileMetadata })`. `profileMetadata` is onboarding data only and must never
  authorize a database operation.
- `signOut({ scope })`; scope defaults to `local`.
- `refresh()`.
- `requestPasswordReset(email, { redirectTo, captchaToken })`.
- `updatePassword(password)`.
- `inspect()`: non-sensitive diagnostics.

PKCE callbacks have one owner: the SDK's `detectSessionInUrl` handling. A
recovery page calls `ready`/`start()` and must not exchange the `?code=` again.
The Auth reconciliation queue drains SDK events and explicit actions before
resolving, so callers never receive a superseded intermediate `loading` state.

State changes after explicit activation dispatch `buscarte:authchange`. The
event detail is the immutable state snapshot. Auth callbacks stay synchronous
and defer Supabase calls to a later task.

Legacy identity keys are synchronized only when `syncLegacyCache` is enabled.
The source default is disabled. The keys remain UX compatibility data and are
never authorization evidence.

## `BuscARTEApi`

This is a least-privilege contract. Every query uses an explicit selector and
the only mutation is a closed own-ad action; it does not expose a generic RPC
or mutation method.

- `fields` and `selectors`: immutable public/owner profile and ad projections.
- `publicProfiles.list(options)` / `publicProfiles.getById(id)`.
- `publicAds.list(options)` / `publicAds.getById(id)`.
- `ownProfile.get()`.
- `ownAds.list(options)`.
- `ownAds.manage(id, action)`: accepts only `pausar`, `reactivar`, `republicar`,
  or `eliminar`, and calls `gestionar_anuncio_v2` without a caller-supplied
  owner ID.
- `inspect()`: relation names and selectors without a request.

List options currently support bounded `limit`/`offset`, sorting, exact counts,
IDs, and the documented rubro/type/state filters. Supplying an empty or wholly
invalid `ids` array returns an empty page without creating a client or making a
request. Owner methods require a real Auth user mapped to a profile; RLS remains
the final authority.

The layer expects the additive, least-privilege relations `mi_perfil`,
`perfiles_publicos`, and `anuncios_publicos`, plus RLS for owner access to
`anuncios`. Until those exist, calls made in an enabled local environment will
fail closed with a query error. No call is made in committed shadow mode. The
private Auth-to-profile mapping is deliberately absent from browser selectors.

## Vendored Supabase browser client

`vendor/supabase-2.112.3.min.js` is the unmodified UMD browser artifact from
the official npm package `@supabase/supabase-js@2.112.3`. The package names the
archive member `dist/umd/supabase.js`; it is already compact/minified. Only the
destination filename changed.

- Registry tarball: `https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-2.112.3.tgz`
- npm integrity: `sha512-Jv1bxVQmEJNkjvPEhFaKjPzsh+Ozyew6lWGD+SoYcsclDEP1z7yEvKvfUQfzy0DkxRIQnZNxmmWtAzw5XLTQoA==`
- Tarball SHA-256: `f28b54178a3ab925260562e4089beb8bb3edccee1cea6391ebe20facff0aa211`
- Archive member: `package/dist/umd/supabase.js`
- Vendored file size: `211907` bytes
- Vendored file SHA-256: `ec004176d101aec77aeef266aa1c94411287fe2039c65ea5f6c72f5e14b3847d`
- Browser global: `window.supabase`
- License: MIT

### MIT License

Copyright (c) 2020 Supabase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
