import { Injectable } from '@nestjs/common';
import { LinkPreview } from './schemas/message.schema';

const FETCH_TIMEOUT_MS = 3000;
const MAX_HTML_BYTES = 500_000;
const USER_AGENT = 'HangoutLinkPreview/1.0 (+https://hangout.app)';

// Never fetch pages on the local/private network on behalf of a chat message
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.test')
  ) {
    return true;
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254))
      return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  if (host === '::1' || host === '0.0.0.0') return true;
  return false;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function metaContent(html: string, key: string): string | undefined {
  const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${keyPattern}["'][^>]+content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${keyPattern}["']`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = decodeEntities(match[1]).trim();
      if (value) return value;
    }
  }
  return undefined;
}

function absoluteUrl(base: URL, maybeRelative?: string): string | undefined {
  if (!maybeRelative) return undefined;
  try {
    const resolved = new URL(maybeRelative, base);
    return resolved.protocol === 'http:' || resolved.protocol === 'https:'
      ? resolved.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function buildPreview(url: URL, html: string): LinkPreview | null {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    metaContent(html, 'og:title') ??
    (titleTag?.[1]
      ? decodeEntities(titleTag[1]).replace(/\s+/g, ' ').trim()
      : undefined);
  const description =
    metaContent(html, 'og:description') ?? metaContent(html, 'description');
  const image = absoluteUrl(url, metaContent(html, 'og:image'));
  const siteName =
    metaContent(html, 'og:site_name') ?? url.hostname.replace(/^www\./, '');

  if (!title && !description && !image) return null;

  return {
    url: url.toString(),
    ...(title ? { title: title.slice(0, 200) } : {}),
    ...(description ? { description: description.slice(0, 400) } : {}),
    ...(image ? { image: image.slice(0, 500) } : {}),
    siteName: siteName.slice(0, 100),
  };
}

@Injectable()
export class LinkPreviewService {
  // Scrapes og/title metadata for a link; null when the page can't be read safely
  // (bad URL, private host, timeout, not HTML). Always best-effort.
  async fetchPreview(rawUrl: string): Promise<LinkPreview | null> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isBlockedHost(url.hostname)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) return null;
      // The redirect target is checked too — it may point inside the network
      try {
        if (isBlockedHost(new URL(res.url).hostname)) return null;
      } catch {
        return null;
      }

      const html = (await res.text()).slice(0, MAX_HTML_BYTES);
      return buildPreview(url, html);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
