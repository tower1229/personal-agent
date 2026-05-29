import { createAdminApiClient } from "./utils.js";

async function fetchGithubRepoContent(repo: string, token?: string) {
  const headers: any = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Personal-Agent"
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  // Fetch README
  const res = await fetch(`https://api.github.com/repos/${repo}/readme`, { headers });
  if (!res.ok) {
    console.warn(`Could not fetch README for ${repo}: ${res.status}`);
    return null;
  }
  
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return content;
}

async function main() {
  const repoFullName = process.argv[2]; // e.g. tower1229/personal-agent
  const namespace = process.argv[3] || "personal"; // personal or work
  if (!repoFullName) {
    console.error("Usage: npx tsx import-github.ts <owner/repo> [namespace]");
    process.exit(1);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const adminSecret = process.env.ADMIN_SESSION_SECRET || "default_secret_for_local_dev";
  const ownerId = parseInt(process.env.OWNER_TG_USER_ID || "12345", 10);
  const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:8787";

  const client = await createAdminApiClient(baseUrl, ownerId, adminSecret);

  console.log(`Fetching README for ${repoFullName}...`);
  const content = await fetchGithubRepoContent(repoFullName, githubToken);

  if (content) {
    const usagePolicy = namespace === "work" ? "do_not_use" : "background_knowledge";
    try {
      const result = await client.post("/api/admin/personal-model/sources", {
        data: {
          sourceType: "github",
          title: `README of ${repoFullName}`,
          content: content,
          usagePolicy: usagePolicy,
          sensitivity: "standard"
        },
        metadata: {
          source: "github",
          repo: repoFullName,
          namespace: namespace
        }
      });
      console.log(`✅ Imported GitHub Repo: ${repoFullName} -> source_id: ${(result as any).source.id}`);
    } catch (err) {
      console.error(`❌ Failed to import GitHub repo ${repoFullName}:`, err);
    }
  }
}

main().catch(console.error);
