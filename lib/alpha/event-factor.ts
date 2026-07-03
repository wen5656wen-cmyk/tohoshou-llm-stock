/**
 * Alpha factor — corporate event factors (Buyback / Dividend Raise / Guidance Raise /
 * TDnet Event).
 *
 * PHASE 1: interface only. Returns nulls (unknown) so downstream schema/API is ready;
 * population from Disclosure / TDnet / Dividend history is deferred to a later phase.
 * Independent: no dependency on price bars or other factors.
 */
export type EventFactors = {
  buyback: boolean | null;
  dividendRaise: boolean | null;
  guidanceRaise: boolean | null;
  tdnetEvent: boolean | null;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function computeEventFactors(_symbol: string): EventFactors {
  return {
    buyback: null,
    dividendRaise: null,
    guidanceRaise: null,
    tdnetEvent: null,
  };
}
