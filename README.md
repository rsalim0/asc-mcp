# asc-mcp-pro

[![npm version](https://img.shields.io/npm/v/asc-mcp-pro.svg)](https://www.npmjs.com/package/asc-mcp-pro)
[![npm downloads](https://img.shields.io/npm/dm/asc-mcp-pro.svg)](https://www.npmjs.com/package/asc-mcp-pro)
[![license](https://img.shields.io/npm/l/asc-mcp-pro.svg)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/rsalim0/asc-mcp?style=social)](https://github.com/rsalim0/asc-mcp)

An MCP server that exposes **191 tools** spanning the entire App Store Connect API: apps, versions, builds, TestFlight, IAP & subscriptions, pricing, screenshots, certificates, reports — plus high-level **workflow macros** (`release_next_version`, `submission_health`, `aso_audit`, `crash_triage`, etc.) and a **declarative workflow runner** that executes JSON manifests.

Built so you can do *"translate my what's-new to all locales and push"* or *"submit the latest build to External Testers"* from a Claude / Cursor / Codex conversation instead of clicking through ASC for 40 minutes.

[![Add asc-mcp-pro to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=asc-mcp-pro&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImFzYy1tY3AtcHJvIl0sImVudiI6eyJBUFBfU1RPUkVfQ09OTkVDVF9LRVlfSUQiOiJZT1VSX0tFWV9JRCIsIkFQUF9TVE9SRV9DT05ORUNUX0lTU1VFUl9JRCI6IllPVVJfSVNTVUVSX0lEIiwiQVBQX1NUT1JFX0NPTk5FQ1RfUDhfUEFUSCI6Ii9hYnNvbHV0ZS9wYXRoL3RvL0F1dGhLZXkucDgifX0%3D)

> The button opens Cursor with a pre-filled install dialog. After install, edit `~/.cursor/mcp.json` and replace `YOUR_KEY_ID`, `YOUR_ISSUER_ID`, and the `.p8` path with your real values — see [Getting an App Store Connect API key](#getting-an-app-store-connect-api-key) below.

---

## Install

Same env vars everywhere — `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_P8_PATH`. Pick your client:

### Claude Code

```bash
claude mcp add appstore-connect \
  -e APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID \
  -e APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID \
  -e APP_STORE_CONNECT_P8_PATH=/absolute/path/to/AuthKey_XXXXXX.p8 \
  -- npx -y asc-mcp-pro
```

### OpenAI Codex CLI

```bash
codex mcp add appstore-connect \
  --env APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID \
  --env APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID \
  --env APP_STORE_CONNECT_P8_PATH=/absolute/path/to/AuthKey_XXXXXX.p8 \
  -- npx -y asc-mcp-pro
```

### Cursor

Click the **Add to Cursor** button at the top — fills the install dialog automatically. Then open `~/.cursor/mcp.json` and replace the `YOUR_*` placeholders with your real values.

### Claude Desktop / Windsurf / Zed / Continue

Paste this JSON into your client's MCP config file:

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "npx",
      "args": ["-y", "asc-mcp-pro"],
      "env": {
        "APP_STORE_CONNECT_KEY_ID": "YOUR_KEY_ID",
        "APP_STORE_CONNECT_ISSUER_ID": "YOUR_ISSUER_ID",
        "APP_STORE_CONNECT_P8_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

| Client | Config file location | Notes |
|---|---|---|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)<br>`%APPDATA%\Claude\claude_desktop_config.json` (Windows) | — |
| **Cursor** | `~/.cursor/mcp.json` | (Or use the button above) |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | — |
| **Zed** | `~/.config/zed/settings.json` | Use key `"context_servers"` instead of `"mcpServers"` |
| **Continue** (VS Code / JetBrains) | `.continue/config.json` | See [Continue MCP docs](https://docs.continue.dev/customization/mcp-tools) |

Restart the client after editing.

### Verify it works

```bash
APP_STORE_CONNECT_KEY_ID=YOUR_KEY_ID \
APP_STORE_CONNECT_ISSUER_ID=YOUR_ISSUER_ID \
APP_STORE_CONNECT_P8_PATH=/absolute/path/to/AuthKey.p8 \
npx -y asc-mcp-pro
```

Should print `appstore-connect-mcp ready (191 tools)` to stderr and wait. Ctrl+C to exit. (This is what your MCP client runs under the hood.)

### Optional: sales / finance reports

Set `APP_STORE_CONNECT_VENDOR_NUMBER=XXXXXXXXXX` (find it in App Store Connect → *Payments and Financial Reports*) to unlock the sales/finance report tools.

### Bleeding edge / local hacking

To install the latest unreleased `main` from GitHub:

```bash
# replace `asc-mcp-pro` with `github:rsalim0/asc-mcp` in any install command above
claude mcp add appstore-connect -e ... -- npx -y github:rsalim0/asc-mcp
```

To hack on the source:

```bash
git clone https://github.com/rsalim0/asc-mcp.git
cd asc-mcp
npm install
npm run build
# point your client at node $(pwd)/build/index.js
```

---

## Getting an App Store Connect API key

1. Go to https://appstoreconnect.apple.com/access/integrations/api
2. Click **+** to generate a new key. Role: **App Manager** (or **Admin** if you need full provisioning access).
3. Note the **Key ID** (10 chars, e.g. `7Y3QAAD5HX`) and **Issuer ID** (UUID).
4. **Download API Key** — saves `AuthKey_<KEYID>.p8`. ⚠️ One-time download — keep it safe.
5. Pass all three to the `claude mcp add` command above.

---

## Quick wins

Once installed, try in Claude Code:

```
list my apps
audit the latest version of <app name> for submission readiness
draft what's new from git log v1.2.0..HEAD in ~/code/myapp
find the newest valid build for <app name> and add it to my "Beta" group
list reviews I haven't responded to yet for <app name>
show me the keyword overlap and gaps for <app name>'s latest version
```

---

## Tool catalog (191 tools)

| Group | Tools | Notable |
|---|---:|---|
| `asc_ping` | 1 | Smoke test |
| `asc_apps_*` | 11 | List/get/update apps + app info localizations |
| `asc_versions_*` | 28 | Version CRUD, localizations, submission, phased release, review details, age rating |
| `asc_review_submissions_*` | 4 | v2 review submission API (bundles version + IAPs) |
| `asc_builds_*` | 12 | Builds + beta build localizations + export compliance |
| `asc_testflight_*` | 25 | Groups, testers (single + bulk), public links, beta review, feedback |
| `asc_reviews_*` | 3 | Customer reviews + developer responses |
| `asc_iap_*` | 8 | IAP CRUD + localizations + review submission |
| `asc_subscription*` / `asc_subscriptions_*` | 17 | Groups, subscriptions, prices, intro + promotional offers, localizations |
| `asc_pricing_*` | 6 | Price schedules, territories, availability, pre-orders |
| `asc_reports_*` / `asc_analytics_*` | 6 | Sales/finance (gzip TSV parsed), async analytics flow |
| `asc_users_*` / `asc_user_invitations_*` | 4 | Team management |
| `asc_bundle_*` / `asc_certificates_*` / `asc_profiles_*` / `asc_devices_*` | 14 | Signing assets |
| `asc_screenshots_*` / `asc_previews_*` | 17 | Sets, single upload, **folder matrix upload**, reorder, delete |
| `asc_workflow_*` | 14 | Macros (see below) + declarative runner |

### Workflow macros (the payoff)

- **`asc_workflow_release_next_version`** — copy metadata from prior version, attach latest build, set release type. Caller pushes "what's new" separately.
- **`asc_workflow_whats_new_from_git`** — `git log <since>..HEAD` → clean release-note bullets.
- **`asc_workflow_localize_metadata`** — push a translations map across locales (calling model does the translation inline).
- **`asc_workflow_testflight_quick_ship`** — newest valid build → groups → "what to test" → optional beta submit.
- **`asc_workflow_submission_health`** — pre-submit audit: locales complete, screenshots present, export compliance, review details, build attached, age rating.
- **`asc_workflow_aso_audit`** — keyword duplicates, unused chars, words wasted in description, optional competitor diff.
- **`asc_workflow_build_lifecycle`** — all builds w/ days-to-expiry, flag <7 days.
- **`asc_workflow_crash_triage`** — top diagnostic signatures grouped across recent builds.
- **`asc_workflow_id_resolver`** — bundle id / name / sku → canonical appId + latest version/build.
- **`asc_workflow_review_responses`** — list unanswered reviews.
- **`asc_workflow_metadata_sync`** — pull metadata to a JSON object or push from one.
- **`asc_workflow_analytics_oneshot`** — create analytics request + poll until ready.

### Declarative workflow runner

`asc_workflow_run` executes JSON manifests with templated values:

```json
{
  "name": "Cut next App Store version",
  "vars": { "appId": "1234", "newVersion": "1.2.3" },
  "steps": [
    {
      "name": "create",
      "tool": "asc_workflow_release_next_version",
      "input": { "appId": "${vars.appId}", "platform": "IOS", "newVersionString": "${vars.newVersion}" }
    },
    {
      "name": "audit",
      "tool": "asc_workflow_submission_health",
      "input": { "versionId": "${steps.create.newVersionId}" }
    }
  ]
}
```

Run it via `asc_workflow_run({ workflowPath: "/abs/path/to/release.workflow.json" })`. Use `dryRun: true` to validate + propagate dry-run to every step. Examples in `examples/`.

---

## Safety

- Every write tool supports `dryRun: true` → returns `{ method, path, body }` without sending.
- App Store char limits enforced before request (name 30, subtitle 30, keywords 100, promo 170, description 4000, what's-new 4000).
- The runner propagates `dryRun` to every step automatically when set.
- Stdio server logs only to stderr — never stdout (preserves JSON-RPC framing).

---

## Development

```bash
npm install
npm run typecheck       # tsc --noEmit
npm run build           # compiles to ./build/
npm run dev             # tsx src/index.ts (for iterating)
npm test                # runs scripts/test-all.ts against real ASC — requires .env
```

The test runner exercises every registered tool (reads as-is, writes with `dryRun: true`) and reports a pass/fail/skip matrix.

### Project layout

```
src/
├── index.ts          # stdio bootstrap
├── auth.ts           # ES256 JWT generation + caching
├── client.ts         # HTTP client, JSON:API error normalization
├── lib/
│   ├── jsonapi.ts    # JSON:API flatten helpers
│   ├── jsonapi-write.ts  # PATCH/POST body builders + dryRun gate
│   ├── pagination.ts # cursor walker
│   ├── projections.ts # default sparse fields per resource
│   ├── locales.ts    # locale codes + char limits
│   └── upload.ts     # 3-step asset reservation flow
└── tools/
    ├── registry.ts   # aggregates all tools
    ├── ping.ts apps.ts versions.ts builds.ts testflight.ts reviews.ts
    ├── iap.ts pricing.ts reports.ts users.ts provisioning.ts privacy.ts
    ├── screenshots.ts workflows.ts runner.ts
    └── types.ts
```

---

## Known limitations

- **App Privacy nutrition labels** are not exposed by Apple's public API. Edit them in the ASC web UI.
- **Power & Performance metrics** endpoint was removed from the public API.
- **Feedback submissions** (screenshots/crashes) can only be accessed by id (no listing endpoint).
- **Analytics reports** are async — `analytics_create_request` returns immediately; the reports are generated over the following minutes/hours. Use `asc_workflow_analytics_oneshot` to poll.

---

## License

MIT — see [LICENSE](./LICENSE).
