#!/usr/bin/env python3
"""
Simple HTTP server that renders README.md as HTML with GitHub Dark styling
"""
import http.server
import socketserver
import os
import re
from pathlib import Path

PORT = 8000

# GitHub Dark CSS (from https://github.com/sindresorhus/github-markdown-css)
GITHUB_DARK_CSS = """
<style>
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  background-color: #0d1117;
}

body {
  min-height: 100vh;
}

.markdown-body {
  box-sizing: border-box;
  min-width: 200px;
  max-width: 980px;
  margin: 0 auto;
  padding: 45px;
  color: #c9d1d9;
  background-color: #0d1117;
  font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji";
  font-size: 16px;
  line-height: 1.5;
  word-wrap: break-word;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: #f0f6fc;
}

.markdown-body h1 {
  font-size: 2em;
  border-bottom: 1px solid #21262d;
  padding-bottom: .3em;
}

.markdown-body h2 {
  font-size: 1.5em;
  border-bottom: 1px solid #21262d;
  padding-bottom: .3em;
}

.markdown-body code {
  padding: .2em .4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(110,118,129,0.4);
  border-radius: 6px;
  color: #c9d1d9;
  font-family: ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;
}

.markdown-body pre {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background-color: #161b22;
  border-radius: 6px;
  color: #c9d1d9;
}

.markdown-body pre code {
  display: inline;
  max-width: auto;
  padding: 0;
  margin: 0;
  overflow: visible;
  line-height: inherit;
  word-wrap: normal;
  background-color: transparent;
  border: 0;
}

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  display: block;
  width: max-content;
  max-width: 100%;
  overflow: auto;
}

.markdown-body table th, .markdown-body table td {
  padding: 6px 13px;
  border: 1px solid #30363d;
}

.markdown-body table th {
  font-weight: 600;
  background-color: #161b22;
}

.markdown-body table tr {
  background-color: #0d1117;
  border-top: 1px solid #21262d;
}

.markdown-body table tr:nth-child(2n) {
  background-color: #161b22;
}

.markdown-body a {
  color: #58a6ff;
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: #8b949e;
  border-left: .25em solid #30363d;
  margin: 0;
}

.markdown-body ul, .markdown-body ol {
  padding-left: 2em;
}

.markdown-body li {
  margin: .25em 0;
}

.markdown-body hr {
  height: .25em;
  padding: 0;
  margin: 24px 0;
  background-color: #21262d;
  border: 0;
}

.markdown-body strong {
  font-weight: 600;
  color: #f0f6fc;
}

.markdown-body em {
  font-style: italic;
  color: #c9d1d9;
}
</style>
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  {css}
</head>
<body>
  <article class="markdown-body">
    {content}
  </article>
  <script>
    // Auto-refresh every 2 seconds to see updates
    setTimeout(function() {{
      location.reload();
    }}, 2000);
  </script>
</body>
</html>
"""

class MarkdownHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Always serve the rendered README, regardless of path
        try:
            readme_path = Path('README.md')
            if not readme_path.exists():
                self.send_error(404, "README.md not found")
                return
            
            # Read and convert markdown to HTML
            import markdown
            with open(readme_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
            
            # Convert markdown to HTML
            html_content = markdown.markdown(
                md_content,
                extensions=['tables', 'fenced_code', 'codehilite']
            )
            
            # Wrap in HTML template
            html = HTML_TEMPLATE.format(
                title="Blueprint App - README",
                css=GITHUB_DARK_CSS,
                content=html_content
            )
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
            
        except Exception as e:
            self.send_error(500, f"Error rendering markdown: {str(e)}")

if __name__ == "__main__":
    try:
        import markdown
    except ImportError:
        print("Installing markdown library...")
        import subprocess
        subprocess.check_call(['pip3', 'install', 'markdown'])
        import markdown
    
    with socketserver.TCPServer(("", PORT), MarkdownHandler) as httpd:
        print(f"Markdown server running at http://127.0.0.1:{PORT}/")
        print("Auto-refreshing every 2 seconds to show updates...")
        httpd.serve_forever()

