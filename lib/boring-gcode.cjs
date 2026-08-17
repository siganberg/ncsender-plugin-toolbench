/**
 * Boring G-code generator for the ToolBench plugin.
 *
 * MUST STAY IN SYNC WITH generateBoringGcode inside config.html.
 * ncSenderPro V2's plugin server does its own placeholder replacement
 * for config.html and won't inject external JS, so the browser copy
 * lives inline in config.html — this file is the Node-loadable twin
 * used by tests/boring-gcode.test.cjs. Every fix to the generator
 * must be applied to BOTH.
 *
 * Arc-line precision — the reason this module exists at all — must
 * stay at toFixed(5) for endpoints and I/J offsets. Anything lower
 * lets values that round differently on the two sides of an arc
 * (e.g. -0.0625 rounds to -0.063 while 0.15625 rounds to 0.156)
 * compound into a >grbl-tolerance radius mismatch and get rejected
 * as error:33 "Motion command target is invalid."
 */
function makeBoringGenerator(isImperial) {
  function generateBoringGcode(params) {
    var shape = params.shape || 'round';
    var xCount = params.xCount, xDistance = params.xDistance;
    var yCount = params.yCount, yDistance = params.yDistance;
    var diameter = params.diameter, depth = params.depth;
    var rectWidth = params.rectWidth, rectHeight = params.rectHeight;
    var origin = params.origin || 'center';
    var cutType = params.cutType, bitDiameter = params.bitDiameter;
    var pitch = params.pitch;
    var feedRate = params.feedRate, plungeFeedRate = params.plungeFeedRate;
    var spindleRPM = params.spindleRPM, spindleDelay = params.spindleDelay;
    var mistM7 = params.mistM7, floodM8 = params.floodM8;

    var safeHeight = isImperial ? (5 * 0.0393701).toFixed(3) : '5.000';
    var unitsCode = isImperial ? 'G20' : 'G21';
    var unitsLabel = isImperial ? 'inch' : 'mm';

    var coreSafeZMm = typeof params.safeZHeightMm === 'number' && isFinite(params.safeZHeightMm)
      ? params.safeZHeightMm
      : null;
    var coreSafeZLine = coreSafeZMm !== null
      ? 'G53 G0 Z' + (isImperial ? (coreSafeZMm * 0.0393701) : coreSafeZMm).toFixed(3)
      : null;

    var toolRadius = bitDiameter / 2;
    var zIncrement = pitch;

    var shapeW = shape === 'rectangle' ? rectWidth : diameter;
    var shapeH = shape === 'rectangle' ? rectHeight : diameter;

    var originOffsetX = 0;
    var originOffsetY = 0;
    if (origin === 'center') {
      originOffsetX = -((xCount - 1) * xDistance) / 2;
      originOffsetY = -((yCount - 1) * yDistance) / 2;
    } else if (origin === 'top-left') {
      originOffsetX = shapeW / 2;
      originOffsetY = -((yCount - 1) * yDistance) - shapeH / 2;
    } else if (origin === 'top-right') {
      originOffsetX = -((xCount - 1) * xDistance) - shapeW / 2;
      originOffsetY = -((yCount - 1) * yDistance) - shapeH / 2;
    } else if (origin === 'bottom-left') {
      originOffsetX = shapeW / 2;
      originOffsetY = shapeH / 2;
    } else if (origin === 'bottom-right') {
      originOffsetX = -((xCount - 1) * xDistance) - shapeW / 2;
      originOffsetY = shapeH / 2;
    }

    var gcode = [];
    if (shape === 'rectangle') {
      gcode.push('(Rectangle Cut Operation)');
      gcode.push('(Pattern: ' + xCount + ' x ' + yCount + ')');
      gcode.push('(Size: ' + rectWidth + unitsLabel + ' x ' + rectHeight + unitsLabel + ', Depth: ' + depth + unitsLabel + ')');
    } else {
      gcode.push('(Boring Operation)');
      gcode.push('(Pattern: ' + xCount + ' x ' + yCount + ' holes)');
      gcode.push('(Hole Diameter: ' + diameter + unitsLabel + ', Depth: ' + depth + unitsLabel + ')');
    }
    gcode.push('(Cut Type: ' + cutType + ')');
    gcode.push('(Origin: ' + origin + ')');
    gcode.push('(Bit Diameter: ' + bitDiameter + unitsLabel + ')');
    gcode.push('(Pitch: ' + pitch + unitsLabel + ' per pass)');
    gcode.push('(X-Distance: ' + xDistance + unitsLabel + ', Y-Distance: ' + yDistance + unitsLabel + ')');
    gcode.push('');
    gcode.push(unitsCode + ' ; ' + (isImperial ? 'Imperial' : 'Metric') + ' units');
    gcode.push('G17 ; XY plane selection');
    gcode.push('G90 ; Absolute positioning');
    gcode.push('G94 ; Feed rate per minute');
    gcode.push('');
    if (coreSafeZLine) {
      gcode.push(coreSafeZLine + ' ; Move to safe Z');
    } else {
      gcode.push('G53 G0 Z0 ; Move to machine Z0');
    }
    gcode.push('');

    var itemNumber = 0;
    for (var yi = 0; yi < yCount; yi++) {
      for (var xi = 0; xi < xCount; xi++) {
        itemNumber++;
        var centerX = xi * xDistance + originOffsetX;
        var centerY = yi * yDistance + originOffsetY;

        if (itemNumber === 1) {
          if (mistM7) { gcode.push('M7 ; Mist coolant on'); }
          if (floodM8) { gcode.push('M8 ; Flood coolant on'); }
          if (spindleRPM > 0) {
            gcode.push('M3 S' + spindleRPM + ' ; Start spindle');
            if (spindleDelay > 0) {
              gcode.push('G4 P' + spindleDelay + ' ; Wait ' + spindleDelay + ' seconds');
            }
          }
        }

        if (shape === 'rectangle') {
          var halfW = rectWidth / 2;
          var halfH = rectHeight / 2;
          var pathHalfW, pathHalfH;
          if (cutType === 'inner') {
            pathHalfW = halfW - toolRadius;
            pathHalfH = halfH - toolRadius;
          } else {
            pathHalfW = halfW + toolRadius;
            pathHalfH = halfH + toolRadius;
          }

          if (pathHalfW <= 0 || pathHalfH <= 0) {
            gcode.push('(WARNING: Rectangle too small for tool diameter, skipping)');
            continue;
          }

          var rx1 = centerX + pathHalfW;
          var rx0 = centerX - pathHalfW;
          var ry1 = centerY + pathHalfH;
          var ry0 = centerY - pathHalfH;

          gcode.push('(Rectangle ' + itemNumber + '/' + (xCount * yCount) + ' center X' + centerX.toFixed(3) + ' Y' + centerY.toFixed(3) + ')');

          var startX = centerX;
          var startY = ry0;
          gcode.push('G0 X' + startX.toFixed(3) + ' Y' + startY.toFixed(3));
          gcode.push('G0 Z' + safeHeight);

          var slowPlungeStart = isImperial ? (2 * 0.0393701) : 2;
          gcode.push('G0 Z' + slowPlungeStart.toFixed(3));

          var firstDepth = Math.min(depth, zIncrement);
          gcode.push('G1 Z' + (-firstDepth).toFixed(3) + ' F' + plungeFeedRate);

          gcode.push('G1 X' + rx1.toFixed(3) + ' Y' + ry0.toFixed(3) + ' F' + feedRate);

          var currentDepth = firstDepth;
          var depthTolerance = 1e-6;

          while (currentDepth < depth - depthTolerance) {
            var nextDepth = Math.min(depth, currentDepth + zIncrement);
            var zPerSide = (nextDepth - currentDepth) / 4;

            var z1 = -(currentDepth + zPerSide);
            gcode.push('G1 X' + rx1.toFixed(3) + ' Y' + ry1.toFixed(3) + ' Z' + z1.toFixed(3));

            var z2 = -(currentDepth + zPerSide * 2);
            gcode.push('G1 X' + rx0.toFixed(3) + ' Y' + ry1.toFixed(3) + ' Z' + z2.toFixed(3));

            var z3 = -(currentDepth + zPerSide * 3);
            gcode.push('G1 X' + rx0.toFixed(3) + ' Y' + ry0.toFixed(3) + ' Z' + z3.toFixed(3));

            var z4 = -nextDepth;
            gcode.push('G1 X' + rx1.toFixed(3) + ' Y' + ry0.toFixed(3) + ' Z' + z4.toFixed(3));

            currentDepth = nextDepth;
          }

          gcode.push('G1 X' + rx1.toFixed(3) + ' Y' + ry1.toFixed(3) + ' F' + feedRate);
          gcode.push('G1 X' + rx0.toFixed(3) + ' Y' + ry1.toFixed(3));
          gcode.push('G1 X' + rx0.toFixed(3) + ' Y' + ry0.toFixed(3));
          gcode.push('G1 X' + rx1.toFixed(3) + ' Y' + ry0.toFixed(3));

          gcode.push('G0 Z' + safeHeight);
          gcode.push('');
        } else {
          var holeX = centerX;
          var holeY = centerY;
          var holeRadius = diameter / 2;
          var pathRadius;
          if (cutType === 'inner') {
            pathRadius = holeRadius - toolRadius;
          } else {
            pathRadius = holeRadius + toolRadius;
          }

          gcode.push('(Hole ' + itemNumber + '/' + (xCount * yCount) + ' at X' + holeX.toFixed(3) + ' Y' + holeY.toFixed(3) + ')');

          var minEntryOffset = isImperial ? 0.005 : 0.1;
          var entryOffsetCandidate = Math.max(pathRadius * 0.0125, toolRadius * 0.25, minEntryOffset);
          var entryOffset = Math.min(pathRadius * 0.05, entryOffsetCandidate, pathRadius * 0.5);
          var approachStartOffset = Math.max(entryOffset, Math.min(pathRadius * 0.8, entryOffset * 2.5));
          var rStartX = holeX + pathRadius - approachStartOffset;
          var arcStartX = holeX + pathRadius - entryOffset;
          var rStartY = holeY - entryOffset;
          var rampXTravel = Math.max(arcStartX - rStartX, 0);

          gcode.push('G0 X' + rStartX.toFixed(5) + ' Y' + rStartY.toFixed(5));
          gcode.push('G0 Z' + safeHeight);

          var slowPlungeStart2 = isImperial ? (2 * 0.0393701) : 2;
          gcode.push('G0 Z' + slowPlungeStart2.toFixed(3));

          var startDepth = Math.min(depth, zIncrement * 0.5);
          var rampTargetDepth = Math.min(depth, zIncrement);
          var rampDepthDiff = Math.max(0, rampTargetDepth - startDepth);
          gcode.push('G1 Z' + (-startDepth).toFixed(3) + ' F' + plungeFeedRate);

          var leadInSteps = 7;
          for (var step = 1; step <= leadInSteps; step++) {
            var progress = step / leadInSteps;
            var xPos = rStartX + (rampXTravel * progress);
            var zPos = -(startDepth + (rampDepthDiff * progress));
            gcode.push('X' + xPos.toFixed(5) + ' Z' + zPos.toFixed(3));
          }

          var arcCenterYOffset = entryOffset;
          gcode.push('G3 X' + (holeX + pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I0 J' + arcCenterYOffset.toFixed(5) + ' F' + feedRate);

          var currentDepth2 = rampTargetDepth;
          var depthTolerance2 = 1e-6;
          var zIncrementPerSemicircle = zIncrement / 2;
          var atPlusX = true;

          while (currentDepth2 < depth - depthTolerance2) {
            var firstHalfDepth = Math.min(depth, currentDepth2 + zIncrementPerSemicircle);
            gcode.push('G3 X' + (holeX - pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I' + (-pathRadius).toFixed(5) + ' J0 Z' + (-firstHalfDepth).toFixed(3) + ' F' + feedRate);
            currentDepth2 = firstHalfDepth;
            atPlusX = false;

            if (currentDepth2 >= depth - depthTolerance2) break;

            var secondHalfDepth = Math.min(depth, currentDepth2 + zIncrementPerSemicircle);
            gcode.push('G3 X' + (holeX + pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I' + pathRadius.toFixed(5) + ' J0 Z' + (-secondHalfDepth).toFixed(3) + ' F' + feedRate);
            currentDepth2 = secondHalfDepth;
            atPlusX = true;
          }

          if (atPlusX) {
            gcode.push('G3 X' + (holeX - pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I' + (-pathRadius).toFixed(5) + ' J0 F' + feedRate);
            gcode.push('G3 X' + (holeX + pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I' + pathRadius.toFixed(5) + ' J0 F' + feedRate);
          } else {
            gcode.push('G3 X' + (holeX + pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I' + pathRadius.toFixed(5) + ' J0 F' + feedRate);
            gcode.push('G3 X' + (holeX - pathRadius).toFixed(5) + ' Y' + holeY.toFixed(5) + ' I' + (-pathRadius).toFixed(5) + ' J0 F' + feedRate);
          }

          gcode.push('G0 Z' + safeHeight);
          gcode.push('');
        }
      }
    }

    if (coreSafeZLine) {
      gcode.push(coreSafeZLine + ' ; Return to safe Z');
    } else {
      gcode.push('G53 G0 Z0 ; Return to machine Z0');
    }
    if (mistM7 || floodM8) {
      gcode.push('M9 ; Coolant off');
    }
    if (spindleRPM > 0) {
      gcode.push('M5 ; Stop spindle');
    }
    gcode.push('M30 ; Program end');

    return gcode.join('\n');
  }

  return { generateBoringGcode: generateBoringGcode };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { makeBoringGenerator: makeBoringGenerator };
}
