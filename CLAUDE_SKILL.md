---
name: Bitrix24 Task Manager
description: Manage Bitrix24 tasks via MCP — list, create, update, complete, delegate tasks and work with comments.
version: 1.0.0
author: Ribas Hotels Group
---

# Bitrix24 Task Manager

You are connected to Bitrix24 via MCP. Use the tools below to manage tasks on behalf of the authenticated user.

## Available tools

### View tasks
- `bitrix_whoami` — who is connected (name, email, domain)
- `bitrix_tasks_list` — list tasks with optional filters
- `bitrix_tasks_get` — full details of a task by ID
- `bitrix_tasks_overdue` — tasks with past deadline that are not completed
- `bitrix_tasks_counters` — dashboard: overdue count, new comments, mentions

### Manage tasks
- `bitrix_tasks_create` — create a new task
- `bitrix_tasks_update` — update task fields (title, description, deadline, priority, responsible)
- `bitrix_tasks_start` — move task to "in progress"
- `bitrix_tasks_pause` — pause an in-progress task
- `bitrix_tasks_complete` — mark task as completed
- `bitrix_tasks_defer` — defer (postpone) a task
- `bitrix_tasks_renew` — reopen a completed task
- `bitrix_tasks_delegate` — reassign task to another user

### Comments and users
- `bitrix_tasks_comments` — list comments or add a comment to a task
- `bitrix_users_search` — find user by name or email
- `bitrix_users_list` — list all active users

## Roles
- `responsible` — assignee (executes the task)
- `creator` — who created/assigned the task
- `accomplice` — co-executor (helps)
- `auditor` — observer
- `any` — all roles combined (default for most tools)

## Task statuses
- `new` — new
- `pending` — waiting to start
- `in_progress` — in progress
- `supposedly_completed` — awaiting review
- `completed` — done
- `deferred` — postponed
- `declined` — declined

## Priority values
- `low`, `normal` (default), `high`

## Behavior guidelines

**Always call `bitrix_whoami` first** if the user asks who they are or what account is connected.

**For "show my tasks"** → call `bitrix_tasks_list` with no filters (returns responsible + creator + accomplice + auditor tasks).

**For "overdue tasks"** → call `bitrix_tasks_overdue` (finds tasks with deadline in the past that are not completed).

**For "tasks this week"** → call `bitrix_tasks_list` with `deadline_to` set to end of week in ISO format.

**For "create task X for person Y by date Z"**:
1. Call `bitrix_users_search` to find person Y's user ID
2. Call `bitrix_tasks_create` with `title`, `responsible_id`, `deadline`

**For "complete / start / defer task"** → always use the dedicated action tool (`bitrix_tasks_complete`, `bitrix_tasks_start`, `bitrix_tasks_defer`) rather than `bitrix_tasks_update`.

**For delegating** → find the new assignee ID via `bitrix_users_search`, then call `bitrix_tasks_delegate`.

## Date format
All dates must be ISO 8601: `2026-05-28T18:00:00` or `2026-05-28`.

## Important notes
- Task IDs are integers
- When searching for a task by title use `bitrix_tasks_list` with the `search` parameter
- After creating or updating a task, confirm the result to the user with the task ID and title
- Respond to the user in the same language they write in
