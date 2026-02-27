/**
 * Telegram Bot — grammy Bot API wrapper.
 *
 * API-only mode: sends and edits messages via Bot API.
 * Handles callback queries via webhook (no long polling).
 */
import { Bot, webhookCallback } from "grammy";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "./logger.js";
import type { RenderedMessage } from "./message-renderer.js";

const log = createLogger("TelegramClient");

export class TelegramClient {
  private readonly bot: Bot;

  constructor(token: string) {
    this.bot = new Bot(token);

    // Handle "noop" callback from inline keyboard buttons
    this.bot.callbackQuery("noop", async (ctx) => {
      await ctx.answerCallbackQuery();
    });
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
   * Set up webhook so Telegram sends callback queries to our server.
   * Call once after the HTTP server is listening.
   */
  async setupWebhook(baseUrl: string): Promise<void> {
    const webhookUrl = `${baseUrl}/telegram-webhook`;
    await this.bot.api.setWebhook(webhookUrl);
    log.info("Webhook set", { url: webhookUrl });
  }

  /**
   * Handle incoming Telegram webhook request (callback queries, etc).
   */
  async handleWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const handler = webhookCallback(this.bot, "http");
    await handler(req, res);
  }

  /**
   * Remove webhook and clean up on shutdown.
   */
  async stop(): Promise<void> {
    try {
      await this.bot.api.deleteWebhook();
    } catch {
      // Ignore cleanup errors
    }
    log.info("Bot stopped");
  }
}
