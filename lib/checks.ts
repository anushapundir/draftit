import type Anthropic from "@anthropic-ai/sdk";

// Directories, review sites, press and social: they write about companies, they are not the company.
const BLOCKED = [
  "g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustradius.com", "alternativeto.net", "saasworthy.com",
  "sourceforge.net", "slashdot.org", "stackshare.io", "builtwith.com", "similarweb.com", "clutch.co", "goodfirms.co",
  "crunchbase.com", "pitchbook.com", "tracxn.com", "cbinsights.com", "owler.com", "zoominfo.com", "getlatka.com", "sacra.com",
  "wellfound.com", "angel.co", "f6s.com", "ycombinator.com", "producthunt.com", "betalist.com",
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com", "youtube.com", "reddit.com", "github.com",
  "medium.com", "substack.com", "wikipedia.org", "glassdoor.com", "indeed.com",
  "techcrunch.com", "venturebeat.com", "forbes.com", "businessinsider.com", "theverge.com", "wired.com", "bloomberg.com", "reuters.com",
];

const LISTICLE = /\b(top|best)\s+\d+\b|\balternatives?\b|\bvs\.?\s/i;

// "https://www.Acme.io/pricing" -> "acme.io". Null when there is no plausible hostname.
export function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
}

const within = (domain: string, root: string) => domain === root || domain.endsWith(`.${root}`);

export const isBlockedDomain = (domain: string) => BLOCKED.some((b) => within(domain, b));

export type Candidate = { name: string; domain: string; fit: string };

export function cleanTargets(found: Candidate[], ownDomain: string, limit: number): { kept: Candidate[]; rejected: { name: string; domain: string; reason: string }[] } {
  const own = normalizeDomain(ownDomain);
  const seen = new Set<string>();
  const kept: Candidate[] = [];
  const rejected: { name: string; domain: string; reason: string }[] = [];
  for (const c of found) {
    const domain = normalizeDomain(c.domain);
    const reason = !domain
      ? "no company domain"
      : own && (within(domain, own) || within(own, domain))
        ? "your own site"
        : isBlockedDomain(domain)
          ? "directory or press site"
          : LISTICLE.test(c.name)
            ? "looks like a list, not a company"
            : seen.has(domain)
              ? "duplicate"
              : kept.length >= limit
                ? "over the limit"
                : null;
    if (reason) {
      rejected.push({ name: c.name, domain: c.domain, reason });
      continue;
    }
    seen.add(domain!);
    kept.push({ ...c, domain: domain! });
  }
  return { kept, rejected };
}

// Same page, ignoring scheme, www, case of host, fragment, trailing slash and utm_* tracking params.
export function normalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  const query = url.searchParams.toString();
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.hostname.toLowerCase().replace(/^www\./, "")}${path}${query ? `?${query}` : ""}`;
}

// Every URL the search tool actually returned in these blocks. Error results carry an object, not a list.
export function retrievedUrls(content: Anthropic.ContentBlock[]): string[] {
  return content.flatMap((b) => (b.type === "web_search_tool_result" && Array.isArray(b.content) ? b.content.map((r) => r.url) : []));
}

export type SignalCheck = "verified" | "unverified" | "none";

// The trust rule: a signal counts only if its source is a URL the search tool returned, not one the model typed.
export function verifySignal(sourceUrl: string | null | undefined, retrieved: Iterable<string>): SignalCheck {
  if (!sourceUrl) return "none";
  const cited = normalizeUrl(sourceUrl);
  if (!cited) return "unverified";
  for (const url of retrieved) if (normalizeUrl(url) === cited) return "verified";
  return "unverified";
}

// Model text goes straight to the screen and into the saved fixture, so house style is enforced here too.
export function cleanText(text: string): string {
  return text
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email removed]")
    .trim();
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;
