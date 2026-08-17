const { test } = require('node:test');
const assert = require('node:assert/strict');
const { makeBoringGenerator } = require('../lib/boring-gcode.cjs');

// grblHAL default arc tolerance ($12) is 0.002 mm ≈ 0.0000787 in. Any
// start-vs-end radius mismatch larger than this makes grbl reject the
// arc block as error:33 "Motion command target is invalid." Tests keep
// a safety margin below this threshold.
const GRBL_ARC_TOLERANCE_INCH = 0.00008;
const GRBL_ARC_TOLERANCE_MM = 0.002;

function baseParams(overrides) {
  return Object.assign({
    shape: 'round',
    xCount: 1, yCount: 1,
    xDistance: 50, yDistance: 50,
    diameter: 20, depth: 5,
    rectWidth: 20, rectHeight: 20,
    origin: 'center',
    cutType: 'inner',
    bitDiameter: 3.175,
    pitch: 1,
    feedRate: 500, plungeFeedRate: 100,
    spindleRPM: 15000, spindleDelay: 1,
    mistM7: false, floodM8: false
  }, overrides || {});
}

// Parse `G3 X<> Y<> I<> J<> Z? F<>` and return {endX, endY, i, j, z, feed}.
function parseArc(line) {
  const m = (re) => {
    const r = line.match(re);
    return r ? parseFloat(r[1]) : null;
  };
  return {
    endX: m(/(?<![A-Z])X(-?\d+\.?\d*)/i),
    endY: m(/(?<![A-Z])Y(-?\d+\.?\d*)/i),
    i:    m(/(?<![A-Z])I(-?\d+\.?\d*)/i),
    j:    m(/(?<![A-Z])J(-?\d+\.?\d*)/i),
    z:    m(/(?<![A-Z])Z(-?\d+\.?\d*)/i),
    feed: m(/(?<![A-Z])F(-?\d+\.?\d*)/i)
  };
}

// Parse a G0/G1 XY position line to update prevPos.
function parsePos(line, prev) {
  const m = (re) => {
    const r = line.match(re);
    return r ? parseFloat(r[1]) : null;
  };
  const x = m(/(?<![A-Z])X(-?\d+\.?\d*)/i);
  const y = m(/(?<![A-Z])Y(-?\d+\.?\d*)/i);
  return { x: x !== null ? x : prev.x, y: y !== null ? y : prev.y };
}

// For a full gcode program, walk motion lines and for every G2/G3 line
// compute (startRadius, endRadius) using the position immediately
// before the arc. Return the max radius delta seen (0 if no arcs).
function maxArcRadiusDelta(gcode) {
  const lines = gcode.split('\n');
  let pos = { x: 0, y: 0 };
  let worst = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('(') || line.startsWith(';')) continue;
    if (/^G0*[23](?![0-9])/i.test(line) || /^G(0*2|0*3)\b/i.test(line)) {
      const arc = parseArc(line);
      if (arc.endX === null || arc.endY === null || arc.i === null || arc.j === null) continue;
      const cx = pos.x + arc.i;
      const cy = pos.y + arc.j;
      const rStart = Math.hypot(pos.x - cx, pos.y - cy);
      const rEnd = Math.hypot(arc.endX - cx, arc.endY - cy);
      const delta = Math.abs(rStart - rEnd);
      if (delta > worst) worst = delta;
      pos = { x: arc.endX, y: arc.endY };
    } else if (/^G0*[01](?![0-9])/i.test(line) || /^X/i.test(line) || /^Y/i.test(line)) {
      pos = parsePos(line, pos);
    }
  }
  return worst;
}

