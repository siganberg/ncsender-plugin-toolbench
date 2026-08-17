const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makePlanerGenerator } = require('../lib/planer-gcode.cjs');

// Minimum params that produce a valid planer program. Individual tests
// override just the fields they care about.
function baseParams(overrides) {
  return Object.assign({
    startX: 0, startY: 0,
    xDimension: 100, yDimension: 100,
    depthOfCut: 1, targetDepth: 2,
    bitDiameter: 25.4, stepover: 40,
    overrun: 0,
    feedRate: 1000, plungeFeedRate: 300,
    spindleRpm: 18000, spindleDelay: 2,
    patternType: 'zigzagY',
    mistM7: false, floodM8: false,
    depthMode: 'depth'
  }, overrides || {});
}

function firstMatch(gcode, re) {
  const line = gcode.split('\n').find(l => re.test(l));
  if (!line) throw new Error(`no line matched ${re} in:\n${gcode}`);
  return line;
}

function everyMatch(gcode, re) {
  return gcode.split('\n').filter(l => re.test(l));
}

// ---------- BUG 1: safe-Z hardcodes 5 in mm, breaks in imperial ----------
//
// stmoha, 2026-08-15: planer produced G0 Z11.125" on a 6" block of EPS
// foam — 5 was added as raw units, so imperial got +5 INCHES instead of
// +5mm. The runner then hit the machine's soft limit.
test('imperial thickness mode: safe-Z is starting_thickness + 5mm, not + 5in', () => {
  const gen = makePlanerGenerator(true).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 6,   // 6-inch tall stock
    targetDepth: 0.1,
    depthOfCut: 0.05,
    bitDiameter: 1.5, stepover: 40,
    xDimension: 10, yDimension: 10,
    feedRate: 80, plungeFeedRate: 10
  }));

  const startupRapid = firstMatch(gcode, /Rapid to safe height/);
  // 6 + 0.19685 ≈ 6.197 (5 mm converted to inches). Emphatically NOT 11.
  assert.match(startupRapid, /G0 Z6\.197 /);
  assert.doesNotMatch(gcode, /G0 Z11\./);
});

test('metric thickness mode: safe-Z is starting_thickness + 5mm', () => {
  const gen = makePlanerGenerator(false).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 125,   // 125 mm block
    targetDepth: 2, depthOfCut: 1,
    xDimension: 25, yDimension: 50
  }));

  const startupRapid = firstMatch(gcode, /Rapid to safe height/);
  assert.match(startupRapid, /G0 Z130\.000 /);
});

// ---------- BUG 2: end-of-pass retract descends INTO the stock ----------
//
// t0n3, 2026-08-16: metric example, starting thickness = 125mm. Line 22
// was correct (G0 Z130), but line 38 emitted "G0 Z5" — plain safeHeight,
// which in thickness mode sits 120mm *below* the top of the stock. A
// rapid to that Z between passes plunges through the block.
test('thickness mode: end-of-pass retract clears the stock top', () => {
  const gen = makePlanerGenerator(false).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 125,
    targetDepth: 3, depthOfCut: 1,   // → 3 passes, 3 retracts
    xDimension: 25, yDimension: 50
  }));

  const retracts = everyMatch(gcode, /Retract to safe height/);
  assert.ok(retracts.length >= 1, 'expected at least one retract line');
  for (const line of retracts) {
    // must clear the 125mm stock — bad code produced "G0 Z5"
    assert.match(line, /G0 Z130\.000 /,
      `retract must be above starting stock top, got: ${line}`);
    assert.doesNotMatch(line, /G0 Z5\.000 /);
  }
});

test('imperial thickness mode: end-of-pass retract clears the stock top', () => {
  const gen = makePlanerGenerator(true).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 6,
    targetDepth: 0.1, depthOfCut: 0.05,
    bitDiameter: 1.5, stepover: 40,
    xDimension: 10, yDimension: 10,
    feedRate: 80, plungeFeedRate: 10
  }));

  const retracts = everyMatch(gcode, /Retract to safe height/);
  for (const line of retracts) {
    assert.match(line, /G0 Z6\.197 /,
      `retract must be above starting stock top, got: ${line}`);
  }
});

// ---------- BUG 1 (variant): between-pass Z-hop also uses hardcoded 5 ----------
test('imperial thickness mode: between-pass Z-hop is scaled to inches', () => {
  const gen = makePlanerGenerator(true).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 6,
    targetDepth: 0.1, depthOfCut: 0.03,   // → 4 passes, 3 hops
    bitDiameter: 1.5, stepover: 40,
    xDimension: 10, yDimension: 10,
    feedRate: 80, plungeFeedRate: 10
  }));

  const hops = everyMatch(gcode, /Safety Z-hop above last pass/);
  assert.ok(hops.length >= 1, 'expected at least one Z-hop');
  for (const line of hops) {
    // hop = previousZ + 0.197in ≈ 5.9x, definitely < 10 (bad code was + 5 inches → 10.x)
    const zMatch = line.match(/G0 Z(\-?\d+\.\d+)/);
    assert.ok(zMatch, `expected numeric Z in: ${line}`);
    const z = parseFloat(zMatch[1]);
    assert.ok(z < 7, `hop Z should be near previous cut + 0.197in, got ${z} in: ${line}`);
  }
});

// ---------- Regression: depth mode still emits 5mm/0.197in safe Z ----------
test('metric depth mode: safe-Z stays at 5mm (regression)', () => {
  const gen = makePlanerGenerator(false).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'depth',
    targetDepth: 2, depthOfCut: 1
  }));

  const startupRapid = firstMatch(gcode, /Rapid to safe height/);
  assert.match(startupRapid, /G0 Z5\.000 /);
  for (const line of everyMatch(gcode, /Retract to safe height/)) {
    assert.match(line, /G0 Z5\.000 /);
  }
});

