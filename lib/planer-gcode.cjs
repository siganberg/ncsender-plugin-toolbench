/**
 * Planer G-code generator for the ToolBench plugin.
 *
 * Extracted from config.html so the generator can be unit-tested in Node.
 * Loaded two ways:
 *   - Browser (dialog): index.js injects this file's source inline into
 *     config.html. `makePlanerGenerator` becomes a global; initPlanerLogic
 *     calls it to obtain the same functions the inline code used to define.
 *   - Node (tests):   `const { makePlanerGenerator } = require('./lib/planer-gcode');`
 *
 * `isImperial` is captured in a closure so callers don't have to thread it
 * through every generator invocation — matches the pre-extraction
 * closure-scoped behavior.
 */
function makePlanerGenerator(isImperial) {
  // 5 mm above the reference plane, converted to the active unit.
  // "Reference plane" is workpiece Z0 in depth mode, and the top of the
  // starting stock in thickness mode (see safeHopZ derivation below).
  var safeHopDelta = isImperial ? (5 * 0.0393701) : 5;
  var rapidClearance = isImperial ? (2 * 0.0393701) : 2;

  function addStartupSequence(gcode, options) {
    var mistM7 = options.mistM7, floodM8 = options.floodM8, spindleRpm = options.spindleRpm;
    var spindleDelay = options.spindleDelay, safeHeight = options.safeHeight;
    var currentDepth = options.currentDepth, previousDepth = options.previousDepth;
    var plungeFeedRate = options.plungeFeedRate;

    if (mistM7) {
      gcode.push('M7 ; Mist coolant on');
    }
    if (floodM8) {
      gcode.push('M8 ; Flood coolant on');
    }
    if (spindleRpm > 0) {
      gcode.push('M3 S' + spindleRpm + ' ; Start spindle');
    }
    if (spindleRpm > 0 && spindleDelay > 0) {
      gcode.push('G4 P' + spindleDelay + ' ; Wait ' + spindleDelay + ' seconds');
    }
    // Startup rapid stays workpiece-relative — the rapid-down + G1 plunge
    // sequence below assumes we start above the material at a reasonable
    // distance, not from machine top. Core safeZHeight is used only for
    // end-of-pass retracts, not for the initial approach.
    gcode.push('G0 Z' + safeHeight + ' ; Rapid to safe height');

    var targetDepth = -currentDepth;
    var rapidDepth = -(previousDepth || 0) - rapidClearance;

    if (rapidDepth > targetDepth) {
      gcode.push('G0 Z' + rapidDepth.toFixed(3) + ' ; Rapid to 2mm above previous surface');
    }
    gcode.push('G1 Z' + targetDepth.toFixed(3) + ' F' + plungeFeedRate + ' ; Plunge to depth');
  }

  function generatePlanerGcode(params) {
    var startX = params.startX, startY = params.startY;
    var xDimension = params.xDimension, yDimension = params.yDimension;
    var depthOfCut = params.depthOfCut, targetDepth = params.targetDepth;
    var bitDiameter = params.bitDiameter, stepover = params.stepover;
    var overrun = params.overrun;
    var feedRate = params.feedRate, plungeFeedRate = params.plungeFeedRate;
    var spindleRpm = params.spindleRpm;
    var patternType = params.patternType, spindleDelay = params.spindleDelay;
    var mistM7 = params.mistM7, floodM8 = params.floodM8;
    var depthMode = params.depthMode || 'depth';
    var thicknessStartZ = params.thicknessStartZ || 0;
    var isWasteboard = params.isWasteboard || false;
    // ncSender core setting: machine-coord Z in mm (negative). When
    // provided we emit retracts as `G53 G0 Z<val>` so the operator's
    // configured safe-travel plane is respected; when null we fall back
    // to a workpiece-relative retract that clears the top of the stock.
    var coreSafeZMm = typeof params.safeZHeightMm === 'number' && isFinite(params.safeZHeightMm)
      ? params.safeZHeightMm
      : null;

    var safeHeight = safeHopDelta.toFixed(3);
    var unitsCode = isImperial ? 'G20' : 'G21';
    var unitsLabel = isImperial ? 'inch' : 'mm';

    // safeZHeightMm is always stored in mm. Convert to the active unit
    // for the g-code output (G20/G21 dictates how the machine reads it).
    var coreSafeZLine = coreSafeZMm !== null
      ? 'G53 G0 Z' + (isImperial ? (coreSafeZMm * 0.0393701) : coreSafeZMm).toFixed(3)
      : null;

    var stepoverDistance = (bitDiameter * stepover) / 100;
    var numDepthPasses = Math.ceil(targetDepth / depthOfCut);
    var isThicknessMode = depthMode === 'thickness';
    var selectedPattern = patternType || 'zigzagY';
    var invertOrientation = selectedPattern === 'zigzagX';
    var isSpiral = selectedPattern === 'spiral';

    // Safe absolute Z that clears the top of the starting stock. In
    // thickness mode the workpiece Z0 is the wasteboard, so a plain
    // safeHeight (5mm above workpiece zero) is INSIDE the stock — using
    // it as a "retract" plunges through material. safeHopZ raises the
    // retract to above the tallest point that could still be present.
    var safeHopZ = isThicknessMode
      ? (thicknessStartZ + safeHopDelta).toFixed(3)
      : safeHeight;

    var adjustedStartX = startX - overrun;
    var adjustedStartY = startY - overrun;
    var adjustedXDimension = xDimension + (overrun * 2);
    var adjustedYDimension = yDimension + (overrun * 2);

    var stepDimension = invertOrientation ? adjustedYDimension : adjustedXDimension;
    var numPasses = Math.ceil(stepDimension / stepoverDistance) + 1;

    if (isWasteboard) {
      overrun = 0;
      adjustedStartX = startX;
      adjustedStartY = startY;
      adjustedXDimension = xDimension;
      adjustedYDimension = yDimension;
      stepDimension = invertOrientation ? adjustedYDimension : adjustedXDimension;
      numPasses = Math.ceil(stepDimension / stepoverDistance) + 1;
    }

    var gcode = [];
    gcode.push('(Planer Operation' + (isWasteboard ? ' - Wasteboard Surfacing' : isThicknessMode ? ' - Thickness Mode' : '') + ')');
    if (isWasteboard) gcode.push('(Machine Coordinates - Full travel area)');
    gcode.push('(Start: X' + startX + ' Y' + startY + ')');
    gcode.push('(Dimensions: ' + xDimension + ' x ' + yDimension + ' ' + unitsLabel + ')');
    gcode.push('(Overrun: ' + overrun + unitsLabel + ')');
    gcode.push('(Actual Cut Area: ' + adjustedXDimension + ' x ' + adjustedYDimension + ' ' + unitsLabel + ')');
    gcode.push('(Bit Diameter: ' + bitDiameter + unitsLabel + ', Stepover: ' + stepover + '%)');
    if (isThicknessMode) {
      gcode.push('(Starting Thickness: ' + thicknessStartZ.toFixed(3) + unitsLabel + ', Target Thickness: ' + (thicknessStartZ - targetDepth).toFixed(3) + unitsLabel + ')');
      gcode.push('(Material to remove: ' + targetDepth.toFixed(3) + unitsLabel + ' in ' + numDepthPasses + ' passes)');
      gcode.push('(Z-zero = bottom of material / wasteboard)');
    } else {
      gcode.push('(Target Depth: ' + targetDepth + unitsLabel + ' in ' + numDepthPasses + ' passes)');
    }
    gcode.push('(Feed Rate: ' + feedRate + unitsLabel + '/min, Spindle: ' + spindleRpm + 'RPM)');
    gcode.push('');
    gcode.push(unitsCode + ' ; ' + (isImperial ? 'Imperial' : 'Metric') + ' units');
    gcode.push('G90 ; Absolute positioning');
    gcode.push('G94 ; Feed rate per minute');
    gcode.push('');
    if (coreSafeZLine) {
      gcode.push(coreSafeZLine + ' ; Move to safe Z');
    } else {
      gcode.push('G53 G0 Z0 ; Move to machine Z0');
    }
    gcode.push('');

    // In thickness mode: Z values are positive (above wasteboard).
    // First pass at startZ - depthOfCut, last pass at targetThickness.
    // In depth mode: Z values are negative (below material top).
    var currentDepth = 0;
    var previousDepth = 0;
    for (var depthPass = 0; depthPass < numDepthPasses; depthPass++) {
      previousDepth = currentDepth;
      currentDepth = Math.min(currentDepth + depthOfCut, targetDepth);

      var zPos;
      if (isThicknessMode) {
        zPos = thicknessStartZ - currentDepth;
        gcode.push('(Pass ' + (depthPass + 1) + '/' + numDepthPasses + ' - Z' + zPos.toFixed(3) + ' = thickness ' + zPos.toFixed(3) + unitsLabel + ')');
      } else {
        zPos = -currentDepth;
        gcode.push('(Depth pass ' + (depthPass + 1) + '/' + numDepthPasses + ' - Z' + zPos.toFixed(3) + ')');
      }

      if (depthPass === 0) {
        gcode.push('G0 X' + adjustedStartX.toFixed(3) + ' Y' + adjustedStartY.toFixed(3) + ' ; Move to start position');
        var startupDepth = isThicknessMode ? -(thicknessStartZ - currentDepth) : currentDepth;
        var startupPrev = isThicknessMode ? -(thicknessStartZ) : previousDepth;
        addStartupSequence(gcode, {
          mistM7: mistM7, floodM8: floodM8, spindleRpm: spindleRpm, spindleDelay: spindleDelay,
          safeHeight: safeHopZ,
          isImperial: isImperial, currentDepth: startupDepth, previousDepth: startupPrev,
          plungeFeedRate: plungeFeedRate
        });
      } else {
        var previousZ = isThicknessMode ? (thicknessStartZ - previousDepth) : -previousDepth;
        var td = isThicknessMode ? (thicknessStartZ - currentDepth) : -currentDepth;
        var rapidZ = previousZ + rapidClearance;
        var hopZ = isThicknessMode ? (previousZ + safeHopDelta).toFixed(3) : safeHeight;

        gcode.push('G0 Z' + hopZ + ' ; Safety Z-hop above last pass');
        gcode.push('G0 X' + adjustedStartX.toFixed(3) + ' Y' + adjustedStartY.toFixed(3) + ' ; Move to start position');
        if (rapidZ > td) {
          gcode.push('G0 Z' + rapidZ.toFixed(3) + ' ; Rapid to 2mm above previous surface');
        }
        gcode.push('G1 Z' + td.toFixed(3) + ' F' + plungeFeedRate + ' ; Plunge to depth');
      }

      if (isSpiral) {
        var effectiveStep = Math.max(Math.min(stepoverDistance, Math.min(adjustedXDimension, adjustedYDimension) / 2), 0.1);
        var left = adjustedStartX;
        var right = adjustedStartX + adjustedXDimension;
        var top = adjustedStartY;
        var bottom = adjustedStartY + adjustedYDimension;
        var currentX = adjustedStartX;
        var currentY = adjustedStartY;

        while (right - left > 0 && bottom - top > 0) {
          gcode.push('G1 X' + right.toFixed(3) + ' Y' + top.toFixed(3) + ' F' + feedRate);
          currentX = right;
          currentY = top;

          top += effectiveStep;
          if (top >= bottom) break;

          gcode.push('G1 X' + currentX.toFixed(3) + ' Y' + bottom.toFixed(3) + ' F' + feedRate);
          currentY = bottom;

          right -= effectiveStep;
          if (left >= right) break;

          gcode.push('G1 X' + left.toFixed(3) + ' Y' + currentY.toFixed(3) + ' F' + feedRate);
          currentX = left;

          bottom -= effectiveStep;
          if (top >= bottom) break;

          gcode.push('G1 X' + currentX.toFixed(3) + ' Y' + top.toFixed(3) + ' F' + feedRate);
          currentY = top;

          left += effectiveStep;
          if (left >= right) break;

          gcode.push('G1 X' + left.toFixed(3) + ' Y' + currentY.toFixed(3) + ' F' + feedRate);
          currentX = left;
        }

        var centerX = adjustedStartX + (adjustedXDimension / 2);
        var centerY = adjustedStartY + (adjustedYDimension / 2);
        if (Math.abs(currentX - centerX) > 0.01 || Math.abs(currentY - centerY) > 0.01) {
          gcode.push('G1 X' + centerX.toFixed(3) + ' Y' + centerY.toFixed(3) + ' F' + feedRate);
        }
      } else {
        var direction = 1;

        if (invertOrientation) {
          for (var pass = 0; pass < numPasses; pass++) {
            var yPos = Math.min(adjustedStartY + (pass * stepoverDistance), adjustedStartY + adjustedYDimension);
            if (pass > 0) {
              gcode.push('G1 Y' + yPos.toFixed(3) + ' F' + feedRate + ' ; Step over');
            }
            if (direction === 1) {
              gcode.push('G1 X' + (adjustedStartX + adjustedXDimension).toFixed(3) + ' F' + feedRate);
            } else {
              gcode.push('G1 X' + adjustedStartX.toFixed(3) + ' F' + feedRate);
            }
            direction *= -1;
          }
        } else {
          for (var pass = 0; pass < numPasses; pass++) {
            var xPos = Math.min(adjustedStartX + (pass * stepoverDistance), adjustedStartX + adjustedXDimension);
            if (pass > 0) {
              gcode.push('G1 X' + xPos.toFixed(3) + ' F' + feedRate + ' ; Step over');
            }
            if (direction === 1) {
              gcode.push('G1 Y' + (adjustedStartY + adjustedYDimension).toFixed(3) + ' F' + feedRate);
            } else {
              gcode.push('G1 Y' + adjustedStartY.toFixed(3) + ' F' + feedRate);
            }
            direction *= -1;
          }
        }
      }

      if (coreSafeZLine) {
        gcode.push(coreSafeZLine + ' ; Retract to core safe Z');
      } else {
        gcode.push('G0 Z' + safeHopZ + ' ; Retract to safe height');
      }
      gcode.push('');
    }

    if (coreSafeZLine) {
      gcode.push(coreSafeZLine + ' ; Move to safe Z');
    } else {
      gcode.push('G53 G0 Z0 ; Move to machine Z0');
    }
    if (mistM7 || floodM8) {
      gcode.push('M9 ; Coolant off');
    }
    if (spindleRpm > 0) {
      gcode.push('M5 ; Stop spindle');
    }
    gcode.push('M30 ; End program');

    return gcode.join('\n');
  }

  return { generatePlanerGcode: generatePlanerGcode, addStartupSequence: addStartupSequence };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makePlanerGenerator: makePlanerGenerator };
}
