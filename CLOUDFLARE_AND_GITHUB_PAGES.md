# Cloudflare & GitHub Pages Architecture Guide

This document explains:
1. **What is set up in Cloudflare and how it works** (`zako05.dev` + Cloudflare Worker + GitHub Actions CI/CD).
2. **How GitHub Pages & Jekyll work**, and **why `https://zako05.github.io/` returns 404** while `https://zako05.github.io/online-cv/` works.

---

## Part 1: Cloudflare Setup & How It Works

### 1. High-Level Architecture

```text
Visitor / AI Agent
       │
       ▼  HTTPS request (https://zako05.dev or https://zako05.dev/online-cv)
┌──────────────────────────────────────────────────────────────────────┐
│ Cloudflare Edge (Worker: online-cv)                                  │
│  • Custom Domains: zako05.dev, www.zako05.dev                        │
│  • Config: wrangler.toml                                             │
│  • Code:   edge/cloudflare-worker.js                                 │
│                                                                      │
│  What the Worker does:                                               │
│  1. GET /               → Fetches & serves /online-cv/landing.html   │
│  2. GET /online-cv      → Fetches & serves full HTML CV              │
│  3. Accept: text/markdown → Serves .md files with Vary: Accept       │
│  4. POST /mcp           → Runs live MCP JSON-RPC 2.0 server          │
│  5. GET /openapi.json   → Serves OpenAPI 3.0.3 specification         │
│  6. 404 / API errors    → Returns Markdown 404 or JSON error object  │
└──────────────────────────────────────────────────────────────────────┘
       │
       ▼  Standard public HTTPS fetch()
┌──────────────────────────────────────────────────────────────────────┐
│ GitHub Pages Origin (https://zako05.github.io/online-cv/)            │
│  • Built automatically by GitHub from the `gh-pages` branch          │
│  • Renders Jekyll templates + `_data/data.yml` into static files     │
└──────────────────────────────────────────────────────────────────────┘
```

### 2. What Is Configured in Cloudflare

1. **Domain (`zako05.dev`)**:
   - Registered on Cloudflare Registrar (free SSL/TLS, HSTS, and Cloudflare DNS).
2. **Cloudflare Worker (`online-cv`)**:
   - Configured in [`wrangler.toml`](./wrangler.toml):
     - `name = "online-cv"`
     - `account_id = "5b240bd601b2dd7711a894d07f2a84b8"`
     - `main = "edge/cloudflare-worker.js"`
     - `workers_dev = false` (disables the temporary `online-cv.zako05.workers.dev` test subdomain)
     - `routes`: Attaches `zako05.dev` and `www.zako05.dev` (`custom_domain = true`) directly to the Worker.
3. **Cloudflare API Token & GitHub Secret (`CLOUDFLARE_API_TOKEN`)**:
   - Stored in GitHub repository secrets (`Settings → Secrets and variables → Actions → CLOUDFLARE_API_TOKEN`).
   - Token permissions in Cloudflare:
     - **Account (`Entire Account`):** `Workers Scripts (Read & Write)`, `Workers (Admin & Editor)`
     - **Zone (`zako05.dev`):** `Workers Routes (Read & Write)`, `DNS (Read & Write)`, `Zone (Read)`

### 3. How Updates Work (Day-to-Day Workflow)

Because the Cloudflare Worker is a **live proxy** that fetches pages from `https://zako05.github.io/online-cv/` on the fly, it does **not** store a static copy of your CV:

- **When you edit CV content (`_data/data.yml`, HTML/SCSS templates, or PDFs):**
  1. Push or merge your changes to the `gh-pages` branch on GitHub.
  2. GitHub Pages automatically rebuilds the Jekyll site at `https://zako05.github.io/online-cv/`.
  3. `https://zako05.dev/online-cv` automatically serves the new content (no Cloudflare redeploy needed).
- **When you edit `edge/cloudflare-worker.js` or `wrangler.toml`:**
  1. Push or merge to `gh-pages`.
  2. The GitHub Actions workflow (`.github/workflows/deploy-worker.yml`) runs the Minitest suite (`ruby test/agentic_readiness_test.rb`) and automatically runs `wrangler deploy` using `CLOUDFLARE_API_TOKEN`.

---

## Part 2: How GitHub Pages Works & Why `https://zako05.github.io/` Does Not Work

### 1. Why `https://zako05.github.io/` Returns `404 Not Found`

GitHub Pages has two distinct types of sites based on the **exact name of your GitHub repository**:

| Type | Required Repository Name | Published URL |
| --- | --- | --- |
| **User Site** (1 per GitHub account) | **Must** be named `zako05/zako05.github.io` | `https://zako05.github.io/` |
| **Project Site** (1 per repository) | Any other repository name (e.g. `zako05/online-cv`) | `https://zako05.github.io/<repo-name>/` (`https://zako05.github.io/online-cv/`) |

Because your repository is named **`online-cv`** (a Project Site) and you do not have a separate repository named **`zako05.github.io`**, GitHub Pages **only** publishes files under the `/online-cv/` subpath (`https://zako05.github.io/online-cv/`).
Any request to the root `https://zako05.github.io/` hits nothing and returns GitHub's default `HTTP 404` page.

### 2. Why That Broke `is-agentic` Before Adding Cloudflare + `zako05.dev`

1. **Root-Origin Probing:**
   When `npx is-agentic` scans a site, it checks root-level paths (`/`, `/robots.txt`, `/llms.txt`, `/sitemap.xml`, `/__ora-404-probe-...`) at the root of the domain. On `zako05.github.io`, all of those root paths returned `404` because the site lived inside `/online-cv/`.
2. **Static Hosting Limitations on GitHub Pages:**
   Even for files inside `/online-cv/`, GitHub Pages is a purely static file server:
   - It **cannot** inspect the HTTP `Accept: text/markdown` header to return Markdown (`Content-Type: text/markdown`, `Vary: Accept`) on `/` or `404` pages.
   - It **cannot** handle `POST /mcp` JSON-RPC 2.0 requests for the Model Context Protocol.
   - It **cannot** return dynamic JSON error payloads (`Content-Type: application/json`) on unknown `/api/*` routes.

Putting the **Cloudflare Worker** on **`zako05.dev`** in front of GitHub Pages solved both problems while keeping your free GitHub Pages Jekyll build workflow intact.

### 3. How Jekyll Builds Your Files on GitHub Pages

Whenever you push to the `gh-pages` branch, GitHub Pages runs `jekyll build`:
1. **Loads Data:** Jekyll reads `_config.yml` (`site.*`) and `_data/data.yml` (`site.data.data.*`).
2. **Processes Front Matter (`---`):** Any file starting with `---` at the top is processed by Jekyll's Liquid template engine:
   - `index.html` → `_site/index.html` (Full HTML CV)
   - `landing.html` → `_site/landing.html` (Minimal root landing page served at `https://zako05.dev/`)
   - `index-md.txt` (`permalink: /index.md`, `layout: null`) → `_site/index.md` (Full Markdown CV)
   - `llms.txt` & `llms-full.txt` → `_site/llms.txt` & `_site/llms-full.txt` (LLM discovery & context files)
   - `api/cv.json` → `_site/api/cv.json` (Structured JSON API)
   - `openapi.json` → `_site/openapi.json` (OpenAPI 3.0.3 specification)
   - `docs/`, `mcp/`, `about/`, `contact/`, `privacy/`, `404.html`, `404-md.txt`, `robots.txt`, `sitemap.xml`
3. Thus, editing **`_data/data.yml`** automatically updates every HTML, Markdown, `llms.txt`, and JSON file across the entire site on every build.
