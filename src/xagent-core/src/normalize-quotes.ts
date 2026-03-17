/**
 * xNexus Core — Quote normalizer.
 *
 * Auto-extracts NexusQuotePayload from common wrong shapes that user agents
 * may pass to xagent_orchestrate_payment.
 */

/**
 * Ensure quote-level fields have correct types after JSON transit.
 * MCP / LLM may coerce:
 *  - `amount` (should be string "100000") → number 100000
 *  - `chain_id` (should be number) → string "20250407"
 *  - `expiry` (should be number) → string
 *  - `context.line_items[].amount` (should be string) → number
 */
function coerceQuoteTypes(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const coerced = { ...obj };

  // amount must be a string for BigInt conversion
  if (coerced.amount != null) {
    coerced.amount = String(coerced.amount);
  }

  // chain_id must be a number
  if (typeof coerced.chain_id === "string") {
    coerced.chain_id = Number(coerced.chain_id);
  }

  // expiry must be a number
  if (typeof coerced.expiry === "string") {
    coerced.expiry = Number(coerced.expiry);
  }

  // Normalize context.line_items amounts to strings
  if (coerced.context && typeof coerced.context === "object") {
    const ctx = coerced.context as Record<string, unknown>;
    if (Array.isArray(ctx.line_items)) {
      const normalizedItems = ctx.line_items.map(
        (item: Record<string, unknown>) => ({
          ...item,
          amount: String(item.amount),
          qty: typeof item.qty === "string" ? Number(item.qty) : item.qty,
        }),
      );
      coerced.context = {
        ...ctx,
        line_items: normalizedItems,
        ...(ctx.original_amount != null
          ? { original_amount: String(ctx.original_amount) }
          : {}),
      };
    }
  }

  return coerced;
}

/**
 * User agents may pass various shapes instead of the raw NexusQuotePayload:
 *
 * 1. Raw quote (correct): { merchant_did, amount, signature, ... }
 * 2. Full UCP envelope: { ucp: { payment_handlers: { "urn:ucp:payment:nexus_v1": [{ config: QUOTE }] } } }
 * 3. Handler object: { config: QUOTE, nexus_core: { ... } }
 *
 * This function normalizes all shapes to NexusQuotePayload[].
 */
export function normalizeQuotes(rawQuotes: unknown[]): unknown[] {
  const result: unknown[] = [];

  for (const item of rawQuotes) {
    if (item == null || typeof item !== "object") {
      result.push(item);
      continue;
    }

    const obj = item as Record<string, unknown>;

    // Shape 1: Already a raw NexusQuotePayload (has merchant_did + signature)
    if (
      typeof obj.merchant_did === "string" &&
      typeof obj.signature === "string"
    ) {
      result.push(coerceQuoteTypes(obj));
      continue;
    }

    // Shape 2: Full UCP envelope
    if (obj.ucp && typeof obj.ucp === "object") {
      const ucp = obj.ucp as Record<string, unknown>;
      const handlers = ucp.payment_handlers as
        | Record<string, unknown>
        | undefined;
      if (handlers) {
        const nexusHandlers = handlers["urn:ucp:payment:nexus_v1"] as
          | unknown[]
          | undefined;
        if (Array.isArray(nexusHandlers)) {
          for (const handler of nexusHandlers) {
            if (handler && typeof handler === "object") {
              const h = handler as Record<string, unknown>;
              if (h.config && typeof h.config === "object") {
                result.push(
                  coerceQuoteTypes(h.config as Record<string, unknown>),
                );
              }
            }
          }
          continue;
        }
      }
    }

    // Shape 3: Handler object — { config: QUOTE, nexus_core: { ... } }
    if (
      obj.config &&
      typeof obj.config === "object" &&
      (obj.config as Record<string, unknown>).merchant_did
    ) {
      result.push(coerceQuoteTypes(obj.config as Record<string, unknown>));
      continue;
    }

    // Fallback: pass through and let downstream validation catch it
    result.push(obj);
  }

  return result;
}
