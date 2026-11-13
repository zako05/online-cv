#!/usr/bin/env ruby
# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'rexml/document'
require_relative '../scripts/serve_agentic'

class AgenticReadinessTest < Minitest::Test
  SITE_DIR = File.expand_path('../_site', __dir__)

  def setup
    @app = AgenticApp.new(SITE_DIR)
  end

  # 1. Not blocked from AI agents (crawler and bot rules)
  def test_robots_txt_allows_ai_agents_and_declares_sitemap
    robots_path = File.join(SITE_DIR, 'robots.txt')
    assert File.file?(robots_path), 'Expected _site/robots.txt to exist'

    content = File.read(robots_path)
    %w[* GPTBot ChatGPT-User OAI-SearchBot ClaudeBot PerplexityBot Google-Extended Applebot-Extended CCBot].each do |agent|
      assert_includes content, "User-agent: #{agent}"
    end
    assert_includes content, 'Allow: /'
    refute_match(/Disallow:\s*\/\s*$/, content)
    assert_includes content, 'Sitemap: https://zako05.github.io/online-cv/sitemap.xml'
  end

  def test_bot_user_agents_can_reach_homepage
    %w[
      GPTBot/1.0
      ClaudeBot/1.0
      PerplexityBot/1.0
      Google-Extended
      Mozilla/5.0\ (compatible;\ OAI-SearchBot/1.0)
    ].each do |ua|
      status, _reason, headers, body = @app.handle('GET', '/online-cv/', { 'user-agent' => ua, 'accept' => 'text/html' })
      assert_equal 200, status, "Expected 200 OK for User-Agent #{ua}"
      assert_includes headers['Content-Type'], 'text/html'
      assert_includes body, 'Michal Zak'
    end
  end

  # 2. Agent-friendly 404s
  def test_agent_friendly_404_markdown_and_html
    status_md, _reason, headers_md, body_md = @app.handle(
      'GET',
      '/online-cv/__ora-404-probe-g1kadbce',
      { 'accept' => 'text/markdown' }
    )
    assert_equal 404, status_md
    assert_includes headers_md['Content-Type'], 'text/markdown'
    assert_includes headers_md['Vary'], 'Accept'
    assert_operator body_md.strip.length, :>=, 20
    assert_includes body_md, '# 404 Not Found'
    assert_includes body_md, 'https://zako05.github.io/online-cv/llms.txt'
    assert_includes body_md, 'https://zako05.github.io/online-cv/sitemap.xml'
    assert_includes body_md, 'https://zako05.github.io/online-cv/docs/'

    status_html, _reason, headers_html, body_html = @app.handle(
      'GET',
      '/online-cv/__ora-404-probe-g1kadbce',
      { 'accept' => 'text/html' }
    )
    assert_equal 404, status_html
    assert_includes headers_html['Content-Type'], 'text/html'
    assert_includes headers_html['Vary'], 'Accept'
    assert_includes body_html, '404'
    assert_includes body_html, '/online-cv/llms.txt'
    assert_includes body_html, '/online-cv/sitemap.xml'
    assert_includes body_html, '/online-cv/docs/'
  end

  # 3. Markdown content negotiation (acceptmarkdown.com)
  def test_homepage_markdown_content_negotiation
    status_md, _reason, headers_md, body_md = @app.handle(
      'GET',
      '/online-cv/',
      { 'accept' => 'text/markdown' }
    )
    assert_equal 200, status_md
    assert_includes headers_md['Content-Type'], 'text/markdown'
    assert_includes headers_md['Vary'], 'Accept'
    assert_includes body_md, '# Michal Zak — Senior Test Automation Engineer'
    assert_includes body_md, '## Experiences'
    assert_includes body_md, '## Skills & Proficiency'

    status_html, _reason, headers_html, body_html = @app.handle(
      'GET',
      '/online-cv/',
      { 'accept' => 'text/html' }
    )
    assert_equal 200, status_html
    assert_includes headers_html['Content-Type'], 'text/html'
    assert_includes headers_html['Vary'], 'Accept'
    assert_includes body_html, '<!DOCTYPE html>'
    assert_includes body_html, '<div class="wrapper">'
  end

  # 4. Developer resource discoverability
  def test_developer_resources_docs_mcp_json_llms_and_sitemap
    # /docs/ page has product name and "API" in <title> and <h1>, and uses minimal sidebar
    docs_html = File.read(File.join(SITE_DIR, 'docs', 'index.html'))
    assert_match(/<title>.*Michal Zak Online CV API Documentation.*<\/title>/, docs_html)
    assert_match(/<h1[^>]*>.*Michal Zak Online CV API Documentation.*<\/h1>/m, docs_html)
    assert_includes docs_html, 'sidebar-minimal'
    refute_includes docs_html, 'languages-container'
    refute_includes docs_html, 'interests-container'

    # /mcp/ page has tool name "MCP" in <title> and <h1>, and uses minimal sidebar
    mcp_html = File.read(File.join(SITE_DIR, 'mcp', 'index.html'))
    assert_match(/<title>.*Michal Zak Online CV MCP Server.*<\/title>/, mcp_html)
    assert_match(/<h1[^>]*>.*Michal Zak Online CV MCP Server.*<\/h1>/m, mcp_html)
    assert_includes mcp_html, 'sidebar-minimal'
    refute_includes mcp_html, 'languages-container'

    # /api/cv.json is valid JSON with expected fields
    cv_json_raw = File.read(File.join(SITE_DIR, 'api', 'cv.json'))
    cv_data = JSON.parse(cv_json_raw)
    assert_equal 'Michal Zak', cv_data['name']
    assert_equal 'Senior Test Automation Engineer', cv_data['tagline']
    assert_kind_of Array, cv_data['experiences']
    refute_empty cv_data['experiences']
    assert_kind_of Array, cv_data['skills']
    refute_empty cv_data['skills']

    # /llms.txt follows llmstxt.org format and includes When to Use section
    llms_txt = File.read(File.join(SITE_DIR, 'llms.txt'))
    assert_match(/\A# Michal Zak - Senior Test Automation Engineer/, llms_txt)
    assert_includes llms_txt, '> Freelance Software Test Engineer'
    assert_includes llms_txt, '## When to Use This'
    assert_includes llms_txt, 'https://zako05.github.io/online-cv/docs/'
    assert_includes llms_txt, 'https://zako05.github.io/online-cv/mcp/'
    assert_includes llms_txt, 'https://zako05.github.io/online-cv/api/cv.json'
    assert_includes llms_txt, 'https://github.com/zako05'

    # /sitemap.xml is valid XML and includes lastmod dates
    sitemap_raw = File.read(File.join(SITE_DIR, 'sitemap.xml'))
    doc = REXML::Document.new(sitemap_raw)
    locs = []
    lastmods = []
    doc.elements.each('urlset/url/loc') { |el| locs << el.text }
    doc.elements.each('urlset/url/lastmod') { |el| lastmods << el.text }
    assert_includes locs, 'https://zako05.github.io/online-cv/'
    assert_includes locs, 'https://zako05.github.io/online-cv/about/'
    assert_includes locs, 'https://zako05.github.io/online-cv/contact/'
    assert_includes locs, 'https://zako05.github.io/online-cv/privacy/'
    assert_includes locs, 'https://zako05.github.io/online-cv/docs/'
    assert_includes locs, 'https://zako05.github.io/online-cv/mcp/'
    assert_includes locs, 'https://zako05.github.io/online-cv/llms.txt'
    assert_includes locs, 'https://zako05.github.io/online-cv/api/cv.json'
    assert_equal locs.length, lastmods.length

    # Trust anchor pages (/about/, /contact/, /privacy/) exist with >= 500 chars each
    %w[about contact privacy].each do |page|
      html = File.read(File.join(SITE_DIR, page, 'index.html'))
      md = File.read(File.join(SITE_DIR, page, 'index.md'))
      assert_operator html.length, :>=, 500, "Expected /#{page}/ HTML to be >= 500 chars"
      assert_operator md.length, :>=, 500, "Expected /#{page}/index.md to be >= 500 chars"
      assert_includes html, 'sidebar-minimal'
    end

    # Homepage links to GitHub over HTTPS and links to docs, mcp, llms.txt
    index_html = File.read(File.join(SITE_DIR, 'index.html'))
    assert_includes index_html, 'href="https://github.com/zako05"'
    assert_includes index_html, 'href="/online-cv/docs/"'
    assert_includes index_html, 'href="/online-cv/mcp/"'
    assert_includes index_html, 'href="/online-cv/llms.txt"'
  end

  # 5. Brand name & product term discoverability
  def test_brand_and_product_terms_in_json_ld_meta_and_title
    index_html = File.read(File.join(SITE_DIR, 'index.html'))

    assert_includes index_html, '<title>Michal Zak | Senior Test Automation Engineer</title>'
    assert_includes index_html, '<meta property="og:image"'
    assert_includes index_html, '<meta property="og:type"'
    assert_includes index_html, '<link rel="canonical"'
    assert_match(/<meta name="keywords" content="[^"]*Senior Test Automation Engineer[^"]*E2E Test Automation/, index_html)

    json_ld_match = index_html.match(/<script type="application\/ld\+json">\s*(\{.*?\})\s*<\/script>/m)
    refute_nil json_ld_match, 'Expected application/ld+json script on homepage'

    json_ld = JSON.parse(json_ld_match[1])
    graph = json_ld['@graph']
    refute_nil graph

    service = graph.find { |node| Array(node['@type']).include?('ProfessionalService') }
    refute_nil service
    assert_includes Array(service['@type']), 'Organization'
    assert_equal 'SK', service.dig('address', 'addressCountry')
    refute_empty service['contactPoint']
    assert_equal 'Senior Test Automation Engineer', service['serviceType']
    assert_includes service['knowsAbout'], 'Senior Test Automation Engineer'
    assert_includes service['knowsAbout'], 'E2E Test Automation'
    assert_includes service['knowsAbout'], 'API Test Automation'
    assert_includes service['knowsAbout'], 'Playwright'

    # Verify all JSON-LD product/service terms also appear verbatim in visible page content
    service['knowsAbout'].each do |term|
      assert_includes index_html, term, "Expected JSON-LD term '#{term}' to appear on homepage"
    end
  end
end
