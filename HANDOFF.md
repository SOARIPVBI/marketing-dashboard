# Handoff

Marketing dashboard for SOAR. Static page on GitHub Pages, fed by a nightly
GitHub Actions job that pulls five sources and commits `data.json`.

## Where things live

| | |
|---|---|
| Dashboard | https://soaripvbi.github.io/marketing-dashboard/ |
| Repo | https://github.com/SOARIPVBI/marketing-dashboard |
| Job | Actions → "Refresh dashboard data", 06:30 UTC daily |

## Files

```
index.html              the whole dashboard — no build step, no dependencies
data.json               system of record, committed by the job, never truncated
annotations.json        event markers on the chart (site relaunch, tracking gaps)
scripts/fetch.mjs       the nightly fetcher
scripts/discover-buffer.mjs   prints Buffer org + channel IDs; re-run when a channel changes
.github/workflows/refresh.yml
```

## The one rule

**`data.json` is the system of record, not the APIs.** Mailchimp's daily
activity reaches back ~180 days, Buffer ~365, and Bluesky/Instagram/Facebook
publish no follower history at all — today's snapshot *is* the history. Once a
day scrolls out of a source's window, this file is the only copy.

So: never rebuild `data.json` from scratch, never let a commit shrink it. The
workflow has a guard that refuses to commit a file with fewer rows than the
one on main. Leave it there.

Second rule, same spirit: **raw counts only, never rates.** Every percentage
is derived in the browser from summed counts. Averaging seven daily open rates
does not give the weekly open rate — `sum(opened)/sum(delivered)` does.

## Sources

| Source | What it gives | Auth |
|---|---|---|
| Buffer (GraphQL) | views, reach, engagements, posts — per channel | personal API key, `account:read` + `posts:read` + `insights:read` |
| Bluesky | follower count | none, public endpoint |
| Meta | Instagram + Facebook follower counts | System User token, read-only scopes |
| Mailchimp | sends, opens, clicks, subscribers | API key with `-usX` suffix |
| GA4 | sessions, pageviews, key events | service account JSON, base64'd |

Secrets are already set on the repo (Settings → Secrets → Actions). Nothing
needs re-entering unless a key is rotated.

## Running it locally

Node 20+. Copy `.env.example` to `.env`, fill in the values, then:

```bash
node --env-file=.env scripts/fetch.mjs
```

`.env` is gitignored and must stay that way. Never paste a key into a chat or
a commit — put it in `.env` and point the tooling at the file.

To push a rotated key to the repo secrets:

```bash
gh secret set --env-file .env --repo SOARIPVBI/marketing-dashboard
```

Use `--env-file`, not a shell pipe: Windows PowerShell prepends a BOM when
piping to a native command, which silently corrupts every secret.

## When it breaks

The job **fails loudly on purpose** — a source returning zero rows fails the
run rather than committing an unchanged file and going green. That has already
caught a revoked Buffer key within a day.

A failed run still commits whatever succeeded, so one dead source doesn't
discard four good ones. The missing day backfills itself on the next run: the
fetcher re-fetches a trailing 7-day window rather than only appending, and
reaches further back if a run was missed entirely.

Check Actions for red runs. The job summary names the failing source.

Two things that will eventually bite:

- **Scheduled workflows are disabled after 60 days of repo inactivity**, and
  the job's own commits don't reliably reset that timer. If data goes stale,
  check whether the workflow was disabled and re-enable it. `workflow_dispatch`
  is on, so it can be fired by hand from the Actions tab.
- **Tokens expire.** Buffer keys get revoked, Meta System User tokens can be
  revoked in Business Settings, the GA4 service account can lose property
  access. All surface as a 401 in the run log.

## Known gaps

- **Conversion rate reads "Not configured."** GA4 has no key event defined on
  the property. Mark one in GA4 Admin → Events and it starts reporting.
- **LinkedIn has no follower count.** It needs Marketing Developer Platform
  approval, 2–4 weeks, for one number. Deliberately skipped.
- **Reach covers Instagram and LinkedIn only.** Facebook and Bluesky report
  engagement but not reach, which is why engagement rate uses
  `reach_engagements` — engagements counted only from channels that also
  reported reach. Blending all four inflated the rate by 24%.
- **Reach is a sum of per-post reach**, not unique people. Someone who saw
  twelve posts counts twelve times. Labelled as such in the UI; don't quote it
  as audience size.
- **Analytics gap, 2026-02-25 to 2026-08-06** (restored 2026-08-07). The GA4
  tracking code was missing from the live site. Those zeros are missing
  measurement, not lost traffic. The gap is recorded in `annotations.json` with
  an `until` date, and the dashboard treats any day inside it as untracked:
  no zero bars, no comparisons across it.

## If you're picking this up in a new Claude session

Clone the repo, open a session in the folder, and point it at this file. The
background it needs that isn't obvious from the code: the two rules above, the
per-channel metric differences, and the fact that follower levels are
irreplaceable — re-deriving them from a stale local copy silently flattens real
daily snapshots into one carried-forward value. Always `git pull` before
touching `data.json`.
