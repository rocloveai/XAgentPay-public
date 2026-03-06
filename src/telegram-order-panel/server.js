import 'dotenv/config';
import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const TG_TOKEN = process.env.TG_BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${TG_TOKEN}`;
const FLIGHT_API = process.env.FLIGHT_API || 'https://nexus-flight-agent-3xb1.onrender.com/api/v1/call-tool';
const HOTEL_API  = process.env.HOTEL_API  || 'https://nexus-hotel-agent-d2lj.onrender.com/api/v1/call-tool';

if (!TG_TOKEN) {
  console.error('Missing TG_BOT_TOKEN in environment');
  process.exit(1);
}

/** @type {Map<string, {state: object, timer: NodeJS.Timeout}>} */
const jobs = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(method, payload) {
  const { data } = await axios.post(`${TG_API}/${method}`, payload, { timeout: 15000 });
  if (!data.ok) throw new Error(`Telegram API ${method} failed: ${JSON.stringify(data)}`);
  return data.result;
}

async function checkStatus(orderRef, kind) {
  if (!orderRef) return 'N/A';
  try {
    const api = kind === 'hotel' ? HOTEL_API : FLIGHT_API;
    const { data } = await axios.post(
      api,
      { tool: 'nexus_check_status', arguments: { order_ref: orderRef } },
      { timeout: 15000 }
    );
    return data?.data?.status || 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

function fmtStatus(s) {
  if (s === 'PAID')    return '✅ PAID';
  if (s === 'UNPAID')  return '⏳ UNPAID';
  if (s === 'EXPIRED') return '⌛ EXPIRED';
  if (s === 'N/A')     return '—';
  return `❔ ${s || 'UNKNOWN'}`;
}

function renderText(state, statuses) {
  const vals = Object.values(statuses).filter(s => s !== 'N/A');
  const allPaid = vals.length > 0 && vals.every(s => s === 'PAID');
  const header = allPaid
    ? '✅ <b>XAgent Pay 订单（已全部支付）</b>'
    : '🧾 <b>XAgent Pay 订单</b>  <i>每10秒自动刷新</i>';

  const lines = [header, ''];

  if (state.outRef)   lines.push(`✈️ 去程  <code>${state.outRef}</code>：${fmtStatus(statuses.out)}`);
  if (state.hotelRef) lines.push(`🏨 酒店  <code>${state.hotelRef}</code>：${fmtStatus(statuses.hotel)}`);
  if (state.backRef)  lines.push(`✈️ 返程  <code>${state.backRef}</code>：${fmtStatus(statuses.back)}`);

  lines.push('');
  lines.push(`🔖 Group: <code>${state.groupId}</code>`);

  return lines.join('\n');
}

function keyboard(state, allPaid) {
  if (allPaid) {
    return { inline_keyboard: [[{ text: '✅ 支付完成', callback_data: 'noop' }]] };
  }
  return {
    inline_keyboard: [
      [{ text: '💳 去收银台支付', url: state.checkoutUrl }],
      [{ text: '🔄 手动刷新', callback_data: `refresh:${state.groupId}` }]
    ]
  };
}

async function fetchStatuses(state) {
  const [out, hotel, back] = await Promise.all([
    checkStatus(state.outRef,   'flight'),
    checkStatus(state.hotelRef, 'hotel'),
    checkStatus(state.backRef,  'flight'),
  ]);
  return { out, hotel, back };
}

async function updateMessage(state) {
  const statuses = await fetchStatuses(state);
  const vals = Object.values(statuses).filter(s => s !== 'N/A');
  const allPaid = vals.length > 0 && vals.every(s => s === 'PAID');
  const text = renderText(state, statuses);

  await tg('editMessageText', {
    chat_id: state.chatId,
    message_id: state.messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: keyboard(state, allPaid),
  });

  if (allPaid) {
    const job = jobs.get(state.groupId);
    if (job) {
      clearInterval(job.timer);
      jobs.delete(state.groupId);
      console.log(`[${state.groupId}] All paid — stopped polling`);
    }
  }

  return statuses;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ ok: true, activeJobs: jobs.size });
});

/**
 * POST /start-order-panel
 * Body: { chatId, groupId, checkoutUrl, outRef, hotelRef?, backRef?, intervalSec? }
 *
 * outRef  — outbound flight order ref (required)
 * hotelRef — hotel order ref (optional)
 * backRef  — return flight order ref (optional)
 */
app.post('/start-order-panel', async (req, res) => {
  try {
    const { chatId, groupId, checkoutUrl, outRef, hotelRef, backRef, intervalSec } = req.body || {};

    if (!chatId || !groupId || !checkoutUrl || !outRef) {
      return res.status(400).json({ ok: false, error: 'Missing required fields: chatId, groupId, checkoutUrl, outRef' });
    }

    const state = { chatId, groupId, checkoutUrl, outRef, hotelRef: hotelRef || null, backRef: backRef || null, messageId: null };

    // Cancel previous job for same group (idempotent)
    if (jobs.has(groupId)) {
      clearInterval(jobs.get(groupId).timer);
      jobs.delete(groupId);
    }

    // Send initial placeholder message
    const initialMsg = await tg('sendMessage', {
      chat_id: chatId,
      text: '🧾 <b>XAgent Pay 订单</b> — 正在初始化…',
      parse_mode: 'HTML',
      reply_markup: keyboard(state, false),
    });

    state.messageId = initialMsg.message_id;

    // First status fetch
    await updateMessage(state);

    const ms = Math.max(5, Number(intervalSec || 10)) * 1000;
    const timer = setInterval(() => {
      updateMessage(state).catch((e) => console.error(`[${groupId}] update failed:`, e.message));
    }, ms);

    jobs.set(groupId, { state, timer });

    res.json({ ok: true, groupId, messageId: state.messageId, pollEverySec: ms / 1000 });
  } catch (e) {
    console.error('[start-order-panel] error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** Telegram webhook — handles inline button callbacks */
app.post('/telegram/webhook', async (req, res) => {
  try {
    const cb = req.body?.callback_query;
    if (!cb) return res.sendStatus(200);

    if (cb.data === 'noop') {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '' });
      return res.sendStatus(200);
    }

    if (cb.data?.startsWith('refresh:')) {
      const groupId = cb.data.slice('refresh:'.length);
      const job = jobs.get(groupId);

      if (!job) {
        await tg('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: '找不到这个任务（可能已完成或服务重启）',
          show_alert: false,
        });
        return res.sendStatus(200);
      }

      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: '正在刷新…', show_alert: false });
      await sleep(200);
      await updateMessage(job.state);
    }

    return res.sendStatus(200);
  } catch (e) {
    console.error('[webhook] error:', e.message);
    return res.sendStatus(200);
  }
});

app.listen(PORT, () => {
  console.log(`telegram-order-panel listening on :${PORT}`);
});
