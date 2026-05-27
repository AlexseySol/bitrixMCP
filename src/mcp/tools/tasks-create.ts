import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";
import { TASK_PRIORITY_TO_CODE } from "../../bitrix/client.js";

export function registerTasksCreate(
  server: McpServer,
  client: BitrixClient,
  ctx: TokenPayload,
): void {
  server.registerTool(
    "bitrix_tasks_create",
    {
      description:
        "Create a new task in Bitrix24. You are always set as the creator. If responsible_id is omitted, the task is assigned to yourself.",
      inputSchema: {
        title: z.string().min(1).describe("Task title (required)"),
        description: z.string().optional().describe("Task description"),
        responsible_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("User ID of the assignee (defaults to you)"),
        accomplices: z
          .array(z.number().int().positive())
          .optional()
          .describe("User IDs of accomplices"),
        auditors: z
          .array(z.number().int().positive())
          .optional()
          .describe("User IDs of auditors"),
        deadline: z
          .string()
          .optional()
          .describe("Deadline in ISO format, e.g. 2026-06-30T18:00:00"),
        start_date_plan: z.string().optional().describe("Planned start date in ISO format"),
        end_date_plan: z.string().optional().describe("Planned end date in ISO format"),
        priority: z.enum(["low", "normal", "high"]).optional().describe("Priority (default: normal)"),
        group_id: z.number().int().positive().optional().describe("Project / workgroup ID"),
        parent_id: z.number().int().positive().optional().describe("Parent task ID"),
        tags: z.array(z.string()).optional().describe("Task tags"),
        allow_change_deadline: z
          .boolean()
          .optional()
          .describe("Allow responsible to change the deadline"),
        task_control: z
          .boolean()
          .optional()
          .describe("Require creator approval when task is marked complete"),
        match_work_time: z
          .boolean()
          .optional()
          .describe("Factor in the work calendar when computing deadlines"),
      },
    },
    async (params) => {
      try {
        const fields: Record<string, unknown> = {
          TITLE: params.title,
          CREATED_BY: ctx.bitrixUserId,
          RESPONSIBLE_ID: params.responsible_id ?? ctx.bitrixUserId,
          PRIORITY: TASK_PRIORITY_TO_CODE[params.priority ?? "normal"] ?? 1,
        };

        if (params.description) fields["DESCRIPTION"] = params.description;
        if (params.accomplices?.length) fields["ACCOMPLICES"] = params.accomplices;
        if (params.auditors?.length) fields["AUDITORS"] = params.auditors;
        if (params.deadline) fields["DEADLINE"] = params.deadline;
        if (params.start_date_plan) fields["START_DATE_PLAN"] = params.start_date_plan;
        if (params.end_date_plan) fields["END_DATE_PLAN"] = params.end_date_plan;
        if (params.group_id) fields["GROUP_ID"] = params.group_id;
        if (params.parent_id) fields["PARENT_ID"] = params.parent_id;
        if (params.tags?.length) fields["TAGS"] = params.tags;
        if (params.allow_change_deadline !== undefined)
          fields["ALLOW_CHANGE_DEADLINE"] = params.allow_change_deadline ? "Y" : "N";
        if (params.task_control !== undefined)
          fields["TASK_CONTROL"] = params.task_control ? "Y" : "N";
        if (params.match_work_time !== undefined)
          fields["MATCH_WORK_TIME"] = params.match_work_time ? "Y" : "N";

        const result = await client.createTask(fields);
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
