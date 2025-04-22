# Gemini Chatbot Static Test Site

Static website with a gemini api call. Using for testing stuff.  
Can run locally with something like `npx serve .`

Remember to disable ad blockers when testing ads...

## Changing into site hosted at

[richardjdwang.com](richardjdwang.com)

# 1) Install / upgrade Wrangler

npm i -g wrangler # or: pnpm add -g wrangler

# 2) Authenticate once

wrangler login

# 3) Create (or link) a Pages project ── interactive prompts

npx wrangler pages project create # choose “chatbot-site” as the name

# 4) First deploy – assume your static files live in ./public

npx wrangler pages deploy ./public --project-name chatbot-site
