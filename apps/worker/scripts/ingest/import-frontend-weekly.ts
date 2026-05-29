import fs from "fs/promises";
import path from "path";
import { createAdminApiClient } from "./utils.js";

function parseFrontendWeeklyMarkdown(content: string) {
  let title = "Untitled Frontend-Weekly";
  let metadata: any = {};
  
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

  // Very naive block segmentation
  // Assume lines starting with > are external quotes
  // We can segment into: Original View, External Link/Quote
  const blocks: Array<{ content: string; type: "original_view" | "external_link" }> = [];
  
  const paragraphs = content.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const text = para.trim();
    if (!text || text.startsWith("#")) continue;
    
    if (text.startsWith(">")) {
      blocks.push({ content: text, type: "external_link" });
    } else {
      blocks.push({ content: text, type: "original_view" });
    }
  }

  return { title, blocks, metadata };
}

async function main() {
  const dirPath = process.argv[2];
  if (!dirPath) {
    console.error("Usage: npx tsx import-frontend-weekly.ts <path-to-markdown-files>");
    process.exit(1);
  }

  const adminSecret = process.env.ADMIN_SESSION_SECRET || "default_secret_for_local_dev";
  const ownerId = parseInt(process.env.OWNER_TG_USER_ID || "12345", 10);
  const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8787";

  const client = await createAdminApiClient(baseUrl, ownerId, adminSecret);

  const files = await fs.readdir(dirPath);
  for (const file of files) {
    if (file.endsWith(".md")) {
      console.log(`Processing ${file}...`);
      const rawContent = await fs.readFile(path.join(dirPath, file), "utf8");
      const { title, blocks, metadata } = parseFrontendWeeklyMarkdown(rawContent);

      try {
        for (const [index, block] of blocks.entries()) {
          // If it's an external link, we use do_not_use for safety, or background_knowledge with external flag
          const usagePolicy = block.type === "external_link" ? "do_not_use" : "background_knowledge";
          const result = await client.post("/api/admin/personal-model/sources", {
            data: {
              sourceType: "blog",
              title: `${title} - Part ${index + 1}`,
              content: block.content,
              usagePolicy: usagePolicy,
              sensitivity: "standard"
            },
            metadata: {
              ...metadata,
              source: "frontend-weekly",
              filename: file,
              weekly_segment_type: block.type
            }
          });
          console.log(`✅ Imported block: ${block.type} -> source_id: ${(result as any).source.id}`);
        }
      } catch (err) {
        console.error(`❌ Failed to import ${file}:`, err);
      }
    }
  }
}

main().catch(console.error);
