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
        "Get a task dashboard for the current user: counts of overdue tasks, tasks with new comments, and tasks where you are mentioned.",
    },
    async () => {
      try {
        const counters = await client.getCounters();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                expired: counters.expired,
                new_comments: counters.new_comments,
                mentioned: counters.mentioned,
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
          overdueOnly: true,
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