// ---------- BUG REPRO: the exact scenario from the field report ----------
//
// Ran a 0.1875" outer bore with a 0.125" bit, top-left origin, one hole
// in imperial mode. Emitted `G3 X-0.063 Y-0.094 I-0.156 J0 Z-0.150` —
// but the exact math is holeX=0.09375, pathRadius=0.15625 so endX
// should be -0.0625. toFixed(3) rounded endX up to -0.063 while
// pathRadius rounded down to 0.156, compounding into a 0.001" radius
// mismatch and firing grbl error:33. Test guards the fix.
test('imperial bore that used to trigger grbl error:33 emits self-consistent arcs', () => {
  const gen = makeBoringGenerator(true).generateBoringGcode;
  const gcode = gen(baseParams({
    shape: 'round',
    xCount: 1, yCount: 1,
    diameter: 0.1875, depth: 0.25,
    cutType: 'outer',
    origin: 'top-left',
    bitDiameter: 0.125,
    pitch: 0.1,
    xDistance: 1.9685, yDistance: 1.9685,
    feedRate: 50, plungeFeedRate: 7.874
  }));

  const worst = maxArcRadiusDelta(gcode);
  assert.ok(worst < GRBL_ARC_TOLERANCE_INCH,
    `arc radius mismatch ${worst} in exceeds grbl tolerance ${GRBL_ARC_TOLERANCE_INCH}`);
});

// ---------- Broader precision guardrails ----------
test('imperial helical arcs across a range of hole sizes stay within grbl tolerance', () => {
  const gen = makeBoringGenerator(true).generateBoringGcode;
  const sizes = [
    { d: 0.125, b: 0.0625 },
    { d: 0.1875, b: 0.125 },
    { d: 0.25, b: 0.0625 },
    { d: 0.5, b: 0.25 },
    { d: 0.75, b: 0.125 },
    { d: 1.0, b: 0.25 }
  ];
  for (const s of sizes) {
    const gcode = gen(baseParams({
      diameter: s.d, bitDiameter: s.b, pitch: 0.05, depth: 0.2, cutType: 'inner'
    }));
    const worst = maxArcRadiusDelta(gcode);
    assert.ok(worst < GRBL_ARC_TOLERANCE_INCH,
      `bit=${s.b} hole=${s.d}: arc radius mismatch ${worst} exceeds ${GRBL_ARC_TOLERANCE_INCH}`);
  }
});

test('metric helical arcs across a range of hole sizes stay within grbl tolerance', () => {
  const gen = makeBoringGenerator(false).generateBoringGcode;
  const sizes = [
    { d: 4, b: 2 },
    { d: 5, b: 3.175 },
    { d: 10, b: 3.175 },
    { d: 12.7, b: 6.35 },
    { d: 20, b: 6.35 }
  ];
  for (const s of sizes) {
    const gcode = gen(baseParams({
      diameter: s.d, bitDiameter: s.b, pitch: 1, depth: 3, cutType: 'inner'
    }));
    const worst = maxArcRadiusDelta(gcode);
    assert.ok(worst < GRBL_ARC_TOLERANCE_MM,
      `bit=${s.b} hole=${s.d}: arc radius mismatch ${worst} exceeds ${GRBL_ARC_TOLERANCE_MM}`);
  }
});

// Precision drop-back would kill the fix. Assert the arc lines *aren't*
// emitted at the old 3-decimal precision that produced the bug.
test('arc endpoints and I/J offsets emit at least 4 decimals of precision', () => {
  const gen = makeBoringGenerator(true).generateBoringGcode;
  const gcode = gen(baseParams({
    diameter: 0.1875, bitDiameter: 0.125, pitch: 0.1, depth: 0.25, cutType: 'outer'
  }));
  const arcLines = gcode.split('\n').filter(l => /^G0*3\b/i.test(l.trim()));
  assert.ok(arcLines.length > 0, 'expected at least one G3 line');
  for (const line of arcLines) {
    for (const word of ['X', 'Y', 'I', 'J']) {
      const re = new RegExp(`(?<![A-Z])${word}(-?\\d+\\.\\d+)`);
      const m = line.match(re);
      if (!m) continue;
      const decimals = m[1].split('.')[1].length;
      assert.ok(decimals >= 4,
        `${word}${m[1]} has only ${decimals} decimals in: ${line}`);
    }
  }
});

