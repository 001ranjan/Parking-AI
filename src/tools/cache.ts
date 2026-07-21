import type { WpPage, WpPortfolio, WpPost } from '../types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

let postsCache: CacheEntry<WpPost[]> | null = null;
let pagesCache: CacheEntry<WpPage[]> | null = null;
let portfolioCache: CacheEntry<WpPortfolio[]> | null = null;

const SITE_URL = (process.env.WP_SITE_URL || 'https://parking.sistem.app').replace(/\/$/, '');
const BASE = (process.env.WP_API_URL || `${SITE_URL}/wp-json/ai/v1`).replace(/\/$/, '');
const WP_V2_BASE = `${SITE_URL}/wp-json/wp/v2`;

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    // Remove entire style/script blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Remove VC shortcodes that wrap raw HTML/SVG
    .replace(/\[vc_raw_html[^\]]*\][\s\S]*?\[\/vc_raw_html\]/gi, '')
    .replace(/\[vc_raw_js[^\]]*\][\s\S]*?\[\/vc_raw_js\]/gi, '')
    // Convert anchor tags to text with URL so links inside content are preserved
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, text) => {
      const trimmedText = text.replace(/<[^>]+>/g, '').trim();
      if (!trimmedText) return '';
      if (!href || href === '#') return trimmedText;
      return `${trimmedText} (${href})`;
    })
    // Remove all remaining shortcode tags
    .replace(/\[\/[\w-]+\]/g, ' ')
    .replace(/\[[\w-]+[^\]]*?\/\]/g, ' ')
    .replace(/\[[\w-]+[^\]]*?\]/g, ' ')
    // Remove all HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#038;/g, '&')
    .replace(/&#8217;/g, "'")
    // Remove inline CSS fragments
    .replace(/[a-z-]+\s*:\s*[^;{}"'\s][^;{}"']*;/gi, '')
    // Collapse whitespace
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
}

async function wpFetchRaw<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`WP API error ${res.status} — ${url}`);
  return res.json() as Promise<T>;
}

