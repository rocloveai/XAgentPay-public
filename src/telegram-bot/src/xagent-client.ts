/**
 * Telegram Bot — XAgent Core API client.
 *
 * Fetches payment group status from xagent-core REST API.
 */
import { createLogger } from "./logger.js";
import type { XAgentGroupStatusResponse } from "./types.js";

const log = createLogger("XAgentClient");

export class XAgentClient {
  constructor(private readonly baseUrl: string) {}

  async getGroupStatus(groupId: string): Promise<XAgentGroupStatusResponse> {
    const url = `${this.baseUrl}/api/payments?group_id=${encodeURIComponent(groupId)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log.error("Failed to fetch group status", {
        group_id: groupId,
        status: response.status,
        body: body.slice(0, 200),
      });
      throw new Error(
        `xagent-core returned ${response.status} for group ${groupId}`,
      );
    }

    const data = (await response.json()) as XAgentGroupStatusResponse;
    return data;
  }
}
