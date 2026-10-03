import type Anthropic from "@anthropic-ai/sdk";

// USD per million tokens. ponytail: hand-copied list prices, update when pricing changes.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
};
const WEB_SEARCH_USD = 0.01; // $10 per 1,000 searches

export function estimateCost(model: string, usage: Anthropic.Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  const tokens =
    usage.input_tokens * p.input +
    (usage.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
    (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
    usage.output_tokens * p.output;
  return tokens / 1_000_000 + (usage.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

// Running total for the current process, so the CLI can print a per-run cost.
export const totals = { usd: 0, searches: 0 };

// One line per API call, so a run's cost can be added up from the server log.
export function logUsage(step: string, model: string, usage: Anthropic.Usage): void {
  const cost = estimateCost(model, usage);
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  totals.usd += cost ?? 0;
  totals.searches += searches;
  console.log(
    `[draftit cost] ${step} ${model}: in ${usage.input_tokens} (cache read ${usage.cache_read_input_tokens ?? 0}, write ${usage.cache_creation_input_tokens ?? 0}), out ${usage.output_tokens}, searches ${searches}, ~${cost === null ? "unknown price" : `$${cost.toFixed(4)}`}`,
  );
}