async function wpFetchDynamic(endpointUrl: string): Promise<any[]> {
  const allItems: any[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const sep = endpointUrl.includes('?') ? '&' : '?';
    const url = `${endpointUrl}${sep}page=${page}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) break;

      const totalPagesHeader = res.headers.get('x-wp-totalpages');
      if (totalPagesHeader) {
        const parsedPages = parseInt(totalPagesHeader, 10);
        if (!isNaN(parsedPages)) totalPages = parsedPages;
      }

      const items = (await res.json()) as any[];
      if (Array.isArray(items) && items.length > 0) {
        allItems.push(...items);
      } else {
        break;
      }
    } catch {
      break;
    }
    page++;
  }

  return allItems;
}

function extractTitle(item: any): string {
  if (!item) return '';
  if (typeof item.title === 'string') return item.title;
  if (typeof item.title === 'object' && item.title !== null) return item.title.rendered ?? '';
  return String(item.title ?? '');
}

function extractContent(item: any): string {
  if (!item) return '';
  if (typeof item.content === 'string') return item.content;
  if (typeof item.content === 'object' && item.content !== null) return item.content.rendered ?? '';
  return String(item.content ?? '');
}

function extractExcerpt(item: any): string {
  if (!item) return '';
  if (typeof item.excerpt === 'string') return item.excerpt;
  if (typeof item.excerpt === 'object' && item.excerpt !== null) return item.excerpt.rendered ?? '';
  return String(item.excerpt ?? '');
}

function extractUrl(item: any): string {
  if (!item) return '';
  return item.link || item.url || '';
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export async function getPosts(): Promise<WpPost[]> {
  if (postsCache && !isExpired(postsCache)) return postsCache.data;

  let rawItems: any[] = [];

  // Try custom AI endpoint first
  try {
    rawItems = await wpFetchRaw<any[]>(`${BASE}/all-posts`);
  } catch {
    // Fall back to standard WP REST API dynamic fetch
    const endpoints = [
      `${WP_V2_BASE}/posts`,
      `${WP_V2_BASE}/parking`,
      `${WP_V2_BASE}/documents`,
    ];
    for (const ep of endpoints) {
      const fetched = await wpFetchDynamic(ep);
      if (fetched.length) {
        rawItems.push(...fetched);
      }
    }
  }

  const data: WpPost[] = rawItems.map((p) => ({
    id: Number(p.id),
    title: stripHtml(extractTitle(p)),
    url: extractUrl(p),
    content: stripHtml(extractContent(p)).slice(0, 2000),
    thumbnail: p.thumbnail,
  }));

  postsCache = { data, fetchedAt: Date.now() };
  return data;
}

// ─── Pages ────────────────────────────────────────────────────────────────────

export async function getPages(): Promise<WpPage[]> {
  if (pagesCache && !isExpired(pagesCache)) return pagesCache.data;

  let rawItems: any[] = [];

  try {
    rawItems = await wpFetchRaw<any[]>(`${BASE}/all-pages`);
  } catch {
    rawItems = await wpFetchDynamic(`${WP_V2_BASE}/pages`);
  }

  const data: WpPage[] = rawItems.map((p) => ({
    id: Number(p.id),
    title: stripHtml(extractTitle(p)),
    url: extractUrl(p),
    content: stripHtml(extractContent(p)).slice(0, 3000),
  }));

  pagesCache = { data, fetchedAt: Date.now() };
  return data;
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export async function getPortfolio(): Promise<WpPortfolio[]> {
  if (portfolioCache && !isExpired(portfolioCache)) return portfolioCache.data;

  let rawItems: any[] = [];

  try {
    rawItems = await wpFetchRaw<any[]>(`${BASE}/all-portfolio`);
  } catch {
    const endpoints = [
      `${WP_V2_BASE}/ohio_portfolio`,
      `${WP_V2_BASE}/parking`,
    ];
    for (const ep of endpoints) {
      const fetched = await wpFetchDynamic(ep);
      if (fetched.length) rawItems.push(...fetched);
    }
  }

  const data: WpPortfolio[] = rawItems.map((p) => ({
    id: Number(p.id),
    title: stripHtml(extractTitle(p)),
    url: extractUrl(p),
    content: stripHtml(extractContent(p)).slice(0, 1500),
    excerpt: stripHtml(extractExcerpt(p)).slice(0, 400),
    thumbnail: p.thumbnail,
  }));

  portfolioCache = { data, fetchedAt: Date.now() };
  return data;
}

// ─── Single post/page by ID ───────────────────────────────────────────────────

export async function getItemById(id: number): Promise<{
  id: number; title: string; url: string; content: string; excerpt: string; type: string;
}> {
  try {
    const raw = await wpFetchRaw<any>(`${BASE}/post/${id}`);
    return {
      id: Number(raw.id),
      title: stripHtml(extractTitle(raw)),
      url: extractUrl(raw),
      content: stripHtml(extractContent(raw)).slice(0, 4000),
      excerpt: stripHtml(extractExcerpt(raw)).slice(0, 500),
      type: raw.type || 'post',
    };
  } catch {
    // Try standard WP endpoints for post, page, parking, ohio_portfolio
    const postTypes = ['posts', 'pages', 'parking', 'ohio_portfolio', 'documents'];
    for (const pt of postTypes) {
      try {
        const raw = await wpFetchRaw<any>(`${WP_V2_BASE}/${pt}/${id}`);
        if (raw && raw.id) {
          return {
            id: Number(raw.id),
            title: stripHtml(extractTitle(raw)),
            url: extractUrl(raw),
            content: stripHtml(extractContent(raw)).slice(0, 4000),
            excerpt: stripHtml(extractExcerpt(raw)).slice(0, 500),
            type: raw.type || pt,
          };
        }
      } catch {
        // ignore
      }
    }
    throw new Error(`Item with ID ${id} not found.`);
  }
}

// ─── Cache control ────────────────────────────────────────────────────────────

export function bustCache(): void {
  postsCache = null;
  pagesCache = null;
  portfolioCache = null;
}
