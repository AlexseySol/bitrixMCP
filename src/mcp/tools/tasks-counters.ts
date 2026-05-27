import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";

export function registerTasksCounters(
  server: McpServer,
  client: BitrixClient,
  ctx: TokenPayload,
): void {
  server.registerTool(
    "bitrix_tasks_counters",
    {
      description:
        "Get a task dashboard for the current user: counts of new, in-progress, and overdue tasks grouped by your role.",
    },
    async () => {
      try {
        const raw = await client.getCounters(ctx.bitrixUserId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                as_responsible: {
                  new: raw["RESPONSIBLE_NEW"] ?? 0,
                  in_progress: raw["RESPONSIBLE_TOTAL"] ?? 0,
                  overdue: raw["RESPONSIBLE_OVERDUED"] ?? 0,
                  new_comments: raw["RESPONSIBLE_NEW_COMMENTS"] ?? 0,
                },
                as_creator: {
                  in_progress: raw["ORIGINATOR_TOTAL"] ?? 0,
                  overdue: raw["ORIGINATOR_OVERDUED"] ?? 0,
                },
                as_accomplice: {
                  in_progress: raw["ACCOMPLICE_TOTAL"] ?? 0,
                  overdue: raw["ACCOMPLICE_OVERDUED"] ?? 0,
                },
                as_auditor: {
                  in_progress: raw["AUDITOR_TOTAL"] ?? 0,
                },
              }),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_overdue",
    {
      description:
        "Shortcut: list all overdue tasks (deadline in the past, not completed) for the current user.",
      inputSchema: {
        role: z
          .enum(["responsible", "creator", "any"])
          .optional()
          .describe("Your role filter (default: any)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Max results (default: 20)"),
      },
    },
    async ({ role, limit }) => {
      try {
        const result = await client.listTasks({
          userId: ctx.bitrixUserId,
          role: role ?? "any",
          deadlineTo: new Date().toISOString(),
          status: ["new", "pending", "in_progress", "deferred"],
          orderBy: "deadline",
          orderDir: "asc",
          page: 1,
          perPage: limit ?? 20,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
