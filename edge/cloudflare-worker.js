/**
 * Cloudflare Worker / Edge Middleware for Agentic Readiness
 *
 * Deploy with:
 *   npx wrangler deploy
 */

const ORIGIN = 'https://zako05.github.io';
const BASE_PATH = '/online-cv';
const ORIGIN_BASE_URL = `${ORIGIN}${BASE_PATH}`;

const VALID_SECTIONS = new Set([
  'all',
  'experiences',
  'skills',
  'education',
  'certificates',
  'languages',
  'contact',
  'career_profile',
  'interests'
]);

function prefersMarkdown(acceptHeader) {
  if (!acceptHeader) return false;
  const lower = acceptHeader.toLowerCase();
  return lower.includes('text/markdown') || lower.includes('text/x-markdown');
}

function prefersJson(acceptHeader) {
  if (!acceptHeader) return false;
  const lower = acceptHeader.toLowerCase();
  return (
    lower.includes('application/json') ||
    lower.includes('application/problem+json') ||
    lower.includes('application/openapi+json')
  ) && !lower.includes('text/html');
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
  let out = text;
  if (requestOrigin && requestOrigin !== ORIGIN) {
    out = out
      .replaceAll(ORIGIN_BASE_URL, requestOrigin)
      .replaceAll(`href="${BASE_PATH}/`, 'href="/')
      .replaceAll(`src="${BASE_PATH}/`, 'src="/');
  }
  // Ensure sequential heading hierarchy (H1 -> H2 -> H3 -> H4) on HTML pages
  out = out
    .replace('<h3 class="tagline">', '<h2 class="tagline">')
    .replace('</h3>\n    \n\n  </div><!--//profile-container-->', '</h2>\n    \n\n  </div><!--//profile-container-->')
    .replaceAll('<h3 class="tagline">', '<h2 class="tagline">')
    .replaceAll('<h5 class="certificate-title">', '<h3 class="certificate-title" style="font-size:14px;margin-top:0;margin-bottom:5px;">')
    .replaceAll('<h4 class="degree">', '<h3 class="degree">')
    .replaceAll('</h4>\n      <h5 class="meta">', '</h3>\n      <h4 class="meta" style="font-size:14px;">')
    .replaceAll('</h5>\n      <div class="time">', '</h4>\n      <div class="time">');
  return out;
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
    'Vary': 'Accept',
    ...extraHeaders
  });
  return new Response(JSON.stringify(payload, null, 2), { status, headers });
}

function jsonErrorResponse(status, code, error, message, resolution, path) {
  return jsonResponse(
    {
      type: 'https://online-cv.zako05.workers.dev/docs/#errors',
      title: error,
      error,
      code,
      status,
      message,
      detail: message,
      instance: path,
      resolution
    },
    status
  );
}

