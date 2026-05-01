// Test runner — no jest, no vitest. Just a tiny harness that imports the
// parser and serializer (compiled to JS via tsc-on-the-fly using esbuild).
// Run with `npm test`.

import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

let passed = 0;
let failed = 0;

function eq(label, a, b) {
  const sa = JSON.stringify(a, null, 2);
  const sb = JSON.stringify(b, null, 2);
  if (sa === sb) {
    console.log(`  PASS  ${label}`);
    passed++;
    return true;
  }
  console.log(`  FAIL  ${label}`);
  console.log("  --- expected ---\n" + sb);
  console.log("  --- actual   ---\n" + sa);
  failed++;
  return false;
}

function strEq(label, a, b) {
  if (a === b) {
    console.log(`  PASS  ${label}`);
    passed++;
    return true;
  }
  console.log(`  FAIL  ${label}`);
  // show diff line by line
  const al = a.split("\n");
  const bl = b.split("\n");
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < max; i++) {
    if (al[i] !== bl[i]) {
      console.log(`  L${i + 1}:`);
      console.log(`    actual:   ${JSON.stringify(al[i])}`);
      console.log(`    expected: ${JSON.stringify(bl[i])}`);
    }
  }
  failed++;
  return false;
}

async function compileLib() {
  // bundle parser + serializer + types into a single ESM file the tests can import.
  const out = join(await mkdtemp(join(tmpdir(), "atc-test-")), "lib.mjs");
  await build({
    entryPoints: [join(root, "tests/lib-entry.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2020",
    outfile: out,
    logLevel: "silent",
  });
  return out;
}

async function main() {
  console.log("Agent Traffic Control — round-trip parser tests");
  // make a tiny entry that re-exports the bits we want.
  await writeFile(
    join(root, "tests/lib-entry.ts"),
    [
      'export { parseBoard } from "../src/parser/board";',
      'export { serializeBoard } from "../src/serializer/board";',
      'export { splitFrontmatter, serializeFrontmatter } from "../src/parser/frontmatter";',
      "",
    ].join("\n"),
  );
  const libPath = await compileLib();
  const lib = await import(pathToFileURL(libPath).href);
  const { parseBoard, serializeBoard, splitFrontmatter, serializeFrontmatter } = lib;

  // -- Test 1: round-trip the sample fixture
  const fixture = await readFile(join(root, "tests/fixtures/sample-board.md"), "utf8");
  const r1 = parseBoard(fixture);
  const s1 = serializeBoard(r1.model);
  const r2 = parseBoard(s1);
  // The structural model must be identical.
  eq("round-trip: parse(serialize(parse(text))) preserves model", r2.model, r1.model);

  // -- Test 2: serialize is idempotent
  const s2 = serializeBoard(r2.model);
  strEq("idempotent serializer: serialize(serialize(parse(text))) == serialize(parse(text))", s2, s1);

  // -- Test 3: warnings are empty for clean fixture
  eq("clean fixture has no parser warnings", r1.warnings, []);

  // -- Test 4: known fields make it through
  const pipe = r1.model.strips.find((s) => s.callsign === "PIPE-04");
  eq("PIPE-04 sector + bay", { sector: pipe?.sector, bay: pipe?.bay }, { sector: "Code", bay: "active" });
  eq("PIPE-04 controller", pipe?.controller, "Claude Code");
  eq("PIPE-04 next", pipe?.next, "Update boundaries, run suite, capture failing edge cases");
  eq("PIPE-04 constraints", pipe?.constraints, ["repo:mags-core", "branch:feature/mags-orch", "depends:spec-v2"]);
  eq("PIPE-04 context_pct", pipe?.context_pct, 60);
  eq("PIPE-04 tags", pipe?.tags, ["drift-risk"]);

  // -- Test 5: handoff arrow notation parses
  const patch = r1.model.strips.find((s) => s.callsign === "PATCH-22");
  eq("PATCH-22 controller_from / controller", { from: patch?.controller_from, to: patch?.controller }, { from: "Claude Cowork", to: "Claude Code" });
  // multi-line handoff_note must round-trip
  if (!patch?.handoff_note?.includes("Files touched: orchestrator.ts")) {
    console.log("  FAIL  PATCH-22 handoff_note missing expected line");
    failed++;
  } else {
    console.log("  PASS  PATCH-22 multi-line handoff_note parsed");
    passed++;
  }

  // -- Test 6: opaque preservation — inject an unknown line and ensure it survives
  const injected = fixture.replace(
    "  #drift-risk",
    "  #drift-risk\n  notes-for-future-me: keep this exact line untouched",
  );
  const ri = parseBoard(injected);
  const si = serializeBoard(ri.model);
  if (si.includes("notes-for-future-me: keep this exact line untouched")) {
    console.log("  PASS  unknown lines preserved through round-trip");
    passed++;
  } else {
    console.log("  FAIL  unknown line lost during round-trip");
    failed++;
  }

  // -- Test 7: frontmatter preserves order
  const fm = splitFrontmatter(fixture);
  eq("frontmatter key order preserved", fm.order, [
    "agent-traffic-plugin",
    "sectors",
    "wip_limits",
    "stall_minutes",
    "controllers",
  ]);

  // -- Test 8: empty board parses without error
  const emptyDoc = `---\nagent-traffic-plugin: v1\nsectors: [Code]\nstall_minutes: 30\ncontrollers: [Claude]\n---\n\n# Code\n`;
  const re = parseBoard(emptyDoc);
  eq("empty board has zero strips", re.model.strips.length, 0);
  // Round-trip again
  const reSerialized = serializeBoard(re.model);
  const reReparsed = parseBoard(reSerialized);
  eq("empty board round-trip", reReparsed.model.config.sectors, ["Code"]);

  // -- Test 9: stall comment marks strip as alert
  const withStall = fixture.replace(
    "  #drift-risk",
    "  #drift-risk\n  <!-- stall_at: 2026-05-01T12:34 -->",
  );
  const rs = parseBoard(withStall);
  const stalled = rs.model.strips.find((s) => s.callsign === "PIPE-04");
  eq("stall comment promotes status to alert", stalled?.status, "alert");
  // and survives serialize
  const ss = serializeBoard(rs.model);
  if (ss.includes("<!-- stall_at: 2026-05-01T12:34 -->")) {
    console.log("  PASS  stall comment preserved");
    passed++;
  } else {
    console.log("  FAIL  stall comment lost");
    failed++;
  }

  // -- Test 10: status derivation
  eq("Inbound MAGS-17 status", r1.model.strips.find((s) => s.callsign === "MAGS-17")?.status, "executing");
  eq("Active GTM-31 status", r1.model.strips.find((s) => s.callsign === "GTM-31")?.status, "executing");
  eq("Review OPS-MEMO status", r1.model.strips.find((s) => s.callsign === "OPS-MEMO")?.status, "review");
  eq("Waiting TEST-03 status", r1.model.strips.find((s) => s.callsign === "TEST-03")?.status, "waiting");

  console.log(`\n${passed} passed, ${failed} failed`);
  // best-effort cleanup
  try { await rm(join(root, "tests/lib-entry.ts")); } catch {}
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
