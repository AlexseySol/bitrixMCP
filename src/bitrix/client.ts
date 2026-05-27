import { fetch } from "undici";
import type {
  BitrixApiResponse,
  BitrixRawComment,
  BitrixRawTask,
  BitrixRawUser,
  Comment,
  Task,
  User,
} from "./types.js";
import {
  TASK_FIELDS,
  TASK_PRIORITY_BY_CODE,
  TASK_PRIORITY_TO_CODE,
  TASK_STATUS_BY_CODE,
  TASK_STATUS_TO_CODE,
} from "./types.js";

export class BitrixError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BitrixError";
  }
}

// ---- HTTP client ----

export class BitrixClient {
  constructor(private readonly webhookUrl: string) {}

  private async call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.webhookUrl}${method}.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new BitrixError("HTTP_ERROR", `Bitrix24 responded with HTTP ${response.status}`);
    }

    const data = (await response.json()) as BitrixApiResponse<T>;

    if (data.error) {
      throw new BitrixError(data.error, data.error_description ?? data.error);
    }

    return data.result;
  }

  private async batchCall(
    commands: Record<string, string>,
  ): Promise<Record<string, BitrixApiResponse<unknown>>> {
    const result = await this.call<{ result: Record<string, BitrixApiResponse<unknown>> }>("batch", {
      halt: 0,
      cmd: commands,
    });
    // Bitrix wraps batch result in an extra `result` key
    return (result as { result?: Record<string, BitrixApiResponse<unknown>> }).result ?? {};
  }

  // ---- Users ----

  async getCurrentUser(): Promise<User> {
    // `profile` works with any webhook scope; `user.current` needs the `user` scope.
    // Try user.current first for full data (email), fall back to profile.
    try {
      const raw = await this.call<BitrixRawUser>("user.current");
      return normalizeUser(raw);
    } catch {
      const raw = await this.call<BitrixRawUser>("profile");
      return normalizeUser(raw);
    }
  }

  async searchUsers(query: string, limit: number): Promise<User[]> {
    const q = query.trim();
    // One batch request for name / last_name / email search simultaneously
    const cmds: Record<string, string> = {
      byName: `user.get?filter[%NAME]=${encodeURIComponent(q)}&filter[ACTIVE]=true&start=0`,
      byLastName: `user.get?filter[%LAST_NAME]=${encodeURIComponent(q)}&filter[ACTIVE]=true&start=0`,
      byEmail: `user.get?filter[%EMAIL]=${encodeURIComponent(q)}&filter[ACTIVE]=true&start=0`,
    };

    const batchResult = await this.batchCall(cmds);

    const seen = new Set<string>();
    const merged: User[] = [];

    for (const key of ["byName", "byLastName", "byEmail"]) {
      const entry = batchResult[key];
      const users = (entry?.result ?? []) as BitrixRawUser[];
      for (const u of users) {
        if (!seen.has(u.ID)) {
          seen.add(u.ID);
          merged.push(normalizeUser(u));
        }
        if (merged.length >= limit) break;
      }
      if (merged.length >= limit) break;
    }

    return merged;
  }

  async listUsers(page: number, activeOnly: boolean): Promise<{ users: User[]; total: number }> {
    const start = (page - 1) * 50;
    const filter: Record<string, unknown> = activeOnly ? { ACTIVE: true } : {};
    const raw = await this.call<BitrixRawUser[]>("user.get", { filter, start });
    return { users: raw.map(normalizeUser), total: raw.length };
  }

  // ---- Tasks ----

  async listTasks(params: TaskListParams): Promise<TaskListResult> {
    const perPage = Math.min(params.perPage ?? 20, 50);
    const page = params.page ?? 1;
    const start = (page - 1) * perPage;
    const filter = buildFilter(params);
    const order = buildOrder(params.orderBy, params.orderDir);

    if (!params.role || params.role === "any") {
      return this.listTasksAllRoles(params.userId, filter, order, start, perPage, page);
    }

    const roleFilter = roleToFilter(params.role, params.userId);
    const raw = await this.call<{ tasks: BitrixRawTask[] }>("tasks.task.list", {
      filter: { ...filter, ...roleFilter },
      select: TASK_FIELDS,
      order,
      start,
    });
    const tasks = (raw.tasks ?? []).map((t) => normalizeTask(t, params.userId));
    return { tasks, total: tasks.length, page, per_page: perPage };
  }

  private async listTasksAllRoles(
    userId: number,
    filter: Record<string, unknown>,
    order: Record<string, string>,
    start: number,
    limit: number,
    page: number,
  ): Promise<TaskListResult> {
    const filterQs = filterToQueryString(filter);
    const selectQs = TASK_FIELDS.map((f) => `select[]=${f}`).join("&");

    const cmds: Record<string, string> = {
      r: `tasks.task.list?filter[RESPONSIBLE_ID]=${userId}&${filterQs}&${selectQs}&start=${start}`,
      c: `tasks.task.list?filter[CREATED_BY]=${userId}&${filterQs}&${selectQs}&start=${start}`,
      a: `tasks.task.list?filter[ACCOMPLICES][0]=${userId}&${filterQs}&${selectQs}&start=${start}`,
      u: `tasks.task.list?filter[AUDITORS][0]=${userId}&${filterQs}&${selectQs}&start=${start}`,
    };

    const batchResult = await this.batchCall(cmds);

    const seen = new Set<string>();
    const merged: Task[] = [];

    for (const key of ["r", "c", "a", "u"]) {
      const entry = batchResult[key];
      const tasks = ((entry?.result as { tasks?: BitrixRawTask[] })?.tasks ?? []) as BitrixRawTask[];
      for (const t of tasks) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          merged.push(normalizeTask(t, userId));
        }
      }
    }

    const sorted = sortTasks(merged, order);
    return { tasks: sorted.slice(0, limit), total: sorted.length, page, per_page: limit };
  }

  async getTask(taskId: number, userId: number): Promise<Task> {
    const raw = await this.call<{ task: BitrixRawTask }>("tasks.task.get", {
      taskId,
      select: TASK_FIELDS,
    });
    if (!raw.task) throw new BitrixError("NOT_FOUND", `Task ${taskId} not found`);
    return normalizeTask(raw.task, userId);
  }

  async createTask(fields: Record<string, unknown>): Promise<{ task_id: number; task: Task }> {
    const raw = await this.call<{ task: BitrixRawTask }>("tasks.task.add", { fields });
    const task = normalizeTask(raw.task, Number(raw.task.creator.id));
    return { task_id: task.id, task };
  }

  async updateTask(taskId: number, fields: Record<string, unknown>): Promise<void> {
    await this.call("tasks.task.update", { taskId, fields });
  }

  async startTask(taskId: number): Promise<void> {
    await this.call("tasks.task.start", { taskId });
  }

  async pauseTask(taskId: number): Promise<void> {
    await this.call("tasks.task.pause", { taskId });
  }

  async completeTask(taskId: number): Promise<void> {
    await this.call("tasks.task.complete", { taskId });
  }

  async deferTask(taskId: number): Promise<void> {
    await this.call("tasks.task.defer", { taskId });
  }

  async renewTask(taskId: number): Promise<void> {
    await this.call("tasks.task.renew", { taskId });
  }

  async delegateTask(taskId: number, newResponsibleId: number): Promise<void> {
    await this.call("tasks.task.delegate", { taskId, userId: newResponsibleId });
  }

  // ---- Comments ----

  async listComments(taskId: number): Promise<Comment[]> {
    const raw = await this.call<BitrixRawComment[]>("task.commentitem.getlist", {
      TASKID: taskId,
    });
    return (raw ?? []).map(normalizeComment);
  }

  async addComment(taskId: number, text: string): Promise<number> {
    return this.call<number>("task.commentitem.add", {
      TASKID: taskId,
      FIELDS: { POST_MESSAGE: text },
    });
  }

  // ---- Counters ----

  async getCounters(userId: number): Promise<Record<string, number>> {
    const raw = await this.call<Record<string, Record<string, number>>>(
      "tasks.task.counters.get",
      {},
    );
    return raw[String(userId)] ?? {};
  }
}

