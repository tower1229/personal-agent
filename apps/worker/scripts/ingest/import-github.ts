import { createAdminApiClient } from "./utils.js";

async function fetchGithubRepoContent(repo: string, endpoint: string, token?: string) {
  const headers: any = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "Personal-Agent"
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, { headers });
  if (!res.ok) {
    return null;
  }
  return res.json();
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
  const usagePolicy = namespace === "work" ? "do_not_use" : "background_knowledge";
  
  async function importToAdmin(title: string, content: string, type: string) {
    try {
      const result = await client.post("/api/admin/personal-model/sources", {
        data: {
          sourceType: "github",
          title: title,
          content: content,
          usagePolicy: usagePolicy,
          sensitivity: "standard"
        },
        metadata: {
          source: "github",
          repo: repoFullName,
          namespace: namespace,
          github_data_type: type
        }
      });
      console.log(`✅ Imported GitHub ${type}: ${title} -> source_id: ${(result as any).source.id}`);
    } catch (err) {
      console.error(`❌ Failed to import GitHub ${type} ${title}:`, err);
    }
  }

  console.log(`Fetching data for ${repoFullName}...`);

  // 1. Fetch README
  const readmeData = await fetchGithubRepoContent(repoFullName, "readme", githubToken);
  if (readmeData && readmeData.content) {
    const content = Buffer.from(readmeData.content, "base64").toString("utf-8");
    await importToAdmin(`README of ${repoFullName}`, content, "readme");
  }

  // 2. Fetch Docs (try root /docs directory)
  const docsData = await fetchGithubRepoContent(repoFullName, "contents/docs", githubToken);
  if (Array.isArray(docsData)) {
    for (const file of docsData) {
      if (file.type === "file" && file.name.endsWith(".md")) {
        const fileData = await fetchGithubRepoContent(repoFullName, `contents/${file.path}`, githubToken);
        if (fileData && fileData.content) {
          const content = Buffer.from(fileData.content, "base64").toString("utf-8");
          await importToAdmin(`Doc: ${file.path}`, content, "doc");
        }
      }
    }
  }

  // 3. Fetch recent Issues and PRs
  const issuesData = await fetchGithubRepoContent(repoFullName, "issues?state=all&per_page=20", githubToken);
  if (Array.isArray(issuesData)) {
    for (const issue of issuesData) {
      // Ignore issues with empty bodies
      if (issue.body) {
        const type = issue.pull_request ? "pr" : "issue";
        await importToAdmin(`[#${issue.number}] ${issue.title}`, issue.body, type);
      }
    }
  }

  // 4. Fetch recent Commits
  const commitsData = await fetchGithubRepoContent(repoFullName, "commits?per_page=50", githubToken);
  if (Array.isArray(commitsData)) {
    // Combine commits into a single daily log or chunk them. For simplicity, join them.
    const commitMessages = commitsData.map((c: any) => `- [${c.sha.substring(0,7)}] ${c.commit.message}`).join("\n");
    if (commitMessages.trim()) {
      await importToAdmin(`Recent Commits of ${repoFullName}`, commitMessages, "commits");
    }
  }
}

main().catch(console.error);
