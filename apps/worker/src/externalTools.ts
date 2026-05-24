export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  source: string;
  rank: number;
}

export interface SearchClient {
  search(input: { query: string; count?: number }): Promise<WebSearchResult[]>;
}

export interface UrlFetchResult {
  url: string;
  title: string | null;
  text: string;
  bytesRead: number;
}

export interface UrlFetcher {
  fetchUrl(input: { url: string; maxBytes?: number }): Promise<UrlFetchResult>;
}

interface BraveSearchResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
}

export function createBraveSearchClient(input: {
  apiKey: string;
  fetcher?: typeof fetch;
}): SearchClient {
  const fetcher = input.fetcher ?? fetch;

  return {
    async search(request) {
      const query = request.query.trim();
      if (!query) {
        return [];
      }

      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(request.count ?? 5));

      const response = await fetcher(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": input.apiKey
        }
      });

      if (!response.ok) {
        throw new Error(`Brave search returned ${response.status}`);
      }

      const body = (await response.json()) as BraveSearchResponse;
      return (body.web?.results ?? [])
        .filter((item) => item.url)
        .slice(0, request.count ?? 5)
        .map((item, index) => ({
          title: item.title ?? item.url ?? "",
          url: item.url ?? "",
          description: item.description ?? "",
          source: "brave",
          rank: index + 1
        }));
    }
  };
}

function extractTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? decodeHtml(match[1] ?? "").trim() : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToText(value: string): string {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
  ).trim();
}

export function createUrlFetcher(input: {
  fetcher?: typeof fetch;
  defaultMaxBytes: number;
}): UrlFetcher {
  const fetcher = input.fetcher ?? fetch;

  return {
    async fetchUrl(request) {
      const parsed = new URL(request.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("fetch_url only supports http and https URLs");
      }

      const maxBytes = request.maxBytes ?? input.defaultMaxBytes;
      const response = await fetcher(parsed.toString(), {
        headers: {
          Accept: "text/html,text/plain,application/xhtml+xml"
        }
      });

      if (!response.ok) {
        throw new Error(`fetch_url returned ${response.status}`);
      }

      const text = await response.text();
      const bytesRead = new TextEncoder().encode(text).byteLength;
      if (bytesRead > maxBytes) {
        throw new Error(`fetch_url exceeded ${maxBytes} bytes`);
      }

      return {
        url: parsed.toString(),
        title: extractTitle(text),
        text: htmlToText(text).slice(0, maxBytes),
        bytesRead
      };
    }
  };
}