// ---- Parameter types ----

interface TaskListParams {
  userId: number;
  role?: string;
  status?: string[];
  groupId?: number;
  deadlineFrom?: string;
  deadlineTo?: string;
  createdFrom?: string;
  search?: string;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  perPage?: number;
}

interface TaskListResult {
  tasks: Task[];
  total: number;
  page: number;
  per_page: number;
}

// ---- Normalization ----

function normalizeUser(u: BitrixRawUser): User {
  return {
    id: Number(u.ID),
    name: u.NAME ?? "",
    last_name: u.LAST_NAME ?? "",
    full_name: [u.NAME, u.LAST_NAME].filter(Boolean).join(" "),
    email: u.EMAIL ?? "",
    position: u.WORK_POSITION ?? "",
    active: u.ACTIVE !== false,
  };
}

function normalizeTask(t: BitrixRawTask, currentUserId: number): Task {
  const creatorId = Number(t.creator?.id ?? 0);
  const responsibleId = Number(t.responsible?.id ?? 0);
  const accompliceIds = (t.accomplices ?? []).map((a) => Number(a.id));
  const auditorIds = (t.auditors ?? []).map((a) => Number(a.id));

  const myRole: string[] = [];
  if (creatorId === currentUserId) myRole.push("creator");
  if (responsibleId === currentUserId) myRole.push("responsible");
  if (accompliceIds.includes(currentUserId)) myRole.push("accomplice");
  if (auditorIds.includes(currentUserId)) myRole.push("auditor");

  const priorityCode = Number(t.priority);

  return {
    id: Number(t.id),
    title: t.title,
    description: t.description ?? undefined,
    status: TASK_STATUS_BY_CODE[t.status] ?? "unknown",
    status_code: Number(t.status),
    priority: TASK_PRIORITY_BY_CODE[t.priority] ?? "normal",
    priority_code: priorityCode,
    deadline: t.deadline || undefined,
    start_date_plan: t.startDatePlan || undefined,
    end_date_plan: t.endDatePlan || undefined,
    created_date: t.createdDate,
    creator: { id: creatorId, name: t.creator?.name ?? "" },
    responsible: { id: responsibleId, name: t.responsible?.name ?? "" },
    accomplices: (t.accomplices ?? []).map((a) => ({ id: Number(a.id), name: a.name })),
    auditors: (t.auditors ?? []).map((a) => ({ id: Number(a.id), name: a.name })),
    group: t.group ? { id: Number(t.group.id), name: t.group.name } : undefined,
    parent_id: t.parentId ? Number(t.parentId) : undefined,
    tags: t.tags ?? [],
    my_role: myRole,
  };
}

