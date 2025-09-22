# Blog Writing Workflow

## ✨ New Markdown-First Approach

Instead of writing tedious HTML, you can now write blog posts in **Markdown** with frontmatter metadata. The build system automatically converts them to properly styled HTML pages.

## 📝 Writing a New Post

1. **Create a new `.md` file** in `src/posts/`:
   ```bash
   touch src/posts/my-new-post.md
   ```

2. **Add frontmatter and content**:
   ```markdown
   ---
   title: Your Awesome Post Title
   date: 2025-09-22
   readTime: 3 min read
   description: A brief description for SEO and previews
   ---

   # Your Post Content

   Write your post in **Markdown**! You can use:

   - **Bold** and *italic* text
   - [Links](https://example.com)
   - `code snippets`
   - Lists and quotes
   - Headers and subheaders

   ## Code Blocks

   ```javascript
   console.log("Hello, world!");
   ```

   ## Math (if needed)
   You can even include LaTeX: $E = mc^2$
   ```

3. **Build and preview**:
   ```bash
   npm run build:posts  # Convert markdown to HTML
   npm run dev          # Start development server
   ```

## 🔧 Development Commands

```bash
# Build all posts from markdown
npm run build:posts

# Full development workflow (posts + CSS + JS)
npm run dev

# Production build
npm run build

# Deploy to Cloudflare Pages
npm run deploy
```

## 📁 File Structure

```
src/posts/
├── my-post.md          # Your markdown source
├── my-post.html        # Generated HTML (don't edit!)
└── _template.html      # Template for manual HTML posts
```

## 🎨 Styling

Posts automatically get:
- Tailwind CSS typography classes
- Responsive design
- Proper spacing and readability
- Code syntax highlighting
- Consistent with your site theme

## 📊 Frontmatter Options

```yaml
---
title: "Post Title"           # Required
date: 2025-09-22             # Publication date
readTime: "5 min read"       # Reading time estimate
description: "SEO description" # Meta description
tags: ["tech", "ai"]         # Categories (optional)
draft: false                 # Set to true to exclude from build
---
```

## 🚀 Benefits Over HTML

- **Faster writing**: Focus on content, not markup
- **Consistent styling**: Automatic application of your theme
- **SEO-friendly**: Proper meta tags and structure
- **Version control friendly**: Clean diffs, easy to review
- **Portable**: Standard markdown works everywhere
- **Future-proof**: Easy to migrate to other systems

## 🔄 Migration from HTML

Your existing HTML posts remain functional. To convert:

1. Copy the text content from your HTML post
2. Create a new `.md` file with the same name
3. Add frontmatter with title, date, etc.
4. Paste content and format as markdown
5. Run `npm run build:posts` to generate new HTML
6. The old HTML file can be deleted

## ⚡ Pro Tips

- Use `npm run dev` while writing - it rebuilds automatically
- Preview your posts at `http://localhost:8788/posts/your-post.html`
- The PJAX router keeps your chat widget alive between pages
- Markdown files are ignored by git in the build output
- All your existing site features (chat, ads, routing) work seamlessly
