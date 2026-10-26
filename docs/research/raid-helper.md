# Raid-Helper: what to take from it

[Raid-Helper](https://raid-helper.dev/) is the most widely used Discord raid-signup bot.
Stridulent pointed us at it (2026-10-25) as a source of layout and feature ideas. This note
records what it does, what's worth adopting, and where Vintage already does better. Researched
from Raid-Helper's own docs (intro, guides, commands, advanced settings, reference, API, premium
pages) plus a few community tools; first-hand user complaints weren't reachable, so the
"avoid" list is partly inferred.

**Worth knowing:** Raid-Helper ships a ready-made **WoW: Forever** template. Some guild members
may already know its signup post, so matching its familiar shapes costs little and helps.

## How its signup post works

- **Header:** a title, then an info row with the leader, the date and time (a local Discord
  timestamp, optionally also a fixed time zone), a signup counter, and an optional countdown.
  Each element can be hidden.
- **Role counters:** a line of totals per role (for example tanks, healers, dps) under the info
  row.
- **Signups:** grouped by class, in three inline columns, each line showing a spec icon, the
  person's **queue position**, and their name. A stacked layout avoids cut-off names.
- **Status buckets:** Bench, Late, Tentative, and Absence, each shown separately. People over
  the cap appear struck through as queued.
- **Flow:** pick a class, then a spec from a dropdown; optionally add a note. Members switch to
  Absence rather than withdrawing.

## Features at a glance

| Area | Raid-Helper |
|---|---|
| Events | Guided creation, saved profiles, plain-language dates, custom class/spec templates |
| Recurring | Repost every N days (paid) |
| Reminders | Up to three per event to a channel or a target group (e.g. unsigned raiders); personal reminders (paid) |
| Limits | Total cap, lock at limit, overflow to bench or a queue that **auto-promotes and notifies**, minimum headcount that auto-cancels, keep-order rules |
| Loot | Soft-reserves through softres.it, DKP, roll tools |
| Attendance | Reports by date range and tag, percentage "since they joined", CSV export |
| Web | Dashboard, group composition tool, comp announcement with confirm/decline, calendar |
| Integrations | REST API, webhooks, JSON exports read by community WoW addons, Discord scheduled events and threads |
| Permissions | Admin/Manage Server, manager and assistant roles, custom permission groups |

## Ideas to adopt

| # | Idea | Why | Where it lands |
|---|---|---|---|
| 1 | **Queue over the cap, auto-promote, and notify** the promoted person | Fairer than a fixed bench and fits the place-in-line we already keep | raids (`signup-set`, roster) + coordinator |
| 2 | **Lose your place when you drop to tentative/bench** (keep it when only changing character or spec) | Today any change keeps `signedUpAt`; their middle setting is the fairer rule | raids `signup-set` |
| 3 | **A Late button and short reasons** for late/tentative/bench (shown on the post and in the officer digest) | Officers want to know *why*; we already store `note` | coordinator render + gateway buttons (#10) |
| 4 | **Role counter line** ("Tanks 4 · Healers 9 · DPS 25") next to the comp gaps | Quick to read; we already compute it | coordinator render |
| 5 | **Comp confirmation at lock**: rostered people confirm or decline their slot | Closes a real gap in our lock step | coordinator + gateway (#10) |
| 6 | **Run counter in titles** ("MC #12") | Makes recurring nights distinct in the channel | raids schedule naming |
| 7 | **Attendance reports** with a "since they joined" percentage | Loot council needs it | loot / post-raid (#29) |
| 8 | **Webhooks** alongside MCP/CLI | Lets the website and outside tools react to signups | apps/api events bus |
| 9 | **Personal reminder offset** per member | Some people want an earlier nudge | identity prefs + coordinator |
| 10 | **Minimum headcount that warns officers** (not auto-cancel) | Catches a dead night early without surprising anyone | coordinator digest |

Recommended order: 4 and 3 (small, visible), then 1 and 2 together (one place-in-line rule),
then 5 once buttons work. 6–10 fit their phases.

**Adopted (2026-10-25):** 1 (queue and promotion notice), 2 (lose place on stepping down), 3
(Late button and reasons on the post and digest; the reason prompt arrives with buttons), and 4
(role counter line). Jobs J12–J14 in docs/jtbd/raid-night.md cover them.

## Where Vintage is already ahead

- **Signups are characters, not Discord names.** Community addons had to build name → character
  mapping on top of Raid-Helper.
- **The comp line names buff gaps** ("no Mark of the Wild"), not just counts, and suggestions
  are rank-aware (raiders before flex raiders).
- **Reminders ping only non-responders,** found from the guild roster; theirs depend on raider
  roles being configured.
- **One-step addon import string** at lock; theirs is export JSON, then paste into a third-party
  addon.
- **Recurring nights and the full loop are free,** and every action is an AFD command for agents.

## Things to avoid

- **Settings sprawl.** Theirs has roughly 80 advanced settings across server and event levels.
  Ship good defaults and few options.
- **Discord-limit workarounds.** Reaction caps, custom emote slots, and three-column layouts
  that cut names off. Use buttons and selects, plain names, and a stacked layout.
- **DM-dependent flows** (spec choice, reasons) fail quietly when DMs are closed. Use ephemeral
  interaction replies.
- **Loot on a separate site** (softres.it). Keep soft-reserves inside the loot module.
