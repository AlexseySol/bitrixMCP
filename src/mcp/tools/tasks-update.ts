import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";
import { TASK_PRIORITY_TO_CODE } from "../../bitrix/client.js";

export function registerTasksUpdate(
  server: McpServer,
  client: BitrixClient,
  ctx: TokenPayload,
): void {
  server.registerTool(
    "bitrix_tasks_update",
    {
      description:
        "Update an existing task. Only the task creator or responsible person can make changes.",
      inputSchema: {
        task_id: z.number().int().positive().describe("Task ID to update"),
        title: z.string().min(1).optional().describe("New task title"),
        description: z.string().optional().describe("New task description"),
        responsible_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("New responsible user ID"),
        accomplices: z
          .array(z.number().int().positive())
          .optional()
          .describe("New list of accomplice user IDs"),
        auditors: z
          .array(z.number().int().positive())
          .optional()
          .describe("New list of auditor user IDs"),
        deadline: z.string().optional().describe("New deadline in ISO format"),
        priority: z.enum(["low", "normal", "high"]).optional().describe("New priority"),
        group_id: z.number().int().positive().optional().describe("New project / workgroup ID"),
        tags: z.array(z.string()).optional().describe("New tags list"),
      },
    },
    async (params) => {
      try {
        const task = await client.getTask(params.task_id, ctx.bitrixUserId);

        if (!task.my_role.includes("creator") && !task.my_role.includes("responsible")) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Access denied: only the task creator or responsible person can update it.",
              },
            ],
          };
        }

        const fields: Record<string, unknown> = {};
        if (params.title !== undefined) fields["TITLE"] = params.title;
        if (params.description !== undefined) fields["DESCRIPTION"] = params.description;
        if (params.responsible_id !== undefined) fields["RESPONSIBLE_ID"] = params.responsible_id;
        if (params.accomplices !== undefined) fields["ACCOMPLICES"] = params.accomplices;
        if (params.auditors !== undefined) fields["AUDITORS"] = params.auditors;
        if (params.deadline !== undefined) fields["DEADLINE"] = params.deadline;
        if (params.priority !== undefined)
          fields["PRIORITY"] = TASK_PRIORITY_TO_CODE[params.priority];
        if (params.group_id !== undefined) fields["GROUP_ID"] = params.group_id;
        if (params.tags !== undefined) fields["TAGS"] = params.tags;

        await client.updateTask(params.task_id, fields);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, task_id: params.task_id }),
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
}
