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
npm ci                    # installs deps
```

## 3 Environment variables for local dev

Create a .dev.vars file in the repo root (ignored by Git):

```bash
# .dev.vars
echo "GEMINI_API_KEY=<your-key>" > .dev.vars
```

Add any other env‑vars you need; they are injected automatically when you `run wrangler pages dev`

## 4 Run the dev server

```
# 4 Launch everything (pages + Tailwind + Vite)
npm run dev           # → http://localhost:8788
```

Open http://localhost:8788 in your browser.
Need to reload site every time you edit. Don't need to rerun dev build.  
Might need to turn off browser cache depending on your edits.

## 5 Building for production

```
npm run build   # Generates css and js builds
```

All distributable files end up in `public/`.
That folder is what we deploy.  
**Please don't push compiled code without plan.**

## 6 Deployment options

### Preferred

We'll figure out Cloudflare perms later.  
For now,

```bash
npm run build
git checkout -b feat/<your-branch>
git add .
git commit -m "feat: concise description"
git push --set-upstream origin feat/<your-branch>
```

Then I'll deploy with

```bash
npm run deploy
```

Without Cloudflare login perms you can't deploy.

### Coming soon

GitHub CI:

Every merge/push to `main` triggers the Pages build & deploy pipeline  
Create a PR, get it reviewed, merge → Pages redeploys automatically.

**or**

Manual Wrangler deployment  
Use this when you need an emergency hot‑fix without a full CI round.

```
wrangler login          # first time only, opens browser
npm run deploy
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

Just talk if you need production env secret vars.

```
# for production use GUI or
wrangler pages secret put YOUR_VAR --project-name chatbot-site
```

```
# for local dev add it to .dev.vars
echo VAR_NAME=<var> > .dev.vars
```

## 9 Code style & linting

Tailwind classes: utility‑first; use @apply sparingly.

JavaScript: ES modules, async/await, Prettier defaults
(npm run format).

We don't have `npm test` yet. Should add...
