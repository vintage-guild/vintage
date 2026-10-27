# Guild agent

Jobs for Random's answers in Discord (epic #126): asking in plain words, confirming a change the
agent prepared, officers seeing the notes that need them, and help that fits your rank (#155).
The automated scenarios run every command, tier, tool, and Discord render for real; only the
OpenAI turn is stood in for (the test calls the same registry tools the agent would). The live
checklist runs the real turn.

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

### J30 · Get a private note on what the log says I could do better

When we've raided and someone has the log, I want a short private note on one or two things I
could do better, with the evidence, so I can improve without being singled out in the guild.

Live checklist:

- [ ] A raider imports the night's Farsight summary (`run-import` with the `farsight.run` upload);
      importing it again does nothing.
- [ ] `insights-get` shows me only my findings, each with its times or counts; an officer sees
      everyone's.
- [ ] With `insights-optin-set dms:true`, an officer's `insights-send` previews me as a recipient,
      and after Confirm I get one DM; without the opt-in I get none.

### J31 · Find out what I can do, for my rank

When I can't remember Random's commands, I want help inside Discord that shows what my rank can
do, with examples, so I can get on with it without asking an officer.

Live checklist:

- [ ] As a raider, `/random help` answers privately: polls, ask, signups, and recruiting I can
      use, and one line saying raid leaders and officers can make events.
- [ ] As a raider, `/random event help` says my rank can't use these yet and who can.
- [ ] As a raid leader, `/random help topic:Events` lists `/random event create` and
      `pick-night` with their options (kind, role counts) and examples, on one screen.
- [ ] `/random poll help` links the website's polls page (with `VINTAGE_SITE_URL` set).
- [ ] From an account Random hasn't synced yet, `/random help` starts with the role-sync note
      and shows only what anyone can do.
- [ ] `/random ask question: how do I make a dungeon run?` answers with the command to type, from
      the same page.
