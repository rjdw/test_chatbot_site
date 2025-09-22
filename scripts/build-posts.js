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
    <meta name="google-adsense-account" content="ca-pub-5642788581103145" />
    <title>{{TITLE}}</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="bg-gray-50 text-gray-800 leading-relaxed">
    <main id="page-content" class="mx-auto max-w-3xl px-4 space-y-12">
      <section aria-labelledby="post-title" class="border-t mt-10 pt-10">
        <h2 id="post-title" class="text-2xl font-semibold mb-4 tracking-tight">
          {{TITLE}}
        </h2>
        
        <div class="max-w-3xl mx-auto leading-relaxed space-y-6 prose prose-gray max-w-none">
          {{CONTENT}}
        </div>
      </section>
      <section aria-labelledby="border" class="border-t mt-10 pt-10"></section>
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
