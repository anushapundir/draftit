import { z } from "zod";
import { hasLiveAccess } from "../../../lib/access";
import { hasAgentKey } from "../../../lib/env";
import { run, understand, type PipelineEvent } from "../../../lib/pipeline";
import { InputError } from "../../../lib/site";

export const maxDuration = 300;

const Url = z.string().trim().min(3).max(300);
const Body = z.discriminatedUnion("stage", [
  z.object({ stage: z.literal("understand"), url: Url }),
  z.object({
    stage: z.literal("run"),
    url: Url,
    profile: z.object({
      name: z.string().trim().min(1).max(200),
      summary: z.string().trim().min(10).max(2000),
      icp: z.string().trim().min(10).max(3000),
    }),
    voice: z.string().max(6000).default(""),
  }),
]);

export async function POST(req: Request) {
  if (!hasLiveAccess(req)) return Response.json({ error: "Live mode is disabled on this deployment" }, { status: 403 });
  if (!hasAgentKey) return Response.json({ error: "Live mode needs ANTHROPIC_API_KEY on the server" }, { status: 503 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const input = body.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: PipelineEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away; the abort signal stops the remaining work.
        }
      };
      try {
        if (input.stage === "understand") await understand(input.url, emit, req.signal);
        else await run({ domain: input.url, profile: input.profile, voice: input.voice }, emit, req.signal);
      } catch (err) {
        if (!req.signal.aborted) {
          if (!(err instanceof InputError)) console.error("pipeline failed", err);
          emit({ type: "error", message: err instanceof InputError ? err.message : "Something went wrong on our side. Try again in a minute." });
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
