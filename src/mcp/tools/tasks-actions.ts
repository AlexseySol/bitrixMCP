import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { Task } from "../../bitrix/types.js";
import type { TokenPayload } from "../../utils/crypto.js";

type Role = "responsible" | "creator_or_responsible";

async function assertRole(
  client: BitrixClient,
  taskId: number,
  userId: number,
  required: Role,
): Promise<{ task: Task; error?: string }> {
  const task = await client.getTask(taskId, userId);
  const roles = task.my_role;

  if (required === "responsible" && !roles.includes("responsible")) {
    return { task, error: "Only the responsible person can perform this action." };
  }
  if (
    required === "creator_or_responsible" &&
    !roles.includes("creator") &&
    !roles.includes("responsible")
  ) {
    return { task, error: "Only the task creator or responsible person can perform this action." };
  }
  return { task };
}

function success(taskId: number) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify({ success: true, task_id: taskId }) },
    ],
  };
}

function denied(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function failed(err: unknown) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
  };
}

export function registerTasksActions(
  server: McpServer,
  client: BitrixClient,
  ctx: TokenPayload,
): void {
  server.registerTool(
    "bitrix_tasks_start",
    {
      description: "Start a task — move it to 'In Progress'. Only the responsible person can start a task.",
      inputSchema: { task_id: z.number().int().positive().describe("Task ID") },
    },
    async ({ task_id }) => {
      try {
        const { error } = await assertRole(client, task_id, ctx.bitrixUserId, "responsible");
        if (error) return denied(error);
        await client.startTask(task_id);
        return success(task_id);
      } catch (err) {
        return failed(err);
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_pause",
    {
      description: "Pause a task — move it back to 'Pending'. Only the responsible person can pause.",
      inputSchema: { task_id: z.number().int().positive().describe("Task ID") },
    },
    async ({ task_id }) => {
      try {
        const { error } = await assertRole(client, task_id, ctx.bitrixUserId, "responsible");
        if (error) return denied(error);
        await client.pauseTask(task_id);
        return success(task_id);
      } catch (err) {
        return failed(err);
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_complete",
    {
      description:
        "Complete a task. Only the responsible person can mark a task as done. Optionally attach a result comment before completing.",
      inputSchema: {
        task_id: z.number().int().positive().describe("Task ID"),
        result_text: z.string().optional().describe("Optional result comment added before completing"),
      },
    },
    async ({ task_id, result_text }) => {
      try {
        const { error } = await assertRole(client, task_id, ctx.bitrixUserId, "responsible");
        if (error) return denied(error);
        if (result_text) await client.addComment(task_id, result_text);
        await client.completeTask(task_id);
        return success(task_id);
      } catch (err) {
        return failed(err);
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_defer",
    {
      description: "Defer a task. The task creator or responsible person can defer it.",
      inputSchema: { task_id: z.number().int().positive().describe("Task ID") },
    },
    async ({ task_id }) => {
      try {
        const { error } = await assertRole(client, task_id, ctx.bitrixUserId, "creator_or_responsible");
        if (error) return denied(error);
        await client.deferTask(task_id);
        return success(task_id);
      } catch (err) {
        return failed(err);
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_renew",
    {
      description: "Renew a deferred or completed task — move it back to In Progress.",
      inputSchema: { task_id: z.number().int().positive().describe("Task ID") },
    },
    async ({ task_id }) => {
      try {
        const { error } = await assertRole(client, task_id, ctx.bitrixUserId, "creator_or_responsible");
        if (error) return denied(error);
        await client.renewTask(task_id);
        return success(task_id);
      } catch (err) {
        return failed(err);
      }
    },
  );

  server.registerTool(
    "bitrix_tasks_delegate",
    {
      description:
        "Delegate a task to a different user (change the responsible person). The current responsible or creator can delegate.",
      inputSchema: {
        task_id: z.number().int().positive().describe("Task ID"),
        new_responsible_id: z
          .number()
          .int()
          .positive()
          .describe("User ID of the new responsible person"),
      },
    },
    async ({ task_id, new_responsible_id }) => {
      try {
        const { error } = await assertRole(client, task_id, ctx.bitrixUserId, "creator_or_responsible");
        if (error) return denied(error);
        await client.delegateTask(task_id, new_responsible_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, task_id, new_responsible_id }),
            },
          ],
        };
      } catch (err) {
        return failed(err);
      }
    },
  );
}
