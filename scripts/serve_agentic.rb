#!/usr/bin/env ruby
# frozen_string_literal: true

require 'socket'
require 'uri'
require 'json'

SITE_DIR = File.expand_path('../_site', __dir__)
BASE_PATH = '/online-cv'

MIME_TYPES = {
  '.html' => 'text/html; charset=utf-8',
  '.md'   => 'text/markdown; charset=utf-8',
  '.txt'  => 'text/plain; charset=utf-8',
  '.json' => 'application/json; charset=utf-8',
  '.xml'  => 'application/xml; charset=utf-8',
  '.css'  => 'text/css; charset=utf-8',
  '.js'   => 'application/javascript; charset=utf-8',
  '.pdf'  => 'application/pdf',
  '.ico'  => 'image/x-icon',
  '.png'  => 'image/png',
  '.jpg'  => 'image/jpeg',
  '.jpeg' => 'image/jpeg'
}.freeze

class AgenticApp
  def initialize(site_dir = SITE_DIR)
    @site_dir = site_dir
  end

  def prefers_markdown?(accept_header)
    return false if accept_header.nil? || accept_header.empty?

    lower = accept_header.downcase
    lower.include?('text/markdown') || lower.include?('text/x-markdown')
  end

  def normalize_path(raw_path)
    path = URI.decode_www_form_component(raw_path.split('?').first || '/')
    if path == BASE_PATH || path == "#{BASE_PATH}/"
      '/'
    elsif path.start_with?("#{BASE_PATH}/")
      path.sub(/\A#{Regexp.escape(BASE_PATH)}/, '')
    else
      path
    end
  end

  def handle(method, raw_path, headers)
    accept = headers['accept'] || ''
    wants_md = prefers_markdown?(accept)
    rel_path = normalize_path(raw_path)

    if wants_md
      md_candidate = case rel_path
                     when '/', '/index.html'
                       File.join(@site_dir, 'index.md')
                     when '/docs', '/docs/', '/docs/index.html'
                       File.join(@site_dir, 'docs', 'index.md')
                     when '/mcp', '/mcp/', '/mcp/index.html'
                       File.join(@site_dir, 'mcp', 'index.md')
                     when '/about', '/about/', '/about/index.html'
                       File.join(@site_dir, 'about', 'index.md')
                     when '/contact', '/contact/', '/contact/index.html'
                       File.join(@site_dir, 'contact', 'index.md')
                     when '/privacy', '/privacy/', '/privacy/index.html'
                       File.join(@site_dir, 'privacy', 'index.md')
                     end
      if md_candidate && File.file?(md_candidate)
        body = File.read(md_candidate, encoding: 'UTF-8')
        return [200, 'OK', { 'Content-Type' => 'text/markdown; charset=utf-8', 'Vary' => 'Accept' }, method == 'HEAD' ? '' : body]
      end
    end

    fs_path = File.expand_path(File.join(@site_dir, rel_path))
    if fs_path.start_with?(@site_dir)
      fs_path = File.join(fs_path, 'index.html') if File.directory?(fs_path)
      if File.file?(fs_path)
        ext = File.extname(fs_path).downcase
        content_type = MIME_TYPES[ext] || 'application/octet-stream'
        body = content_type.include?('charset=utf-8') ? File.read(fs_path, encoding: 'UTF-8') : File.binread(fs_path)
        return [200, 'OK', { 'Content-Type' => content_type, 'Vary' => 'Accept' }, method == 'HEAD' ? '' : body]
      end
    end

    if rel_path.start_with?('/api/') && !File.file?(File.expand_path(File.join(@site_dir, rel_path)))
      err = {
        'error' => 'API Endpoint Not Found',
        'code' => 'endpoint_not_found',
        'status' => 404,
        'message' => "The API endpoint \"#{rel_path}\" does not exist.",
        'resolution' => 'Query GET /online-cv/api/cv.json or inspect /online-cv/openapi.json.'
      }
      return [404, 'Not Found', { 'Content-Type' => 'application/json; charset=utf-8', 'Vary' => 'Accept' }, JSON.pretty_generate(err)]
    end

    if wants_md
      md_404 = File.join(@site_dir, '404.md')
      body = File.file?(md_404) ? File.read(md_404, encoding: 'UTF-8') : "# 404 Not Found\n\nResource not found. See /online-cv/llms.txt\n"
      [404, 'Not Found', { 'Content-Type' => 'text/markdown; charset=utf-8', 'Vary' => 'Accept' }, method == 'HEAD' ? '' : body]
    else
      html_404 = File.join(@site_dir, '404.html')
      body = File.file?(html_404) ? File.read(html_404, encoding: 'UTF-8') : '<h1>404 Not Found</h1>'
      [404, 'Not Found', { 'Content-Type' => 'text/html; charset=utf-8', 'Vary' => 'Accept' }, method == 'HEAD' ? '' : body]
    end
  end
end

if __FILE__ == $PROGRAM_NAME
  port = (ARGV[0] || ENV['PORT'] || 4000).to_i
  server = TCPServer.new('127.0.0.1', port)
  app = AgenticApp.new
  $stdout.sync = true
  puts "Agentic server listening on http://127.0.0.1:#{port}/online-cv/"

  trap('INT') { exit 0 }
  trap('TERM') { exit 0 }

  loop do
    client = server.accept
    begin
      request_line = client.gets
      next unless request_line

      method, raw_path, _version = request_line.strip.split(' ', 3)
      headers = {}
      while (line = client.gets) && line != "\r\n" && line != "\n"
        key, val = line.split(':', 2)
        headers[key.strip.downcase] = val.strip if key && val
      end

      status, reason, resp_headers, body = app.handle(method, raw_path, headers)
      client.write("HTTP/1.1 #{status} #{reason}\r\n")
      resp_headers['Content-Length'] = body.bytesize.to_s
      resp_headers['Connection'] = 'close'
      resp_headers.each { |k, v| client.write("#{k}: #{v}\r\n") }
      client.write("\r\n")
      client.write(body)
    rescue StandardError => e
      warn "Error handling request: #{e.message}"
    ensure
      client.close
    end
  end
end
