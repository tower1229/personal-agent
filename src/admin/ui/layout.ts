import { adminUiStyles } from "./styles.js";

export function layout(title: string, body: string): string {
  const pageTitle = `${title} | Admin Debug`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${pageTitle}</title>
  <style>${adminUiStyles}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="/admin/ui">Admin Debug</a>
      <nav class="nav" aria-label="Admin sections">
        <a href="/admin/ui/runs">Runs</a>
        <a href="/admin/ui/workflows">Workflows</a>
        <a href="/admin/ui/approvals">Approvals</a>
        <a href="/admin/ui/documents">Documents</a>
        <a href="/admin/ui/evals">Eval Runs</a>
      </nav>
    </header>
    ${body}
  </main>
</body>
</html>`;
}
