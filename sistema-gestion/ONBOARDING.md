# Welcome to Transportes Pucarani

## How We Use Claude

Based on etianxvx's usage over the last 30 days (10 sessions):

Work Type Breakdown:
```
  Debug Fix         ████████░░░░░░░░░░░░  40%
  Plan Design       ████████░░░░░░░░░░░░  40%
  Build Feature     ██░░░░░░░░░░░░░░░░░░  10%
  Improve Quality   ██░░░░░░░░░░░░░░░░░░  10%
```

Top Skills & Commands:
```
  /model            ████████████████████  17x/month
  /effort           ████░░░░░░░░░░░░░░░░   3x/month
  /graphify         ██░░░░░░░░░░░░░░░░░░   2x/month
  /login            █░░░░░░░░░░░░░░░░░░░   1x/month
```

Top MCP Servers:
```
  Claude_Preview    ████████████████████  170 calls
  Claude_Browser    █████████░░░░░░░░░░░   75 calls
  visualize         █░░░░░░░░░░░░░░░░░░░    5 calls
  claude-in-chrome  █░░░░░░░░░░░░░░░░░░░    2 calls
  ccd_session       █░░░░░░░░░░░░░░░░░░░    2 calls
```

## Your Setup Checklist

### Codebases
- [ ] PucaraniWeb — https://github.com/tekaEX/PucaraniWeb

  One repo, two very different halves. The root is the static marketing site
  (plain HTML + Bootstrap, no build step, deployed to GitHub Pages). Inside it,
  `sistema-gestion/` is the real application: Next.js 16 + Supabase, deployed to
  Vercel. Most Claude sessions happen in `sistema-gestion/`.

### MCP Servers to Activate
- [ ] **Claude_Preview** — by far the most-used server (170 calls). Used for
  previewing rendered output while iterating on UI. Ask etianxvx for the setup
  config.
- [ ] **Claude_Browser** — browser automation and page inspection (75 calls).
  Useful for checking the deployed Vercel app end to end. Ask etianxvx for the
  setup config.
- [ ] **visualize** — generating diagrams and charts (5 calls). Low usage;
  activate when you need it, not on day one.
- [ ] **claude-in-chrome** — drives your own Chrome session to click through
  pages, read console logs, and take screenshots. Install the Claude in Chrome
  extension and grant it site permissions.
- [ ] **ccd_session** — session tooling, light usage (2 calls). Optional.

### Skills to Know About
- [ ] **/graphify** — turns the codebase into a persistent knowledge graph you
  can query, so you can ask "where does X live?" and "what depends on Y?"
  instead of grepping. Output lands in `graphify-out/`. Installed as a global
  skill at `~/.claude/skills/graphify/`. Worth running once when you join, since
  40% of sessions here are about understanding the code rather than changing it.
- [ ] **/model** — the most-used command by a wide margin (17x/month). Switch
  models per task: heavier for debugging and design, lighter for mechanical
  edits.
- [ ] **/effort** — dials reasoning effort up or down. Pairs with `/model` when
  a problem turns out to be harder than it looked.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
