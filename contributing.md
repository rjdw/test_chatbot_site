# Local Development & Deployment Guide

## 1 Prerequisites

| Tool             | Version               | Notes                                   |
| ---------------- | --------------------- | --------------------------------------- |
| **Node.js**      | ≥ 18 (LTS 20 + works) | We pin 22.x in `package.json → engines` |
| **npm**          | ≥ 9                   | Ships with Node                         |
| **Wrangler CLI** | 4 .x                  | `npm i -g wrangler`                     |

> **Access**  
> Ask a maintainer to invite you to **both**
>
> 1. the GitHub repository (collaborator or via PRs)
> 2. the Cloudflare account → Pages project **chatbot‑site**  
>    (`Account ▸ Members ▸ Invite` → role **Administrator** or **Pages Developer**).

---

## 2 Cloning & installing deps

```bash
git clone git@github.com:rjdw/test_chatbot_site.git
cd chatbot-site
npm ci                    # installs Tailwind, PostCSS, Wrangler, etc.
```

## 3 Environment variables for local dev

Create a .dev.vars file in the repo root (ignored by Git):

```bash
# .dev.vars
GEMINI_API_KEY="sk-…"
```

Add any other env‑vars you need; they are injected automatically when you `run wrangler pages dev`

## 4 Run the dev server

```
# build Tailwind for every save
npm run dev:css

# start Pages dev (HTML, Functions, live‑reload)
npx wrangler pages dev ./publicb
```

Open http://localhost:8788 in your browser.

## 5 Building for production

```
npm run build   # Generates public/assets/styles.css
```

All distributable files end up in `public/`.
That folder is what we deploy.
Please don't push compiled code without plan.

## 6 Deployment options

A — GitHub CI (preferred)
Every merge/push to `main` triggers the Pages build & deploy pipeline.
Build command: `npm run build`   Output directory: `public/`  
Will set this up with Cloudflare workers. Right now not working.

Create a PR, get it reviewed, merge → Pages redeploys automatically.

B — Manual Wrangler deploy
Use this when you need an emergency hot‑fix without a full CI round.

```
npm run build           # step 1 – compile assets
wrangler login          # first time only, opens browser
npx wrangler pages deploy ./public \
 --project-name chatbot-site # step 2 – upload
```

**Requirements**

- Member of the Cloudflare account.
- Wrangler picks up your API token from the browser login.
- Production‑only secrets (e.g. `GEMINI_API_KEY`) are already stored in the project. To add a new one:

```
    wrangler pages secret put <NAME> --project-name chatbot-site
```

## 7 Adding / Updating ads.txt

Edit or create `public/ads.txt`.  
This is for Google AdSense. Don't mess with this for now. Also the `<meta>` tags with AdSense verification. We'll figure this out later.

## 8 Adding new env‑vars

```
# once per variable – production
wrangler pages secret put YOUR_VAR --project-name chatbot-site
# for local dev add it to .dev.vars
```

## 9 Code style & linting

Tailwind classes: utility‑first; use @apply sparingly.

JavaScript: ES modules, async/await, Prettier defaults
(npm run format).

We don't have `npm test` yet. Should add...
