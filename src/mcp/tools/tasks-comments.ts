import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";

export function registerTasksComments(
  server: McpServer,
  client: BitrixClient,
  ctx: TokenPayload,
): void {
  server.registerTool(
    "bitrix_tasks_comments_list",
    {
      description:
        "Get all comments for a task. You must be a participant (creator, responsible, accomplice, or auditor) to view comments.",
      inputSchema: {
        task_id: z.number().int().positive().describe("Task ID"),
      },
    },
    async ({ task_id }) => {
      try {
        const task = await client.getTask(task_id, ctx.bitrixUserId);
        if (task.my_role.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Access denied: you are not a participant in this task.",
              },
            ],
          };
        }
        const comments = await client.listComments(task_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(comments) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_comment_add",
    {
      description:
        "Add a comment to a task. You must be a participant (creator, responsible, accomplice, or auditor).",
      inputSchema: {
        task_id: z.number().int().positive().describe("Task ID"),
        text: z.string().min(1).describe("Comment text"),
      },
    },
    async ({ task_id, text }) => {
      try {
        const task = await client.getTask(task_id, ctx.bitrixUserId);
        if (task.my_role.length === 0) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "Access denied: you are not a participant in this task.",
              },
            ],
          };
        }
        const commentId = await client.addComment(task_id, text);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, comment_id: commentId, task_id }),
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
