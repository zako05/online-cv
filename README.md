# CV - Michal Zak

https://zako05.github.io/online-cv/

## Open CV locally

```bash
bundle exec jekyll serve
```

http://localhost:4000/online-cv/

## Build & Run Agentic Readiness Tests

```bash
bundle exec jekyll build
ruby test/agentic_readiness_test.rb
```

## Deploy Cloudflare Worker (Root Domain & Markdown Negotiation)

```bash
npx wrangler deploy
```

## Pages & Machine-Readable Endpoints

| Resource | Production URL | Local URL |
| --- | --- | --- |
| **Online CV (HTML)** | https://zako05.github.io/online-cv/ | http://localhost:4000/online-cv/ |
| **Online CV (Markdown)** | https://zako05.github.io/online-cv/index.md | http://localhost:4000/online-cv/index.md |
| **Printable PDF Template** | https://zako05.github.io/online-cv/cv-pdf.html | http://localhost:4000/online-cv/cv-pdf.html |
| **Structured JSON API** | https://zako05.github.io/online-cv/api/cv.json | http://localhost:4000/online-cv/api/cv.json |
| **API Documentation (HTML)** | https://zako05.github.io/online-cv/docs/ | http://localhost:4000/online-cv/docs/ |
| **API Documentation (Markdown)** | https://zako05.github.io/online-cv/docs/index.md | http://localhost:4000/online-cv/docs/index.md |
| **MCP Server & CLI Guide (HTML)** | https://zako05.github.io/online-cv/mcp/ | http://localhost:4000/online-cv/mcp/ |
| **MCP Server & CLI Guide (Markdown)** | https://zako05.github.io/online-cv/mcp/index.md | http://localhost:4000/online-cv/mcp/index.md |
| **About Page (HTML & Markdown)** | https://zako05.github.io/online-cv/about/ | http://localhost:4000/online-cv/about/ (`/about/index.md`) |
| **Contact Page (HTML & Markdown)** | https://zako05.github.io/online-cv/contact/ | http://localhost:4000/online-cv/contact/ (`/contact/index.md`) |
| **Privacy Policy (HTML & Markdown)** | https://zako05.github.io/online-cv/privacy/ | http://localhost:4000/online-cv/privacy/ (`/privacy/index.md`) |
| **LLMs Discovery (`llms.txt`)** | https://zako05.github.io/online-cv/llms.txt | http://localhost:4000/online-cv/llms.txt |
| **Full LLM Context (`llms-full.txt`)** | https://zako05.github.io/online-cv/llms-full.txt | http://localhost:4000/online-cv/llms-full.txt |
| **XML Sitemap (`sitemap.xml`)** | https://zako05.github.io/online-cv/sitemap.xml | http://localhost:4000/online-cv/sitemap.xml |
| **Robots (`robots.txt`)** | https://zako05.github.io/online-cv/robots.txt | http://localhost:4000/online-cv/robots.txt |
| **404 Error Page (HTML & Markdown)** | https://zako05.github.io/online-cv/404.html | http://localhost:4000/online-cv/404.html (`/404.md`) |
