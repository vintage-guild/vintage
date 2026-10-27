# Guild agent

Jobs for Random's answers in Discord (epic #126): asking in plain words, confirming a change the
agent prepared, and officers seeing the notes that need them. The automated scenarios run every
command, tier, tool, and Discord render for real; only the OpenAI turn is stood in for (the test
calls the same registry tools the agent would). The live checklist runs the real turn.

## Live setup

- The local backend (`pnpm --filter @vintage/api dev:local:watch`) with `OPENAI_API_KEY`,
  `VINTAGE_CONFIRM_SECRET`, and `DISCORD_GUILD_ID` (the test server) in its environment, and the
  gateway pointed at it. Register the slash command on the test server after a change to it:
  `pnpm --filter @vintage/gateway register-commands` with `DISCORD_GUILD_ID` set to the test server.
- A raider and an officer on the test server, synced (`member-sync`), and one open raid.

### J25 · Ask Random about the guild, privately

When I want to know something about raids, signups, the roster, or recruiting, I want to ask
Random in plain words and get a private answer, so I can stop digging through channels.

Live checklist:

- [ ] `/random ask question: when is the next raid and am I signed up?` shows "Random is thinking"
      to me only, then the answer with the raid's time in my time zone.
- [ ] `/random ask question: tell me a joke` answers at once that it only helps with guild things.
- [ ] As a raider, `/random ask question: bench <someone>` answers that it needs a raid leader.
- [ ] After the daily limit (`agent-config-set memberDailyAsks 1`), the next ask is refused at once
      with when the limit resets.

### J26 · Confirm a change Random prepared for me

When I ask Random to change something of mine, I want to see exactly what will change and press
Confirm, so nothing happens behind my back.

Live checklist:

- [ ] `/random ask question: mark me tentative for <raid>` answers with **Change 1** and Confirm and
      Drop buttons; my signup has not changed yet.
- [ ] Confirm updates the reply to "Done." and the signup post shows me tentative.
- [ ] Asking again and pressing Drop changes nothing and says so.

### J27 · See the signup notes that need an officer

When members leave notes on their signups, I want the ones that ask me for something lifted to
the top of the officer digest, so I can answer them before raid night.

Live checklist:

- [ ] With notes like "can I bring my alt?" and "late 20 min", the digest at the last reminder
      shows **Needs an officer** with the alt question and keeps "late" in the Late line.
- [ ] With `agent-pause`, the next digest shows every note raw, as before.
