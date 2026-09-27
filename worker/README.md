# Video correction service

The site remains on GitHub Pages. This Worker accepts anonymous suggestions and opens a PR changing only the matching member's video in `members.json`. No database or CAPTCHA is required.

## Deploy

From this directory, using Node 22 or newer:

```sh
npx wrangler@4 login
npx wrangler@4 deploy
npx wrangler@4 secret put GITHUB_TOKEN
```

Use a fine-grained GitHub personal access token owned by `allankenneth`, restricted to `allankenneth/bigaddposse.com`, with **Contents: Read and write** and **Pull requests: Read and write**. Paste it into Wrangler's hidden prompt, never into source files or chat. Set an expiration and replace the secret before it expires. GitHub's Metadata read permission is included automatically. PRs are authored by the token owner, so that owner can merge them but cannot approve their own PRs; no required approval rule is needed for this personal review workflow.

Set `window.BAP_CORRECTIONS_ENDPOINT` in `assets/corrections-config.js` to the Worker URL plus `/corrections`. An empty URL keeps the form in email-only mode. The Worker accepts the two production origins listed in `wrangler.jsonc`; add another exact origin only if needed. No domain transfer or DNS change is required for a workers.dev endpoint.

Set repository **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. Push the changes to the GitHub `main` branch. The workflow tests the Worker, builds the HTML, and uploads only public site files, excluding Worker code and credentials. It deploys after a merge; merely approving a PR does not publish it. Generated `index.html` is no longer committed by the workflow; run `node scripts/build.js` for local previews.

## Verify after connecting

1. Open a player's video and expand “Is this the wrong video?”.
2. Submit a different valid YouTube link. Confirm the returned PR changes only that player's video.
3. Submit the same correction again; it should link to the existing PR.
4. Close the test PR without merging, and delete its test branch if desired.
5. For a real correction, merge it and verify the Pages deployment and updated video.

Local checks:

```sh
node --test worker/test.mjs
npx wrangler@4 deploy --dry-run
```

## Abuse controls and optional CAPTCHA

Initial controls: a honeypot, 4 KB request limit, strict YouTube URL validation, known player matching, three requests per IP per minute, fifteen total requests per minute per Cloudflare location, and deterministic branches to deduplicate suggestions. Cloudflare rate-limit counters are approximate and local to each Cloudflare location, not a strict global quota. Visitors sharing an IP share the limit. Origin checks restrict browsers but are not authentication and do not stop a scripted client.

Turnstile is deliberately absent. To add it later, render a widget in the form, send its response token, and verify it in `checkSubmission()` before any GitHub calls. Another CAPTCHA provider can use the same integration point. This requires a small frontend/backend change, not a migration or database. Never trust a token without server-side verification.

For an immediate pause, change `SUBMISSIONS_ENABLED` to `false` in `wrangler.jsonc` and redeploy; the email fallback remains available. The rate-limit namespace IDs must be unique within the account if other Workers use this API.

GitHub credentials remain inside Worker secret storage. No visitor email or name is collected. Suggestions and optional explanations are public in PRs; the form discloses this. IP addresses are used for rate limiting but are not included in PRs or application logs. URL validation verifies syntax/provider, not whether a video exists, embeds successfully, or depicts the right person: that is part of human review.

A repeated suggestion links to an existing PR even if closed; it does not silently reopen a rejected request. GitHub API failures can leave a suggestion branch; retries recover an unchanged branch or reuse its existing commit. If its contents changed separately, a retry refuses to overwrite them.
