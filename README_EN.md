# Skland Auto Sign-in · Cloudflare Workers

> 本项目已链接认可 [LINUX DO](https://linux.do) 社区。

English | [简体中文](./README.md)

Run automated Skland check-ins on Cloudflare Workers without maintaining a server. A Cron Trigger performs the daily check-in, while an authenticated HTTP endpoint is available for manual runs.

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/xiaoyulejia/skyland-auto-sign-CFworker">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare">
  </a>
</p>

To deploy your own copy, click the **Deploy to Cloudflare** button above. Cloudflare will clone the repository, install dependencies, build, and deploy the Worker. You only need to enter your own `TOKEN` and `WORKER_AUTH`; Node.js and Wrangler are not required on your computer.

> [!IMPORTANT]
> This project was completed with the assistance of artificial intelligence.

> [!IMPORTANT]
> This is an unofficial project for educational and personal use. It is not affiliated with Hypergryph, Skland, or Cloudflare. Treat your account token like a password: never commit it to Git or expose it in issues, logs, or screenshots.

## Features

- Supports Skland check-ins for Arknights and Arknights: Endfield
- Supports multiple Skland accounts
- Runs automatically with a Cloudflare Cron Trigger
- Optional ServerChan³, Qmsg, and PushPlus notifications
- Authenticated HTTP `POST` endpoint for manual runs
- Accepts a temporary Skland token in the JSON body of a manual request
- Stores tokens in Cloudflare Secrets instead of source code or Wrangler configuration

## Prerequisites

- The current [Node.js](https://nodejs.org/) LTS release (Node.js 20 or newer recommended)
- npm
- A valid Skland token

A [Cloudflare](https://dash.cloudflare.com/) account is required only for an online deployment. Local use does not require a Cloudflare account or `wrangler login`.

## Get a Skland token

1. Sign in to the [Skland website](https://www.skland.com/) in your browser.

   <p align="center"><img src="./assets/img1.png" alt="Skland website" width="70%"></p>

2. While still signed in, open <https://web-api.skland.com/account/info/hg>.
3. Find the `data.content` field in the returned JSON. Copy only its string value, without the field name, quotation marks, or the complete JSON response.

   <p align="center"><img src="./assets/img2.png" alt="Copy the token" width="70%"></p>

The response has roughly this structure; `copy-this-token-value` is only a placeholder:

```json
{
  "code": 0,
  "data": {
    "content": "copy-this-token-value"
  },
  "msg": "..."
}
```

> [!IMPORTANT]
> Store this value only in your local `.dev.vars` file or in Cloudflare Secrets. Never place a real token in `.dev.vars.example`, `wrangler.toml`, source files, or documentation.

## Deployment

### Option 1: One-click deployment (recommended)

Click the **Deploy to Cloudflare** button at the top of this page, sign in to your Cloudflare account, and provide:

- `TOKEN`: Your Skland token. Required for scheduled Cron sign-ins; separate accounts with commas.
- `WORKER_AUTH`: A separate random password for the manual trigger endpoint.
- `SC3_SENDKEY`, `SC3_UID`, `QMSG_KEY`, `PUSHPLUS_KEY`: Optional notification settings.

The Worker uses the Cron configuration in this repository: UTC 23:00, which is 07:00 the next day in Beijing time.

   <p align="center"><img src="./assets/img3.png" alt="Deployment page" width="50%"></p>

### Option 2: Command-line deployment

### 1. Clone and install

```bash
git clone https://github.com/xiaoyulejia/skyland-auto-sign-CFworker.git
cd skyland-auto-sign-CFworker
npm ci
npm run check
```

### 2. Create a local secrets file

Windows PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

macOS / Linux:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:

```dotenv
TOKEN="your-skland-token"
WORKER_AUTH="a-long-random-secret"
```

The default Cron-based setup requires both `TOKEN` and `WORKER_AUTH`:

- `TOKEN` is the Skland login credential used by scheduled Cron check-ins. You may omit this secret if you only pass temporary tokens in HTTP request bodies.
- `WORKER_AUTH` is a separate password that protects the manual HTTP endpoint. It is required whenever you use the HTTP API; do not reuse your Skland token.

Separate multiple account tokens with commas:

```dotenv
TOKEN="first-token,second-token,third-token"
```

Add any notification services you want to use:

```dotenv
SC3_SENDKEY="your-serverchan-sendkey"
SC3_UID="your-serverchan-uid-or-empty"
QMSG_KEY="your-qmsg-key"
PUSHPLUS_KEY="your-pushplus-token"
```

`.dev.vars` is excluded by `.gitignore`. Before committing, still run `git status --short` and confirm that the file is not staged or untracked.

### 3. Test locally

```bash
npm run dev
```

Wrangler normally listens on `http://localhost:8787`. Trigger a manual run from another terminal:

```bash
curl -X POST "http://localhost:8787/" \
  -H "Authorization: Bearer your-WORKER_AUTH"
```

Test the scheduled handler:

```bash
curl "http://localhost:8787/cdn-cgi/handler/scheduled?format=json"
```

Both tests contact Skland and may perform a real check-in.

### 4. Deploy to Cloudflare

Sign in to Cloudflare:

```bash
npx wrangler login
```

Run a build-only deployment check first:

```bash
npx wrangler deploy --dry-run
```

On the first deployment, securely upload the secrets from `.dev.vars` together with the Worker:

```bash
npx wrangler deploy --secrets-file .dev.vars
```

Wrangler prints the Worker URL after deployment. Secret values are not written to the repository or to `wrangler.toml`.

To update an individual secret later, use the interactive command and paste the value when prompted:

```bash
npx wrangler secret put TOKEN
npx wrangler secret put WORKER_AUTH
```

Optional notification secrets work the same way; set only the services you use:

```bash
npx wrangler secret put SC3_SENDKEY
npx wrangler secret put SC3_UID
npx wrangler secret put QMSG_KEY
npx wrangler secret put PUSHPLUS_KEY
```

Deploy later code changes with:

```bash
npm run check
npm run deploy
```

## Modify

### Change the schedule

- Cloudflare uses UTC. Convert from Beijing time (UTC+8) when setting the schedule.
- [Cron syntax](https://developers.cloudflare.com/workers/configuration/cron-triggers/#supported-cron-expressions)
- Field order: `minute → hour → day-of-month → month → day-of-week`
- `0 23 * * *` means 23:00 UTC every day, which is 07:00 the next day in Beijing time (UTC+8).

   <p align="center"><img src="./assets/img4.png" alt="Schedule settings" width="50%"></p>

### Enable the HTTP endpoint or bind a custom domain

You can enable the HTTP endpoint here, or bind your own Cloudflare domain.

   <p align="center"><img src="./assets/img5.png" alt="HTTP endpoint and domain settings" width="50%"></p>

## Verify the deployment

Send an authenticated `POST` request to the URL printed by Wrangler:

```bash
curl -X POST "https://skyland-auto-sign.<your-subdomain>.workers.dev/" \
  -H "Authorization: Bearer your-WORKER_AUTH"
```

View live logs with:

```bash
npx wrangler tail
```

The endpoint only accepts `POST`. A missing or incorrect `Authorization` header returns `401`; a missing `WORKER_AUTH` secret returns `503`.

### Pass a temporary token with curl

You can provide `token` in the JSON request body. The Worker uses it only for that request and does not store or log it. If the request body does not contain `token`, the Worker falls back to the deployed `TOKEN` secret.

Avoid typing real credentials directly into the command because your shell may retain them in its history. Set environment variables in the current terminal first.

Windows PowerShell:

```powershell
$env:SKLAND_TOKEN = "your-skland-token"
$env:WORKER_AUTH = "your-WORKER_AUTH"

$body = @{ token = $env:SKLAND_TOKEN } | ConvertTo-Json -Compress
curl.exe -X POST "https://skyland-auto-sign.<your-subdomain>.workers.dev/" `
  -H "Authorization: Bearer $env:WORKER_AUTH" `
  -H "Content-Type: application/json" `
  --data-binary $body
```

macOS / Linux (requires `jq`):

```bash
read -rsp "Skland Token: " SKLAND_TOKEN && echo
read -rsp "WORKER_AUTH: " WORKER_AUTH && echo
export SKLAND_TOKEN WORKER_AUTH

printf '%s' "$SKLAND_TOKEN" \
  | jq -Rs '{token: .}' \
  | curl -X POST "https://skyland-auto-sign.<your-subdomain>.workers.dev/" \
      -H "Authorization: Bearer ${WORKER_AUTH}" \
      -H "Content-Type: application/json" \
      --data-binary @-

unset SKLAND_TOKEN WORKER_AUTH
```

For multiple accounts, separate tokens inside the `token` string with commas. `WORKER_AUTH` must always be configured on the deployed Worker. You may omit the deployed `TOKEN` secret if you only use manual requests, but scheduled Cron check-ins still require it.

## Schedule

The default schedule in [wrangler.toml](./wrangler.toml) is:

```toml
[triggers]
crons = ["0 23 * * *"]
```

Cloudflare Cron uses UTC. This runs every day at 23:00 UTC, which is 07:00 the following day in China Standard Time (UTC+8). Run `npm run deploy` after changing the schedule; propagation may take several minutes.

## Run automatically before an MAA task

MAA can run a script before each task starts. This repository provides:

- Windows: [scripts/maa-sign.bat](./scripts/maa-sign.bat)
- macOS / Linux: [scripts/maa-sign.sh](./scripts/maa-sign.sh)
- Local configuration template: [scripts/maa-curl.env.example](./scripts/maa-curl.env.example)

### 1. Create the local MAA configuration

Copy the template; do not put real values in the committed `.example` file.

Windows PowerShell:

```powershell
Copy-Item scripts\maa-curl.env.example scripts\maa-curl.env
```

macOS / Linux:

```bash
cp scripts/maa-curl.env.example scripts/maa-curl.env
```

Edit `scripts/maa-curl.env`:

```dotenv
WORKER_URL=https://skyland-auto-sign.<your-subdomain>.workers.dev/
WORKER_AUTH=your-WORKER_AUTH
SKLAND_TOKEN=the-Skland-token-copied-from-data.content
```

### 2. Test the script manually

Windows:

```powershell
scripts\maa-sign.bat
```

macOS / Linux:

```bash
chmod +x scripts/maa-sign.sh
./scripts/maa-sign.sh
```

### 3. Add it to MAA

Open “Settings → Connection Settings” in MAA and find the pre-start script field. Select the absolute path to `maa-sign.bat`; on macOS / Linux, use the absolute path to `maa-sign.sh`. Labels may differ slightly between MAA versions.

![MAA pre-start script field](./assets/img_3.png)

MAA will now run the check-in script before starting each task. A completed pre-start-script entry means the script process has finished; use the Worker's JSON output to confirm whether the check-in itself succeeded.

![MAA pre-start script completed](./assets/img_5.png)

> [!IMPORTANT]
> MAA automation requires a reachable online `WORKER_URL`. Use your own deployed Worker or an address and `WORKER_AUTH` explicitly supplied by a service provider you trust. Never send your token to an unknown public Worker, because its operator can access the token while processing the request.

## Run locally without deploying

Use this option if you only want to perform a check-in immediately. Everything runs on your own computer, so you do not need to send the token to a third party or create a Cloudflare account. The service stops when you close Wrangler, so this mode does not provide an automatic daily Cron schedule.

### 1. Download and install

```bash
git clone https://github.com/xiaoyulejia/skyland-auto-sign-CFworker.git
cd skyland-auto-sign-CFworker
npm ci
```

### 2. Configure a local access password

Windows PowerShell:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

macOS / Linux:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and set `WORKER_AUTH` to a password used only on your computer. When passing the token temporarily with curl, `TOKEN` may be empty:

```dotenv
TOKEN=""
WORKER_AUTH="choose-a-local-password"
```

### 3. Start the local Worker

```bash
npm run dev
```

Keep that terminal open. Wrangler normally starts the local service at `http://localhost:8787`.

### 4. Check in with curl

Open another PowerShell window and run:

```powershell
$token = Read-Host "Enter your Skland token"
$body = @{ token = $token } | ConvertTo-Json -Compress

curl.exe -X POST "http://localhost:8787/" `
  -H "Authorization: Bearer choose-a-local-password" `
  -H "Content-Type: application/json" `
  --data-binary $body
```

macOS / Linux (requires `jq`):

```bash
read -rsp "Skland Token: " SKLAND_TOKEN && echo

printf '%s' "$SKLAND_TOKEN" \
  | jq -Rs '{token: .}' \
  | curl -X POST "http://localhost:8787/" \
      -H "Authorization: Bearer choose-a-local-password" \
      -H "Content-Type: application/json" \
      --data-binary @-

unset SKLAND_TOKEN
```

Replace `choose-a-local-password` in the command with the exact `WORKER_AUTH` value from `.dev.vars`. Separate multiple account tokens with commas. When finished, press `Ctrl+C` in the Wrangler terminal to stop the service.

> [!NOTE]
> “Without deploying” means running the project on the user's own computer. This project does not publish your online Worker URL or share its `WORKER_AUTH`; sharing that password would allow anyone who knows it to consume your Worker resources.