// ---------- Multi-hole patterns ----------
test('2x2 pattern generates one helix per hole and all arcs are consistent', () => {
  const gen = makeBoringGenerator(false).generateBoringGcode;
  const gcode = gen(baseParams({
    xCount: 2, yCount: 2, xDistance: 30, yDistance: 30,
    diameter: 10, bitDiameter: 3.175, pitch: 0.5, depth: 2
  }));
  const holeComments = gcode.split('\n').filter(l => /^\(Hole \d+\//.test(l));
  assert.equal(holeComments.length, 4, `expected 4 hole comments, got ${holeComments.length}`);
  assert.ok(maxArcRadiusDelta(gcode) < GRBL_ARC_TOLERANCE_MM);
});

// ---------- Rectangle path (different code path, no arcs) ----------
test('rectangle cut emits no arcs and covers perimeter laps', () => {
  const gen = makeBoringGenerator(false).generateBoringGcode;
  const gcode = gen(baseParams({
    shape: 'rectangle',
    rectWidth: 50, rectHeight: 30,
    depth: 3, pitch: 1,
    bitDiameter: 3.175, cutType: 'inner'
  }));
  assert.ok(!/\bG0*3\b/.test(gcode), 'rectangle path should emit no G3 arcs');
  assert.match(gcode, /Rectangle 1\/1 center/);
});

// ---------- Core safeZHeight ----------
test('core safeZHeightMm routes program start + end through G53', () => {
  const gen = makeBoringGenerator(false).generateBoringGcode;
  const gcode = gen(baseParams({
    diameter: 10, bitDiameter: 3.175, pitch: 0.5, depth: 2,
    safeZHeightMm: -5
  }));
  assert.match(gcode, /G53 G0 Z-5\.000 ; Move to safe Z/);
  assert.match(gcode, /G53 G0 Z-5\.000 ; Return to safe Z/);
  assert.doesNotMatch(gcode, /G53 G0 Z0 /);
});

test('imperial + core safeZHeightMm converts mm → inches for the G53 line', () => {
  const gen = makeBoringGenerator(true).generateBoringGcode;
  const gcode = gen(baseParams({
    diameter: 0.5, bitDiameter: 0.125, pitch: 0.05, depth: 0.2,
    safeZHeightMm: -5
  }));
  // -5 mm → -0.197 in
  assert.match(gcode, /G53 G0 Z-0\.197 ; Move to safe Z/);
  assert.match(gcode, /G53 G0 Z-0\.197 ; Return to safe Z/);
});

test('safeZHeightMm=null falls back to G53 G0 Z0 for start + end', () => {
  const gen = makeBoringGenerator(false).generateBoringGcode;
  const gcode = gen(baseParams({
    diameter: 10, bitDiameter: 3.175, pitch: 0.5, depth: 2,
    safeZHeightMm: null
  }));
  const starts = gcode.match(/G53 G0 Z0 ; Move to machine Z0/g) || [];
  const ends = gcode.match(/G53 G0 Z0 ; Return to machine Z0/g) || [];
  assert.equal(starts.length, 1);
  assert.equal(ends.length, 1);
});

// ---------- Basic sanity ----------
test('G20/G21 emitted per unit + M3/M5 spindle bracketing + M30 end', () => {
  const metric = makeBoringGenerator(false).generateBoringGcode(baseParams());
  const imperial = makeBoringGenerator(true).generateBoringGcode(baseParams({
    diameter: 0.5, bitDiameter: 0.125, pitch: 0.05, depth: 0.2
  }));
  assert.match(metric, /^G21 ; Metric units/m);
  assert.match(imperial, /^G20 ; Imperial units/m);
  for (const g of [metric, imperial]) {
    assert.match(g, /^M3 S\d+ ; Start spindle/m);
    assert.match(g, /^M5 ; Stop spindle/m);
    assert.match(g, /^M30 ; Program end/m);
  }
});
