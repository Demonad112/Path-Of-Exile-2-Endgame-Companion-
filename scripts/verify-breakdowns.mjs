// Verify that poe.ninja's stat-breakdown array still means what breakdowns.ts
// says it means.
//
// The index -> stat mapping in src/lib/characterImport/breakdowns.ts was
// derived empirically: for each index, the set of DefensiveStats keys whose
// value equalled that entry's total, intersected across a corpus of live
// characters. Nothing in the payload labels those indices, so if poe.ninja
// ever inserts or reorders a stat, the mapping silently starts attributing
// (say) evasion to armour — the kind of wrong that looks perfectly plausible
// on screen.
//
// This script re-derives the mapping from live data and fails if it disagrees
// with what the module declares. Run it after a PoE2 patch, alongside
// extract-mod-tiers.py.
//
//   node scripts/verify-breakdowns.mjs [--league runesofaldur] [--sample 40]
//
// Exit codes: 0 verified, 1 mapping disagreement or invariant broken,
// 2 could not gather enough data to judge (network, dead proxy) — which is
// explicitly NOT treated as a pass.

import { readFileSync } from "node:fs";

const PROXY =
  process.env.NINJA_PROXY_BASE ?? "https://poe2-endgame-ninja-proxy.vercel.app";
const NINJA = "https://poe.ninja";
const MODULE_PATH = "src/lib/characterImport/breakdowns.ts";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const LEAGUE = argOf("league", "runesofaldur");
const SAMPLE = Number(argOf("sample", "40"));
const MIN_CHARACTERS = 12;

const CLASSES = [
  "Deadeye", "Titan", "Infernalist", "Stormweaver", "Invoker",
  "Gemling Legionnaire", "Chronomancer", "Warbringer", "Pathfinder",
  "Blood Mage", "Acolyte of Chayula", "Witchhunter",
];

// --- the claim under test ---------------------------------------------------

/** Parse STAT_BY_INDEX out of the module, so the two cannot drift apart. */
function declaredMapping() {
  const src = readFileSync(MODULE_PATH, "utf8");
  const block = /const STAT_BY_INDEX: Record<number, AttributableStat> = \{([^}]*)\}/s.exec(src);
  if (!block) {
    console.error(`Could not find STAT_BY_INDEX in ${MODULE_PATH}.`);
    process.exit(1);
  }
  const map = {};
  for (const [, index, stat] of block[1].matchAll(/(\d+)\s*:\s*"([^"]+)"/g)) {
    map[Number(index)] = stat;
  }
  return map;
}

// --- schema-less protobuf (same decoder the ladder endpoint uses) -----------

function readVarint(buf, i) {
  let v = 0, shift = 0;
  while (i < buf.length) {
    const b = buf[i];
    v += (b & 0x7f) * Math.pow(2, shift);
    i += 1;
    if (!(b & 0x80)) return [v, i];
    shift += 7;
    if (shift > 56) return [null, i];
  }
  return [null, i];
}

function parseMessage(buf, depth = 0, maxDepth = 10) {
  const out = [];
  let i = 0;
  const n = buf.length;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (i < n) {
    const [tag, ni] = readVarint(buf, i);
    i = ni;
    if (tag === null || tag === 0) return null;
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (field === 0 || field > 4000) return null;
    if (wire === 0) {
      const [v, nj] = readVarint(buf, i);
      i = nj;
      if (v === null) return null;
      out.push([field, "int", v]);
    } else if (wire === 1) {
      if (i + 8 > n) return null;
      out.push([field, "f64", view.getFloat64(i, true)]);
      i += 8;
    } else if (wire === 2) {
      const [len, nj] = readVarint(buf, i);
      i = nj;
      if (len === null || i + len > n) return null;
      const chunk = buf.subarray(i, i + len);
      i += len;
      const sub = depth < maxDepth && chunk.length > 1 ? parseMessage(chunk, depth + 1, maxDepth) : null;
      if (sub !== null) out.push([field, "msg", sub]);
      else {
        try {
          out.push([field, "str", new TextDecoder("utf-8", { fatal: true }).decode(chunk)]);
        } catch {
          out.push([field, "bytes", chunk]);
        }
      }
    } else if (wire === 5) {
      if (i + 4 > n) return null;
      out.push([field, "f32", view.getFloat32(i, true)]);
      i += 4;
    } else return null;
  }
  return out;
}

function decodeSearchResponse(bytes) {
  const msg = parseMessage(bytes);
  if (!msg || msg[0]?.[1] !== "msg") throw new Error("unrecognised search response shape");
  const env = msg[0][2];
  const columns = {};
  const order = [];
  for (const [f, kind, value] of env) {
    if (f !== 5 || kind !== "msg") continue;
    let colName = value.find(([ff, kk]) => ff === 1 && kk === "str")?.[2];
    if (!colName) continue;
    if (colName in columns) colName = `${colName}_2`;
    const cells = [];
    for (const [ff, kk, cell] of value) {
      if (ff !== 2) continue;
      if (kk === "msg") {
        const display = cell.find(([g, w]) => g === 1 && w === "str")?.[2];
        const number = cell.find(([g, w]) => g === 2 && w === "int")?.[2];
        cells.push(display !== undefined ? display : (number ?? null));
      } else cells.push(kk === "str" ? cell : null);
    }
    columns[colName] = cells;
    order.push(colName);
  }
  const rowCount = Math.max(0, ...order.map((c) => columns[c].length));
  const rows = [];
  for (let idx = 0; idx < rowCount; idx += 1) {
    const row = {};
    for (const name of order) row[name] = columns[name][idx] ?? null;
    rows.push(row);
  }
  return rows;
}

