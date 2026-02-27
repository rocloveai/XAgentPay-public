/**
 * Telegram Bot — grammy Bot API wrapper.
 *
 * API-only mode: sends and edits messages via Bot API.
 * No polling, no webhook — only outgoing API calls.
 * This avoids hijacking updates from OpenClaw or other bot consumers.
 */
import { Bot } from "grammy";
import { createLogger } from "./logger.js";
import type { RenderedMessage } from "./message-renderer.js";

const log = createLogger("TelegramClient");

export class TelegramClient {
  private readonly bot: Bot;

  constructor(token: string) {
    this.bot = new Bot(token);
  }

  /**
   * Send an order message to a Telegram chat.
   * @returns The sent message's message_id (used for later edits).
   */
  async sendOrderMessage(
    chatId: number | string,
    rendered: RenderedMessage,
  ): Promise<number> {
    const msg = await this.bot.api.sendMessage(chatId, rendered.text, {
      parse_mode: "HTML",
      reply_markup: rendered.replyMarkup,
    });

    log.info("Sent order message", {
      chat_id: chatId,
      message_id: msg.message_id,
    });

    return msg.message_id;
  }

  /**
   * Edit an existing order message with updated content.
   * @returns true if the message was edited, false if content was unchanged.
   */
  async editOrderMessage(
    chatId: number | string,
    messageId: number,
    rendered: RenderedMessage,
  ): Promise<boolean> {
    try {
      await this.bot.api.editMessageText(chatId, messageId, rendered.text, {
        parse_mode: "HTML",
        reply_markup: rendered.replyMarkup,
      });

      log.info("Edited order message", {
        chat_id: chatId,
        message_id: messageId,
      });
      return true;
    } catch (err: unknown) {
      // "message is not modified" is expected when content hasn't changed
      if (err instanceof Error && err.message.includes("not modified")) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Ensure no webhook is set on this bot, so updates flow to
   * whoever is polling (e.g. OpenClaw).
   */
  async deleteWebhookIfSet(): Promise<void> {
    try {
      const info = await this.bot.api.getWebhookInfo();
      if (info.url) {
        await this.bot.api.deleteWebhook();
        log.info("Deleted stale webhook", { was: info.url });
      }
    } catch {
      // Ignore errors
    }
  }

  async stop(): Promise<void> {
    log.info("Bot stopped");
  }
}
