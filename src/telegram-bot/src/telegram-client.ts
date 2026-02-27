/**
 * Telegram Bot — grammy Bot API wrapper.
 *
 * Thin layer around grammy for sending and editing messages.
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
   * Handle callback queries (e.g., "noop" button presses).
   * Call this once at startup to register the handler.
   */
  registerCallbackHandler(): void {
    this.bot.callbackQuery("noop", async (ctx) => {
      await ctx.answerCallbackQuery();
    });
  }

  /**
   * Start the bot (long polling for callback queries).
   * Non-blocking — runs in the background.
   */
  start(): void {
    this.registerCallbackHandler();
    this.bot.start({
      onStart: () => log.info("Bot started"),
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    log.info("Bot stopped");
  }
}