function normalizeComment(c: BitrixRawComment): Comment {
  return {
    id: Number(c.ID),
    task_id: Number(c.TASK_ID),
    text: c.POST_MESSAGE,
    author_id: Number(c.AUTHOR_ID),
    author_name: c.AUTHOR_NAME,
    date: c.POST_DATE,
  };
}

// ---- Filter / order helpers ----

function buildFilter(p: TaskListParams): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (p.status?.length) f["STATUS"] = p.status.map((s) => TASK_STATUS_TO_CODE[s] ?? 3);
  if (p.groupId) f["GROUP_ID"] = p.groupId;
  if (p.deadlineFrom) f[">=DEADLINE"] = p.deadlineFrom;
  if (p.deadlineTo) f["<=DEADLINE"] = p.deadlineTo;
  if (p.createdFrom) f[">=CREATED_DATE"] = p.createdFrom;
  if (p.search) f["%TITLE"] = p.search;
  return f;
}

function buildOrder(orderBy?: string, orderDir?: string): Record<string, string> {
  const fields: Record<string, string> = {
    created_date: "CREATED_DATE",
    deadline: "DEADLINE",
    status: "STATUS",
    priority: "PRIORITY",
  };
  return { [fields[orderBy ?? "created_date"] ?? "CREATED_DATE"]: (orderDir ?? "desc").toUpperCase() };
}

function roleToFilter(role: string, userId: number): Record<string, unknown> {
  const map: Record<string, Record<string, unknown>> = {
    responsible: { RESPONSIBLE_ID: userId },
    creator: { CREATED_BY: userId },
    accomplice: { ACCOMPLICES: [userId] },
    auditor: { AUDITORS: [userId] },
  };
  return map[role] ?? {};
}

function filterToQueryString(filter: Record<string, unknown>): string {
  return Object.entries(filter)
    .map(([k, v]) => `filter[${encodeURIComponent(k)}]=${encodeURIComponent(String(v))}`)
    .join("&");
}

function sortTasks(tasks: Task[], order: Record<string, string>): Task[] {
  const [field = "CREATED_DATE", dir = "DESC"] = Object.entries(order)[0] ?? [];
  return [...tasks].sort((a, b) => {
    let diff = 0;
    if (field === "DEADLINE") {
      diff = (a.deadline ?? "").localeCompare(b.deadline ?? "");
    } else if (field === "STATUS") {
      diff = a.status_code - b.status_code;
    } else if (field === "PRIORITY") {
      diff = a.priority_code - b.priority_code;
    } else {
      diff = a.created_date.localeCompare(b.created_date);
    }
    return dir === "ASC" ? diff : -diff;
  });
}

// Re-export for convenience
export { TASK_PRIORITY_TO_CODE };
