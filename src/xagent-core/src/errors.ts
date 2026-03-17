/**
 * xNexus Core — error hierarchy.
 */

/** Base error for all xNexus Core errors */
export class NexusError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "NexusError";
    this.code = code;
    this.context = context;
  }
}

/** Security-related errors (bad signature, unauthorized, etc.) */
export class SecurityError extends NexusError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super("SECURITY_ERROR", message, context);
    this.name = "SecurityError";
  }
}

/** Illegal state transition attempted */
export class InvalidTransitionError extends NexusError {
  constructor(
    from: string,
    to: string,
    context: Record<string, unknown> = {},
  ) {
    super(
      "INVALID_TRANSITION",
      `Cannot transition from ${from} to ${to}`,
      { from, to, ...context },
    );
    this.name = "InvalidTransitionError";
  }
}

/** Relayer errors (gas, nonce, submission) */
export class RelayerError extends NexusError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super("RELAYER_ERROR", message, context);
    this.name = "RelayerError";
  }
}

/** On-chain interaction errors */
export class ChainError extends NexusError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super("CHAIN_ERROR", message, context);
    this.name = "ChainError";
  }
}
