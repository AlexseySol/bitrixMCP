import { fetch } from "undici";

// Accepts cloud Bitrix24 (*.bitrix24.*) and self-hosted on any HTTPS domain.
// Pattern: https://<domain>/rest/<userId>/<token>/
const WEBHOOK_REGEX = /^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\/rest\/\d+\/[a-z0-9_-]+\/?$/i;

export function parseWebhookUrl(url: string): { domain: string } | null {
  const trimmed = url.trim().replace(/\/?$/, "/");
  if (!WEBHOOK_REGEX.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    return { domain: parsed.hostname };
  } catch {
    return null;
  }
}

export interface BitrixCurrentUser {
  id: number;
  name: string;
  lastName: string;
  email: string;
  position: string;
}

// Uses `profile` method — works with ANY valid webhook token, no extra scopes required.
// `user.current` requires the `user` scope, but `profile` does not.
export async function validateWebhookAndGetUser(webhookUrl: string): Promise<BitrixCurrentUser> {
  const cleanUrl = webhookUrl.trim().replace(/\/?$/, "/");

  let response: Response;
  try {
    response = await fetch(`${cleanUrl}profile.json`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(
      "Не удаётся подключиться к Bitrix24. Проверьте URL и доступность сервера.",
    );
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

  // Token wrong or webhook deleted
  if (
    data.error === "WRONG_AUTH_TYPE" ||
    data.error === "NO_AUTH_FOUND" ||
    response.status === 401
  ) {
    throw new Error(
      "Вебхук не найден или токен недействителен. " +
        "Создайте новый входящий вебхук в Bitrix24 и скопируйте URL заново.",
    );
  }

  // Scope error (shouldn't happen with profile, but just in case)
  if (data.error === "insufficient_scope") {
    throw new Error(
      "У вебхука недостаточно прав. Добавьте права: ✅ task   ✅ user",
    );
  }

  if (data.error === "ACCESS_DENIED" || response.status === 403) {
    throw new Error(
      "Доступ запрещён. Убедитесь что вебхук активен и не имеет IP-ограничений.",
    );
  }

  if (!response.ok) {
    throw new Error(`Bitrix24 вернул HTTP ${response.status}. Проверьте URL вебхука.`);
  }

  if (data.error) {
    throw new Error(`Bitrix24: ${data.error_description ?? data.error}`);
  }

  if (!data.result?.ID) {
    throw new Error("Bitrix24 вернул пустой ответ. Проверьте URL вебхука.");
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
