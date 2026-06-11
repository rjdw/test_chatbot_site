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
// surrounding site (including the hero on `/`) is owned by index.html;
// posts just render a centred reading column that inherits the global
// Fraunces/Inter system.
const POST_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="google-adsense-account" content="ca-pub-5642788581103145" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#000000" />
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
        <a class="post-back" href="/#essays" data-back-link data-back-fallback="/#essays">← Back</a>
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

async function regenerateFavicons() {
  // Rebuild the PNG favicons from favicon.svg whenever the SVG is newer
  // (or the PNGs don't exist yet). Keeps checked-in assets in sync
  // without requiring devs to remember an extra command.
  try {
    const svgPath = path.resolve('src/public/favicon.svg');
    const svgStat = await fs.stat(svgPath);
    const pngPath = path.resolve('src/public/favicon-512.png');
    let pngMtime = 0;
    try {
      pngMtime = (await fs.stat(pngPath)).mtimeMs;
    } catch {}
    if (pngMtime && pngMtime >= svgStat.mtimeMs) return;

    const { default: sharp } = await import('sharp');
    const svg = await fs.readFile(svgPath);
    for (const size of [32, 180, 512]) {
      const buf = await sharp(svg, { density: 384 })
        .resize(size, size)
        .png()
        .toBuffer();
      await fs.writeFile(path.resolve(`src/public/favicon-${size}.png`), buf);
    }
    await fs.writeFile(
      path.resolve('src/public/apple-touch-icon.png'),
      await sharp(svg, { density: 384 }).resize(180, 180).png().toBuffer()
    );
    console.log('✅ Regenerated favicon PNGs');
  } catch (err) {
    console.warn('⚠️  Favicon regeneration skipped:', err.message);
  }
}

async function validateContent() {
  // content.json now lives in src/public/ so Vite copies it verbatim.
  // We only need to validate the JSON here to catch errors early.
  try {
    const src = path.resolve('src/public/content.json');
    const raw = await fs.readFile(src, 'utf-8');
    const data = JSON.parse(raw);
    console.log('✅ Validated: src/public/content.json');

    // Warn about locally-referenced thumbnails that don't exist yet.
    const items = [
      ...(data.essays || []),
      ...(data.notes || []),
      ...(data.media || []),
    ];
    for (const it of items) {
      const t = it.thumbnail;
      if (!t || !t.startsWith('/')) continue;
      const p = path.resolve('src/public', t.replace(/^\//, ''));
      try {
        await fs.access(p);
      } catch {
        console.warn(
          `⚠️  thumbnail not found for "${it.id || it.title}": ${t} (looked at ${p})`
        );
      }
    }
  } catch (err) {
    console.warn('⚠️  content.json invalid or missing:', err.message);
  }
}

// ─── Media pages (reusable templates) ──────────────────────────────

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c])
  );
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

const KIND_LABEL = {
  video: 'Video',
  podcast: 'Podcast',
  talk: 'Talk',
};

const MEDIA_SHELL = (item, playerHtml, extraHead = '', embedCss = '') => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="google-adsense-account" content="ca-pub-5642788581103145" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <meta name="theme-color" content="#000000" />
    <title>${escapeHtml(item.title)} — Richard Wang</title>
    <meta name="description" content="${escapeHtml(item.description || '')}" />
    <meta property="og:title" content="${escapeHtml(item.title)}" />
    <meta property="og:type" content="${item.kind === 'video' ? 'video.other' : 'article'}" />
    <meta property="og:description" content="${escapeHtml(item.description || '')}" />
    ${item.thumbnail ? `<meta property="og:image" content="${escapeHtml(item.thumbnail)}" />` : ''}
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fraunces:opsz,wght,SOFT@9..144,300..700,30..100&display=swap"
    />
    <link rel="stylesheet" href="/styles.css" />
    ${extraHead}
    ${embedCss ? `<style>${embedCss}</style>` : ''}
  </head>
  <body>
    <main id="page-content" class="media-shell">
      <article class="media-page">
        <a class="post-back" href="/#media" data-back-link data-back-fallback="/#media">← Back</a>

        <header class="media-head">
          <span class="media-kind">${escapeHtml(KIND_LABEL[item.kind] || 'Media')}</span>
          <h1 class="media-title">${escapeHtml(item.title)}</h1>
          <div class="media-meta">
            ${item.venue ? `<span class="media-venue">${
              item.venueUrl
                ? `<a href="${escapeHtml(item.venueUrl)}" target="_blank" rel="noopener">${escapeHtml(item.venue)}</a>`
                : escapeHtml(item.venue)
            }</span>` : ''}
            ${item.date ? `<span>·</span><span>${escapeHtml(formatDate(item.date))}</span>` : ''}
            ${item.duration ? `<span>·</span><span>${escapeHtml(item.duration)}</span>` : ''}
          </div>
        </header>

        <div class="media-player">
          ${playerHtml}
        </div>

        ${item.description ? `
        <div class="media-body">
          <p class="media-lede">${escapeHtml(item.description)}</p>
          ${item.body ? item.body : ''}
        </div>` : ''}

        ${Array.isArray(item.chapters) && item.chapters.length > 0 ? `
        <section class="media-chapters" aria-labelledby="media-chapters-title">
          <h2 class="media-chapters-title" id="media-chapters-title">Chapters</h2>
          <ol class="media-chapter-list">
            ${item.chapters
              .map(
                (c) => `
              <li>
                <button
                  class="media-chapter-btn"
                  type="button"
                  data-start="${Number(c.start) || 0}"
                >
                  <span class="media-chapter-time">${escapeHtml(c.timeLabel || formatSeconds(c.start))}</span>
                  <span class="media-chapter-label">${escapeHtml(c.label)}</span>
                </button>
              </li>`
              )
              .join('')}
          </ol>
        </section>` : ''}

        ${item.liveUrl ? `
        <div class="media-external">
          <a class="media-external-link" href="${escapeHtml(item.liveUrl)}" target="_blank" rel="noopener">
            Open original on ${escapeHtml(item.source === 'youtube' ? 'YouTube' : item.source || 'source')}
            <span aria-hidden="true">↗</span>
          </a>
        </div>` : ''}

        ${Array.isArray(item.tags) && item.tags.length > 0 ? `
        <div class="media-tags">
          ${item.tags.map((t) => `<span class="blog-tag">${escapeHtml(t)}</span>`).join('')}
        </div>` : ''}
      </article>
    </main>

    <footer class="blog-footer">
      <div class="blog-footer-inner">
        <a class="blog-footer-mark" href="/">
          <svg viewBox="0 0 40 20" fill="none" stroke="currentColor"
               stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4"
               aria-hidden="true">
            <path d="M10 10c0-4 4-6 7-3s5 6 8 6 6-2 6-5-3-6-6-5-5 4-8 6-5 5-7 4-4-2-4-5 3-5 6-5"/>
          </svg>
          Richard Wang
        </a>
        <nav class="blog-footer-nav" aria-label="Footer">
          <a href="/#about">About</a>
          <a href="/#essays">Essays</a>
          <a href="/writing">Archive</a>
          <a href="https://cladlabs.ai" target="_blank" rel="noopener">Clad Labs</a>
        </nav>
        <p class="blog-footer-copy">&copy; 2025 Richard Wang. Opinions are my own.</p>
      </div>
    </footer>

    <script type="module" src="/main.js"></script>
    <script type="module" src="/router.js"></script>
  </body>
