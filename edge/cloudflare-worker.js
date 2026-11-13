/**
 * Cloudflare Worker / Edge Middleware for Agentic Readiness
 *
 * Deploy with:
 *   npx wrangler deploy
 *
 * Implements:
 * 1. Root-Domain Mapping:
 *    - Maps root paths (`/`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/docs/`, `/mcp/`,
 *      `/about/`, `/contact/`, `/privacy/`, `/api/cv.json`, `/assets/...`) to the GitHub Pages
 *      origin (`https://zako05.github.io/online-cv/...`) and rewrites canonical/resource URLs
 *      to match the Worker's origin.
 * 2. Markdown Content Negotiation (https://acceptmarkdown.com):
 *    - Requests with `Accept: text/markdown` receive `Content-Type: text/markdown; charset=utf-8`
 *      and `Vary: Accept`.
 *    - Requests with `Accept: text/html` receive HTML with `Vary: Accept`.
 * 3. Agent-Friendly 404s:
 *    - Nonexistent paths with `Accept: text/markdown` return HTTP 404 with a Markdown error body
 *      (`Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`) linking to `llms.txt`, `sitemap.xml`, and `/docs/`.
 */

const ORIGIN = 'https://zako05.github.io';
const BASE_PATH = '/online-cv';
const ORIGIN_BASE_URL = `${ORIGIN}${BASE_PATH}`;

function prefersMarkdown(acceptHeader) {
  if (!acceptHeader) return false;
  const lower = acceptHeader.toLowerCase();
  return lower.includes('text/markdown') || lower.includes('text/x-markdown');
}

function appendVaryAccept(headers) {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', 'Accept');
  } else if (!existing.toLowerCase().split(',').map(s => s.trim()).includes('accept')) {
    headers.set('Vary', `${existing}, Accept`);
  }
}

function stripBasePath(pathname) {
  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
    return '/';
  }
  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length);
  }
  return pathname;
}

function resolveMarkdownPath(pathname) {
  const clean = stripBasePath(pathname);
  if (clean === '/' || clean === '' || clean === '/index.html') {
    return `${BASE_PATH}/index.md`;
  }
  const sections = ['docs', 'mcp', 'about', 'contact', 'privacy'];
  for (const section of sections) {
    if (clean === `/${section}` || clean === `/${section}/` || clean === `/${section}/index.html`) {
      return `${BASE_PATH}/${section}/index.md`;
    }
  }
  return null;
}

function toOriginPath(pathname) {
  if (pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname === BASE_PATH ? `${BASE_PATH}/` : pathname;
  }
  return `${BASE_PATH}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function isTextContentType(contentType) {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return (
    lower.includes('text/') ||
    lower.includes('application/json') ||
    lower.includes('application/xml') ||
    lower.includes('application/ld+json')
  );
}

function rewriteUrlsForOrigin(text, requestOrigin) {
  if (!requestOrigin || requestOrigin === ORIGIN) return text;
  return text
    .replaceAll(ORIGIN_BASE_URL, requestOrigin)
    .replaceAll(`href="${BASE_PATH}/`, 'href="/')
    .replaceAll(`src="${BASE_PATH}/`, 'src="/');
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const accept = request.headers.get('Accept') || '';
    const wantsMarkdown = prefersMarkdown(accept);

    if (wantsMarkdown) {
      const mdPath = resolveMarkdownPath(url.pathname);
      if (mdPath) {
        const mdResponse = await fetch(`${ORIGIN}${mdPath}`, {
          headers: { 'User-Agent': request.headers.get('User-Agent') || 'Agentic-Worker' }
        });
        if (mdResponse.ok) {
          const rawBody = await mdResponse.text();
          const body = rewriteUrlsForOrigin(rawBody, url.origin);
          const headers = new Headers(mdResponse.headers);
          headers.set('Content-Type', 'text/markdown; charset=utf-8');
          appendVaryAccept(headers);
          return new Response(body, { status: 200, headers });
        }
      }
    }

    const targetPath = toOriginPath(url.pathname);
    const originResponse = await fetch(`${ORIGIN}${targetPath}${url.search}`, {
      method: request.method,
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Agentic-Worker',
        'Accept': request.headers.get('Accept') || '*/*'
      },
      redirect: 'follow'
    });

    if (originResponse.status === 404 && wantsMarkdown) {
      const md404 = await fetch(`${ORIGIN}${BASE_PATH}/404.md`);
      const raw404 = md404.ok
        ? await md404.text()
        : `# 404 Not Found\n\nThe requested path \`${url.pathname}\` was not found on Michal Zak Online CV.\n\n- [LLMs.txt](${ORIGIN_BASE_URL}/llms.txt)\n- [API Documentation](${ORIGIN_BASE_URL}/docs/)\n- [Sitemap](${ORIGIN_BASE_URL}/sitemap.xml)\n`;
      const body = rewriteUrlsForOrigin(raw404, url.origin);
      const headers = new Headers(originResponse.headers);
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
      appendVaryAccept(headers);
      return new Response(body, { status: 404, headers });
    }

    const headers = new Headers(originResponse.headers);
    if (url.pathname.endsWith('.md')) {
      headers.set('Content-Type', 'text/markdown; charset=utf-8');
    }
    appendVaryAccept(headers);

    if (isTextContentType(headers.get('Content-Type'))) {
      const rawText = await originResponse.text();
      const rewritten = rewriteUrlsForOrigin(rawText, url.origin);
      return new Response(rewritten, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers
      });
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers
    });
  }
};
