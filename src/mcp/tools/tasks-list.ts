import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";

const statusValues = [
  "new",
  "pending",
  "in_progress",
  "supposedly_completed",
  "completed",
  "deferred",
  "declined",
] as const;

export function registerTasksList(server: McpServer, client: BitrixClient, ctx: TokenPayload): void {
  server.registerTool(
    "bitrix_tasks_list",
    {
      description:
        "List Bitrix24 tasks with optional filters. By default returns all tasks where you participate in any role. Use filters to narrow by status, deadline, project, etc.",
      inputSchema: {
        role: z
          .enum(["responsible", "creator", "accomplice", "auditor", "any"])
          .optional()
          .describe("Your role in the task (default: any)"),
        status: z
          .array(z.enum(statusValues))
          .optional()
          .describe("Filter by one or more task statuses"),
        group_id: z.number().int().optional().describe("Filter by project / workgroup ID"),
        deadline_from: z.string().optional().describe("ISO date — tasks with deadline ≥ this"),
        deadline_to: z.string().optional().describe("ISO date — tasks with deadline ≤ this"),
        created_from: z.string().optional().describe("ISO date — tasks created on or after this"),
        search: z.string().optional().describe("Text search in task title"),
        order_by: z
          .enum(["created_date", "deadline", "status", "priority"])
          .optional()
          .describe("Sort field (default: created_date)"),
        order_dir: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: desc)"),
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Results per page (default: 20, max: 50)"),
      },
    },
    async (params) => {
      try {
        const result = await client.listTasks({
          userId: ctx.bitrixUserId,
          role: params.role,
          status: params.status as string[] | undefined,
          groupId: params.group_id,
          deadlineFrom: params.deadline_from,
          deadlineTo: params.deadline_to,
          createdFrom: params.created_from,
          search: params.search,
          orderBy: params.order_by,
          orderDir: params.order_dir,
          page: params.page,
          perPage: params.per_page,
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
