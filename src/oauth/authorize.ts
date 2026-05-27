import type { RequestHandler } from "express";
import { createAuthCode, getClient } from "../store/memory.js";
import { parseWebhookUrl, validateWebhookAndGetUser } from "../bitrix/validate.js";
import { logger } from "../utils/logger.js";

// ---- HTML helpers ----

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- Authorization page ----

function renderAuthPage(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state?: string;
  error?: string;
  webhookValue?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bitrix24 → Claude AI</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .card {
      background: #1a1d27;
      border: 1px solid #2d3148;
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 540px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    }

    .header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 28px;
    }

    .icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      flex-shrink: 0;
    }

    .icon-bitrix { background: linear-gradient(135deg, #ff6b35, #f7931e); }
    .icon-arrow  { color: #4a5568; font-size: 18px; }
    .icon-claude { background: linear-gradient(135deg, #cc785c, #d4956a); }

    h1 { font-size: 20px; font-weight: 700; color: #f7fafc; }
    .subtitle { color: #718096; font-size: 13px; margin-top: 4px; }

    .error {
      background: #2d1b1b;
      border: 1px solid #742a2a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      color: #fc8181;
      font-size: 13px;
      line-height: 1.5;
    }

    .field-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      color: #718096;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    input[type="url"] {
      width: 100%;
      padding: 11px 14px;
      background: #0f1117;
      border: 1px solid #2d3148;
      border-radius: 8px;
      color: #f7fafc;
      font-size: 14px;
      outline: none;
      transition: border-color 0.15s;
    }

    input[type="url"]:focus { border-color: #5a67d8; }
    input[type="url"]::placeholder { color: #4a5568; }

    .hint {
      font-size: 12px;
      color: #718096;
      margin-top: 7px;
      line-height: 1.5;
    }

    code {
      font-family: "SF Mono", "Fira Code", monospace;
      background: #2d3148;
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 11px;
      color: #90cdf4;
    }

    .steps {
      background: #0f1117;
      border: 1px solid #2d3148;
      border-radius: 8px;
      padding: 16px;
      margin: 18px 0;
    }

    .steps-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #718096;
      margin-bottom: 12px;
    }

    .step {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      font-size: 13px;
      color: #cbd5e0;
      line-height: 1.5;
    }

    .step + .step { margin-top: 10px; }

    .step-num {
      background: #2d3148;
      color: #a0aec0;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      margin-top: 1px;
    }

    button {
      width: 100%;
      padding: 13px;
      margin-top: 18px;
      background: linear-gradient(135deg, #5a67d8, #4c51bf);
      border: none;
      border-radius: 8px;
      color: #fff;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    button:hover { opacity: 0.88; }
    button:disabled { opacity: 0.45; cursor: not-allowed; }

    .security {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      margin-top: 18px;
      padding: 12px 14px;
      background: #0a1f0a;
      border: 1px solid #1a4731;
      border-radius: 8px;
      font-size: 12px;
      color: #68d391;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon icon-bitrix">🏢</div>
      <div class="icon-arrow">→</div>
      <div class="icon icon-claude">🤖</div>
      <div>
        <h1>Подключить Bitrix24</h1>
        <div class="subtitle">Введите ваш webhook URL для работы с задачами</div>
      </div>
    </div>

    ${params.error ? `<div class="error">⚠️ ${escapeHtml(params.error)}</div>` : ""}

    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id"             value="${escapeHtml(params.clientId)}">
      <input type="hidden" name="redirect_uri"          value="${escapeHtml(params.redirectUri)}">
      <input type="hidden" name="code_challenge"        value="${escapeHtml(params.codeChallenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}">
      ${params.state ? `<input type="hidden" name="state" value="${escapeHtml(params.state)}">` : ""}

      <label class="field-label" for="webhook_url">Bitrix24 Webhook URL</label>
      <input
        type="url"
        id="webhook_url"
        name="webhook_url"
        required
        autocomplete="off"
        spellcheck="false"
        placeholder="https://my-company.bitrix24.ru/rest/1/abc123xyz/"
        value="${escapeHtml(params.webhookValue ?? "")}"
      >
      <div class="hint">
        Формат: <code>https://домен.bitrix24.ru/rest/USER_ID/TOKEN/</code>
      </div>

      <div class="steps">
        <div class="steps-title">Как получить webhook</div>
        <div class="step">
          <div class="step-num">1</div>
          <div>Bitrix24 → <strong>Приложения</strong> → <strong>Разработчикам</strong> → <strong>Входящий вебхук</strong></div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div>Нажмите <strong>Добавить вебхук</strong></div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div>Выберите права: <code>task</code> и <code>user</code></div>
        </div>
        <div class="step">
          <div class="step-num">4</div>
          <div>Скопируйте <strong>URL вебхука</strong> и вставьте выше</div>
        </div>
      </div>

      <button type="submit" id="btn">Подключить →</button>
    </form>

    <div class="security">
      🔒 Webhook шифруется алгоритмом AES-256-GCM.
      Сервер не хранит ваши данные — ключ доступа живёт только в Claude AI.
    </div>
  </div>

  <script>
    document.querySelector("form").addEventListener("submit", function () {
      const btn = document.getElementById("btn");
      btn.disabled = true;
      btn.textContent = "Проверяем...";
    });
  </script>
</body>
</html>`;
}

// ---- Route handlers ----

export const authorizeGet: RequestHandler = (req, res) => {
  const {
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    response_type,
    state,
  } = req.query as Record<string, string | undefined>;

  if (!client_id || !redirect_uri || !code_challenge || response_type !== "code") {
    res.status(400).send("Invalid authorization request: missing required OAuth parameters.");
    return;
  }

  if (code_challenge_method && code_challenge_method !== "S256") {
    res.status(400).send("Only S256 code_challenge_method is supported.");
    return;
  }

  // Verify the client exists and the redirect_uri is registered
  const client = getClient(client_id);
  if (client && !client.redirectUris.includes(redirect_uri)) {
    res.status(400).send("redirect_uri is not registered for this client.");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    renderAuthPage({
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method ?? "S256",
      state,
    }),
  );
};

export const authorizePost: RequestHandler = async (req, res) => {
  const {
    webhook_url,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    state,
  } = req.body as Record<string, string | undefined>;

  const showError = (error: string): void => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      renderAuthPage({
        clientId: client_id ?? "",
        redirectUri: redirect_uri ?? "",
        codeChallenge: code_challenge ?? "",
        codeChallengeMethod: code_challenge_method ?? "S256",
        state,
        error,
        webhookValue: webhook_url,
      }),
    );
  };

  if (!webhook_url || !client_id || !redirect_uri || !code_challenge) {
    showError("Отсутствуют обязательные параметры запроса.");
    return;
  }

  // Verify redirect_uri against registered client
  const client = getClient(client_id);
  if (client && !client.redirectUris.includes(redirect_uri)) {
    res.status(400).send("redirect_uri mismatch.");
    return;
  }

  // Validate webhook URL format
  const parsed = parseWebhookUrl(webhook_url);
  if (!parsed) {
    showError(
      "Неверный формат URL. Ожидается: https://домен.bitrix24.ru/rest/USER_ID/TOKEN/",
    );
    return;
  }

  // Validate webhook by calling user.current — proves it works and gets user info
  let bitrixUser: Awaited<ReturnType<typeof validateWebhookAndGetUser>>;
  try {
    bitrixUser = await validateWebhookAndGetUser(webhook_url);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Ошибка проверки webhook.");
    return;
  }

  const normalizedWebhook = webhook_url.trim().replace(/\/?$/, "/");
  const userName = [bitrixUser.name, bitrixUser.lastName].filter(Boolean).join(" ");

  logger.info({ domain: parsed.domain, userId: bitrixUser.id }, "OAuth: user authorized");

  const code = createAuthCode({
    payload: {
      webhook: normalizedWebhook,
      bitrixUserId: bitrixUser.id,
      bitrixDomain: parsed.domain,
      bitrixUserName: userName,
    },
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method ?? "S256",
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const callbackUrl = new URL(redirect_uri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);

  res.redirect(302, callbackUrl.toString());
};
