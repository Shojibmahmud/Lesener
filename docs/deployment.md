# Deployment

Lesener is deployed at **<https://lesener.vercel.app>**.

It is a static Vite build on Vercel's Hobby tier, talking to the same Supabase
project used for local development. There is no server-side rendering, no serverless
function of Vercel's own, and no CI — a push to `main` triggers a build and that is
the whole pipeline.

For operating the backend, see [operations.md](operations.md).

## What is deployed where

| | |
|---|---|
| Host | Vercel, Hobby tier, project `lesener` under `shojibs-projects` |
| Production URL | `https://lesener.vercel.app` |
| Git alias | `https://lesener-git-main-shojibs-projects.vercel.app` |
| Source | `main` — every push builds and promotes to production |
| Build time | ~7 seconds |
| Node version | 24.x (Vercel's default; the repo pins nothing) |
| Region | `iad1` |
| Backend | Supabase `mxkyojmuodcksvgddgke` — the same project local dev uses |

## Build settings

Vercel's Vite preset, unmodified:

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |
| Install command | `npm install` |

**No `vercel.json` exists and none is needed.** In particular there is no SPA
rewrite, because there is no router — see
[ADR 0009](decisions/0009-no-router-no-state-library.md). If a router is ever added,
a rewrite of everything to `/index.html` becomes mandatory or every deep link will
404.

## Environment variables

Two, both set in Vercel under **Settings → Environment Variables**, for
**Production and Preview**:

```
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Two things about them cause almost all first-deploy trouble.

### They must be typed `Config`, not `Secret`

Vercel refuses to save a `VITE_`-prefixed variable as a Secret, with:

> *Remove the public framework prefix to keep this value private. Public prefixes
> expose values to the browser. If that's safe, change the variable to Config.*

Vercel is right. `VITE_` means Vite inlines the value into the JavaScript bundle
every visitor downloads, so "secret" would be a promise it cannot keep. These values
are safe to expose — the publishable key only ever acts as `anon`, and `anon` is
revoked from every table ([security.md](security.md)) — so **Config** is the honest
label.

A variable already saved as a Secret **cannot be converted**: secrets are
write-only. Delete it and add it again as Config.

### Changing one requires a redeploy, not a restart

Vite inlines these at **build** time. Saving a new value does nothing to the
deployment already serving; the old value stays compiled into the old bundle
forever. After any change: **Deployments → latest → ⋯ → Redeploy**.

**Never add `SUPABASE_SERVICE_ROLE_KEY` here.** It has no `VITE_` prefix precisely
so Vite cannot inline it, and it belongs only to the Edge Function runtime, which
injects it server-side.

## Supabase settings the deployment depends on

Under **Authentication → URL Configuration**:

- **Site URL** — `https://lesener.vercel.app`
- **Redirect allowlist** — the same origin. The app sends
  `redirectTo: window.location.origin` on a password reset, so an unregistered
  origin means the mail still sends and the link then refuses to come home.

Vercel gives every preview build its own hostname, so a reset started from a preview
needs a wildcard entry (`https://lesener-*.vercel.app/**`) or it fails the same way.

Mail itself needs no work: custom SMTP is configured and reset reaches any address.
See [security.md](security.md#why-there-is-no-signup-confirmation).

## Deployment protection

The project runs with Vercel's **Standard Protection**. Production is public;
generated preview and git-alias URLs sit behind Vercel Authentication and answer a
`302` to a login for anyone not signed in to the Vercel account. That is why
`lesener-git-main-…` is not a way to check whether production is healthy.

## Verifying a deploy

The build succeeding is not the same as the app working — a missing environment
variable produces a **blank white page** with a healthy `200` behind it, because
`src/lib/supabase.js` throws at import time before React mounts.

Three checks, cheapest first:

```sh
# 1. Is it reachable and serving?
curl -s -o /dev/null -w "%{http_code}\n" https://lesener.vercel.app/

# 2. Which bundle is live?
BUNDLE=$(curl -s https://lesener.vercel.app/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)

# 3. Did the environment variables actually get inlined?
curl -s "https://lesener.vercel.app/$BUNDLE" | grep -c 'supabase\.co'
```

The neatest signal is inverted: search the live bundle for the guard string.

```sh
curl -s "https://lesener.vercel.app/$BUNDLE" | grep -c 'Missing VITE_SUPABASE_URL'
```

**`0` is the healthy answer.** When both variables are real constants at build time,
the minifier proves the throw unreachable and deletes it. A count of `1` means the
branch survived, which means at least one variable was missing during the build.

## Known issue: some Vercel edge IPs are unreachable from Bangladesh

`lesener.vercel.app` resolves to a rotating pool of Vercel edge addresses, and not
all of them are reachable from every network. Measured 2026-09-03 from the author's
connection:

| IP | Result |
|---|---|
| `64.29.17.131` | HTTP 200 |
| `64.29.17.195` | connection timed out |
| `216.198.79.131` | HTTP 200 |
| `216.198.79.65` | connection timed out |

The symptom is `ERR_CONNECTION_TIMED_OUT` in the browser while the site is perfectly
healthy for everyone else — a cached DNS answer pointing at an address this network
cannot route to. It is not a deployment fault and nothing in this repository can fix
it.

Before concluding the site is down:

1. Flush DNS (`ipconfig /flushdns` on Windows) and hard-reload.
2. Try another network — a phone hotspot settles it in seconds.
3. `curl` it, which often picks a different address than the browser cached.

If it ever becomes persistent rather than intermittent, the options are a custom
domain (costs money) or a host on different address space — Cloudflare Pages and
Netlify are both free and would serve this build unchanged.

## What is deliberately absent

- **No CI.** Nothing runs `npm run lint` or `npm test` before a deploy. Every push
  to `main` ships whatever is on it.
- **No staging.** Preview deployments talk to the same Supabase project as
  production, so a preview writes real rows.
- **No monitoring or error reporting.** A production failure is invisible unless
  someone opens the console.
- **No custom domain**, and none planned.

## A note on the free tiers

Both are genuinely free at this scale. Vercel Hobby is free for non-commercial use,
which this is, and the dictionary at 8,170 rows is about 4% of Supabase's 500 MB.

The one thing worth understanding properly is Supabase's project pausing, because a
paused database means the app loads and then cannot fetch its library.

### How pausing actually works

Checked against [Supabase's project pausing
guide](https://supabase.com/docs/guides/platform/free-project-pausing) on
2026-09-03, because the one-line version of this ("it pauses after a week of
inactivity") is alarming in a way the real policy is not.

- **The trigger is low activity over a 7-day period, not zero activity.** Supabase's
  wording is that "typically a few user requests to the database each day over the
  previous week is enough to keep the project from being paused". Opening the
  project in the Supabase dashboard also counts as activity.
- **You are warned first.** A warning email goes to the project owner roughly a week
  before the pause takes effect, and a second email confirms once it has happened.
  Loading the site once after the warning is enough to prevent it.
- **Restoring is one click**, from the project page in the dashboard, and the
  project comes back with its data and configuration intact.
- **The restore window is one year.** Note that Supabase's own page still carries the
  anchor `#90-day-window-to-restore` from when the window was shorter, so a search
  result or a cached copy of that page may tell you 90 days — the live text says a
  year. After the window closes, the remaining option is downloading a backup and
  restoring it elsewhere.

In practice this only bites a project nobody touches at all — including its owner —
for a week, and even then not without an email first. It is worth knowing before
putting the link somewhere it might sit unvisited, rather than something to design
around.
