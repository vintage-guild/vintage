// A DecisionsPort that checks a budget before each call and records each call after. The host
// supplies both (apps/api: the agent module's pause switch, monthly cap, and run ledger), so a
// paused agent or a spent cap reads to every consumer as a failed call, and they fall back.
import type { DecisionsPort } from './types';

export interface DecisionLedger {
  /** Null to go ahead, or why not (paused, over the cap). */
  refuse(): Promise<string | null>;
  record(entry: {
    inputTokens: number | null;
    model: string | null;
    error: string | null;
  }): Promise<void>;
}

export class DecisionRefused extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'DecisionRefused';
  }
}

export function withLedger(port: DecisionsPort, ledger: DecisionLedger): DecisionsPort {
  return {
    async ask(request) {
      const reason = await ledger.refuse();
      if (reason) throw new DecisionRefused(reason);
      try {
        const result = await port.ask(request);
        await ledger.record({
          inputTokens: result.usage.inputTokens,
          model: result.model,
          error: null,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ledger
          .record({ inputTokens: null, model: null, error: message })
          .catch(() => undefined);
        throw err;
      }
    },
  };
}