// --- gather ----------------------------------------------------------------

async function gatherCharacters() {
  const index = await (await fetch(`${NINJA}/poe2/api/data/index-state`)).json();
  const snapshot = (index.snapshotVersions ?? []).find((s) => s.url === LEAGUE);
  if (!snapshot) throw new Error(`no ladder snapshot for league "${LEAGUE}"`);

  const perClass = Math.max(1, Math.ceil(SAMPLE / CLASSES.length));
  const candidates = [];
  for (const cls of CLASSES) {
    try {
      const res = await fetch(
        `${NINJA}/poe2/api/builds/${snapshot.version}/search?overview=${snapshot.snapshotName}&class=${encodeURIComponent(cls)}`
      );
      if (!res.ok) continue;
      candidates.push(...decodeSearchResponse(new Uint8Array(await res.arrayBuffer())).slice(0, perClass));
    } catch {
      // one dead class shouldn't sink the run
    }
  }

  const models = await Promise.all(
    candidates.map(async (row) => {
      try {
        const res = await fetch(
          `${PROXY}/api/character?account=${encodeURIComponent(row.account)}&league=${encodeURIComponent(LEAGUE)}&character=${encodeURIComponent(row.name)}`
        );
        if (!res.ok) return null;
        const model = (await res.json())?.charModel;
        return model?.breakdowns?.stats && model?.defensiveStats ? model : null;
      } catch {
        return null;
      }
    })
  );
  return models.filter(Boolean);
}

// --- verify ----------------------------------------------------------------

function verify(models, declared) {
  const problems = [];

  // 1. The invariants attribution depends on: the modifier list must fully
  //    explain the base and the increase it is attached to.
  let checked = 0, flatBroken = 0, incBroken = 0;
  for (const model of models) {
    for (const entry of Object.values(model.breakdowns.stats)) {
      if (!Array.isArray(entry?.mods)) continue;
      checked += 1;
      const flat = entry.mods.filter((m) => m[0] === 0).reduce((a, m) => a + m[1], 0);
      const inc = entry.mods.filter((m) => m[0] === 1).reduce((a, m) => a + m[1], 0);
      if (Math.abs(flat - entry.base) > 1) flatBroken += 1;
      if (Math.abs(inc - entry.inc) > 1) incBroken += 1;
    }
  }
  if (flatBroken > 0) problems.push(`sum(flat mods) != base on ${flatBroken}/${checked} entries`);
  if (incBroken > 0) problems.push(`sum(increased mods) != inc on ${incBroken}/${checked} entries`);

  // 2. Each declared index must still agree with the character sheet.
  //    chaosResistance is allowed to diverge on Chaos Inoculation characters,
  //    where the sheet reports immunity (100) over a breakdown that sums to
  //    the raw gear value.
  const results = [];
  for (const [index, stat] of Object.entries(declared)) {
    let hits = 0, total = 0, excused = 0;
    const misses = [];
    for (const model of models) {
      const entry = model.breakdowns.stats[index];
      if (!entry) continue;
      total += 1;
      if (entry.total === model.defensiveStats[stat]) hits += 1;
      else if (stat === "chaosResistance" && model.defensiveStats.chaosResistance === 100) excused += 1;
      else misses.push(`${model.name}: breakdown ${entry.total} vs sheet ${model.defensiveStats[stat]}`);
    }
    results.push({ index, stat, hits, total, excused, misses });
    if (total === 0) {
      problems.push(`index ${index} (${stat}) absent from every sampled character`);
    } else if (misses.length > 0) {
      problems.push(
        `index ${index} claims "${stat}" but disagrees with the sheet on ${misses.length}/${total}: ${misses.slice(0, 3).join("; ")}`
      );
    }
  }
  return { problems, results, checked };
}

// --- main ------------------------------------------------------------------

const declared = declaredMapping();
console.log(`Declared mapping: ${Object.keys(declared).length} indices from ${MODULE_PATH}`);

let models;
try {
  models = await gatherCharacters();
} catch (err) {
  console.error(`Could not gather characters: ${err}`);
  process.exit(2);
}

if (models.length < MIN_CHARACTERS) {
  console.error(
    `Only ${models.length} characters with breakdowns (need ${MIN_CHARACTERS}). Not enough to judge — treating as inconclusive, not as a pass.`
  );
  process.exit(2);
}

const { problems, results, checked } = verify(models, declared);

console.log(`Sampled ${models.length} characters, ${checked} stat entries.\n`);
for (const r of results) {
  const note = r.excused > 0 ? `  (${r.excused} excused: chaos immunity)` : "";
  console.log(`  ${r.misses.length === 0 ? "ok  " : "FAIL"} [${String(r.index).padStart(2)}] ${r.stat.padEnd(22)} ${r.hits}/${r.total}${note}`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nThe mapping in breakdowns.ts no longer matches live data. Re-derive it before shipping — attribution built on a stale mapping is confidently wrong."
  );
  process.exit(1);
}

console.log("\nVerified: every declared index still agrees with the character sheet.");
