// Ad setup and pacing, modelled on Block Blast's approach:
//   * ads are the whole business model - no paywalls, no currency to buy
//   * a banner at the bottom while playing
//   * interstitials only at natural breaks (after a finished run or level),
//     never mid-game, and never during a new player's first few games
//   * exactly one rewarded placement: a revive when you are about to lose,
//     at most once per run
//   * nothing is shown offline
// Every number here is meant to be tuned with real data (A/B tests).

/** Google's official AdMob test IDs. Real IDs come from the build environment. */
const TEST = {
  banner: "ca-app-pub-3940256099942544/9214589741",
  interstitial: "ca-app-pub-3940256099942544/1033173712",
  rewarded: "ca-app-pub-3940256099942544/5224354917",
};

const env = import.meta.env;

export const AD_UNITS = {
  banner: env.VITE_ADMOB_BANNER_ID || TEST.banner,
  interstitial: env.VITE_ADMOB_INTERSTITIAL_ID || TEST.interstitial,
  rewarded: env.VITE_ADMOB_REWARDED_ID || TEST.rewarded,
};

/** True while the build still uses Google's test ads (safe to tap, earns nothing). */
export const USING_TEST_ADS = !env.VITE_ADMOB_BANNER_ID;

export const PACING = {
  /** Finished runs before the first interstitial ever appears. */
  graceRuns: 3,
  /** Show an interstitial after at most every Nth finished run or level. */
  runsBetween: 2,
  /** ...and never closer together than this. */
  minSecondsBetween: 100,
  /** Runs a player finishes before the gameplay banner appears. */
  bannerAfterRuns: 1,
  /** Rewarded revives allowed per run (Block Blast: one). */
  revivesPerRun: 1,
  /** Seconds the revive offer stays up before it counts as "no thanks". */
  reviveCountdown: 6,
};

/** Space kept free at the bottom of the screen for the banner (CSS px / dp). */
export const BANNER_RESERVE = 62;
