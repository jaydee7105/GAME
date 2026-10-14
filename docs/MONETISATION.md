# How Planet Drop makes money

Planet Drop copies the model that took **Block Blast!** (Hungry Studio) to
tens of millions of daily players: **ads only, used sparingly, at natural
breaks**. No purchases, no currency, no energy timers, no paywalled levels.

## What Block Blast does

From public breakdowns of the game and its studio:

- **Revenue is almost entirely in-app advertising.** There is no "remove ads"
  purchase and no in-game currency to sell. Free, complete game; ads fund it.
- **Banner at the bottom during play.** Always-on, out of the way of the board.
- **Interstitials only at natural breaks:** after a game over or a finished
  level, never mid-move, and not after every game (roughly every 2-3 games,
  with a grace period for brand-new players).
- **One rewarded placement: the revive.** When you run out of space you can
  watch a video for a second chance, once per run. Opt-in, never forced, and
  the moment of highest motivation, so it converts well.
- **Ads need a connection.** Offline, the game simply plays ad-free.
- **"Fair" piece generation.** The game looks at the board and favours pieces
  that fit, so runs feel winnable and players keep playing (more sessions =
  more ad breaks, without feeling greedy).
- **Two modes**: endless Classic for high scores and an Adventure with
  levels, so there are many natural breaks and reasons to return.
- **Mediation** (AdMob plus bidding networks) and constant A/B testing of
  frequency and placement.

## How Planet Drop implements it

All placements live in `src/monetization/` and the pacing numbers are in one
place, `src/monetization/config.ts`:

| Placement | When | Rules |
|---|---|---|
| Banner (adaptive, bottom) | During play | From the 2nd run on; hidden on menus; the jar and HUD are laid out above it |
| Interstitial | After a run or level, before the next screen | Not in the first 3 runs; then at most every 2nd finished run and at least 100 s apart |
| Rewarded "Keep going?" | Jar overflow or out of drops | Once per run; overflow clears the top of the jar, out-of-drops gives +5 drops; 6 s countdown, "No thanks" always available |
| Rewarded "Hint" | Puzzle levels, any time or after failing | Shows where to drop every planet for the rest of your attempts at that puzzle; a hinted solve earns 1 star instead of 3 |

Other pieces of the model:

- **Fair drops** (`World.roll`): planets already exposed at the top of the
  pile are a little more likely to be handed out. The Daily Challenge stays
  identical for everyone.
- **Adventure**: 500 levels in 25 chapters with goals and limited drops (`src/game/levels-data.json`),
  balanced with a bot simulator (`tools/sim.ts`) so early levels almost always
  win and later chapters and bosses get tougher.
- **Retention**: achievements with cosmetic jar styles, daily streaks, an
  opt-in daily reminder, share button, and a rare Play review prompt after a
  new best.
- **Consent**: Google's UMP consent form runs before any ad request
  (GDPR/UK/US states), and *Settings > Ad privacy choices* appears where the
  law requires it.
- **Offline**: no ads are requested and nothing breaks.
- **Web build**: no real ads; the revive plays a short labelled "AD BREAK"
  stand-in so the flow can be tested.

## Tuning

Change `PACING` in `src/monetization/config.ts` (grace runs, runs between
interstitials, minimum seconds, revives per run). Watch AdMob's eCPM and the
Play Console's retention numbers together: more interstitials raise revenue
per session but lower sessions per player.

## Sources

- [How could Block Blast earn more? Monetization and gameplay deconstruction (Balancy)](https://balancy.co/blog/2025/03/26/how-could-block-blast-by-hungry-studio-earn-more-monetization-and-gameplay-deconstruction/)
- [The biggest ad-monetized game on mobile (Felix Braberg)](https://felixbraberg.substack.com/p/the-biggest-ad-monetized-game-on)
- [Block Blast: the largest IAA revenue game in the world (Gamigion)](https://www.gamigion.com/block-blast-the-largest-iaa-revenue-game-in-the-world/)
- [The Block Blast playbook: what $127M in ad revenue bought (AppLixir)](https://www.applixir.com/blog/the-block-blast-playbook-what-127m-in-ad-revenue-actually-bought/)
- [Block Blast statistics (Udonis)](https://www.blog.udonis.co/statistics/block-blast)
- [Hungry Studio boosts ARPDAU with Digital Turbine (mediation case study)](https://www.casestudies.com/company/DigitalTurbine/case-study/hungry-studio-boosts-arpdau-8-in-30-days-with-digital-turbine)
- [Hungry Studio and PubMatic OpenWrap (bidding case study)](https://pubmatic.com/case-studies/hungry-studio-accesses-unique-brand-demand-with-pubmatic-openwrap-sdk)
- [Why does Block Blast produce bad blocks? (piece generation)](https://playgama.com/blog/game-faqs/why-does-block-blast-produce-bad-blocks/)
- [AdMob: interstitial ad guidance](https://support.google.com/admob/answer/6066980)
