# Next.js 15.5 upgrade: what it would take

Written 14 Oct 2026, after bumping `next` from 14.2.29 to 14.2.35.

## Why 15.5, and which version

14.2.35 (Dec 2025) is the last 14.x release. Next 14 is end-of-life,
so nothing published since then has been backported to it.
The supported line below 16 is `15.5.x`, npm tag `backport`, now at 15.5.27.

Target **15.5.27 or later**. A bare "15.5" is not enough. The two
critical advisories below are fixed only in 15.5.24 and later.

### Advisories still open on 14.2.35 (npm audit, 14 Oct 2026)

14.2.35 closes 6 of the 29 advisories on `next`: the dev-server origin
leak, two Image Optimization bugs, the middleware-redirect SSRF and two
RSC DoS issues. The other 23 need 15.5.x. Below is how each one bears on
Siren as deployed: Vercel, Linux, App Router only, Server Actions
everywhere, no `rewrites`/`redirects`/`i18n`/`images` config, no CSP
nonces.

| Advisory | Sev | Fixed in | Siren exposure |
|---|---|---|---|
| GHSA-m99w-x7hq-7vfj Server Actions DoS | high | 15.5.21 | **Exposed.** Every live-game write is a Server Action |
| GHSA-h25m-26qc-wcjf, GHSA-q4gf-8mx6-v5v3, GHSA-8h8q-6873-q5fj RSC deserialisation DoS | high | 15.5.10 / .15 / .16 | **Exposed.** Any App Router Server Function endpoint |
| GHSA-955p-x3mx-jcvp internal Server Function endpoints disclosed | mod | 15.5.21 | Exposed. Low impact, because every action checks auth itself |
| GHSA-wfc6-r584-vfw7, GHSA-vfv6-92ff-j949 RSC response cache poisoning | mod/low | 15.5.16 | Possibly. Depends on CDN caching of RSC payloads |
| GHSA-68g3-v927-f742, GHSA-4633-3j49-mh5q cache confusion for requests with bodies | mod | 15.5.21 | Possibly |
| GHSA-3g8h-86w9-wvmq middleware redirects cache-poisoned | low | 15.5.16 | Possibly. Middleware redirects signed-out users to `/login` |
| GHSA-2xp9-vwfh-vxw4 RCE in Image Optimization (AVIF via sharp/libheif) | **crit** | 15.5.24 | Low. 3 `next/image` uses, local images only, Vercel serves `/_next/image` |
| GHSA-p293-qw3h-jr36 RCE on Windows-hosted servers | **crit** | 15.5.24 | Not in prod (Vercel is Linux). **Dev boxes are Windows**, so don't expose `next dev`/`next start` beyond localhost |
| GHSA-89xv-2m56-2m9x SSRF in Server Actions on custom servers | high | 15.5.21 | No. Vercel pins the host header |
| GHSA-c4j6-fc7j-m34r SSRF via WebSocket upgrade | high | 15.5.16 | No. Self-hosted only |
| GHSA-p9j2-gv94-2wf4 SSRF in rewrites, GHSA-ggv3-7p47-pfv8 smuggling in rewrites | high/mod | 15.5.21 / .13 | No `rewrites()` |
| GHSA-36qx-fr4f-26g5 middleware bypass, Pages Router + i18n | high | 15.5.16 | No Pages Router |
| GHSA-ffhc-5mcf-pf4q XSS with CSP nonces | mod | 15.5.16 | No nonces |
| GHSA-gx5p-jg67-6x7h XSS in `beforeInteractive` scripts | mod | 15.5.16 | No. The only one is static `/capacitor.js` |
| GHSA-9g9p-9gw9-jx7f, GHSA-3x4c-7xq6-9pq8, GHSA-h64f-5h5j-jqjh image optimizer DoS / disk growth | mod | 15.5.10–.16 | Low. No `remotePatterns`, and Vercel handles optimisation |
| GHSA-4c39-4ccg-62r3 unbounded Server Action payload, Edge runtime | mod | 15.5.21 | No. Actions run on Node |

**Bottom line:** the four DoS issues on Server Actions and RSC are the
real reason to move. They hit the live-game write path on game day.

## Breaking changes that touch this app

Sizes come from a grep of the tree at `acf48bb`.

### 1. Async request APIs (biggest diff, mostly mechanical)

`cookies()`, `headers()`, `params` and `searchParams` all return
Promises. 15.x still allows sync access with a dev warning; 16 removes
it. Don't ship with the warnings: do the codemod
(`npx @next/codemod@latest next-async-request-api .`), then review by
hand.

- **`createClient()`** in `src/lib/supabase/server.ts` calls `cookies()`.
  It becomes `async`, and the change ripples to about **56 call sites in
  49 files**: pages, layouts, the 22 `"use server"` files, `getUser` /
  `getMembership` (`React.cache` wrappers, fine as async), and
  `requireSuperAdmin`. Nearly all of them are already inside `async`
  functions, so each one becomes `await createClient()`.
- **`getBrand()`** in `src/lib/brand.ts` reads `headers()`.
  It has **31 calls in 21 files**, including `generateMetadata` in
  `src/lib/seo.ts`, `src/app/manifest.ts`, the root layout and the
  marketing components (`Hero`, `FinalCTA`, `TrustBand`, `LoginScreen`
  …). Those components must become async server components, or take
  `brand` as a prop from their page. Check that none of them is
  imported from a `"use client"` tree.
- **`readValidatedUserId()`** in `src/lib/auth/userIdHeader.ts`
  reads `headers()`. It is called from the live, netball and league
  actions and from game actions. Its unit test
  (`userIdHeader.test.ts`) mocks `next/headers` and needs the mock
  to return a Promise.
