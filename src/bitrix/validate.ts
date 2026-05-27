import { fetch } from "undici";

// Valid Bitrix24 webhook URL pattern
const WEBHOOK_REGEX =
  /^https:\/\/[a-z0-9][a-z0-9-]*\.bitrix24\.(com|ru|ua|by|de|fr|es|pl|it|br|eu|in|cn|jp|mx|net|org)\/rest\/\d+\/[a-z0-9]+\/?$/i;

export function parseWebhookUrl(url: string): { domain: string } | null {
  const trimmed = url.trim().replace(/\/?$/, "/"); // ensure trailing slash
  if (!WEBHOOK_REGEX.test(trimmed)) return null;
  const parsed = new URL(trimmed);
  return { domain: parsed.hostname };
}

export interface BitrixCurrentUser {
  id: number;
  name: string;
  lastName: string;
  email: string;
  position: string;
}

export async function validateWebhookAndGetUser(webhookUrl: string): Promise<BitrixCurrentUser> {
  const cleanUrl = webhookUrl.trim().replace(/\/?$/, "/");

  let response: Response;
  try {
    response = await fetch(`${cleanUrl}user.current.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Cannot reach Bitrix24: check the webhook URL and your internet connection");
  }

  if (!response.ok) {
    throw new Error(`Bitrix24 returned HTTP ${response.status}. Verify the webhook URL.`);
  }

  const data = (await response.json()) as {
    result?: {
      ID?: string;
      NAME?: string;
      LAST_NAME?: string;
      EMAIL?: string;
      WORK_POSITION?: string;
    };
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.result?.ID) {
    const msg = data.error_description ?? data.error ?? "Invalid response from Bitrix24";
    throw new Error(`Webhook validation failed: ${msg}`);
  }

  const r = data.result;
  return {
    id: Number(r.ID),
    name: r.NAME ?? "",
    lastName: r.LAST_NAME ?? "",
    email: r.EMAIL ?? "",
    position: r.WORK_POSITION ?? "",
  };
}
