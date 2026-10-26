# Model routing

Pick a model and effort for the immediate task, not for the whole project. Spend on planning
when it turns several judgment-heavy tasks into well-specified ones a cheaper model can finish.

## For contributors' agents (building Vintage)

| Task | Start with | Notes |
|---|---|---|
| Mechanical edits, renames, fixtures, docs updates | Small/fast model (Claude Haiku, GPT Luna) | Exact instructions; verification is cheap |
| Bounded implementation with clear acceptance criteria (a `fleet:candidate` issue) | Fast model at high effort (Claude Sonnet, GPT Luna Extra High) | The issue's acceptance criteria are the spec |
| General coding, integrating modules, routine orchestration | Mid model (Claude Sonnet, GPT Sol Medium) | The default |
| Difficult but contained engineering (tricky Convex/Discord edge cases) | Mid model at high effort (GPT Sol High) | |
| UX, visual, interaction, or product judgment (website, addon UI) | Strong model at low effort (Claude Opus, GPT Astra Low) | Taste matters more than depth |
| Consequential design: auth, permissions, the confirm-token flow, loot method contracts | Strong model at medium/high effort | Name the invariant being checked; keep the expensive phase short |
| Self-review lanes (correctness, contract, data, tests, surfaces, addon) | The authoring session's model; `vintage-reviewer` and `vintage-addon-reviewer` inherit it (`model: inherit`) | A fresh context, not a stronger model, is what makes a self-review independent |
| Security review of auth/MCP/Discord changes | Strong model: `vintage-security-auditor` is pinned to Opus (`model: opus`) | Model effort never replaces the gates |

Rules of thumb:

- Don't inherit an expensive setting into child tasks by accident.
- Escalate the hard part, not the whole backlog.
- If a cheaper model stalls, find out why (missing context, broken environment) before
  escalating.
- Every route still runs `pnpm validate:final`; a stronger model doesn't skip checks.

## For the hosted guild agent (runtime)

| Use | Model | Why |
|---|---|---|
| `/ask`, signup help, coordinator copywriting | `gpt-5.6-luna` | Cheap, fast, and the commands do the real work |
| Comp and strategy questions | `gpt-5.6-sol` | More reasoning when it's worth it |

The agent runs with per-member daily and global monthly spend caps, and falls back to plain
templates when it's unavailable (PLAN.md §3.10).
