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

// Template for blog posts. The shell is kept deliberately spare — the
// surrounding site (including the Klein bottle hero on `/`) is owned by
// index.html; posts just render a centred reading column that inherits
// the global Fraunces/Inter system.
const POST_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="google-adsense-account" content="ca-pub-5642788581103145" />
    <title>{{TITLE}} — Richard Wang</title>
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fraunces:opsz,wght,SOFT@9..144,300..700,30..100&display=swap"
    />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main id="page-content">
      <article class="post-page">
        <a class="post-back" href="/">← Back to essays</a>
        <h1 class="post-title" id="post-title">{{TITLE}}</h1>
        <div class="post-meta">
          <span>Essay</span>
          <span>·</span>
          <span>richardjdwang.com</span>
        </div>
        <div class="post-body">
          {{CONTENT}}
        </div>
      </article>
    </main>

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
