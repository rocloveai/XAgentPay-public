/**
 * Telegram Bot — xNexus Core API client.
 *
 * Fetches payment group status from nexus-core REST API.
 */
import { createLogger } from "./logger.js";
import type { NexusGroupStatusResponse } from "./types.js";

const log = createLogger("NexusClient");

export class NexusClient {
  constructor(private readonly baseUrl: string) {}

  async getGroupStatus(groupId: string): Promise<NexusGroupStatusResponse> {
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
        `nexus-core returned ${response.status} for group ${groupId}`,
      );
    }

    const data = (await response.json()) as NexusGroupStatusResponse;
    return data;
  }
}
