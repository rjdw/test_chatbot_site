#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { marked } from 'marked';
import fg from 'fast-glob';

// Configure marked for better output
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Template for blog posts
const POST_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="google-adsense-account" content="ca-pub-5642788581103145" />
    <meta name="theme-color" content="#05070f" />
    <title>{{TITLE}} — Richard Wang</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="bg-ink text-parchment antialiased">
    <div class="site-backdrop" aria-hidden="true"></div>

    <nav class="site-nav">
      <a href="/" class="site-nav__brand">
        <span class="site-nav__mark" aria-hidden="true"></span>
        <span>Richard Wang</span>
      </a>
      <div class="site-nav__links">
        <a href="/#work">Work</a>
        <a href="/#essays">Essays</a>
        <a href="/#contact">Contact</a>
      </div>
    </nav>

    <main id="page-content" class="post-page container">
      <a class="post-back" href="/">&larr; Back to home</a>
      <article class="post-article">
        <h1 class="post-article__title">{{TITLE}}</h1>
        <div class="post-article__body prose-content">
          {{CONTENT}}
        </div>
      </article>
    </main>

    <footer class="site-footer">
      <div class="container site-footer__inner">
        <p>&copy; 2025 Richard Wang. Opinions are my own.</p>
        <nav>
          <a href="/#work">Work</a>
          <a href="/#essays">Essays</a>
          <a href="/#contact">Contact</a>
        </nav>
      </div>
    </footer>

    <script type="module" src="/main.js"></script>
    <script type="module" src="/router.js"></script>
  </body>
</html>`;

async function extractFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, content };
  }
  
  const frontmatterText = match[1];
  const remainingContent = content.slice(match[0].length);
  
  // Simple YAML parser for basic key-value pairs
  const frontmatter = {};
  frontmatterText.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      frontmatter[key.trim()] = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
    }
  });
  
  return { frontmatter, content: remainingContent };
}

async function processMarkdownFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const { frontmatter, content: markdownContent } = await extractFrontmatter(content);
  
  // Convert markdown to HTML
  const htmlContent = marked.parse(markdownContent);
  
  // Get title from frontmatter or filename
  const title = frontmatter.title || path.basename(filePath, '.md').replace(/_/g, ' ');
  
  // Apply template
  const finalHtml = POST_TEMPLATE
    .replace(/{{TITLE}}/g, title)
    .replace('{{CONTENT}}', htmlContent);
  
  // Determine output path
  const relativePath = path.relative('src/posts', filePath);
  const outputPath = path.join('src/posts', relativePath.replace('.md', '.html'));
  
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Write the HTML file
  await fs.writeFile(outputPath, finalHtml);
  
  console.log(`✅ Generated: ${outputPath}`);
  
  return {
    title,
    path: relativePath.replace('.md', '.html'),
    frontmatter
  };
}

async function buildPosts() {
  console.log('🔨 Building blog posts from markdown...');
  
  // Find all markdown files in src/posts
  const markdownFiles = await fg('src/posts/**/*.md');
  
  if (markdownFiles.length === 0) {
    console.log('📝 No markdown files found in src/posts/');
    return [];
  }
  
  const posts = [];
  
  for (const file of markdownFiles) {
    try {
      const postInfo = await processMarkdownFile(file);
      posts.push(postInfo);
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }
  
  console.log(`✨ Successfully built ${posts.length} posts`);
  return posts;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  buildPosts().catch(console.error);
}

export { buildPosts };
