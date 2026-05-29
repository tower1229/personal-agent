import fs from "fs/promises";
import { createAdminApiClient } from "./utils.js";

async function main() {
  const filePath = process.argv[2];
  const platform = process.argv[3] || "qzone"; // qzone, weibo, etc.
  if (!filePath) {
    console.error("Usage: npx tsx import-social.ts <path-to-json-file> [platform]");
    process.exit(1);
  }

  const adminSecret = process.env.ADMIN_SESSION_SECRET || "default_secret_for_local_dev";
  const ownerId = parseInt(process.env.OWNER_TG_USER_ID || "12345", 10);
  const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8787";

  const client = await createAdminApiClient(baseUrl, ownerId, adminSecret);

  console.log(`Processing social export from ${filePath}...`);
  const rawData = await fs.readFile(filePath, "utf8");
  const records = JSON.parse(rawData);

  if (!Array.isArray(records)) {
    console.error("Expected JSON to be an array of objects.");
    process.exit(1);
  }

  for (const record of records) {
    const { content, created_at, id } = record;
    if (!content) continue;

    try {
      const result = await client.post("/api/admin/personal-model/sources", {
        data: {
          sourceType: "social",
          title: `${platform.toUpperCase()} Record ${id || created_at}`,
          content: content,
          usagePolicy: "background_knowledge", // By default background knowledge
          sensitivity: "private" // Default private for social records
        },
        metadata: {
          source: platform,
          original_id: id,
          isHistoricalExpression: true, // Tag explicitly as historical
          created_at: created_at
        }
      });
      console.log(`✅ Imported: ${platform} record ${id || created_at} -> source_id: ${(result as any).source.id}`);
    } catch (err) {
      console.error(`❌ Failed to import record:`, err);
    }
  }
}

main().catch(console.error);