- **`cookies().get("siren-last-team")`** in `src/app/(marketing)/page.tsx`.
- **`params` / `searchParams` props**: **20 pages and layouts**
  (`teams/[teamId]/**`, `run/[token]/**`, `join/[token]`, `admin/**`,
  `dashboard`, `signup`). Route handlers that read
  `request.nextUrl.searchParams` are unaffected, and so are client
  components using `useParams` / `useSearchParams`.

### 2. Caching defaults

- **`fetch` is no longer cached by default.** Low risk. Every
  authenticated route is already dynamic, because it calls `cookies()`.
  The Supabase admin client already passes `cache: "no-store"`.
  `src/lib/season.ts` uses an explicit `unstable_cache`, which keeps
  working. The PlayHQ, Telegram, push and Decap `fetch`es are POSTs or
  run in route handlers.
- **GET route handlers are no longer cached by default.** No impact.
  The cron, auth callback, decap and dev-login handlers are all
  dynamic already.
- **Client Router Cache: `staleTimes.dynamic` drops from 30 s to 0.**
  This is the one coaches might feel. Back and forward between
  squad, games and live currently reuse the RSC payload for 30 s. On
  15, they refetch on every navigation. That gives fresher data and
  fits our heavy `revalidatePath` use, but it's slower on sideline 3G.
  Decide whether to set `experimental.staleTimes.dynamic: 30` to keep
  14's behaviour. Measure it on the live → break → live flow.

### 3. React 19 (required by App Router on 15)

- Bump `react`, `react-dom`, `@types/react` and `@types/react-dom` to 19.
- Grep found none of the usual breakers: no `useFormState`
  (`useFormStatus` is unchanged), no zero-arg `useRef<T>()`, no
  global `JSX.*`, no `defaultProps` or `propTypes`. The 4
  `forwardRef` uses still work.
- `zustand` 5, `geist`, `@vercel/speed-insights` and the Capacitor
  plugins all accept React 19.
- `next/dynamic({ ssr: false })` is now an error in Server Components.
  All 14 uses are in `"use client"` live-game components. Confirm with
  the build.
- Watch for new hydration errors on the live pages. React 19 reports
  mismatches React 18 tolerated, such as clock text and `Date.now()` in
  render.

### 4. Server Action IDs stop being stable across builds

On 14 an action's ID is a fixed hash of file path and export name
(`hashSalt: ""` in `build/swc/options.js`). Two local builds of the same
commit in different folders got different IDs, so it is the build path.
Vercel always builds in the same folder. An old bundle can keep calling
actions after a deploy as long as nothing moved. On 15 the IDs
are salted with the build's encryption key, which rotates.

This matters for Siren because of two things:

- the offline write queue (`src/lib/live/writeQueue.ts`), which replays
  persisted ops through the bundle that is loaded;
- Capacitor WebViews that stay warm in the app switcher on an old
  shell.

After a deploy, those clients would get "Failed to find Server Action"
mid-game until they reload.

Mitigation:

- Set a fixed `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in Vercel. It pins
  the salt; verify this on a preview deploy.
- And/or turn on Vercel Skew Protection.
- Add a check that a pre-deploy tab can still flush its queue.

### 5. Tooling and ecosystem

- `eslint-config-next` and `@next/third-parties` move to 15.5.x.
  `@next/third-parties` 14.x has a peer range of `next ^13 || ^14`, so
  it must move in the same commit.
- `next lint` is deprecated in 15.5 and removed in 16. Switch to the
  ESLint CLI with `npx @next/codemod@latest next-lint-to-eslint-cli .`
  and update the `lint` script and the `.githooks` pre-push gate.
  ESLint 8 stays supported (peer `^7.23 || ^8 || ^9`).
- `@ducanh2912/next-pwa` 10.2.9 hasn't been published since Sep 2024;
  its author moved to Serwist. It is a webpack plugin, so it should
  keep working on 15 as long as we build with webpack. Don't adopt
  `--turbopack` builds yet.
  - Plan a separate move to `@serwist/next` (peer `next >=14`) before
    16, which defaults to Turbopack.
  - Re-check that `sw.js`, the `/offline` fallback and the middleware
    matcher's `sw.js|workbox-|fallback-|*.js` exclusions still line up
    with the generated file names.
- `@supabase/ssr` 0.5.2 works with async `cookies()`. Just `await` it
  before building the client. No version bump needed.
- Node 18.18+ is required. Local Node is 24. Check the Node version set
  on the Vercel project.
- The middleware needs no change: it doesn't use `request.geo` or
  `request.ip`, which are removed in 15.

## Rough size

**Medium: about 2–3 focused days**, plus one device smoke test.
Roughly 70–90 files change, almost all mechanical await or `async`
edits.

Suggested commits:

1. **`chore(deps)`**: next 15.5.x, React 19, types, eslint-config-next,
   third-parties.
2. **`refactor`**: async `createClient` / `getBrand` /
   `readValidatedUserId` and their callers. Codemod plus review.
3. **`refactor`**: async `params` / `searchParams` in the 20 pages and
   layouts.

   Commits 1–3 only typecheck together. Next 15's generated page types
   reject a non-Promise `params`, so `next build` fails until #3 lands.
   Keep them on one branch and run the checks after #3.
4. **`chore`**: ESLint CLI instead of `next lint`, plus the hook.
5. **`fix`**: decide on `staleTimes`, set
   `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and add an e2e test that an
   old tab's queued write still lands after a rebuild.

Verification: full Playwright suite on a production build, then an iOS
and Android Capacitor pass. Cover the offline → online queue drain and
a deploy while a game is live.

The risky parts are #4 (action-ID rotation against the offline queue)
and the PWA plugin. The rest is volume, not difficulty.
