import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;

export class InputError extends Error {}
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3],
] as const) blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const)
  blocked.addSubnet(net, prefix, "ipv6");

// BlockList also matches IPv4-mapped IPv6 addresses against the IPv4 rules.
const isBlocked = (ip: string) => blocked.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");

export function parseSiteUrl(input: string): URL {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new InputError("Not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new InputError("Only http and https URLs are allowed");
  if (url.username || url.password) throw new InputError("URLs with credentials are not allowed");
  return url;
}

// Every address is vetted inside the socket's own lookup, so the IP we check is the IP we connect to.
const vettedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err?.code === "ENOTFOUND") return callback(new InputError("Could not resolve that host"), "");
    if (err) return callback(err, "");
    if (addresses.length === 0) return callback(new InputError("Could not resolve that host"), "");
    if (addresses.some((a) => isBlocked(a.address))) return callback(new InputError("That host is not publicly reachable"), "");
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
};

type RawResponse = { status: number; location?: string; body: string };

function get(url: URL, signal: AbortSignal): Promise<RawResponse> {
  // IP literals skip the lookup hook entirely, so they are checked here.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && isBlocked(literal)) return Promise.reject(new InputError("That host is not publicly reachable"));
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { lookup: vettedLookup, signal, headers: { "user-agent": "draftit/0.1 (+prospect research)", "accept-encoding": "identity" } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        const done = () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).subarray(0, MAX_BYTES).toString("utf8") });
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          if (size >= MAX_BYTES) {
            res.destroy();
            done();
          }
        });
        res.on("end", done);
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function fetchHomepage(start: URL): Promise<{ url: URL; html: string }> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await get(url, signal);
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = parseSiteUrl(new URL(res.location, url).toString());
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new InputError(`The site answered with HTTP ${res.status}`);
    return { url, html: res.body };
  }
  throw new InputError("Too many redirects");
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function meta(html: string, name: string): string | undefined {
  const tag = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i"))?.[0];
  return tag?.match(/content=["']([^"']*)["']/i)?.[1];
}

export function pageText(html: string): { title: string; siteName?: string; text: string } {
  const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  const description = meta(html, "description") ?? meta(html, "og:description") ?? "";
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decode(`${description}. ${body}`).replace(/\s+/g, " ").trim();
  return { title, siteName: meta(html, "og:site_name"), text };
}
