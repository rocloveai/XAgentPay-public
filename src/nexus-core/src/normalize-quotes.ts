/**
 * NexusPay Core — Quote normalizer.
 *
 * Auto-extracts NexusQuotePayload from common wrong shapes that user agents
 * may pass to nexus_orchestrate_payment.
 */

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
      result.push(obj);
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
                result.push(h.config);
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
      result.push(obj.config);
      continue;
    }

    // Fallback: pass through and let downstream validation catch it
    result.push(obj);
  }

  return result;
}
