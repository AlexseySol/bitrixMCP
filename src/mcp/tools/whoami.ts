import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BitrixClient } from "../../bitrix/client.js";
import type { TokenPayload } from "../../utils/crypto.js";

export function registerWhoami(server: McpServer, client: BitrixClient, ctx: TokenPayload): void {
  server.registerTool(
    "bitrix_whoami",
    {
      description:
        "Get information about the current user — the Bitrix24 account linked to this connection.",
    },
    async () => {
      try {
        const user = await client.getCurrentUser();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                id: user.id,
                name: user.full_name,
                email: user.email,
                domain: ctx.bitrixDomain,
                position: user.position,
              }),
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
