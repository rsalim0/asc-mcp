import { z } from "zod";
import type { AscClient } from "../client.js";
import type { ToolDef } from "./types.js";

export function pingTools(client: AscClient): ToolDef[] {
  return [
    {
      name: "asc_ping",
      description:
        "Smoke test — returns the first app in your account to confirm credentials work.",
      inputSchema: z.object({}),
      handler: async () => client.request("/apps", { query: { limit: 1 } }),
    },
  ];
}
