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
  isTruncated: boolean;
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

import * as cheerio from "cheerio";

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
  try {
    const $ = cheerio.load(value);
    // Remove typical noise tags and classes
    $('script, style, nav, footer, header, aside, noscript, iframe, svg, form, .sidebar, .nav, .menu, .ads, .comment, #comments').remove();
    
    // Attempt to find the main content wrapper
    let mainContent: any = $('article');
    if (mainContent.length === 0) {
      mainContent = $('main');
    }
    if (mainContent.length === 0) {
      mainContent = $('body');
    }
    if (mainContent.length === 0) {
      mainContent = $.root();
    }
    
    // Extract text, condense whitespace
    return mainContent.text().replace(/\s+/g, " ").trim();
  } catch {
    // Fallback to naive regex if cheerio fails
    return decodeHtml(
      value
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    ).trim();
  }
}

async function readLimitedText(input: {
  response: Response;
  maxBytes: number;
}): Promise<{ text: string; bytesRead: number; isTruncated: boolean }> {
  if (!input.response.body) {
    const text = await input.response.text();
    const bytesRead = new TextEncoder().encode(text).byteLength;
    if (bytesRead > input.maxBytes) {
      const truncatedBuffer = new TextEncoder().encode(text).slice(0, input.maxBytes);
      return { 
        text: new TextDecoder().decode(truncatedBuffer), 
        bytesRead: input.maxBytes, 
        isTruncated: true 
      };
    }
    return { text, bytesRead, isTruncated: false };
  }

  const reader = input.response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  let isTruncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      bytesRead += value.byteLength;
      if (bytesRead > input.maxBytes) {
        const allowed = value.byteLength - (bytesRead - input.maxBytes);
        if (allowed > 0) {
          chunks.push(value.slice(0, allowed));
        }
        bytesRead = input.maxBytes;
        isTruncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: new TextDecoder().decode(buffer),
    bytesRead,
    isTruncated
  };
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
        },
        redirect: "manual"
      });

      if (response.status >= 300 && response.status < 400) {
        throw new Error("fetch_url redirect_url_not_allowed");
      }

      if (!response.ok) {
        throw new Error(`fetch_url returned ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (
        contentType &&
        !/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)
      ) {
        throw new Error("fetch_url unsupported content type");
      }

      const { text, bytesRead, isTruncated } = await readLimitedText({
        response,
        maxBytes
      });

      return {
        url: parsed.toString(),
        title: extractTitle(text),
        text: htmlToText(text).slice(0, maxBytes),
        bytesRead,
        isTruncated
      };
    }
  };
}
