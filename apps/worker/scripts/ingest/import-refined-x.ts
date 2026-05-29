import fs from "fs/promises";
import path from "path";
import { createAdminApiClient } from "./utils.js";

// Extract YAML frontmatter and title from markdown
function parseRefinedXMarkdown(content: string) {
  let title = "Untitled Refined-X Article";
  let metadata: any = {};
  
  // Very basic frontmatter parser
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const yaml = frontmatterMatch[1];
    yaml.split("\n").forEach(line => {
      const [key, ...values] = line.split(":");
      if (key && values.length > 0) {
        metadata[key.trim()] = values.join(":").trim();
      }
    });
    content = content.replace(/^---\n[\s\S]*?\n---\n*/, "");
  }

  const h1Match = content.match(/^# (.*)/m);
  if (h1Match) {
    title = h1Match[1].trim();
  } else if (metadata.title) {
    title = metadata.title;
  }

  return { title, content, metadata };
}

async function main() {
  const dirPath = process.argv[2];
  if (!dirPath) {
    console.error("Usage: npx tsx import-refined-x.ts <path-to-markdown-files>");
    process.exit(1);
  }

  // Load from .dev.vars if exists or env
  const adminSecret = process.env.ADMIN_SESSION_SECRET || "default_secret_for_local_dev";
  const ownerId = parseInt(process.env.OWNER_TG_USER_ID || "12345", 10);
  const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8787";

  const client = await createAdminApiClient(baseUrl, ownerId, adminSecret);

  const files = await fs.readdir(dirPath);
  for (const file of files) {
    if (file.endsWith(".md")) {
      console.log(`Processing ${file}...`);
      const rawContent = await fs.readFile(path.join(dirPath, file), "utf8");
      const { title, content, metadata } = parseRefinedXMarkdown(rawContent);

      try {
        const result = await client.post("/api/admin/personal-model/sources", {
          data: {
            sourceType: "blog",
            title: title,
            content: content,
            usagePolicy: "background_knowledge",
            sensitivity: "standard"
          },
          metadata: {
            ...metadata,
            source: "refined-x",
            filename: file
          }
        });
        console.log(`✅ Imported: ${title} -> source_id: ${(result as any).source.id}`);
      } catch (err) {
        console.error(`❌ Failed to import ${file}:`, err);
      }
    }
  }
}

main().catch(console.error);
