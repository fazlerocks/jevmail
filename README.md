# Jevmail

A local, read-only Gmail client that shows you only the mail that needs a reply. Sorting is done by [Jev](https://vercel.com/ai-gateway/models/jev), TypeSafe AI's decision model, through Vercel AI Gateway.

Every inbox message lands in one of five stacks: **Needs reply**, **Updates** (transactional: bank alerts, deliveries, receipts, OTPs), **Promos**, **Sales**, or **Spam**, with a 1–5 urgency score. Jev returns typed probabilities instead of text, so there is nothing to parse and nothing to hallucinate.

The screen is a slim sorter strip (inbox count, the Jev gate, five paper stacks) over a Superhuman-style list with a reading pane. The strip opens while mail is being sorted, showing each email cross the gate and land on its stack, then settles back. Syncing is automatic. Keyboard: `j` `k` move, `e` done, `o` open in Gmail, `esc` close.

A dev-only `/preview` route drives the same screen from a simulator so the animation can be tuned without Google or Jev credentials.

## The read-only guarantee

Jevmail requests a single Gmail scope, `gmail.readonly`. It cannot mark mail read, add labels, archive, report spam, or send. Google enforces this at the OAuth layer, not the app. All app state (lanes, corrections, handled flags) lives in a local SQLite file.

The only Gmail methods used: `messages.list`, `messages.get`, `threads.list`, `history.list`, `getProfile`.

## Setup

**1. Google Cloud (free, ~10 min)**

1. Create a project at console.cloud.google.com.
2. APIs & Services → Library → enable **Gmail API**.
3. APIs & Services → OAuth consent screen → External, Testing. Add your Gmail address under Test users.
4. Credentials → Create OAuth client → Web application. Redirect URI: `http://localhost:3000/api/auth/callback/google`.
5. Copy the client ID and secret.

Testing mode is fine for personal use. Refresh tokens expire after 7 days, so expect a weekly re-sign-in.

**2. Vercel AI Gateway (~2 min)**

1. Vercel dashboard → AI Gateway → API Keys → Create. Copy the `vck_…` key.
2. Add a payment method to your team so the monthly free credit activates. Nothing is charged unless you buy credits. Jev costs about $0.04 per million input tokens and nothing for output.

**3. Run**

```bash
cp .env.example .env.local   # fill in the four keys
npx auth secret              # or paste any random string as AUTH_SECRET
pnpm install
pnpm dev
```

Open http://localhost:3000, sign in, click **Sync**.

## How it works

- First sync pulls your `SYNC_LIMIT` newest inbox messages (default 20) and stores a Gmail history ID.
- Later syncs ask Gmail for inbox additions since that ID. If the ID has expired (404), it falls back to a full pull. Known messages are skipped by ID, so nothing duplicates.
- Vercel's free tier allows about 5 Jev calls per 5-minute window. Sync classifies the first 5 right away; a background timer inside the app classifies 5 more every 5 minutes until the Pending lane is empty. Buying any AI Gateway credits removes the limit.
- Each new message becomes a plain-text state block (sender, subject, headers, trimmed body) and one `experimental_evaluate` call to `typesafe-ai/jev` with three questions: lane (choice), urgency (score), and whether a human wrote it to you (boolean).
- Corrections and handled flags are stored as feedback rows. The original Jev answer is preserved so the agreement rate stays honest.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app |
| `pnpm test` | Run the five-sample classifier test (skips without a gateway key) |
| `pnpm db:reset` | Delete the local database to start over (stop the server first) |
| `pnpm db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `pnpm db:studio` | Browse the local database |

## Not affiliated

Jevmail is an independent side project. It is not affiliated with or endorsed by TypeSafe AI or Vercel.
