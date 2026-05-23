export function renderAdminLandingPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Personal Agent Admin</title>
    <style>
      body {
        margin: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f7f9;
        color: #1f2937;
      }
      main {
        box-sizing: border-box;
        max-width: 760px;
        margin: 0 auto;
        padding: 56px 24px;
      }
      h1 {
        margin: 0 0 16px;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0 0 14px;
        line-height: 1.7;
      }
      code {
        padding: 2px 6px;
        border-radius: 6px;
        background: #e5e7eb;
      }
      a {
        color: #0f766e;
      }
      .panel {
        margin-top: 24px;
        padding: 20px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        background: #ffffff;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Personal Agent Admin</h1>
      <p>当前端口是旧 Node Admin API，不是新的 Cloudflare Admin SPA。</p>
      <div class="panel">
        <p>查看新的 React 控制台：</p>
        <p><code>npm run dev:worker</code></p>
        <p>然后打开 <a href="http://127.0.0.1:8787/admin">http://127.0.0.1:8787/admin</a>。</p>
      </div>
      <div class="panel">
        <p>继续使用旧调试 UI：</p>
        <p><a href="/admin/ui">/admin/ui</a> 仍需要旧的 <code>ADMIN_TOKEN</code> 或 Bearer token。</p>
      </div>
    </main>
  </body>
</html>`;
}