function buildOpenApiSpec(origin) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Michal Zak Online CV API',
      version: '1.0.0',
      description:
        "Public, zero-authentication REST API for retrieving Michal Zak's curriculum vitae, work experience, technical skills, education, certificates, and contact details.",
      contact: {
        name: 'Michal Zak',
        email: 'zako05@gmail.com',
        url: `${origin}/contact/`
      }
    },
    servers: [
      {
        url: origin,
        description: 'Production Online CV API Server'
      }
    ],
    paths: {
      '/api/cv.json': {
        get: {
          operationId: 'getCurriculumVitae',
          summary: 'Retrieve complete curriculum vitae in structured JSON',
          description:
            'Returns the complete structured curriculum vitae for Michal Zak (Senior Test Automation Engineer), including contact information, career profile summary, chronological work experiences, technical skills with proficiency levels, education, certifications, languages, and interests.',
          parameters: [
            {
              name: 'section',
              in: 'query',
              required: false,
              description:
                'Optional section filter (experiences, skills, education, certificates, languages, contact, career_profile, interests, or all).',
              schema: {
                type: 'string',
                enum: [
                  'all',
                  'experiences',
                  'skills',
                  'education',
                  'certificates',
                  'languages',
                  'contact',
                  'career_profile',
                  'interests'
                ],
                default: 'all'
              }
            }
          ],
          responses: {
            '200': {
              description: 'Structured curriculum vitae JSON payload.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/CurriculumVitae'
                  }
                }
              }
            },
            '400': {
              description: 'Invalid query parameter supplied.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ApiError'
                  }
                }
              }
            },
            '404': {
              description: 'Requested API endpoint or resource was not found.',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ApiError'
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        CurriculumVitae: {
          type: 'object',
          description: 'Full curriculum vitae profile for Michal Zak.',
          required: [
            'name',
            'tagline',
            'description',
            'url',
            'contact',
            'career_profile',
            'experiences',
            'skills',
            'education'
          ],
          properties: {
            name: { type: 'string', description: 'Full name of the candidate.' },
            tagline: { type: 'string', description: 'Primary professional title and specialization.' },
            description: { type: 'string', description: 'Short professional bio.' },
            url: { type: 'string', format: 'uri', description: 'Canonical URL of the online curriculum vitae.' },
            contact: { $ref: '#/components/schemas/ContactInfo' },
            career_profile: { type: 'string', description: 'Executive summary of engineering focus and testing philosophy.' },
            experiences: {
              type: 'array',
              description: 'Chronological list of professional engineering roles and projects.',
              items: { $ref: '#/components/schemas/ExperienceItem' }
            },
            skills: {
              type: 'array',
              description: 'List of technical skills and proficiency levels.',
              items: { $ref: '#/components/schemas/SkillItem' }
            },
            education: {
              type: 'array',
              description: 'Academic degrees and language institutions.',
              items: { $ref: '#/components/schemas/EducationItem' }
            }
          }
        },
        ContactInfo: {
          type: 'object',
          description: 'Direct contact details and external developer profile URLs.',
          required: ['email', 'phone', 'github', 'linkedin'],
          properties: {
            email: { type: 'string', format: 'email', description: 'Contact email address.' },
            phone: { type: 'string', description: 'Contact telephone number.' },
            github: { type: 'string', format: 'uri', description: 'GitHub profile URL.' },
            linkedin: { type: 'string', format: 'uri', description: 'LinkedIn profile URL.' }
          }
        },
        ExperienceItem: {
          type: 'object',
          description: 'Work experience entry detailing role, company, duration, and technologies used.',
          required: ['role', 'time', 'company'],
          properties: {
            role: { type: 'string', description: 'Job title held during the engagement.' },
            time: { type: 'string', description: 'Date range of the engagement.' },
            company: { type: 'string', description: 'Company name and city.' },
            projects: { type: 'string', description: 'Key projects and responsibilities.' },
            details: { type: 'string', description: 'Detailed accomplishments.' },
            techStack: { type: 'string', description: 'Comma-separated list of technologies, frameworks, and tools used.' }
          }
        },
        SkillItem: {
          type: 'object',
          description: 'Technical skill and self-assessed proficiency percentage.',
          required: ['name', 'level'],
          properties: {
            name: { type: 'string', description: 'Name of the tool, language, or testing discipline.' },
            level: { type: 'string', description: 'Proficiency percentage (e.g. 90%).' }
          }
        },
        EducationItem: {
          type: 'object',
          description: 'Academic degree or educational qualification.',
          required: ['degree', 'university'],
          properties: {
            degree: { type: 'string', description: 'Degree or qualification earned.' },
            university: { type: 'string', description: 'University or institution name.' }
          }
        },
        ApiError: {
          type: 'object',
          description: 'Structured JSON error response with machine-readable code and resolution hint.',
          required: ['error', 'code', 'status', 'message', 'resolution'],
          properties: {
            error: { type: 'string', description: 'Short error category.' },
            code: { type: 'string', description: 'Machine-readable snake_case error code.' },
            status: { type: 'integer', description: 'HTTP status code.' },
            message: { type: 'string', description: 'Human-readable explanation of what went wrong.' },
            resolution: { type: 'string', description: 'Actionable hint explaining how an agent or developer can resolve the error.' }
          }
        }
      }
    }
  };
}

