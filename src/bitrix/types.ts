// ---- Raw Bitrix24 API shapes ----

export interface BitrixApiResponse<T> {
  result: T;
  next?: number;
  total?: number;
  error?: string;
  error_description?: string;
}

export interface BitrixRawUser {
  ID: string;
  NAME: string;
  LAST_NAME: string;
  EMAIL: string;
  WORK_POSITION: string;
  ACTIVE: boolean;
}

export interface BitrixRawTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: string;
  startDatePlan?: string;
  endDatePlan?: string;
  createdDate: string;
  creator: { id: string; name: string };
  responsible: { id: string; name: string };
  accomplices?: Array<{ id: string; name: string }>;
  auditors?: Array<{ id: string; name: string }>;
  group?: { id: string; name: string };
  parentId?: string;
  tags?: string[];
}

export interface BitrixRawComment {
  ID: string;
  TASK_ID: string;
  POST_MESSAGE: string;
  AUTHOR_ID: string;
  AUTHOR_NAME: string;
  POST_DATE: string;
}

// ---- Normalized output shapes (returned to Claude) ----

export interface User {
  id: number;
  name: string;
  last_name: string;
  full_name: string;
  email: string;
  position: string;
  active: boolean;
}

export interface TaskMember {
  id: number;
  name: string;
}

export interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  status_code: number;
  priority: string;
  priority_code: number;
  deadline?: string;
  start_date_plan?: string;
  end_date_plan?: string;
  created_date: string;
  creator: TaskMember;
  responsible: TaskMember;
  accomplices: TaskMember[];
  auditors: TaskMember[];
  group?: { id: number; name: string };
  parent_id?: number;
  tags?: string[];
  my_role: string[];
}

export interface Comment {
  id: number;
  task_id: number;
  text: string;
  author_id: number;
  author_name: string;
  date: string;
}

// ---- Status / priority mappings ----

export const TASK_STATUS_BY_CODE: Record<string, string> = {
  "1": "new",
  "2": "pending",
  "3": "in_progress",
  "4": "supposedly_completed",
  "5": "completed",
  "6": "deferred",
  "7": "declined",
};

export const TASK_STATUS_TO_CODE: Record<string, number> = {
  new: 1,
  pending: 2,
  in_progress: 3,
  supposedly_completed: 4,
  completed: 5,
  deferred: 6,
  declined: 7,
};

export const TASK_PRIORITY_BY_CODE: Record<string, string> = {
  "0": "low",
  "1": "normal",
  "2": "high",
};

export const TASK_PRIORITY_TO_CODE: Record<string, number> = {
  low: 0,
  normal: 1,
  high: 2,
};

export const TASK_FIELDS = [
  "ID", "TITLE", "DESCRIPTION", "STATUS", "PRIORITY",
  "DEADLINE", "START_DATE_PLAN", "END_DATE_PLAN", "CREATED_DATE",
  "CREATED_BY", "RESPONSIBLE_ID", "ACCOMPLICES", "AUDITORS",
  "GROUP_ID", "PARENT_ID", "TAGS",
] as const;