</html>`;

function formatSeconds(s) {
  const n = Number(s) || 0;
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  const pad = (v) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

function youtubeEmbedHtml(item) {
  // The video-id and start time live as data-* on the wrapper; the
  // runtime (media-player.js) composes the final iframe URL. This avoids
  // hardcoding `origin` at build time (which breaks on preview URLs) and
  // sidesteps template-contents parsing quirks.
  const start = Number(item.startSeconds || 0);
  // Prefer the author's explicit thumbnail; fall back to YouTube's
  // maxresdefault (high quality, works for most YouTube Lives) with a
  // runtime fallback to hqdefault in media-player.js if maxres 404s.
  const primary =
    item.thumbnail ||
    `https://i.ytimg.com/vi/${encodeURIComponent(item.videoId)}/maxresdefault.jpg`;
  const secondary = `https://i.ytimg.com/vi/${encodeURIComponent(
    item.videoId
  )}/hqdefault.jpg`;
  return `
    <div
      class="media-embed media-embed-youtube"
      data-provider="youtube"
      data-video-id="${escapeHtml(item.videoId)}"
      data-start="${start}"
      data-title="${escapeHtml(item.title)}"
      data-thumb="${escapeHtml(primary)}"
      data-thumb-fallback="${escapeHtml(secondary)}"
    >
      <div class="media-embed-poster" role="button" tabindex="0"
           aria-label="Play video: ${escapeHtml(item.title)}"
           style="background-image: url('${escapeHtml(primary)}')">
        <span class="media-play" aria-hidden="true">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="22" fill="rgba(11,13,24,0.65)" />
            <path d="M19 15 L19 33 L33 24 Z" fill="#fff"/>
          </svg>
        </span>
      </div>
    </div>`;
}

function renderMediaPlayer(item) {
  if (item.kind === 'video' && item.source === 'youtube' && item.videoId) {
    return youtubeEmbedHtml(item);
  }
  if (item.liveUrl) {
    return `
      <a class="media-external-fallback" href="${escapeHtml(item.liveUrl)}"
         target="_blank" rel="noopener">
        Open on ${escapeHtml(item.source || 'source')} ↗
      </a>`;
  }
  return `<p class="media-external-fallback">No embed available.</p>`;
}

async function buildMedia() {
  const jsonPath = path.resolve('src/public/content.json');
  let data;
  try {
    data = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
  } catch {
    return [];
  }
  const items = Array.isArray(data.media) ? data.media : [];
  if (items.length === 0) return [];

  const outDir = path.resolve('src/media');
  await fs.mkdir(outDir, { recursive: true });

  const built = [];
  for (const item of items) {
    const slug =
      item.slug ||
      (item.id || item.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) continue;
    const html = MEDIA_SHELL(item, renderMediaPlayer(item));
    const outPath = path.join(outDir, `${slug}.html`);
    await fs.writeFile(outPath, html);
    built.push({ slug, item });
    console.log(`✅ Generated media/${slug}.html`);
  }
  return built;
}

async function buildPosts() {
  console.log('🔨 Building blog posts from markdown...');

  await regenerateFavicons();
  await validateContent();
  await buildMedia();

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
