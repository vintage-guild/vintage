# insights module

Raid insights (epic #126, #137): a raider imports a Farsight Crawler run summary after a raid;
Vintage finds what each raider could do better, with the evidence from the log; officers send
the notes, and raiders who opted in get one private DM. Maturity: **labs**.

## Shape

| Path | Holds |
|---|---|
| `src/farsight/run-summary.ts` | A pinned copy of Farsight's `RunSummaryV1` and `farsight.run` v1 upload schema (source commit in its header). Never edit it here; copy it again, and replace it with the published `@farsight/schemas` (#138) |
| `src/contract.ts` | `InsightRun` (what Vintage keeps of a run), `InsightFinding`, `InsightOptIn` |
| `src/store.ts` | `InsightsStore`, `CharacterOwners` (identity characters by name), `InsightsEffects` (send), `InsightsDeps` |
| `src/domain/findings.ts` | Pure: `findingsFor(run)`: deaths, the spell that killed you twice or more, interrupts that missed, damage taken well above an even share for non-tanks |
| `src/domain/gate.ts` | The DM gate (a Decisions predicate per finding), `DM_INSTRUCTIONS` for the wording, `plainDm` (the fallback) |
| `src/commands/` | `run-import` (raider), `insights-runs`, `insights-get`, `insights-optin-set` (member), `insights-send` (officer, destructive) |
| `convex/` | The `insights` component: `runs`, `findings`, `optins` |

## Rules

- **Summaries, never logs.** `run-import` accepts only the `farsight.run` v1 envelope and keeps the
  run's facts and derived findings, not the summary. Importing the same `run_key` again does
  nothing.
- **Upload text is untrusted.** A raider may import only a run one of their characters is on
  (officers any). `UPLOAD_LIMITS` caps sizes, and `clean` strips everything but what WoW names
  use from names, spells, and zones before anyone reads them, so no link, markdown, or mention
  reaches a finding or a DM. The send preview shows each DM's text before an officer confirms.
- **Findings are code, with evidence.** Every finding is a claim about one raider's own play with
  counts or times a raider can check. No finding compares raiders, and nothing ranks them.
- **Raiders see their own.** `insights-get` answers members only their own findings (matched by
  character name to their member); officers see everyone's.
- **DMs are opt-in and sent once.** `insights-optin-set dms:true` turns them on (off by default);
  `insights-send` previews who would get one, then sends, once per run. Members who opted out of
  coordinator DMs (`dmOptOut`) get none either. Each DM holds at most two findings; the Decisions
  gate drops a finding only when it is sure it won't help, never all of them. Terra at low
  effort writes a one- or two-sentence opening that names what to work on without repeating
  the findings; the plain findings follow it, so the evidence is always there. The footer tells
  members to stop the notes with `/random ask` (the agent prepares `insights-optin-set`, and
  they confirm).
- **Raid support is upstream.** Today's summaries are dungeon-shaped (one tank, run-level
  boundaries); encounter segmentation, roles, and defensives land in Farsight first
  (Falkicon/Farsight#22, tracked in #138).
- **`guildId` on every row**, read through guild-scoped indexes.
