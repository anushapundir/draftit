import type Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanTargets, cleanText, normalizeDomain, retrievedUrls, verifySignal } from "../lib/checks";

const searchResult = (urls: string[]) =>
  ({ type: "web_search_tool_result", tool_use_id: "srv_1", content: urls.map((url) => ({ type: "web_search_result", url, title: "", encrypted_content: "", page_age: null })) }) as unknown as Anthropic.ContentBlock;

test("a signal is verified only when its URL came back from the search tool", () => {
  const retrieved = retrievedUrls([
    searchResult(["https://www.acme.com/blog/series-a/", "https://news.example.com/acme?id=7&utm_source=x"]),
    { type: "web_search_tool_result", tool_use_id: "srv_2", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } } as unknown as Anthropic.ContentBlock,
    { type: "text", text: "see https://acme.com/made-up", citations: null } as Anthropic.ContentBlock,
  ]);
  assert.deepEqual(retrieved, ["https://www.acme.com/blog/series-a/", "https://news.example.com/acme?id=7&utm_source=x"]);

  // Cosmetic differences still match.
  assert.equal(verifySignal("http://acme.com/blog/series-a#top", retrieved), "verified");
  assert.equal(verifySignal("https://news.example.com/acme?id=7", retrieved), "verified");
  // A made-up path on a real domain, a different query, a URL only mentioned in text: all unverified.
  assert.equal(verifySignal("https://acme.com/blog/series-b", retrieved), "unverified");
  assert.equal(verifySignal("https://news.example.com/acme?id=8", retrieved), "unverified");
  assert.equal(verifySignal("https://acme.com/made-up", retrieved), "unverified");
  assert.equal(verifySignal("not a url", retrieved), "unverified");
  assert.equal(verifySignal(null, retrieved), "none");
});

test("domains normalize to a bare hostname", () => {
  assert.equal(normalizeDomain("https://www.Acme.io/pricing?x=1"), "acme.io");
  assert.equal(normalizeDomain("app.acme.co.uk:443"), "app.acme.co.uk");
  assert.equal(normalizeDomain("Acme Inc"), null);
  assert.equal(normalizeDomain("localhost"), null);
});

test("targets drop your own site, directories, listicles and duplicates", () => {
  const fit = "x";
  const { kept, rejected } = cleanTargets(
    [
      { name: "Self", domain: "https://docs.mine.com", fit },
      { name: "Acme", domain: "acme.com", fit },
      { name: "Acme again", domain: "https://www.acme.com/about", fit },
      { name: "Acme on G2", domain: "g2.com/products/acme", fit },
      { name: "Crunchbase", domain: "www.crunchbase.com", fit },
      { name: "Top 10 tools for teams", domain: "blog.example.com", fit },
      { name: "No domain", domain: "unknown", fit },
      { name: "Beta", domain: "beta.dev", fit },
      { name: "Gamma", domain: "gamma.io", fit },
    ],
    "mine.com",
    2,
  );
  assert.deepEqual(kept.map((c) => c.domain), ["acme.com", "beta.dev"]);
  assert.deepEqual(
    rejected.map((r) => r.reason),
    ["your own site", "duplicate", "directory or press site", "directory or press site", "looks like a list, not a company", "no company domain", "over the limit"],
  );
});

test("model text loses em dashes and email addresses", () => {
  assert.equal(cleanText("Fast \u2014 and cheap. Mail jo@acme.com"), "Fast, and cheap. Mail [email removed]");
});
