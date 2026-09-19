# Jevmail

**Open-source AI email triage for Gmail.** Reach inbox zero by seeing only the mail that needs a reply. Read-only, local, and sorted by [Jev](https://vercel.com/ai-gateway/models/jev), TypeSafe AI's new decision model, through [Vercel AI Gateway](https://vercel.com/ai-gateway).

Every message lands in one of five trays: **Needs reply**, **Updates** (bank alerts, deliveries, receipts, OTPs), **Promos**, **Sales**, or **Spam**, with a 1–5 urgency score. You watch it happen: previews ride the progress bar, cross the Jev checkpoint, and drop into their tray. 1,000 emails sort in about a minute for around 3 cents.

> Jevmail is an independent side project. It is not affiliated with TypeSafe AI, Vercel, or Google.

## What is Jev?

Jev is a "System One" model from [TypeSafe AI](https://typesafe.ai), released in September 2026 by ChatGPT co-creator Diogo Almeida. It is not a large language model and it never generates text. You give it a block of state and a set of typed questions, and it answers all of them at once with calibrated probabilities: a choice from your options, a score on your scale, or a yes/no. TypeSafe reports it runs 40 to 200 times faster than frontier LLMs and costs $0.042 per million input tokens with free output.

For email classification that is exactly the right shape. Jevmail asks three questions per message: which tray, how urgent, and whether a human wrote it to you. There is no prompt to engineer, no JSON to repair, and no way for the model to invent a label that isn't in the list.

## Why not an LLM?

An AI email assistant built on a chat model has to write a prompt, parse the reply, validate the JSON, retry on failures, and still pays for output tokens. Jev skips all of it. On a 1,000-email inbox that is the difference between minutes and seconds, and between dollars and cents. It also makes the app honest about uncertainty: every tray shows Jev's top two probabilities, and your corrections are stored next to the original answer.

## The read-only guarantee

Jevmail asks Google for a single scope, `gmail.readonly`. It cannot mark mail read, add labels, archive, report spam, or send. Google enforces this at the OAuth layer, not the app. Everything the app knows (trays, corrections, Done) lives in a local SQLite file you can delete at any time.

The only Gmail methods used: `messages.list`, `messages.get`, `threads.list`, `history.list`, `getProfile`.

## Setup

You need Node.js 22.18+ and pnpm, a Google account, and a Vercel account.

**1. Google Cloud (free, about 10 minutes)**

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. APIs & Services → Library → enable **Gmail API**.
3. APIs & Services → OAuth consent screen → External, Testing. Add your Gmail address under Test users.
4. Credentials → Create OAuth client → Web application. Redirect URI: `http://localhost:3000/api/auth/callback/google`.
5. Copy the client ID and secret.

Testing mode is fine for personal use. Its refresh tokens expire after 7 days, so expect a weekly re-sign-in.

**2. Vercel AI Gateway (about 2 minutes)**

1. Vercel dashboard → AI Gateway → API Keys → Create. Copy the `vck_…` key.
2. Jev is free on the Gateway's free tier, which allows 5 calls per 5-minute window. Buying any credits removes the limit; a 1,000-email sort then takes about a minute.

**3. Run**

```bash
git clone https://github.com/fazlerocks/jevmail
cd jevmail
pnpm install
cp .env.example .env.local   # fill in AUTH_SECRET, the Google client, and the Gateway key
pnpm dev
```

Open http://localhost:3000, sign in, and press **Fetch emails**. Sorting starts as soon as the first 100 have landed.

## How it works

- **Fetch.** The first sync pulls your `SYNC_LIMIT` newest inbox messages (default 20; set 1000 for the full show). It's paced under Gmail's per-user quota and stores each batch as it lands. **Sync new** fetches arrivals via Gmail's history API; **Fetch more** reaches further back, 100 at a time.
- **Sort.** Each message becomes a plain-text block (sender, subject, headers, trimmed body) and one `experimental_evaluate` call to `typesafe-ai/jev` with three questions answered in parallel: which tray (choice), how urgent (score), and whether a human wrote it to you (boolean). Results are stored with their probabilities; corrections you make are stored separately so Jev's original answer is kept.
- **Read.** The list and reading pane below the trays work like a mail client: `j` `k` move, `e` done, `o` open in Gmail, `esc` close. Mark all done per tray, with undo.

## Configuration

All optional, in `.env.local`:

| Variable | Default | What it does |
| --- | --- | --- |
| `SYNC_LIMIT` | 20 | Newest messages pulled on first sync, and the cap for Sync new |
| `FETCH_MORE_LIMIT` | 100 | Older messages per Fetch more click |
| `GMAIL_RATE_PER_MIN` | 100 | Fetch pace. Raise after increasing the Gmail API quota in Cloud Console |
| `JEV_CONCURRENCY` | 1 | Parallel Jev calls. Use 10 on the paid tier |
| `JEV_BURST` | 5 | Calls per background tick. Use 1000 on the paid tier |
| `JEV_DRAIN_INTERVAL_MS` | 310000 | Background tick. The free tier window is 5 calls per 299 s |
| `JEV_AUTO_SORT` | 1 | Set 0 so sorting starts only from a fetch or the Start sorting button |

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the app |
| `pnpm test` | Five-sample classifier test (skips without a Gateway key) |
| `pnpm sort:reset` | Forget the sorting and corrections, keep fetched messages |
| `pnpm db:reset` | Delete the local database (stop the server first) |
| `pnpm db:generate` | Generate a migration after changing `src/db/schema.ts` |

`/preview` (development only) runs the same screen from an in-memory simulator, no credentials needed: http://localhost:3000/preview?total=300&rate=20. Visiting `/?reset=1` clears browser-side read marks.

## Stack

Next.js 16, Auth.js, Drizzle + SQLite, AI SDK 7 (`experimental_evaluate`), Motion, shadcn/ui, Tailwind 4. Jev is called through Vercel AI Gateway, so the same code works with Gateway's free tier or paid credits, and with any other evaluation model the Gateway adds.

## Related

- [Jev on Vercel AI Gateway](https://vercel.com/ai-gateway/models/jev): model card, pricing, playground
- [TypeSafe AI](https://typesafe.ai): the team behind Jev and System One models
- [Vercel AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing): free tier and credits

## License

MIT