const MCP_TOOLS = [
  {
    name: 'get_curriculum_vitae',
    title: 'Get Michal Zak Curriculum Vitae',
    description:
      "Retrieve Michal Zak's structured curriculum vitae, work experiences, technical skills, education, certificates, languages, or contact information.",
    inputSchema: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          description:
            'Optional section of the CV to retrieve (all, experiences, skills, education, certificates, languages, contact, career_profile, interests).',
          enum: [
            'all',
            'experiences',
            'skills',
            'education',
            'certificates',
            'languages',
            'contact',
            'career_profile',
            'interests'
          ],
          default: 'all'
        }
      },
      additionalProperties: false
    },
    annotations: {
      title: 'Get Curriculum Vitae',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }
];

async function handleMcpPost(request, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: invalid JSON payload' } },
      400
    );
  }

  const handleSingle = async (rpc) => {
    if (!rpc || rpc.jsonrpc !== '2.0' || !rpc.method) {
      return {
        jsonrpc: '2.0',
        id: rpc?.id ?? null,
        error: { code: -32600, message: 'Invalid Request: must be a valid JSON-RPC 2.0 object' }
      };
    }

    const { id, method, params } = rpc;

    if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
      return null;
    }

    if (method === 'ping') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'initialize') {
      const requestedVersion = params?.protocolVersion || '2025-03-26';
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: requestedVersion,
          capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
            prompts: { listChanged: false }
          },
          serverInfo: {
            name: 'michal-zak-online-cv-mcp',
            version: '1.0.0',
            description: 'Model Context Protocol (MCP) server for querying Michal Zak Online CV.'
          },
          instructions:
            'Use the get_curriculum_vitae tool to inspect Michal Zak work experience, technical skills, education, certifications, and contact info.'
        }
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS
        }
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      if (toolName !== 'get_curriculum_vitae') {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` }
        };
      }
      const section = params?.arguments?.section || 'all';
      if (!VALID_SECTIONS.has(section)) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Invalid section "${section}". Valid sections: ${Array.from(VALID_SECTIONS).join(', ')}`
              }
            ]
          }
        };
      }
      const cvRes = await fetch(`${ORIGIN}${BASE_PATH}/api/cv.json`);
      const rawCv = await cvRes.text();
      const rewrittenCv = rewriteUrlsForOrigin(rawCv, origin);
      const parsed = JSON.parse(rewrittenCv);
      const data = section === 'all' ? parsed : { name: parsed.name, [section]: parsed[section] };
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(data, null, 2)
            }
          ]
        }
      };
    }

    if (method === 'resources/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: `${origin}/api/cv.json`,
              name: 'Michal Zak Online CV (JSON)',
              description: 'Structured JSON representation of Michal Zak curriculum vitae.',
              mimeType: 'application/json'
            },
            {
              uri: `${origin}/index.md`,
              name: 'Michal Zak Online CV (Markdown)',
              description: 'Clean Markdown representation of Michal Zak curriculum vitae.',
              mimeType: 'text/markdown'
            }
          ]
        }
      };
    }

    if (method === 'resources/read') {
      const cvRes = await fetch(`${ORIGIN}${BASE_PATH}/api/cv.json`);
      const rawCv = rewriteUrlsForOrigin(await cvRes.text(), origin);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri: params?.uri || `${origin}/api/cv.json`,
              mimeType: 'application/json',
              text: rawCv
            }
          ]
        }
      };
    }

    if (method === 'prompts/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          prompts: []
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` }
    };
  };

  if (Array.isArray(body)) {
    const results = (await Promise.all(body.map(handleSingle))).filter(Boolean);
    if (results.length === 0) {
      return new Response(null, { status: 202 });
    }
    return jsonResponse(results, 200);
  }

  const responseObj = await handleSingle(body);
  if (!responseObj) {
    return new Response(null, { status: 202 });
  }
  return jsonResponse(responseObj, 200);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const cleanPath = stripBasePath(url.pathname);
    const accept = request.headers.get('Accept') || '';
    const wantsMarkdown = prefersMarkdown(accept);
    const wantsJson = prefersJson(accept);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id'
        }
      });
    }

    // 1. OpenAPI Specification (/openapi.json, /api/openapi.json)
    if (cleanPath === '/openapi.json' || cleanPath === '/api/openapi.json') {
      return jsonResponse(buildOpenApiSpec(url.origin), 200);
    }

    // 2. MCP Well-Known Discovery & Server Card
    if (
      cleanPath === '/.well-known/mcp.json' ||
      cleanPath === '/.well-known/mcp/server-card.json'
    ) {
      return jsonResponse({
        mcpVersion: '2025-03-26',
        name: 'michal-zak-online-cv-mcp',
        title: 'Michal Zak Online CV MCP Server',
        version: '1.0.0',
        description: 'Model Context Protocol (MCP) server exposing Michal Zak Online CV as structured tools and resources.',
        url: `${url.origin}/mcp`,
        transport: {
          type: 'streamable-http',
          endpoint: `${url.origin}/mcp`
        },
        capabilities: {
          tools: true,
          resources: true
        },
        tools: MCP_TOOLS
      });
    }

    // 3. MCP Streamable HTTP Endpoint (/mcp)
    if (cleanPath === '/mcp' || cleanPath === '/mcp/') {
      if (request.method === 'POST') {
        return handleMcpPost(request, url.origin);
      }
      if (wantsJson) {
        return jsonResponse({
          mcpVersion: '2025-03-26',
          name: 'michal-zak-online-cv-mcp',
          version: '1.0.0',
          transport: 'streamable-http',
          endpoint: `${url.origin}/mcp`,
          tools: MCP_TOOLS
        });
      }
    }

    // 4. API Endpoint (/api/cv.json) & Structured JSON Error Handling (/api/*)
    if (cleanPath === '/api/cv.json' || cleanPath === '/api/cv') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return jsonErrorResponse(
          405,
          'method_not_allowed',
          'Method Not Allowed',
          `HTTP ${request.method} is not supported on ${cleanPath}.`,
          'Use GET /api/cv.json to retrieve the curriculum vitae.',
          url.pathname
        );
      }
      const section = url.searchParams.get('section') || 'all';
      if (!VALID_SECTIONS.has(section)) {
        return jsonErrorResponse(
          400,
          'invalid_parameter',
          'Invalid Query Parameter',
          `Unknown section "${section}".`,
          `Supply a valid section parameter: ${Array.from(VALID_SECTIONS).join(', ')}.`,
          url.pathname
        );
      }
      const cvRes = await fetch(`${ORIGIN}${BASE_PATH}/api/cv.json`);
      const rawCv = rewriteUrlsForOrigin(await cvRes.text(), url.origin);
      if (section === 'all') {
        return new Response(rawCv, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Vary': 'Accept'
          }
        });
      }
      const parsed = JSON.parse(rawCv);
      return jsonResponse({ name: parsed.name, tagline: parsed.tagline, [section]: parsed[section] }, 200);
    }

    if (cleanPath.startsWith('/api/')) {
      return jsonErrorResponse(
        404,
        'endpoint_not_found',
        'API Endpoint Not Found',
        `The API endpoint "${cleanPath}" does not exist.`,
        `Query GET ${url.origin}/api/cv.json or inspect the OpenAPI specification at ${url.origin}/openapi.json.`,
        url.pathname
      );
    }

    // 5. Markdown Content Negotiation
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

    // 6. Proxy to GitHub Pages Origin
    const targetPath = toOriginPath(url.pathname);
    const originResponse = await fetch(`${ORIGIN}${targetPath}${url.search}`, {
      method: request.method,
      headers: {
        'User-Agent': request.headers.get('User-Agent') || 'Agentic-Worker',
        'Accept': request.headers.get('Accept') || '*/*'
      },
      redirect: 'follow'
    });

    if (originResponse.status === 404) {
      if (wantsJson) {
        return jsonErrorResponse(
          404,
          'resource_not_found',
          'Resource Not Found',
          `The requested path "${url.pathname}" does not exist on Michal Zak Online CV.`,
          `Refer to ${url.origin}/llms.txt, ${url.origin}/openapi.json, or ${url.origin}/sitemap.xml for valid endpoints.`,
          url.pathname
        );
      }
      if (wantsMarkdown) {
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
