import { FASTElement, html } from '@lushly-dev/fast-element';
import { LEGAL_UPDATED } from '../content/legal';
import { pageStyles } from './page-styles';

// A plain statement of what the site actually collects (checked against the identity, raids,
// polls, and coordinator modules and @vintage/web-session). Keep it true when a module starts
// storing something new.
const template = html<Page>`
  <article class="page">
    <header>
      <h1>Privacy</h1>
      <p class="lead">What this site keeps about you, why, and how to have it removed. Updated
        ${LEGAL_UPDATED}.</p>
    </header>

    <section aria-labelledby="who">
      <h2 id="who">Who we are</h2>
      <p>Vintage is a volunteer-run guild on World of Warcraft: Forever. This site and its Discord
        bot are run by the guild's officers for the guild. We are not a company and we don't sell
        anything.</p>
    </section>

    <section aria-labelledby="what">
      <h2 id="what">What we keep</h2>
      <p>Only if you sign in with Discord or are a member of our Discord server:</p>
      <ul>
        <li><b>Your Discord identity:</b> your Discord user id, display name, and avatar, and your
          rank in our server (which decides what you can see and do here).</li>
        <li><b>Your characters:</b> names, classes, specs, and which one is your main.</li>
        <li><b>Raid signups:</b> your answer for each raid, any note you add, and the roster
          decisions officers make (group, bench, queue).</li>
        <li><b>Poll votes:</b> your ballot in guild polls.</li>
        <li><b>Preferences:</b> your time zone and whether the bot may send you reminder DMs.</li>
        <li><b>Sign-in sessions:</b> a session record for each sign-in, which can include the IP
          address and browser it came from, kept so we can sign you out and spot misuse.</li>
        <li><b>The bot's log:</b> which reminders and posts it sent and to whom.</li>
      </ul>
      <p>Sign-in asks Discord only for your basic identity (the <code>identify</code> scope). We
        never see your Discord password or email address.</p>
    </section>

    <section aria-labelledby="browser">
      <h2 id="browser">What's stored in your browser</h2>
      <p>Your sign-in session and, if you change it, your theme choice. There are no advertising
        or analytics cookies and no third-party trackers on this site.</p>
    </section>

    <section aria-labelledby="where">
      <h2 id="where">Who processes it</h2>
      <p>The data lives with <a href="https://www.convex.dev" rel="noopener">Convex</a> (our
        database and server), the site is served by
        <a href="https://vercel.com" rel="noopener">Vercel</a>, and sign-in, posts, and DMs go
        through <a href="https://discord.com" rel="noopener">Discord</a>. Each handles it under
        its own privacy policy; these services may store it outside your country.</p>
    </section>

    <section aria-labelledby="use">
      <h2 id="use">How we use it</h2>
      <p>To run the guild: show the roster and calendar, take signups, build raid comps, remind
        people who haven't answered, count votes, and record loot and progress. Members see what
        their rank allows; officers see more so they can run raids. We don't sell or share it
        with anyone else.</p>
    </section>

    <section aria-labelledby="rights">
      <h2 id="rights">Keeping, seeing, and removing it</h2>
      <p>We keep it while you're in the guild. If you leave, or at any time, you can ask an
        officer in our Discord to show you what we hold, correct it, or delete it, and we will.
        The same goes for turning off reminder DMs or removing a character; doing these yourself
        on the site is coming.</p>
    </section>

    <section aria-labelledby="kids">
      <h2 id="kids">Age</h2>
      <p>You need a Discord account to sign in, so you must meet Discord's minimum age in your
        country.</p>
    </section>

    <section aria-labelledby="changes">
      <h2 id="changes">Changes</h2>
      <p>If we start keeping something new, we'll update this page and say so in Discord.</p>
    </section>
  </article>
`;

/** `/privacy`: what the site keeps, why, and how to have it removed. */
export class Page extends FASTElement {}
await Page.define({ name: 'vintage-privacy-page', template, styles: pageStyles });
