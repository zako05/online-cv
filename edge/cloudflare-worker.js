/**
 * Cloudflare Worker / Edge Middleware for Agentic Readiness
 *
 * Implements:
 * 1. Markdown Content Negotiation (https://acceptmarkdown.com):
 *    - Requests with `Accept: text/markdown` receive `Content-Type: text/markdown; charset=utf-8`
 *      and `Vary: Accept` on `/`, `/online-cv/`, `/online-cv/docs/`, and `/online-cv/mcp/`.
 *    - Requests with `Accept: text/html` receive HTML with `Vary: Accept`.
 * 2. Agent-Friendly 404s:
 *    - Nonexistent paths with `Accept: text/markdown` return HTTP 404 with a Markdown error body
 *      (`Content-Type: text/markdown; charset=utf-8`, `Vary: Accept`) linking to `llms.txt`, `sitemap.xml`, and `/docs/`.
 */

const ORIGIN = 'https://zako05.github.io';
const BASE_PATH = '/online-cv';

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

function resolveMarkdownPath(pathname) {
  if (pathname === '/' || pathname === '' || pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
    return `${BASE_PATH}/index.md`;
  }
  if (pathname === '/docs' || pathname === '/docs/' || pathname === `${BASE_PATH}/docs` || pathname === `${BASE_PATH}/docs/`) {
    return `${BASE_PATH}/docs/index.md`;
  }
  if (pathname === '/mcp' || pathname === '/mcp/' || pathname === `${BASE_PATH}/mcp` || pathname === `${BASE_PATH}/mcp/`) {
    return `${BASE_PATH}/mcp/index.md`;
  }
  return null;
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
          const headers = new Headers(mdResponse.headers);
          headers.set('Content-Type', 'text/markdown; charset=utf-8');
          appendVaryAccept(headers);
          return new Response(mdResponse.body, { status: 200, headers });
        }
      }
    }

    const targetPath = url.pathname === '/' ? `${BASE_PATH}/` : url.pathname;
    const originResponse = await fetch(`${ORIGIN}${targetPath}${url.search}`, {
      method: request.method,
      headers: request.headers,
      redirect: 'follow'
    });

    if (originResponse.status === 404 && wantsMarkdown) {
      const md404 = await fetch(`${ORIGIN}${BASE_PATH}/404.md`);
      const body = md404.ok
        ? await md404.text()
        : `# 404 Not Found\n\nThe requested path \`${url.pathname}\` was not found on Michal Zak Online CV.\n\n- [LLMs.txt](${ORIGIN}${BASE_PATH}/llms.txt)\n- [API Documentation](${ORIGIN}${BASE_PATH}/docs/)\n- [Sitemap](${ORIGIN}${BASE_PATH}/sitemap.xml)\n`;
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
    return new Response(originResponse.body, {
      status: originResponse.status,
      statusText: originResponse.statusText,
      headers
    });
  }
};
