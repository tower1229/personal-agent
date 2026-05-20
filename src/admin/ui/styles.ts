export const adminUiStyles = `
:root {
  color-scheme: light;
  --bg: oklch(0.985 0.006 215);
  --panel: oklch(0.998 0.004 215);
  --panel-soft: oklch(0.965 0.008 215);
  --text: oklch(0.22 0.018 240);
  --muted: oklch(0.48 0.018 240);
  --line: oklch(0.88 0.01 230);
  --accent: oklch(0.48 0.12 220);
  --green-bg: oklch(0.93 0.055 155);
  --green-text: oklch(0.32 0.09 155);
  --red-bg: oklch(0.94 0.055 25);
  --red-text: oklch(0.42 0.13 25);
  --yellow-bg: oklch(0.94 0.07 88);
  --yellow-text: oklch(0.42 0.08 82);
  --gray-bg: oklch(0.91 0.008 230);
  --gray-text: oklch(0.38 0.012 230);
  --danger-bg: oklch(0.955 0.04 22);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.45;
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

.shell {
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 40px;
}

.topbar {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}

.brand {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0;
}

.nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.nav a,
.quick-link {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  padding: 7px 10px;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.quick-link {
  min-height: 72px;
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 650;
}

.filter-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 12px;
  margin-bottom: 14px;
}

.filter-form label {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.filter-form input,
.filter-form select {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: white;
  color: var(--text);
  padding: 7px 8px;
  font: inherit;
}

.filter-form .actions {
  display: flex;
  align-items: end;
  gap: 8px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--accent);
  color: white;
  padding: 7px 10px;
  font-weight: 700;
  cursor: pointer;
}

.button.secondary {
  background: var(--panel);
  color: var(--text);
}

.section {
  margin-top: 18px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.section h1 {
  margin: 0 0 14px;
  font-size: 24px;
  line-height: 1.2;
}

.section h2 {
  margin: 24px 0 10px;
  font-size: 17px;
  line-height: 1.25;
}

.table-wrap {
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 760px;
}

th,
td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}

th {
  background: var(--panel-soft);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

tr:last-child td {
  border-bottom: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.badge-green {
  background: var(--green-bg);
  color: var(--green-text);
}

.badge-red {
  background: var(--red-bg);
  color: var(--red-text);
}

.badge-yellow {
  background: var(--yellow-bg);
  color: var(--yellow-text);
}

.badge-gray {
  background: var(--gray-bg);
  color: var(--gray-text);
}

.badge-danger {
  background: var(--red-bg);
  color: var(--red-text);
  border: 1px solid oklch(0.82 0.08 25);
}

.row-expired,
.row-risk-high {
  background: var(--danger-bg);
}

.row-muted {
  color: var(--muted);
  background: var(--gray-bg);
}

.muted {
  color: var(--muted);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}

.preview {
  max-width: 42ch;
}

pre {
  max-width: 100%;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}

details {
  max-width: 720px;
}

summary {
  cursor: pointer;
  color: var(--accent);
  font-weight: 650;
}

.kv {
  display: grid;
  grid-template-columns: minmax(120px, 180px) 1fr;
  gap: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 12px;
}

.kv dt {
  color: var(--muted);
  font-weight: 700;
}

.kv dd {
  margin: 0;
}

.empty {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 16px;
  color: var(--muted);
}

.timeline {
  display: grid;
  gap: 10px;
}

.timeline-item {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  padding: 10px 12px;
}

.timeline-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--muted);
  font-size: 12px;
}

.timeline-summary {
  margin-top: 6px;
}

.debug-prompt {
  margin-top: 12px;
}

@media (max-width: 720px) {
  .shell {
    width: min(100vw - 20px, 1180px);
    padding-top: 16px;
  }

  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .kv {
    grid-template-columns: 1fr;
  }
}
`;
