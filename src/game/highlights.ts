// A hand-picked tour of the most interesting Adventure levels. Shown in the
// web build and in test builds (no real ad ids) so they can be tried without
// playing through; store builds keep normal progression.

import { isNative } from "../core/platform";
import { USING_TEST_ADS } from "../monetization/config";

export interface Highlight { id: number; name: string; blurb: string }

export const HIGHLIGHTS: Highlight[] = [
  { id: 154, name: "Puzzle: Bank Shot", blurb: "A roof hides the twin. Roll a planet down the ramp to reach it." },
  { id: 156, name: "Puzzle: Tunnel Run", blurb: "The twin waits inside a covered tunnel. Only a rolling planet gets in." },
  { id: 152, name: "Puzzle: Ice Cage", blurb: "Crack the frozen lid and it drops onto the marked planet." },
  { id: 190, name: "Puzzle: Sorting Machine", blurb: "Two bins, two marked planets. Send each arrival to the right bin." },
  { id: 252, name: "Puzzle: Twin Thaw", blurb: "Free two frozen twins so they meet in the funnel." },
  { id: 442, name: "Puzzle: Last In, First Out", blurb: "Stacked marked planets and pieces in the wrong order. Park wisely." },
  { id: 57, name: "Plinko", blurb: "Bounce planets through a field of pegs." },
  { id: 104, name: "Frozen Shelf", blurb: "A shelf of frozen planets over a giant boulder." },
  { id: 120, name: "Ice Bowl", blurb: "Boss: a bowl of rocks under hanging ice. Set off a chain!" },
  { id: 180, name: "Jelly Boss", blurb: "Boss: everything bounces. Make two Neptunes." },
  { id: 197, name: "Ice Rink", blurb: "Slippery planets slide all over a shelf of ice." },
  { id: 220, name: "Solar Gale", blurb: "Boss: the wind shoves planets while you chase stardust." },
  { id: 260, name: "Twin Wells", blurb: "Boss: two gravity wells and a field of pegs." },
  { id: 297, name: "Domino Drop", blurb: "A staircase built for a x4 chain, under a low ceiling." },
  { id: 314, name: "Bouncy Fog", blurb: "Jelly bounce, step walls, and you can't see what's next." },
  { id: 405, name: "Greased Gears", blurb: "Heavy, slippery planets and two spinning bars." },
  { id: 437, name: "Moon Wells", blurb: "Low gravity and two wells: planets float everywhere." },
  { id: 460, name: "Nova Factory", blurb: "Boss: bouncy walls, a spinner and a staircase." },
  { id: 492, name: "Spin Cycle", blurb: "Spinners guard two frozen Earths." },
  { id: 500, name: "Make the Sun", blurb: "The finale: one Neptune sets off a tower of giants." },
];

/** Whether the Highlights shortcut is offered (web and test builds only). */
export const SHOW_HIGHLIGHTS = !isNative || USING_TEST_ADS;
