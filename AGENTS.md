# ClubPulse — agent notes

role-based club activity dashboard. next.js 15 (app router) + typescript + prisma/postgres
(neon) + next-auth v4 (google provider) + tailwind v4.

read this before touching auth, the database, or deployment. a lot of it is not in the
code.

## the one that will bite you: migrations are not deployed by the build

the vercel build script is `prisma generate && next build`. it generates the client, it
does **not** apply migrations. so the database schema can be missing while the app
builds and deploys perfectly green.

what happens when that occurs: next-auth v4 calls `adapter.createUser()` on a first-time
google sign-in, prisma throws `P2021: The table public.users does not exist`, next-auth
wraps it in `CreateUserError`, and redirects to
`/api/auth/error?error=OAuthCreateAccount`. the built-in next-auth page renders that as
**"Try signing in with a different account."** — which reads like an account-linking
problem and is not one. it is a missing table.

this actually happened: the production neon database had **zero tables** and no
`_prisma_migrations` row, while every vercel env var (including `DATABASE_URL`) still
dated from 2025-05-09 and had never been changed. migrations had simply never been
applied.

after any database reset, new environment, or fresh neon branch:

```bash
npm run db:deploy   # prisma migrate deploy
npm run db:status   # expect: "Database schema is up to date!"
npm run db:smoke    # exercises createUser/linkAccount/createSession, then cleans up
```

`npm run db:smoke` is the fastest way to prove the auth path is intact. it exits
non-zero and points at `db:deploy` when a table is missing.

## next-auth v4 error message cheat sheet

the built-in error page (`/api/auth/error?error=<code>`) maps codes to messages. several
different codes collapse into the same unhelpful sentence, so the message alone does not
identify the failure:

| error code                | rendered message                                             |
| ------------------------- | ------------------------------------------------------------ |
| `OAuthAccountNotLinked`   | "To confirm your identity, sign in with the same account..." |
| `OAuthCallback`           | "Try signing in with a different account."                   |
| `OAuthCreateAccount`      | "Try signing in with a different account."                   |
| `OAuthSignin`/`Signin`/`Callback`/`EmailCreateAccount` | "Try signing in with a different account." |

read the real error from the server logs (vercel runtime logs for the deployment), not
from the page.

**silent failure to know about:** next-auth v4's `/api/auth/session` route catches
database errors and returns `{}` with HTTP 200. a completely broken database therefore
looks exactly like "not signed in", never like an error. if the dashboard suddenly shows
the sign-in button for everyone, check the database before the cookies.

## roles come from a google sheet, and a sheet failure is silent

role source is the `Activities` tab of the club sheet:

- `GOOGLE_SHEET_MEMBER_DATA_RANGE` = `Activities!A2:D`
- column B (index 1) = member email, column D (index 3) = role string
- `PANEL_ACCESS_ROLES` = comma separated role strings that map to `Role.PANEL`; anything
  else found in the sheet maps to `Role.MEMBER`; anyone not found in the sheet becomes
  `Role.GUEST`
- `specificRole` stores the raw role string from the sheet

the sheet is read with a service account, not a user login:
`GOOGLE_SERVICE_ACCOUNT_CREDENTIALS` holds the service-account JSON (its `client_email`
is the identity that needs access; the gcp project id is inside the same JSON), scopes
`spreadsheets.readonly`.

**the service account must be shared on the target sheet as a reader.** if it is not,
the sheets api returns `404 Requested entity was not found` (not a 403 — google hides
the existence of a spreadsheet the caller cannot see). `getSheetData()` swallows that
error and returns `null`, and the sign-in event then quietly assigns `Role.GUEST` with
only a `console.error`. so a broken sheet share looks like "i signed in but i have no
dashboard" rather than an error. `getMemberStatus()` (the self-service portal) fails
outright in that state.

verify the sheet + service account together:

```bash
node -e "..." # see scripts/smoketest-sheets.mjs pattern in git history
```

or just check the sheet id from the dashboard and confirm the service account email has
"Viewer" access on the sheet, plus an `Activities` tab with that exact name.

## GOOGLE_SERVICE_ACCOUNT_CREDENTIALS and `dotenv`

`vercel env pull` writes the multi-line service-account JSON as a single dotenv line and
escapes the *structural* newlines as `\n`. the `\n` sequences *inside* the private key
string stay two characters, which is what `googleSheets.ts` expects — it does
`private_key.replace(/\\n/g, "\n")` before handing the key to the JWT client.

`dotenv -e .env.local` does the opposite: it expands `\n` inside double-quoted values
into real newlines, which makes `JSON.parse(credentials)` fail with
`SyntaxError: Bad control character in string literal`. **that only affects local runs.**
the production runtime on vercel receives the value exactly as stored, so `JSON.parse`
works there.

if you need the sheet client locally, parse `.vercel/.env.production.local` by hand and
only un-escape `\n` that sit *outside* json strings — do not use `dotenv -e` for
`GOOGLE_SERVICE_ACCOUNT_CREDENTIALS`.

## infrastructure map

| thing          | where                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------- |
| database       | neon postgres, `ap-southeast-1` (singapore — closest region to dhaka), db `neondb` — exact host + role are in the encrypted `DATABASE_URL` |
| deploy owner   | vercel account `ceilingfan690@gmail.com`, team `clubpulses-projects`, project `clubpulse`          |
| live domain    | `https://bucsc.vercel.app` (verified custom domain on that project)                               |
| repo           | `github.com/FahadBinHussain/clubpulse` — public                                                  |
| prisma output  | `../node_modules/.prisma/client` (schema.prisma `generator.output`)                               |

pull the production env locally (all vercel env vars are encrypted, `env pull` decrypts
them):

```bash
cd ~/Downloads/clubpulse
"C:\Users\Admin\Downloads\mainframe\vercel-account.ps1" run ceilingfan690@gmail.com pull --yes --environment=production
```

`.env*` and `.vercel/` are gitignored — never commit them.

## local dev notes

- `npm run dev` runs `node utils-patch.js` first (`predev`). it is a turbopack
  compatibility shim that copies `uglify-js`/`mjml` into fake `[project]` and
  `(action-browser)` module paths. do not delete it without checking why it exists.
- `npm run dev:regular` skips turbopack.
- the repo has both `next.config.js` and `next.config.ts`. next.js picks one of them;
  having both is a known source of confusion.
- `src/app/page.tsx` is the whole app shell: `useSession()` plus a `Sidebar` that
  switches between `dashboard` (PANEL) and `selfStatus` (everyone else).

## verified-good command set

```bash
npm run db:status    # "Database schema is up to date!"
npm run db:deploy    # apply migrations (safe on an empty db; it is additive)
npm run db:smoke     # create user -> link account -> create session -> read -> cleanup
```
