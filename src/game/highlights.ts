// A hand-picked tour of the most interesting Adventure levels. Shown in the
// web build and in test builds (no real ad ids) so they can be tried without
// playing through; store builds keep normal progression (see SHOW_HIGHLIGHTS
// in ui/adventure-screens.ts). tools/verify-puzzles.ts checks the puzzle names.

export interface Highlight { id: number; name: string; blurb: string }

export const HIGHLIGHTS: Highlight[] = [
  { id: 171, name: "Puzzle: Bank Shot", blurb: "A roof hides the twin. Roll a planet down the ramp to reach it." },
  { id: 89, name: "Puzzle: Keyhole", blurb: "Only one planet fits through the hole in the box. Park the big ones first." },
  { id: 131, name: "Puzzle: Missing Step", blurb: "A staircase with a gap. Fill it, then set off the chain." },
  { id: 264, name: "Puzzle: Ice Cage", blurb: "Crack the frozen lid and it drops onto the marked planet." },
  { id: 175, name: "Puzzle: Last In, First Out", blurb: "Stacked marked planets and pieces in the wrong order. Park wisely." },
  { id: 132, name: "Puzzle: Twin Thaw", blurb: "Free two frozen twins so they meet in the funnel." },
  { id: 120, name: "Puzzle: Small Steps", blurb: "Roll two halves into the little room and merge them inside." },
  { id: 161, name: "Jelly Nebula", blurb: "Free play: everything bounces." },
  { id: 201, name: "Solar Wind", blurb: "Free play: the wind shoves planets from side to side." },
  { id: 221, name: "Ring World", blurb: "Free play: spinning bars bat planets around." },
  { id: 241, name: "Gravity Wells", blurb: "Free play: swirling wells hold planets in mid-air." },
  { id: 500, name: "Make the Sun", blurb: "The finale: build a tower of giants into the Sun." },
];
