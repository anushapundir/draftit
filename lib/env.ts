import { existsSync } from "node:fs";
import { z } from "zod";

// Next loads .env itself; the CLI does not.
if (existsSync(".env")) process.loadEnvFile(".env");

const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const env = z
  .object({
    ANTHROPIC_API_KEY: z.preprocess(blankToUndefined, z.string().optional()),
    DRAFTIT_MODEL: z.preprocess(blankToUndefined, z.string().default("claude-sonnet-5-5")),
    // Only needed for an org-wide API key that is not scoped to one workspace.
    ANTHROPIC_WORKSPACE_ID: z.preprocess(blankToUndefined, z.string().optional()),
    DEMO_ACCESS_TOKEN: z.preprocess(blankToUndefined, z.string().optional()),
    DEMO_EMAIL: z.preprocess(blankToUndefined, z.string().default("demo@draftit.dev")),
    DEMO_PASSWORD: z.preprocess(blankToUndefined, z.string().default("draftit")),
  })
  .parse(process.env);

export const hasAgentKey = Boolean(env.ANTHROPIC_API_KEY);
