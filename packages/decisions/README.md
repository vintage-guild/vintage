# @vintage/decisions

Bounded questions with typed answers, over the OpenAI Decisions API (`POST /v1/decisions`,
`gpt-6-luna`). A module asks "which kind of note is this?" or "does this need an officer?" and
gets a label with a probability. The module's own rule decides what to do with it.

## The contract every consumer follows

1. **Ask only from a Convex action.** Decisions calls are HTTP; mutations can't make them. A
   command that needs one schedules an action. In apps/api use `decisionsFor(ctx, label)`
   (`apps/api/convex/decisions.ts`), which returns null when no key is set and goes through the
   agent ledger: the pause switch and the monthly cap refuse a call, and every call is a
   `decision` run labeled with what it was for.
2. **Read answers through the threshold helpers.** `predicateAtLeast`, `choiceAtLeast`, and
   `scoreAtLeast` treat a refusal, a missing answer, or low confidence as no decision.
3. **Pick thresholds from labeled examples.** Keep a fixture of real inputs with the answer a
   human gave; `pickThreshold` finds the lowest threshold with the false positives you can
   tolerate, `choiceAccuracy` scores labels above a confidence floor.
4. **State the fallback.** Below the threshold, on a refusal, a thrown error, a missing key, or
   a paused agent, the consumer does exactly what it did before Decisions existed.
5. **Split dependent questions.** A question that depends on another's answer goes in its own
   request.

## Pieces

| Export | What it is |
|---|---|
| `DecisionsPort`, `Question`, `Answer` | The port and its types (predicate, choice, score, refusal) |
| `createOpenAIDecisions` | The fetch adapter; validates requests before they cost anything |
| `withLedger` | Wraps a port with a budget check and a record of each call |
| `predicateAtLeast`, `choiceAtLeast`, `scoreAtLeast` | Threshold readers |
| `pickThreshold`, `scoreThreshold`, `choiceAccuracy` | Threshold tooling over labeled examples |
| `./testing` `createFakeDecisions` | Scripted answers by question name; `failNext()` to prove fallbacks |

Measured on 2026-10-26 (#128): one request with two questions answered in 1.2 s for 301 input
tokens, and labeled a late-signup note correctly at 0.99. Pricing is input only ($0.10 per
million tokens).
