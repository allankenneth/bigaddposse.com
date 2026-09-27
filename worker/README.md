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
2. Submit a different valid HTTP or HTTPS video link. Confirm the returned PR changes only that player's video.
3. Submit the same correction again; it should link to the existing PR.
4. Close the test PR without merging, and delete its test branch if desired.
5. For a real correction, merge it and verify the Pages deployment and updated video.

Local checks:

```sh
node --test worker/test.mjs
npx wrangler@4 deploy --dry-run
```

## Abuse controls and optional CAPTCHA

Initial controls: a honeypot, 8 KB request limit, HTTP/HTTPS URL validation (no embedded credentials), known player matching, three requests per IP per minute, fifteen total requests per minute per Cloudflare location, and deterministic branches to deduplicate suggestions. Cloudflare rate-limit counters are approximate and local to each Cloudflare location, not a strict global quota. Visitors sharing an IP share the limit. Origin checks restrict browsers but are not authentication and do not stop a scripted client.

Turnstile is deliberately absent. To add it later, render a widget in the form, send its response token, and verify it in `checkSubmission()` before any GitHub calls. Another CAPTCHA provider can use the same integration point. This requires a small frontend/backend change, not a migration or database. Never trust a token without server-side verification.

For an immediate pause, change `SUBMISSIONS_ENABLED` to `false` in `wrangler.jsonc` and redeploy; the email fallback remains available. The rate-limit namespace IDs must be unique within the account if other Workers use this API.

GitHub credentials remain inside Worker secret storage. No visitor email or name is collected. Suggestions and optional explanations are public in PRs; the form discloses this. IP addresses are used for rate limiting but are not included in PRs or application logs. URL validation verifies syntax/provider, not whether a video exists, embeds successfully, or depicts the right person: that is part of human review.

A repeated suggestion links to an existing PR even if closed; it does not silently reopen a rejected request. GitHub API failures can leave a suggestion branch; retries recover an unchanged branch or reuse its existing commit. If its contents changed separately, a retry refuses to overwrite them.

## Video providers

Suggestions can link to any HTTP or HTTPS video URL. Known YouTube URLs are normalized for duplicate detection; other providers and self-hosted URLs preserve query strings and fragments. MP4, WebM, Ogg, M4V, and MOV file extensions select the native video player (codec support depends on the browser). Other URLs use the existing provider embeds or an iframe. An “Open video in a new tab” link is always available for sites that block embedding, unsupported formats, and extensionless file URLs. No submitted URL is fetched by the Worker.

## Community new-member submissions

The footer's **New BAP Inducted** button opens a code gate. `/members/unlock` validates the code on the Worker; `/members` validates it again before accepting a submission. Unlocking does not issue a persistent session, so revocation applies to already-open forms on their next submission. The code is held only in memory while the dialog is open, cleared on close/success, and never added to PRs, source files, URLs, browser storage, or application logs.

Name and induction year are required. Nickname, photo, video, and a review note are optional. JPEG, PNG, and WebP uploads up to 10 MB are resized in the browser to a maximum of 1200 pixels and re-encoded as JPEG without original metadata. The Worker bounds the request, checks JPEG framing/dimensions, and stores the photo under a generated `img/new-member-….jpg` path. Without a photo it uses `img/profile.jpg`. A single Git commit includes the photo and member record, so a reviewer cannot merge a half-finished upload. Existing members retain their order; the new record is inserted into the appropriate year. Review the actual photo and member details before merging.

Member codes are stored as SHA-256 hashes in the encrypted `MEMBER_SUBMITTER_CODE_HASHES` Worker secret. No production code or hash belongs in this repository. Five code attempts per IP per minute and thirty total attempts per Cloudflare location per minute are allowed. Normal submission rate limits also apply after code verification. These limits are approximate, as described above. A shared code grants submission access, not a verified identity; PR review remains the publication gate.

### Replace active codes or revoke one

From the repository root:

```sh
python3 worker/codes.py set
```

The hidden prompt accepts one code at a time. Enter **every code you want to keep active**, then press Enter at an empty prompt to finish. Any omitted code is revoked. This supports distributing separate codes to different groups and revoking one without revoking the others. The script sends only their hashes to the Worker secret through Wrangler and does not save the codes locally.

### Revoke all codes immediately

```sh
python3 worker/codes.py revoke-all
```

This updates only the Worker secret. No site rebuild is needed; once Cloudflare propagates the update, all unlock and final submission attempts using revoked codes fail. Existing PRs remain available for review. Running `set` with a new code reopens submissions. Deleting the `MEMBER_SUBMITTER_CODE_HASHES` secret also disables new-member submissions; video corrections remain available.

Member PRs are deduplicated by normalized full name and induction year. Existing roster names are rejected regardless of year. A duplicate submission returns its original PR rather than replacing an uploaded photo or member details. Closed submissions also return the original PR, so a rejected submission cannot silently reopen itself.