test('imperial depth mode: safe-Z stays at 0.197in (regression)', () => {
  const gen = makePlanerGenerator(true).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'depth',
    targetDepth: 0.1, depthOfCut: 0.05,
    bitDiameter: 1.5, stepover: 40,
    xDimension: 10, yDimension: 10,
    feedRate: 80, plungeFeedRate: 10
  }));

  const startupRapid = firstMatch(gcode, /Rapid to safe height/);
  assert.match(startupRapid, /G0 Z0\.197 /);
});

// ---------- Core safeZHeight override ----------
//
// When the app passes safeZHeightMm (stored in ncSender settings as a
// negative machine-coord Z in mm), the planer should emit retracts as
// `G53 G0 Z<value>` so the operator's configured safe travel plane is
// respected — same primitive as tracing, go-to-zero, and move-spindle.
test('metric + core safeZHeightMm: retracts use G53 with the configured value', () => {
  const gen = makePlanerGenerator(false).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 125,
    targetDepth: 3, depthOfCut: 1,
    xDimension: 25, yDimension: 50,
    safeZHeightMm: -5   // core setting: 5mm below machine max
  }));

  const retracts = everyMatch(gcode, /Retract to core safe Z/);
  assert.ok(retracts.length >= 1, 'expected end-of-pass retracts via core safe Z');
  for (const line of retracts) {
    assert.match(line, /G53 G0 Z-5\.000 /,
      `expected G53 machine-Z with configured value, got: ${line}`);
  }
  // no fallback workpiece-relative retracts should appear when the core value is set
  assert.equal(everyMatch(gcode, /Retract to safe height/).length, 0);

  // Startup rapid stays workpiece-relative — the rapid-down + G1 plunge
  // sequence needs to start close to material, not from machine top.
  const startupRapid = firstMatch(gcode, /Rapid to safe height/);
  assert.match(startupRapid, /G0 Z130\.000 /,
    `startup rapid must stay workpiece-relative (thicknessStartZ + 5mm), got: ${startupRapid}`);
  assert.equal(everyMatch(gcode, /Rapid to core safe Z/).length, 0,
    'startup should NOT switch to core safe Z even when configured');

  // Program-start and program-end machine-Z moves should also respect the
  // core setting — otherwise the last retract goes to Z-5 and then a
  // redundant Z0 fires right after.
  const machineMoves = everyMatch(gcode, /; Move to safe Z|; Move to machine Z0/);
  assert.ok(machineMoves.length >= 2, 'expected at least start + end moves');
  for (const line of machineMoves) {
    assert.match(line, /G53 G0 Z-5\.000 /,
      `program start/end moves should honor core safeZHeight, got: ${line}`);
  }
  assert.equal(everyMatch(gcode, /G53 G0 Z0 /).length, 0,
    'no hardcoded G53 Z0 moves should remain when core safeZHeight is set');
});

test('imperial + core safeZHeightMm: value is converted mm → inches for G20 machines', () => {
  const gen = makePlanerGenerator(true).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 6,
    targetDepth: 0.1, depthOfCut: 0.05,
    bitDiameter: 1.5, stepover: 40,
    xDimension: 10, yDimension: 10,
    feedRate: 80, plungeFeedRate: 10,
    safeZHeightMm: -5
  }));

  // -5 mm → -0.19685 in → toFixed(3) → -0.197
  const retracts = everyMatch(gcode, /Retract to core safe Z/);
  assert.ok(retracts.length >= 1);
  for (const line of retracts) {
    assert.match(line, /G53 G0 Z-0\.197 /,
      `expected imperial-converted machine Z, got: ${line}`);
  }
});

test('safeZHeightMm=null falls back to workpiece-relative retract', () => {
  const gen = makePlanerGenerator(false).generatePlanerGcode;
  const gcode = gen(baseParams({
    depthMode: 'thickness',
    thicknessStartZ: 125,
    targetDepth: 2, depthOfCut: 1,
    xDimension: 25, yDimension: 50,
    safeZHeightMm: null
  }));

  assert.equal(everyMatch(gcode, /Retract to core safe Z/).length, 0);
  assert.ok(everyMatch(gcode, /Retract to safe height/).length >= 1,
    'expected fallback workpiece-relative retract when core value is null');
});

test('safeZHeightMm ignored when not a finite number (undefined / NaN / string)', () => {
  const gen = makePlanerGenerator(false).generatePlanerGcode;
  for (const bad of [undefined, NaN, 'oops', null]) {
    const gcode = gen(baseParams({
      depthMode: 'thickness', thicknessStartZ: 125,
      targetDepth: 1, depthOfCut: 1,
      xDimension: 25, yDimension: 50,
      safeZHeightMm: bad
    }));
    assert.equal(everyMatch(gcode, /Retract to core safe Z/).length, 0,
      `bad safeZHeightMm=${String(bad)} should not emit core-safe-Z retracts`);
  }
});

// ---------- Sanity: gcode is well-formed ----------
test('output has G20/G21 units matching isImperial', () => {
  const metric = makePlanerGenerator(false).generatePlanerGcode(baseParams());
  const imperial = makePlanerGenerator(true).generatePlanerGcode(baseParams({
    xDimension: 10, yDimension: 10,
    depthOfCut: 0.05, targetDepth: 0.1,
    bitDiameter: 1.5, stepover: 40,
    feedRate: 80, plungeFeedRate: 10
  }));
  assert.match(metric, /^G21 ; Metric units/m);
  assert.match(imperial, /^G20 ; Imperial units/m);
});
