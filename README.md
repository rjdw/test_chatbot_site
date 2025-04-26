# Gemini Chatbot Static Test Site

Static website with a gemini api call. Using for testing stuff.  
Remember to disable ad blockers when testing ads...

## Changing into site hosted at

[richardjdwang.com](richardjdwang.com)

# Richard Wang – Chatbot + Blog Site

Adding blog to site to host Google and/or Meta ads.  
A lightweight Cloudflare Pages project that serves a personal blog **and** a floating Gemini-powered chat widget.

| Feature        | Stack                                        |
| -------------- | -------------------------------------------- |
| Static hosting | Cloudflare Pages                             |
| Serverless API | Cloudflare Functions (Workers)               |
| Build          | Vite 4 + Rollup                              |
| Styling        | Tailwind CSS v3 (JIT)                        |
| Chat widget    | Web Component + Google Gemini proxy          |
| Dev loop       | Wrangler CLI · Tailwind watcher · Vite watch |

---

## Quick-start (clone + preview)

Read [Contributing Notes](./contributing.md) for more detailed instructions

```bash
# 1 Clone
git clone git@github.com:rjdw/test_chatbot_site.git
cd chatbot-site

# 2 Install dependencies
npm ci

# 3 Set local secrets (do **NOT** commit)
echo "GEMINI_API_KEY=<your-key>" > .dev.vars

# 4 Launch everything (pages + Tailwind + Vite)
npm run dev           # → http://localhost:8788
```

## adding a post on the blog

- Draft in Markdown (`drafts/my-post.md`)
- Convert once:

```bash
pandoc drafts/my-post.md                      \
    -o src/posts/my-post.html              \
    --standalone                           \
    --metadata title="Cool Post"
```

- Wrap the HTML body with the site shell (see `posts/` examples).
- Add a teaser card inside _Latest essays_ in `src/index.html`.
- `npm run dev` – verify styling and PJAX navigation.”
