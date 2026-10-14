// Sets every level's drop budget by playing it with the bot.
//
//   npx tsx tools/calibrate.ts [from] [to] [workers]
//
// For each level the bot first plays with unlimited drops to see how many it
// needs (and whether the level is fair at all), then the budget is set from
// that spread according to the level's role (easy intro, normal, hard, super
// hard, boss) and checked with fresh games, adding drops if the win rate is
// too low. Results go into src/game/levels-data.json and a report in
// tools/out/calibration.csv.
import { spawn } from "node:child_process";
import fs from "node:fs";

const DATA = new URL("../src/game/levels-data.json", import.meta.url);
const OUT_DIR = new URL("./out/", import.meta.url);

interface Row { id: number; drops: number; winInf: number; win: number; used: number; stars: number; note: string }

if (process.env.CAL_WORKER) await worker();
else await master();

async function master(): Promise<void> {
  const levels = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const from = Number(process.argv[2] ?? 1);
  const to = Number(process.argv[3] ?? levels.length);
  const workers = Number(process.argv[4] ?? 4);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ids: number[] = [];
  for (let id = from; id <= to; id++) ids.push(id);
  // Spread hard and easy levels evenly between workers.
  const shards = Array.from({ length: workers }, (_, k) => ids.filter((_, i) => i % workers === k));
  const started = Date.now();
  const results = await Promise.all(shards.map((shard, k) => new Promise<Row[]>((resolve, reject) => {
    const file = new URL(`shard-${k}.json`, OUT_DIR);
    const child = spawn(process.execPath, ["--import", "tsx", new URL(import.meta.url).pathname], {
      env: { ...process.env, CAL_WORKER: "1", CAL_IDS: shard.join(","), CAL_OUT: file.pathname },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(fs.readFileSync(file, "utf8"))) : reject(new Error(`worker ${k} failed`))));
  })));
  const rows = results.flat().sort((a, b) => a.id - b.id);
  // Re-read in case the levels changed while we ran; only drops are written.
  const fresh = JSON.parse(fs.readFileSync(DATA, "utf8"));
  for (const r of rows) fresh[r.id - 1].drops = r.drops;
  fs.writeFileSync(DATA, "[\n" + fresh.map((l: unknown) => JSON.stringify(l)).join(",\n") + "\n]\n");
  const csvFile = new URL("calibration.csv", OUT_DIR);
  const old: Record<number, string> = {};
  if (fs.existsSync(csvFile)) {
    for (const line of fs.readFileSync(csvFile, "utf8").split("\n").slice(1)) if (line) old[Number(line.split(",")[0])] = line;
  }
  for (const r of rows) old[r.id] = [r.id, r.drops, r.winInf, r.win, r.used, r.stars, r.note].join(",");
  fs.writeFileSync(csvFile, "id,drops,winInf,win,used,stars,note\n" + Object.keys(old).map(Number).sort((a, b) => a - b).map((k) => old[k]).join("\n") + "\n");
  const bad = rows.filter((r) => r.note);
  console.log(`calibrated ${rows.length} levels in ${Math.round((Date.now() - started) / 1000)} s; flagged: ${bad.map((r) => `${r.id}(${r.note})`).join(" ") || "none"}`);
}

async function worker(): Promise<void> {
  const { L, play } = await import("./headless");
  const { LEVELS_PER_CHAPTER } = await import("../src/game/chapters");
  const levels = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const ids = process.env.CAL_IDS!.split(",").filter(Boolean).map(Number);
  const rows: Row[] = [];
  const quantile = (a: number[], p: number) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(Math.floor(p * s.length), s.length - 1)];
  };
  for (const id of ids) {
    const def = levels[id - 1];
    const level = { ...def, id, chapter: L.chapterOf(id) };
    const d = (id - 1) / 499;
    const i = (id - 1) % LEVELS_PER_CHAPTER;
    const early = id <= 40;
    const role = def.tag ?? (def.intro || i <= 2 ? "easy" : "normal");
    // Quantile of the bot's drop use to budget for, extra slack, and the win rate to reach.
    const plan = {
      easy: [0.9, 1.35, 0.9],
      normal: [early ? 0.9 : 0.8, early ? 1.25 : 1.16 - 0.08 * d, early ? 0.85 : 0.72 - 0.12 * d],
      hard: [0.7, 1.06, 0.5],
      super: [0.55, 1.0, 0.35],
      boss: [0.65, 1.06, 0.45],
    }[role as "easy"]!;
    const used: number[] = [];
    let wins = 0;
    const N = 8;
    for (let k = 0; k < N; k++) {
      const r = await play({ ...level, drops: 400 }, 0.85);
      if (r.won) {
        wins++;
        used.push(r.dropsUsed);
      }
    }
    let note = "";
    const winInf = wins / N;
    if (wins < 3) {
      note = "unfair";
      rows.push({ id, drops: 160, winInf, win: 0, used: 0, stars: 0, note });
      console.log(`  ${id}: UNFAIR (${wins}/${N} with unlimited drops) ${def.layout}`);
      continue;
    }
    // A few unlucky bot games shouldn't make a level a walkover: cap at about twice the median.
    const capped = Math.min(quantile(used, plan[0]) * plan[1], quantile(used, 0.5) * 2 + 6);
    let drops = Math.max(10, Math.min(Math.ceil(capped), 180));
    let win = 0, stars = 0;
    for (let round = 0; round < 3; round++) {
      let w = 0, st = 0;
      const V = 6;
      for (let k = 0; k < V; k++) {
        const r = await play({ ...level, drops }, 0.85);
        if (r.won) {
          w++;
          st += r.stars;
        }
      }
      win = w / V;
      stars = w ? st / w : 0;
      if (win >= plan[2] || round === 2) break;
      drops = Math.min(Math.ceil(drops * 1.15) + 1, 200);
    }
    if (win < plan[2] - 0.2) note = "hard-to-win";
    if (drops > 150) note = note || "long";
    const med = quantile(used, 0.5);
    rows.push({ id, drops, winInf, win: Math.round(win * 100) / 100, used: med, stars: Math.round(stars * 10) / 10, note });
    console.log(`  ${String(id).padStart(3)} ${role.padEnd(6)} drops ${String(drops).padStart(3)}  bot needs ~${med}  win ${Math.round(win * 100)}%  ${def.layout}`);
  }
  fs.writeFileSync(process.env.CAL_OUT!, JSON.stringify(rows));
}
