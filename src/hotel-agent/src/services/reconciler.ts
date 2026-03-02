/**
 * Reconciler — periodically checks for UNPAID orders whose payments
 * have actually been completed on nexus-core, and reconciles local state.
 *
 * Runs every RECONCILE_INTERVAL_MS (default 5 min), querying orders
 * created within RECONCILE_LOOKBACK_MS (default 4 hours).
 */
import { listUnpaidSince, updateStatus } from "./order-store.js";
import { requestSettlement } from "./webhook-handler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconcilerConfig {
  readonly nexusCoreUrl: string;
  readonly merchantDid: string;
  readonly intervalMs?: number;
  readonly lookbackMs?: number;
}

interface NexusCorePaymentSummary {
  readonly nexus_payment_id: string;
  readonly merchant_order_ref: string;
  readonly status: string;
  readonly group_id: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 5 * 60_000; // 5 minutes
const DEFAULT_LOOKBACK_MS = 4 * 3_600_000; // 4 hours
const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Reconciler
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | null = null;

export function startReconciler(config: ReconcilerConfig): void {
  if (timer) return; // already running

  const intervalMs = config.intervalMs ?? DEFAULT_INTERVAL_MS;
  const lookbackMs = config.lookbackMs ?? DEFAULT_LOOKBACK_MS;

  console.error(
    `[Reconciler] Starting — interval=${intervalMs / 1000}s lookback=${lookbackMs / 3_600_000}h`,
  );

  // Run once immediately, then on interval
  runReconciliation(config, lookbackMs).catch((err) =>
    console.error("[Reconciler] Initial run failed:", err),
  );

  timer = setInterval(() => {
    runReconciliation(config, lookbackMs).catch((err) =>
      console.error("[Reconciler] Tick failed:", err),
    );
  }, intervalMs);

  timer.unref(); // don't block process exit
}

export function stopReconciler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.error("[Reconciler] Stopped");
  }
}

async function runReconciliation(
  config: ReconcilerConfig,
  lookbackMs: number,
): Promise<void> {
  const sinceISO = new Date(Date.now() - lookbackMs).toISOString();
  const unpaidOrders = await listUnpaidSince(sinceISO);

  if (unpaidOrders.length === 0) return;

  console.error(
    `[Reconciler] Found ${unpaidOrders.length} UNPAID order(s) to check`,
  );

  // Fetch recent payments from nexus-core in one batch call
  const corePayments = await fetchMerchantPayments(
    config.nexusCoreUrl,
    config.merchantDid,
    lookbackMs,
  );

  if (!corePayments) return; // fetch failed, skip this cycle

  // Index core payments by merchant_order_ref for O(1) lookup
  const paymentsByRef = new Map<string, NexusCorePaymentSummary>();
  for (const p of corePayments) {
    paymentsByRef.set(p.merchant_order_ref, p);
  }

  // Reconcile each unpaid order
  for (const order of unpaidOrders) {
    const corePayment = paymentsByRef.get(order.order_ref);
    if (!corePayment) continue; // not found in nexus-core, skip

    const coreStatus = corePayment.status;

    if (
      coreStatus === "ESCROWED" ||
      coreStatus === "SETTLED" ||
      coreStatus === "COMPLETED"
    ) {
      console.error(
        `[Reconciler] ${order.order_ref}: UNPAID → PAID (core status: ${coreStatus})`,
      );
      await updateStatus(order.order_ref, "PAID");

      // If ESCROWED, trigger settlement (fire-and-forget)
      if (coreStatus === "ESCROWED") {
        requestSettlement(
          config.nexusCoreUrl,
          corePayment.nexus_payment_id,
          config.merchantDid,
        ).catch((err) =>
          console.error(
            `[Reconciler] Settlement request failed for ${order.order_ref}:`,
            err,
          ),
        );
      }
    } else if (coreStatus === "EXPIRED" || coreStatus === "REFUNDED") {
      console.error(
        `[Reconciler] ${order.order_ref}: UNPAID → EXPIRED (core status: ${coreStatus})`,
      );
      await updateStatus(order.order_ref, "EXPIRED");
    }
  }
}

// ---------------------------------------------------------------------------
// nexus-core API call
// ---------------------------------------------------------------------------

async function fetchMerchantPayments(
  nexusCoreUrl: string,
  merchantDid: string,
  lookbackMs: number,
): Promise<readonly NexusCorePaymentSummary[] | null> {
  const hours = Math.ceil(lookbackMs / 3_600_000);
  const url =
    `${nexusCoreUrl}/api/merchant/payments` +
    `?merchant_did=${encodeURIComponent(merchantDid)}` +
    `&since=${hours}h` +
    `&limit=200`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, { signal: controller.signal });

    if (!resp.ok) {
      console.error(
        `[Reconciler] nexus-core responded ${resp.status}: ${await resp.text()}`,
      );
      return null;
    }

    const body = (await resp.json()) as {
      payments?: readonly NexusCorePaymentSummary[];
    };
    return body.payments ?? [];
  } catch (err) {
    console.error("[Reconciler] Failed to fetch merchant payments:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
