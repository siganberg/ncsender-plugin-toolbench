/**
 * Planer Plugin
 * Generates G-code for planer operations (fly-cutting)
 */

export async function onLoad(ctx) {
  ctx.log('ToolBench plugin loaded');

  // Register the Planer tool in the Tools menu (client-only dialogs)
  ctx.registerToolMenu('Planer', async () => {
    ctx.log('Planer tool clicked');

    // Get app settings to determine units
    const appSettings = ctx.getAppSettings();
    const unitsPreference = appSettings.unitsPreference || 'metric';
    const isImperial = unitsPreference === 'imperial';

    // Unit labels
    const distanceUnit = isImperial ? 'in' : 'mm';
    const feedRateUnit = isImperial ? 'in/min' : 'mm/min';

    // Conversion factor
    const MM_TO_INCH = 0.0393701;

    // Get saved settings for Planer (separate from jointer)
    const savedPlanerSettings = ctx.getSettings()?.planer || {};
    const defaultPatternType = savedPlanerSettings.patternType ?? (savedPlanerSettings.invertOrientation ? 'zigzagX' : 'zigzagY');

    // Convert from metric to imperial if needed for display
    const convertToDisplay = (value) => isImperial ? parseFloat((value * MM_TO_INCH).toFixed(4)) : value;

    const settings = {
      xDimension: convertToDisplay(savedPlanerSettings.xDimension ?? 100),
      yDimension: convertToDisplay(savedPlanerSettings.yDimension ?? 100),
      depthOfCut: convertToDisplay(savedPlanerSettings.depthOfCut ?? 0.5),
      targetDepth: convertToDisplay(savedPlanerSettings.targetDepth ?? 0.5),
      bitDiameter: convertToDisplay(savedPlanerSettings.bitDiameter ?? 25.4),
      stepover: savedPlanerSettings.stepover ?? 80,
      feedRate: convertToDisplay(savedPlanerSettings.feedRate ?? 2000),
      plungeFeedRate: convertToDisplay(savedPlanerSettings.plungeFeedRate ?? 200),
      spindleRpm: savedPlanerSettings.spindleRpm ?? 15000,
      spindleDelay: savedPlanerSettings.spindleDelay ?? 5,
      patternType: defaultPatternType,
      mistM7: savedPlanerSettings.mistM7 ?? false,
      floodM8: savedPlanerSettings.floodM8 ?? false
    };

    ctx.showDialog('Planer Operation',
      /* html */ `
      <style>
        .planer-layout {
          display: flex;
          flex-direction: column;
          max-width: 800px;
          width: 100%;
          overflow-x: hidden;
        }
        .form-column {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 20px;
          box-sizing: border-box;
        }
        .plugin-dialog-footer {
          grid-column: 1 / -1;
          padding: 16px 20px;
          border-top: 1px solid var(--color-border);
          background: var(--color-surface);
        }
        .form-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-cards-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          width: 100%;
          box-sizing: border-box;
        }

        .form-card {
          background: var(--color-surface-muted);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-medium);
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15);
          box-sizing: border-box;
          min-width: 0;
        }

        .form-card-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text-primary);
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-border);
          text-align: center;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        .form-row.coolant-row {
          grid-template-columns: 1fr;
          display: flex;
          align-items: center;
          gap: 0;
          justify-content: space-between;
        }
        .form-row.spindle-row {
          align-items: center;
        }
        .spindle-delay-group {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        .spindle-delay-group .toggle-label {
          font-size: 0.8rem;
          color: var(--color-text-secondary);
          margin: 0;
        }
        .spindle-delay-group .toggle-hint {
          font-size: 0.75rem;
          color: var(--color-text-secondary);
        }
        .coolant-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--color-text-primary);
          flex-shrink: 0;
        }
        .coolant-controls {
          flex: 1;
          display: flex;
          gap: 24px;
          justify-content: flex-end;
        }
        .coolant-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
        }
        .form-group {
          display: flex;
          flex-direction: column;
        }
        .spindle-settings-group {
          gap: 6px;
        }
        .form-row.delay-row {
          grid-template-columns: 1fr;
          display: flex;
          align-items: center;
          gap: 0;
        }
        .delay-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--color-text-primary);
          flex-shrink: 0;
        }
        .delay-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
        }
        label {
          font-size: 0.85rem;
          font-weight: 500;
          margin-bottom: 4px;
          color: var(--color-text-primary);
          text-align: center;
        }
        input[type="number"] {
          padding: 8px;
          text-align: center;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-small);
          font-size: 0.9rem;
          background: var(--color-surface);
          color: var(--color-text-primary);
        }
        input[type="number"]:focus {
          outline: none;
          border-color: var(--color-accent);
        }
        .toggle-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toggle-group label {
          margin: 0;
          cursor: pointer;
          font-weight: 400;
          font-size: 0.85rem;
        }
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--color-surface-muted);
          border: 1px solid var(--color-border);
          transition: 0.3s;
          border-radius: 24px;
        }
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: var(--color-text-primary);
          transition: 0.3s;
          border-radius: 50%;
        }
        input:checked + .toggle-slider {
          background-color: var(--color-accent);
          border-color: var(--color-accent);
        }
        input:checked + .toggle-slider:before {
          transform: translateX(20px);
          background-color: white;
        }
        .orientation-row {
          grid-template-columns: 1fr;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .orientation-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--color-text-primary);
        }
        .orientation-select {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-small);
          background: var(--color-surface);
          color: var(--color-text-primary);
          font-size: 0.9rem;
          text-align: center;
          text-align-last: center;
        }
        .orientation-select:focus {
          outline: none;
          border-color: var(--color-accent);
        }
        .button-group {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: var(--radius-small);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .btn:hover {
          opacity: 0.9;
        }
        .btn-secondary {
          background: var(--color-surface-muted);
          color: var(--color-text-primary);
          border: 1px solid var(--color-border);
        }
        .btn-primary {
          background: var(--color-accent);
          color: white;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
          .form-cards-container {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="planer-layout">
        <div class="form-column">
          <form id="planerForm" novalidate>
            <div class="form-cards-container">
              <div class="form-card">
                <div class="form-card-title">Dimensions</div>
                <div class="form-row orientation-row">
                  <label class="orientation-label" for="patternType">Direction</label>
                  <select id="patternType" class="orientation-select">
                    <option value="zigzagX" ${settings.patternType === 'zigzagX' ? 'selected' : ''}>Horizontal</option>
                    <option value="zigzagY" ${settings.patternType === 'zigzagY' ? 'selected' : ''}>Vertical</option>
                    <option value="spiral" ${settings.patternType === 'spiral' ? 'selected' : ''}>Spiral</option>
                  </select>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="xDimension">X Dimension (${distanceUnit})</label>
                    <input type="number" id="xDimension" step="0.1" value="${settings.xDimension}">
                  </div>
                  <div class="form-group">
                    <label for="yDimension">Y Dimension (${distanceUnit})</label>
                    <input type="number" id="yDimension" step="0.1" value="${settings.yDimension}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="depthOfCut">Depth of Cut (${distanceUnit})</label>
                    <input type="number" id="depthOfCut" step="0.1" value="${settings.depthOfCut}">
                  </div>
                  <div class="form-group">
                    <label for="targetDepth">Target Depth (${distanceUnit})</label>
                    <input type="number" id="targetDepth" step="0.1" value="${settings.targetDepth}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="stepover">Stepover (%)</label>
                    <input type="number" id="stepover" step="1" value="${settings.stepover}">
                  </div>
                </div>
              </div>

              <div class="form-card">
                <div class="form-card-title">Machine Settings</div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="bitDiameter">Bit Diameter (${distanceUnit})</label>
                    <input type="number" id="bitDiameter" step="0.1" value="${settings.bitDiameter}">
                  </div>
                  <div class="form-group">
                    <label for="feedRate">Feed Rate</label>
                    <input type="number" id="feedRate" step="1" value="${settings.feedRate}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="spindleRpm">Spindle RPM</label>
                    <input type="number" id="spindleRpm" step="1" value="${settings.spindleRpm}">
                  </div>
                  <div class="form-group">
                    <label for="spindleDelay">Spindle Delay</label>
                    <input type="number" id="spindleDelay" min="0" max="30" step="1" value="${settings.spindleDelay}">
                  </div>
                </div>
                <div class="form-row coolant-row">
                  <div class="coolant-label">Mist Coolant</div>
                  <div class="coolant-control">
                    <label class="toggle-switch">
                      <input type="checkbox" id="mistM7" ${settings.mistM7 ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="form-row coolant-row">
                  <div class="coolant-label">Flood Coolant</div>
                  <div class="coolant-control">
                    <label class="toggle-switch">
                      <input type="checkbox" id="floodM8" ${settings.floodM8 ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div class="plugin-dialog-footer">
        <div class="button-group">
          <button type="button" class="btn btn-secondary" onclick="window.postMessage({type: 'close-plugin-dialog'}, '*')">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="document.getElementById('planerForm').requestSubmit()">Generate G-code</button>
        </div>
      </div>

      <script>
        (function() {
          // Units configuration
          const isImperial = ${isImperial};
          const INCH_TO_MM = 25.4;

          // Validation configuration (adjusted for imperial when needed)
          const validationRules = isImperial ? {
            xDimension: { min: 0.5, max: Infinity, label: 'X Dimension' },
            yDimension: { min: 0.5, max: Infinity, label: 'Y Dimension' },
            depthOfCut: { min: 0.003, max: 1, label: 'Depth of Cut' },
            targetDepth: { min: 0.003, max: 1, label: 'Target Depth' },
            bitDiameter: { min: 0.03, max: 2, label: 'Bit Diameter' },
            stepover: { min: 10, max: 100, label: 'Stepover' },
            feedRate: { min: 40, max: 800, label: 'Feed Rate' },
            spindleRpm: { min: 2000, max: 24000, label: 'Spindle RPM' },
            spindleDelay: { min: 0, max: 30, label: 'Spindle Delay', integer: true }
          } : {
            xDimension: { min: 10, max: Infinity, label: 'X Dimension' },
            yDimension: { min: 10, max: Infinity, label: 'Y Dimension' },
            depthOfCut: { min: 0.1, max: 20, label: 'Depth of Cut' },
            targetDepth: { min: 0.1, max: 20, label: 'Target Depth' },
            bitDiameter: { min: 1, max: 50, label: 'Bit Diameter' },
            stepover: { min: 10, max: 100, label: 'Stepover' },
            feedRate: { min: 1000, max: 20000, label: 'Feed Rate' },
            spindleRpm: { min: 2000, max: 24000, label: 'Spindle RPM' },
            spindleDelay: { min: 0, max: 30, label: 'Spindle Delay', integer: true }
          };

          // Create tooltip element
          const tooltip = document.createElement('div');
          tooltip.style.cssText = \`
            position: absolute;
            background: #d32f2f;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 0.85rem;
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          \`;
          tooltip.style.setProperty('white-space', 'nowrap');
          document.body.appendChild(tooltip);

          // Arrow element
          const arrow = document.createElement('div');
          arrow.style.cssText = \`
            position: absolute;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid #d32f2f;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
          \`;
          tooltip.appendChild(arrow);

          function showTooltip(element, message) {
            const rect = element.getBoundingClientRect();
            tooltip.textContent = message;
            tooltip.appendChild(arrow); // Re-append arrow after textContent

            tooltip.style.left = rect.left + (rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - 10) + 'px';
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.style.opacity = '1';

            element.style.borderColor = '#d32f2f';
            element.focus();
          }

          function hideTooltip() {
            tooltip.style.opacity = '0';
            setTimeout(() => {
              tooltip.style.left = '-9999px';
            }, 200);
          }

          function validateInput(id, value) {
            const rules = validationRules[id];
            if (!rules) return null;

            const num = parseFloat(value);

            if (isNaN(num)) {
              return \`\${rules.label} must be a valid number\`;
            }

            if (num < rules.min) {
              return \`\${rules.label} must be at least \${rules.min}\`;
            }

            if (num > rules.max) {
              return \`\${rules.label} must not exceed \${rules.max}\`;
            }

            return null;
          }

          function validateAllInputs() {
            for (const id in validationRules) {
              const element = document.getElementById(id);
              if (!element) continue;

              const error = validateInput(id, element.value);
              if (error) {
                showTooltip(element, error);
                return false;
              }
            }
            return true;
          }

          // Add input listeners to clear error state
          for (const id in validationRules) {
            const element = document.getElementById(id);
            if (element) {
              element.addEventListener('input', function() {
                this.style.borderColor = '';
                hideTooltip();
              });

              element.addEventListener('blur', function() {
                const error = validateInput(id, this.value);
                if (error) {
                  showTooltip(this, error);
                  setTimeout(hideTooltip, 3000);
                }
              });
            }
          }

          function addStartupSequence(gcode, options) {
            const { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate } = options;

            if (mistM7) {
              gcode.push('M7 ; Mist coolant on');
            }
            if (floodM8) {
              gcode.push('M8 ; Flood coolant on');
            }
            if (spindleRpm > 0) {
              gcode.push(\`M3 S\${spindleRpm} ; Start spindle\`);
            }
            if (spindleRpm > 0 && spindleDelay > 0) {
              gcode.push(\`G4 P\${spindleDelay} ; Wait \${spindleDelay} seconds\`);
            }
            gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);

            const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
            const targetDepth = -currentDepth;
            const rapidDepth = -(previousDepth || 0) - rapidClearance;

            if (rapidDepth > targetDepth) {
              gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
            }
            gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
          }

          function generatePlanerGcode(params) {
            const {
              startX, startY,
              xDimension, yDimension,
              depthOfCut, targetDepth,
              bitDiameter, stepover,
              feedRate, plungeFeedRate,
              spindleRpm,
              patternType, spindleDelay,
              mistM7, floodM8,
              isImperial
            } = params;

            // Static values that need conversion
            const safeHeight = isImperial ? (5 * 0.0393701).toFixed(3) : '5.000';
            const unitsCode = isImperial ? 'G20' : 'G21';
            const unitsLabel = isImperial ? 'inch' : 'mm';

            const stepoverDistance = (bitDiameter * stepover) / 100;
            const numDepthPasses = Math.ceil(targetDepth / depthOfCut);
            const selectedPattern = patternType || 'zigzagY';
            const invertOrientation = selectedPattern === 'zigzagX';
            const isSpiral = selectedPattern === 'spiral';

            // Use the cutter center for perimeter moves; no overcut applied
            const adjustedStartX = startX;
            const adjustedStartY = startY;
            const adjustedXDimension = xDimension;
            const adjustedYDimension = yDimension;

            const stepDimension = invertOrientation ? adjustedYDimension : adjustedXDimension;
            const numPasses = Math.ceil(stepDimension / stepoverDistance) + 1;

            let gcode = [];
            gcode.push('(Planer Operation)');
            gcode.push(\`(Start: X\${startX} Y\${startY})\`);
            gcode.push(\`(Dimensions: \${xDimension} x \${yDimension} \${unitsLabel})\`);
            gcode.push(\`(Bit Diameter: \${bitDiameter}\${unitsLabel}, Stepover: \${stepover}%)\`);
            gcode.push(\`(Target Depth: \${targetDepth}\${unitsLabel} in \${numDepthPasses} passes)\`);
            gcode.push(\`(Feed Rate: \${feedRate}\${unitsLabel}/min, Spindle: \${spindleRpm}RPM)\`);
            gcode.push('');
            gcode.push(\`\${unitsCode} ; \${isImperial ? 'Imperial' : 'Metric'} units\`);
            gcode.push('G90 ; Absolute positioning');
            gcode.push('G94 ; Feed rate per minute');
            gcode.push('');
            gcode.push('G53 G0 Z0 ; Move to machine Z0');
            gcode.push('');

            let currentDepth = 0;
            let previousDepth = 0;
            for (let depthPass = 0; depthPass < numDepthPasses; depthPass++) {
              previousDepth = currentDepth;
              currentDepth = Math.min(currentDepth + depthOfCut, targetDepth);
              gcode.push(\`(Depth pass \${depthPass + 1}/\${numDepthPasses} - Z\${(-currentDepth).toFixed(3)})\`);

              // Move to start position
              gcode.push(\`G0 X\${adjustedStartX.toFixed(3)} Y\${adjustedStartY.toFixed(3)} ; Move to start position\`);

              // Start coolant, spindle and plunge (only add coolant/spindle on first pass)
              if (depthPass === 0) {
                addStartupSequence(gcode, { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate });
              } else {
                const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
                const targetDepth = -currentDepth;
                const rapidDepth = -previousDepth - rapidClearance;

                gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);
                if (rapidDepth > targetDepth) {
                  gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
                }
                gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
              }

              if (isSpiral) {
                const effectiveStep = Math.max(Math.min(stepoverDistance, Math.min(adjustedXDimension, adjustedYDimension) / 2), 0.1);
                let left = adjustedStartX;
                let right = adjustedStartX + adjustedXDimension;
                let top = adjustedStartY;
                let bottom = adjustedStartY + adjustedYDimension;
                let currentX = adjustedStartX;
                let currentY = adjustedStartY;

                while (right - left > 0 && bottom - top > 0) {
                  gcode.push(\`G1 X\${right.toFixed(3)} Y\${top.toFixed(3)} F\${feedRate}\`);
                  currentX = right;
                  currentY = top;

                  top += effectiveStep;
                  if (top >= bottom) break;

                  gcode.push(\`G1 X\${currentX.toFixed(3)} Y\${bottom.toFixed(3)} F\${feedRate}\`);
                  currentY = bottom;

                  right -= effectiveStep;
                  if (left >= right) break;

                  gcode.push(\`G1 X\${left.toFixed(3)} Y\${currentY.toFixed(3)} F\${feedRate}\`);
                  currentX = left;

                  bottom -= effectiveStep;
                  if (top >= bottom) break;

                  gcode.push(\`G1 X\${currentX.toFixed(3)} Y\${top.toFixed(3)} F\${feedRate}\`);
                  currentY = top;

                  left += effectiveStep;
                  if (left >= right) break;

                  gcode.push(\`G1 X\${left.toFixed(3)} Y\${currentY.toFixed(3)} F\${feedRate}\`);
                  currentX = left;
                }

                const centerX = adjustedStartX + (adjustedXDimension / 2);
                const centerY = adjustedStartY + (adjustedYDimension / 2);
                if (Math.abs(currentX - centerX) > 0.01 || Math.abs(currentY - centerY) > 0.01) {
                  gcode.push(\`G1 X\${centerX.toFixed(3)} Y\${centerY.toFixed(3)} F\${feedRate}\`);
                }
              } else {
                let direction = 1;

                if (invertOrientation) {
                  // Cut along X-axis, step over Y-axis
                  for (let pass = 0; pass < numPasses; pass++) {
                    const yPos = adjustedStartY + (pass * stepoverDistance);
                    if (pass > 0) {
                      gcode.push(\`G1 Y\${yPos.toFixed(3)} F\${feedRate} ; Step over\`);
                    }
                    if (direction === 1) {
                      gcode.push(\`G1 X\${(adjustedStartX + adjustedXDimension).toFixed(3)} F\${feedRate}\`);
                    } else {
                      gcode.push(\`G1 X\${adjustedStartX.toFixed(3)} F\${feedRate}\`);
                    }
                    direction *= -1;
                  }
                } else {
                  // Cut along Y-axis, step over X-axis (default)
                  for (let pass = 0; pass < numPasses; pass++) {
                    const xPos = adjustedStartX + (pass * stepoverDistance);
                    if (pass > 0) {
                      gcode.push(\`G1 X\${xPos.toFixed(3)} F\${feedRate} ; Step over\`);
                    }
                    if (direction === 1) {
                      gcode.push(\`G1 Y\${(adjustedStartY + adjustedYDimension).toFixed(3)} F\${feedRate}\`);
                    } else {
                      gcode.push(\`G1 Y\${adjustedStartY.toFixed(3)} F\${feedRate}\`);
                    }
                    direction *= -1;
                  }
                }
              }

              // Z-hop retract and return to start
              gcode.push(\`G0 Z\${safeHeight} ; Retract to safe height\`);
              gcode.push('');
            }

            gcode.push('G53 G0 Z0 ; Move to machine Z0');
            if (mistM7 || floodM8) {
              gcode.push('M9 ; Coolant off');
            }
            if (spindleRpm > 0) {
              gcode.push('M5 ; Stop spindle');
            }
            gcode.push('M30 ; End program');

            return gcode.join('\\n');
          }

          document.getElementById('planerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate all inputs before proceeding
            if (!validateAllInputs()) {
              return;
            }

            const patternTypeSelect = document.getElementById('patternType');
            const patternType = patternTypeSelect ? patternTypeSelect.value : 'zigzagY';
            const invertOrientation = patternType === 'zigzagX';

            // Get values from form (in display units)
            const displayValues = {
              xDimension: parseFloat(document.getElementById('xDimension').value),
              yDimension: parseFloat(document.getElementById('yDimension').value),
              depthOfCut: parseFloat(document.getElementById('depthOfCut').value),
              targetDepth: parseFloat(document.getElementById('targetDepth').value),
              bitDiameter: parseFloat(document.getElementById('bitDiameter').value),
              stepover: parseFloat(document.getElementById('stepover').value),
              feedRate: parseFloat(document.getElementById('feedRate').value),
              spindleRpm: parseFloat(document.getElementById('spindleRpm').value),
              mistM7: document.getElementById('mistM7').checked,
              floodM8: document.getElementById('floodM8').checked,
              spindleDelay: parseInt(document.getElementById('spindleDelay').value)
            };

            // Get current saved plungeFeedRate from settings
            const response = await fetch('/api/plugins/com.ncsender.toolbench/settings');
            const savedSettings = response.ok ? await response.json() : {};
            const convertToDisplay = (value) => isImperial ? parseFloat((value * 0.0393701).toFixed(4)) : value;
            const currentPlungeFeedRate = convertToDisplay(savedSettings.planer?.plungeFeedRate ?? 200);

            // Convert to metric for storage
            const convertToMetric = (value) => isImperial ? value * INCH_TO_MM : value;
            const settingsToSave = {
              planer: {
                xDimension: convertToMetric(displayValues.xDimension),
                yDimension: convertToMetric(displayValues.yDimension),
                depthOfCut: convertToMetric(displayValues.depthOfCut),
                targetDepth: convertToMetric(displayValues.targetDepth),
                bitDiameter: convertToMetric(displayValues.bitDiameter),
                stepover: displayValues.stepover,
                feedRate: convertToMetric(displayValues.feedRate),
                plungeFeedRate: convertToMetric(currentPlungeFeedRate),
                spindleRpm: displayValues.spindleRpm,
                spindleDelay: displayValues.spindleDelay,
                patternType,
                invertOrientation,
                mistM7: displayValues.mistM7,
                floodM8: displayValues.floodM8
              }
            };

            // Params for G-code generation (use display values directly)
            const params = {
              startX: 0,
              startY: 0,
              xDimension: displayValues.xDimension,
              yDimension: displayValues.yDimension,
              depthOfCut: displayValues.depthOfCut,
              targetDepth: displayValues.targetDepth,
              bitDiameter: displayValues.bitDiameter,
              stepover: displayValues.stepover,
              feedRate: displayValues.feedRate,
              plungeFeedRate: currentPlungeFeedRate,
              spindleRpm: displayValues.spindleRpm,
              spindleDelay: displayValues.spindleDelay,
              patternType,
              invertOrientation,
              mistM7: displayValues.mistM7,
              floodM8: displayValues.floodM8,
              isImperial
            };

            const gcode = generatePlanerGcode(params);

            // Save settings to server (in metric)
            fetch('/api/plugins/com.ncsender.toolbench/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settingsToSave)
            }).catch(err => console.error('Failed to save settings:', err));

            // Upload file
            const formData = new FormData();
            const blob = new Blob([gcode], { type: 'text/plain' });
            formData.append('file', blob, 'Planer.nc');

            try {
              const response = await fetch('/api/gcode-files', {
                method: 'POST',
                body: formData
              });

              if (response.ok) {
                // Small delay to ensure WebSocket event propagates before closing dialog
                setTimeout(() => {
                  window.postMessage({type: 'close-plugin-dialog'}, '*');
                }, 100);
              } else {
                alert('Failed to upload G-code file');
              }
            } catch (error) {
              alert('Error uploading G-code file: ' + error.message);
            }
          });
        })();
      </script>
    `);
  }, { clientOnly: true }); // Only show to the client who clicked

  // Register the Jointer/Cutter tool in the Tools menu (client-only dialogs)
  ctx.registerToolMenu('Jointer/Cutter', async () => {
    ctx.log('Jointer/Cutter tool clicked');

    // Get app settings to determine units
    const appSettings = ctx.getAppSettings();
    const unitsPreference = appSettings.unitsPreference || 'metric';
    const isImperial = unitsPreference === 'imperial';

    // Unit labels
    const distanceUnit = isImperial ? 'in' : 'mm';
    const feedRateUnit = isImperial ? 'in/min' : 'mm/min';

    // Conversion factor
    const MM_TO_INCH = 0.0393701;

    // Get saved settings for Jointer (separate from planer)
    const savedJointerSettings = ctx.getSettings()?.jointer || {};

    // Convert from metric to imperial if needed for display
    const convertToDisplay = (value) => isImperial ? parseFloat((value * MM_TO_INCH).toFixed(4)) : value;

    const settings = {
      edgeLength: convertToDisplay(savedJointerSettings.edgeLength ?? 100),
      edge: savedJointerSettings.edge ?? 'right',
      depthOfCut: convertToDisplay(savedJointerSettings.depthOfCut ?? 5),
      materialThickness: convertToDisplay(savedJointerSettings.materialThickness ?? 5),
      trimWidth: convertToDisplay(savedJointerSettings.trimWidth ?? 0.5),
      numberOfPasses: savedJointerSettings.numberOfPasses ?? 1,
      leadInOutDistance: convertToDisplay(savedJointerSettings.leadInOutDistance ?? 5),
      bitDiameter: convertToDisplay(savedJointerSettings.bitDiameter ?? 6.35),
      feedRate: convertToDisplay(savedJointerSettings.feedRate ?? 1000),
      plungeFeedRate: convertToDisplay(savedJointerSettings.plungeFeedRate ?? 200),
      spindleRpm: savedJointerSettings.spindleRpm ?? 10000,
      mistM7: savedJointerSettings.mistM7 ?? false,
      floodM8: savedJointerSettings.floodM8 ?? false,
      spindleDelay: savedJointerSettings.spindleDelay ?? 5
    };

    ctx.showDialog('Jointer/Cutter Operation', `
      <style>
        .jointer-layout {
          display: flex;
          flex-direction: column;
          max-width: 800px;
          width: 100%;
        }
        .form-column {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }
        .plugin-dialog-footer {
          grid-column: 1 / -1;
          padding: 16px 20px;
          border-top: 1px solid var(--color-border);
          background: var(--color-surface);
        }
        .form-section {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .form-cards-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          width: 100%;
          box-sizing: border-box;
        }

        .form-card {
          background: var(--color-surface-muted);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-medium);
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15);
          box-sizing: border-box;
          min-width: 0;
        }

        .form-card-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text-primary);
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-border);
          text-align: center;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }
        .form-row.single {
          grid-template-columns: 1fr;
        }
        .form-row.coolant-row {
          grid-template-columns: 1fr;
          display: flex;
          align-items: center;
          gap: 0;
          justify-content: space-between;
        }
        .coolant-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--color-text-primary);
          flex-shrink: 0;
        }
        .coolant-controls {
          flex: 1;
          display: flex;
          gap: 24px;
          justify-content: flex-end;
        }
        .coolant-control {
          flex: 1;
          display: flex;
          justify-content: flex-end;
        }
        .form-group {
          display: flex;
          flex-direction: column;
        }
        label {
          font-size: 0.85rem;
          font-weight: 500;
          margin-bottom: 4px;
          color: var(--color-text-primary);
          text-align: center;
        }
        input[type="number"] {
          padding: 8px;
          text-align: center;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-small);
          font-size: 0.9rem;
          background: var(--color-surface);
          color: var(--color-text-primary);
        }
        input[type="number"]:focus {
          outline: none;
          border-color: var(--color-accent);
        }
        .toggle-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toggle-group label {
          margin: 0;
          cursor: pointer;
          font-weight: 400;
          font-size: 0.85rem;
        }
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--color-surface-muted);
          border: 1px solid var(--color-border);
          transition: 0.3s;
          border-radius: 24px;
        }
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 16px;
          width: 16px;
          left: 3px;
          bottom: 3px;
          background-color: var(--color-text-primary);
          transition: 0.3s;
          border-radius: 50%;
        }
        input:checked + .toggle-slider {
          background-color: var(--color-accent);
          border-color: var(--color-accent);
        }
        input:checked + .toggle-slider:before {
          transform: translateX(20px);
          background-color: white;
        }
        .orientation-row {
          grid-template-columns: 1fr;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .orientation-label {
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--color-text-primary);
        }
        .orientation-select {
          width: 100%;
          padding: 8px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-small);
          background: var(--color-surface);
          color: var(--color-text-primary);
          font-size: 0.9rem;
          text-align: center;
          text-align-last: center;
        }
        .orientation-select:focus {
          outline: none;
          border-color: var(--color-accent);
        }
        .button-group {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: var(--radius-small);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        .btn:hover {
          opacity: 0.9;
        }
        .btn-secondary {
          background: var(--color-surface-muted);
          color: var(--color-text-primary);
          border: 1px solid var(--color-border);
        }
        .btn-primary {
          background: var(--color-accent);
          color: white;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
          .form-cards-container {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="jointer-layout">
        <div class="form-column">
          <form id="jointerForm" novalidate>
            <div class="form-cards-container">
              <div class="form-card">
                <div class="form-card-title">Dimensions</div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="edgeLength">Edge Length (${distanceUnit})</label>
                    <input type="number" id="edgeLength" step="0.1" value="${settings.edgeLength}">
                  </div>
                  <div class="form-group">
                    <label for="edge">Edge</label>
                    <select id="edge" class="orientation-select">
                      <option value="left" ${settings.edge === 'left' ? 'selected' : ''}>Left</option>
                      <option value="right" ${settings.edge === 'right' ? 'selected' : ''}>Right</option>
                      <option value="front" ${settings.edge === 'front' ? 'selected' : ''}>Front</option>
                      <option value="back" ${settings.edge === 'back' ? 'selected' : ''}>Back</option>
                    </select>
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="depthOfCut">Depth of Cut (${distanceUnit})</label>
                    <input type="number" id="depthOfCut" step="0.1" value="${settings.depthOfCut}">
                  </div>
                  <div class="form-group">
                    <label for="materialThickness">Material Thickness (${distanceUnit})</label>
                    <input type="number" id="materialThickness" step="0.1" value="${settings.materialThickness}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="trimWidth">Trim Width (${distanceUnit})</label>
                    <input type="number" id="trimWidth" step="0.01" value="${settings.trimWidth}">
                  </div>
                  <div class="form-group">
                    <label for="numberOfPasses">Number of Passes</label>
                    <input type="number" id="numberOfPasses" step="1" value="${settings.numberOfPasses}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="leadInOutDistance">Lead-In/Out (${distanceUnit})</label>
                    <input type="number" id="leadInOutDistance" step="0.1" value="${settings.leadInOutDistance}">
                  </div>
                </div>
              </div>

              <div class="form-card">
                <div class="form-card-title">Machine Settings</div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="bitDiameter">Bit Diameter (${distanceUnit})</label>
                    <input type="number" id="bitDiameter" step="0.01" value="${settings.bitDiameter}">
                  </div>
                  <div class="form-group">
                    <label for="feedRate">Feed Rate</label>
                    <input type="number" id="feedRate" step="1" value="${settings.feedRate}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="spindleRpm">Spindle RPM</label>
                    <input type="number" id="spindleRpm" step="1" value="${settings.spindleRpm}">
                  </div>
                  <div class="form-group">
                    <label for="spindleDelay">Spindle Delay</label>
                    <input type="number" id="spindleDelay" min="0" max="30" step="1" value="${settings.spindleDelay}">
                  </div>
                </div>
                <div class="form-row coolant-row">
                  <div class="coolant-label">Mist Coolant</div>
                  <div class="coolant-control">
                    <label class="toggle-switch">
                      <input type="checkbox" id="mistM7" ${settings.mistM7 ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
                <div class="form-row coolant-row">
                  <div class="coolant-label">Flood Coolant</div>
                  <div class="coolant-control">
                    <label class="toggle-switch">
                      <input type="checkbox" id="floodM8" ${settings.floodM8 ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div class="plugin-dialog-footer">
        <div class="button-group">
          <button type="button" class="btn btn-secondary" onclick="window.postMessage({type: 'close-plugin-dialog'}, '*')">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="document.getElementById('jointerForm').requestSubmit()">Generate G-code</button>
        </div>
      </div>

      <script>
        (function() {
          // Units configuration
          const isImperial = ${isImperial};
          const INCH_TO_MM = 25.4;

          // Validation configuration
          const validationRules = isImperial ? {
            edgeLength: { min: 1, max: 49, label: 'Edge Length' },
            depthOfCut: { min: 0.1, max: 4, label: 'Depth of Cut' },
            materialThickness: { min: 0.1, max: 4, label: 'Material Thickness' },
            trimWidth: { min: 0, max: 0.2, label: 'Trim Width' },
            numberOfPasses: { min: 1, max: 5, label: 'Number of Passes', integer: true },
            leadInOutDistance: { min: 0.1, max: 2, label: 'Lead-In/Out Distance' },
            bitDiameter: { min: 0.25, max: 2, label: 'Bit Diameter' },
            feedRate: { min: 10, max: 400, label: 'Feed Rate' },
            spindleRpm: { min: 1000, max: 24000, label: 'Spindle RPM' },
            spindleDelay: { min: 0, max: 30, label: 'Spindle Delay', integer: true }
          } : {
            edgeLength: { min: 10, max: 5000, label: 'Edge Length' },
            depthOfCut: { min: 0.1, max: 100, label: 'Depth of Cut' },
            materialThickness: { min: 1, max: 100, label: 'Material Thickness' },
            trimWidth: { min: 0, max: 5, label: 'Trim Width' },
            numberOfPasses: { min: 1, max: 5, label: 'Number of Passes', integer: true },
            leadInOutDistance: { min: 1, max: 50, label: 'Lead-In/Out Distance' },
            bitDiameter: { min: 1, max: 50, label: 'Bit Diameter' },
            feedRate: { min: 100, max: 10000, label: 'Feed Rate' },
            spindleRpm: { min: 1000, max: 24000, label: 'Spindle RPM' },
            spindleDelay: { min: 0, max: 30, label: 'Spindle Delay', integer: true }
          };

          // Create tooltip element
          const tooltip = document.createElement('div');
          tooltip.style.cssText = \`
            position: absolute;
            background: #d32f2f;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 0.85rem;
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          \`;
          tooltip.style.setProperty('white-space', 'nowrap');
          document.body.appendChild(tooltip);

          const arrow = document.createElement('div');
          arrow.style.cssText = \`
            position: absolute;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid #d32f2f;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
          \`;
          tooltip.appendChild(arrow);

          function showTooltip(element, message) {
            const rect = element.getBoundingClientRect();
            tooltip.textContent = message;
            tooltip.appendChild(arrow);

            tooltip.style.left = rect.left + (rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - 10) + 'px';
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.style.opacity = '1';

            element.style.borderColor = '#d32f2f';
            element.focus();
          }

          function hideTooltip() {
            tooltip.style.opacity = '0';
            setTimeout(() => {
              tooltip.style.left = '-9999px';
            }, 200);
          }

          function validateInput(id, value) {
            const rules = validationRules[id];
            if (!rules) return null;

            const num = parseFloat(value);

            if (isNaN(num)) {
              return \`\${rules.label} must be a valid number\`;
            }

            if (rules.integer && !Number.isInteger(num)) {
              return \`\${rules.label} must be a whole number\`;
            }

            if (num < rules.min) {
              return \`\${rules.label} must be at least \${rules.min}\`;
            }

            if (num > rules.max) {
              return \`\${rules.label} must not exceed \${rules.max}\`;
            }

            return null;
          }

          function validateAllInputs() {
            for (const id in validationRules) {
              const element = document.getElementById(id);
              if (!element) continue;

              const error = validateInput(id, element.value);
              if (error) {
                showTooltip(element, error);
                return false;
              }
            }
            return true;
          }

          // Add input listeners
          for (const id in validationRules) {
            const element = document.getElementById(id);
            if (element) {
              element.addEventListener('input', function() {
                this.style.borderColor = '';
                hideTooltip();
              });

              element.addEventListener('blur', function() {
                const error = validateInput(id, this.value);
                if (error) {
                  showTooltip(this, error);
                  setTimeout(hideTooltip, 3000);
                }
              });
            }
          }

          function addJointerStartupSequence(gcode, options) {
            const { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate } = options;

            if (mistM7) {
              gcode.push('M7 ; Mist coolant on');
            }
            if (floodM8) {
              gcode.push('M8 ; Flood coolant on');
            }
            if (spindleRpm > 0) {
              gcode.push(\`M3 S\${spindleRpm} ; Start spindle\`);
            }
            if (spindleRpm > 0 && spindleDelay > 0) {
              gcode.push(\`G4 P\${spindleDelay} ; Wait \${spindleDelay} seconds\`);
            }
            gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);

            const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
            const targetDepth = -currentDepth;
            const rapidDepth = -(previousDepth || 0) - rapidClearance;

            if (rapidDepth > targetDepth) {
              gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
            }
            gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
          }

          function generateJointerGcode(params) {
            const {
              edgeLength, edge,
              depthOfCut, materialThickness,
              trimWidth, numberOfPasses,
              leadInOutDistance, bitDiameter,
              feedRate, plungeFeedRate,
              spindleRpm,
              mistM7, floodM8,
              spindleDelay,
              isImperial
            } = params;

            const safeHeight = isImperial ? (5 * 0.0393701).toFixed(3) : '5.000';
            const unitsCode = isImperial ? 'G20' : 'G21';
            const unitsLabel = isImperial ? 'inch' : 'mm';

            const numDepthPasses = Math.ceil(materialThickness / depthOfCut);

            let gcode = [];
            gcode.push('(Jointer Operation)');
            gcode.push(\`(Edge: \${edge})\`);
            gcode.push(\`(Edge Length: \${edgeLength}\${unitsLabel})\`);
            gcode.push(\`(Material Thickness: \${materialThickness}\${unitsLabel} in \${numDepthPasses} depth passes)\`);
            gcode.push(\`(Trim Width: \${trimWidth}\${unitsLabel}, Passes: \${numberOfPasses})\`);
            gcode.push(\`(Lead-In/Out: \${leadInOutDistance}\${unitsLabel})\`);
            gcode.push(\`(Bit Diameter: \${bitDiameter}\${unitsLabel})\`);
            gcode.push(\`(Feed Rate: \${feedRate}\${unitsLabel}/min, Spindle: \${spindleRpm}RPM)\`);
            gcode.push('');
            gcode.push(\`\${unitsCode} ; \${isImperial ? 'Imperial' : 'Metric'} units\`);
            gcode.push('G90 ; Absolute positioning');
            gcode.push('G94 ; Feed rate per minute');
            gcode.push('');
            gcode.push('G53 G0 Z0 ; Move to machine Z0');
            gcode.push('');

            // Loop through trim width passes
            for (let pass = 0; pass < numberOfPasses; pass++) {
              const offset = (bitDiameter / 2) + trimWidth + (pass * trimWidth);
              gcode.push(\`(Trim pass \${pass + 1}/\${numberOfPasses} - Offset: \${offset.toFixed(3)}\${unitsLabel})\`);

              // Loop through depth passes
              let currentDepth = 0;
              let previousDepth = 0;
              for (let depthPass = 0; depthPass < numDepthPasses; depthPass++) {
                previousDepth = currentDepth;
                currentDepth = Math.min(currentDepth + depthOfCut, materialThickness);
                gcode.push(\`(Depth pass \${depthPass + 1}/\${numDepthPasses} - Z\${(-currentDepth).toFixed(3)})\`);

                if (edge === 'left') {
                  // Left edge: Cut along Y-axis (negative direction for conventional), offset in positive X
                  const startX = offset;
                  const startY = edgeLength + leadInOutDistance;
                  const endY = -leadInOutDistance;

                  gcode.push(\`G0 X\${startX.toFixed(3)} Y\${startY.toFixed(3)} ; Move to start (with lead-in)\`);

                  // Start coolant, spindle and plunge (only add coolant/spindle on first pass)
                  if (pass === 0 && depthPass === 0) {
                    addJointerStartupSequence(gcode, { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate });
                  } else {
                    const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
                    const targetDepth = -currentDepth;
                    const rapidDepth = -previousDepth - rapidClearance;

                    gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);
                    if (rapidDepth > targetDepth) {
                      gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
                    }
                    gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
                  }
                  gcode.push(\`G1 Y\${endY.toFixed(3)} F\${feedRate} ; Cut along left edge (conventional)\`);
                  gcode.push(\`G0 Z\${safeHeight} ; Retract\`);
                } else if (edge === 'right') {
                  // Right edge: Cut along Y-axis (positive direction for conventional), offset in negative X
                  const startX = -offset;
                  const startY = -leadInOutDistance;
                  const endY = edgeLength + leadInOutDistance;

                  gcode.push(\`G0 X\${startX.toFixed(3)} Y\${startY.toFixed(3)} ; Move to start (with lead-in)\`);

                  // Start coolant, spindle and plunge (only add coolant/spindle on first pass)
                  if (pass === 0 && depthPass === 0) {
                    addJointerStartupSequence(gcode, { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate });
                  } else {
                    const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
                    const targetDepth = -currentDepth;
                    const rapidDepth = -previousDepth - rapidClearance;

                    gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);
                    if (rapidDepth > targetDepth) {
                      gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
                    }
                    gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
                  }
                  gcode.push(\`G1 Y\${endY.toFixed(3)} F\${feedRate} ; Cut along right edge (conventional)\`);
                  gcode.push(\`G0 Z\${safeHeight} ; Retract\`);
                } else if (edge === 'front') {
                  // Front edge: Cut along X-axis (negative direction), offset in positive Y
                  const startY = offset;
                  const startX = edgeLength + leadInOutDistance;
                  const endX = -leadInOutDistance;

                  gcode.push(\`G0 X\${startX.toFixed(3)} Y\${startY.toFixed(3)} ; Move to start (with lead-in)\`);

                  // Start coolant, spindle and plunge (only add coolant/spindle on first pass)
                  if (pass === 0 && depthPass === 0) {
                    addJointerStartupSequence(gcode, { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate });
                  } else {
                    const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
                    const targetDepth = -currentDepth;
                    const rapidDepth = -previousDepth - rapidClearance;

                    gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);
                    if (rapidDepth > targetDepth) {
                      gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
                    }
                    gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
                  }
                  gcode.push(\`G1 X\${endX.toFixed(3)} F\${feedRate} ; Cut along front edge (conventional)\`);
                  gcode.push(\`G0 Z\${safeHeight} ; Retract\`);
                } else {
                  // Back edge: Cut along X-axis (positive direction), offset in negative Y
                  const startY = -offset;
                  const startX = -leadInOutDistance;
                  const endX = edgeLength + leadInOutDistance;

                  gcode.push(\`G0 X\${startX.toFixed(3)} Y\${startY.toFixed(3)} ; Move to start (with lead-in)\`);

                  // Start coolant, spindle and plunge (only add coolant/spindle on first pass)
                  if (pass === 0 && depthPass === 0) {
                    addJointerStartupSequence(gcode, { mistM7, floodM8, spindleRpm, spindleDelay, safeHeight, isImperial, currentDepth, previousDepth, plungeFeedRate });
                  } else {
                    const rapidClearance = isImperial ? (2 * 0.0393701) : 2;
                    const targetDepth = -currentDepth;
                    const rapidDepth = -previousDepth - rapidClearance;

                    gcode.push(\`G0 Z\${safeHeight} ; Rapid to safe height\`);
                    if (rapidDepth > targetDepth) {
                      gcode.push(\`G0 Z\${rapidDepth.toFixed(3)} ; Rapid to 2mm above previous surface\`);
                    }
                    gcode.push(\`G1 Z\${targetDepth.toFixed(3)} F\${plungeFeedRate} ; Plunge to depth\`);
                  }
                  gcode.push(\`G1 X\${endX.toFixed(3)} F\${feedRate} ; Cut along back edge (conventional)\`);
                  gcode.push(\`G0 Z\${safeHeight} ; Retract\`);
                }
              }
              gcode.push('');
            }

            gcode.push('G53 G0 Z0 ; Move to machine Z0');
            if (mistM7 || floodM8) {
              gcode.push('M9 ; Coolant off');
            }
            if (spindleRpm > 0) {
              gcode.push('M5 ; Stop spindle');
            }
            gcode.push('M30 ; End program');

            return gcode.join('\\n');
          }

          document.getElementById('jointerForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!validateAllInputs()) {
              return;
            }

            const edgeSelect = document.getElementById('edge');
            const edge = edgeSelect ? edgeSelect.value : 'right';

            const displayValues = {
              edgeLength: parseFloat(document.getElementById('edgeLength').value),
              edge,
              depthOfCut: parseFloat(document.getElementById('depthOfCut').value),
              materialThickness: parseFloat(document.getElementById('materialThickness').value),
              trimWidth: parseFloat(document.getElementById('trimWidth').value),
              numberOfPasses: parseInt(document.getElementById('numberOfPasses').value),
              leadInOutDistance: parseFloat(document.getElementById('leadInOutDistance').value),
              bitDiameter: parseFloat(document.getElementById('bitDiameter').value),
              feedRate: parseFloat(document.getElementById('feedRate').value),
              spindleRpm: parseFloat(document.getElementById('spindleRpm').value),
              mistM7: document.getElementById('mistM7').checked,
              floodM8: document.getElementById('floodM8').checked,
              spindleDelay: parseInt(document.getElementById('spindleDelay').value)
            };

            // Get current saved plungeFeedRate from settings
            const response = await fetch('/api/plugins/com.ncsender.toolbench/settings');
            const savedSettings = response.ok ? await response.json() : {};
            const convertToDisplay = (value) => isImperial ? parseFloat((value * 0.0393701).toFixed(4)) : value;
            const currentPlungeFeedRate = convertToDisplay(savedSettings.jointer?.plungeFeedRate ?? 200);

            const convertToMetric = (value) => isImperial ? value * INCH_TO_MM : value;
            const settingsToSave = {
              jointer: {
                edgeLength: convertToMetric(displayValues.edgeLength),
                edge: displayValues.edge,
                depthOfCut: convertToMetric(displayValues.depthOfCut),
                materialThickness: convertToMetric(displayValues.materialThickness),
                trimWidth: convertToMetric(displayValues.trimWidth),
                numberOfPasses: displayValues.numberOfPasses,
                leadInOutDistance: convertToMetric(displayValues.leadInOutDistance),
                bitDiameter: convertToMetric(displayValues.bitDiameter),
                feedRate: convertToMetric(displayValues.feedRate),
                plungeFeedRate: convertToMetric(currentPlungeFeedRate),
                spindleRpm: displayValues.spindleRpm,
                mistM7: displayValues.mistM7,
                floodM8: displayValues.floodM8,
                spindleDelay: displayValues.spindleDelay
              }
            };

            const params = {
              ...displayValues,
              plungeFeedRate: currentPlungeFeedRate,
              isImperial
            };

            const gcode = generateJointerGcode(params);

            // Save settings
            fetch('/api/plugins/com.ncsender.toolbench/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settingsToSave)
            }).catch(err => console.error('Failed to save settings:', err));

            // Upload file
            const formData = new FormData();
            const blob = new Blob([gcode], { type: 'text/plain' });
            formData.append('file', blob, 'Jointer.nc');

            try {
              const response = await fetch('/api/gcode-files', {
                method: 'POST',
                body: formData
              });

              if (response.ok) {
                // Small delay to ensure WebSocket event propagates before closing dialog
                setTimeout(() => {
                  window.postMessage({type: 'close-plugin-dialog'}, '*');
                }, 100);
              } else {
                alert('Failed to upload G-code file');
              }
            } catch (error) {
              alert('Error uploading G-code file: ' + error.message);
            }
          });
        })();
      </script>
    `);
  }, { clientOnly: true }); // Only show to the client who clicked

  // Register the Boring tool in the Tools menu (client-only dialogs)
  ctx.registerToolMenu('Boring', async () => {
    ctx.log('Boring tool clicked');

    // Get app settings to determine units
    const appSettings = ctx.getAppSettings();
    const unitsPreference = appSettings.unitsPreference || 'metric';
    const distanceUnit = unitsPreference === 'imperial' ? 'in' : 'mm';
    const isImperial = unitsPreference === 'imperial';

    // Conversion functions
    const convertToDisplay = (metricValue) => {
      if (isImperial) {
        return (metricValue / 25.4).toFixed(4);
      }
      return metricValue;
    };

    const convertToMetric = (displayValue) => {
      if (isImperial) {
        return displayValue * 25.4;
      }
      return displayValue;
    };

    // Get saved settings for Boring (separate from other tools)
    const savedBoringSettings = ctx.getSettings()?.boring || {};

    const settings = {
      xCount: savedBoringSettings.xCount ?? 1,
      xDistance: convertToDisplay(savedBoringSettings.xDistance ?? 50),
      yCount: savedBoringSettings.yCount ?? 1,
      yDistance: convertToDisplay(savedBoringSettings.yDistance ?? 50),
      diameter: convertToDisplay(savedBoringSettings.diameter ?? 10),
      depth: convertToDisplay(savedBoringSettings.depth ?? 5),
      cutType: savedBoringSettings.cutType ?? 'inner',
      toolDiameter: convertToDisplay(savedBoringSettings.toolDiameter ?? 3.17),
      pitch: convertToDisplay(savedBoringSettings.pitch ?? 2),
      feedRate: convertToDisplay(savedBoringSettings.feedRate ?? 300),
      plungeFeedRate: convertToDisplay(savedBoringSettings.plungeFeedRate ?? 200),
      spindleRPM: savedBoringSettings.spindleRPM ?? 18000,
      spindleDelay: savedBoringSettings.spindleDelay ?? 6,
      mistM7: savedBoringSettings.mistM7 ?? false,
      floodM8: savedBoringSettings.floodM8 ?? false
    };

    ctx.showDialog('Boring Operation', `
      <style>
        .boring-layout {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 800px;
          margin: 0 auto;
          overflow-x: hidden;
        }

        .boring-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 24px;
          box-sizing: border-box;
        }

        .form-cards-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .form-card {
          margin-bottom: 0;
        }

        .plugin-dialog-footer {
          border-top: 1px solid var(--color-border);
          padding: 16px 24px;
        }

        .button-group {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .btn {
          padding: 8px 16px;
          border-radius: var(--radius-small);
          border: 1px solid var(--color-border);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary {
          background: var(--color-surface);
          color: var(--color-text-primary);
        }

        .btn-secondary:hover {
          background: var(--color-surface-hover);
        }

        .btn-primary {
          background: var(--color-primary);
          color: white;
          border-color: var(--color-primary);
        }

        .btn-primary:hover {
          background: var(--color-primary-hover);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .form-group label {
          font-weight: 500;
          color: var(--color-text-primary);
          font-size: 0.9rem;
          text-align: center;
        }

        .form-group input {
          padding: 8px 12px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-small);
          background: var(--color-surface);
          color: var(--color-text-primary);
          font-size: 0.9rem;
          text-align: center;
          width: 100%;
          max-width: 100%;
          box-sizing: border-box;
        }

        .form-group input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          background: var(--color-surface-muted);
        }

        .cut-type-label {
          font-weight: 500;
          color: var(--color-text-primary);
          font-size: 0.9rem;
        }

        .cut-type-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin-top: 6px;
        }

        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 50px;
          height: 26px;
        }

        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--color-surface-muted);
          border: 1px solid var(--color-border);
          transition: 0.3s;
          border-radius: 26px;
        }

        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: var(--color-text-primary);
          transition: 0.3s;
          border-radius: 50%;
        }

        input:checked + .toggle-slider {
          background-color: var(--color-accent);
          border-color: var(--color-accent);
        }

        input:checked + .toggle-slider:before {
          transform: translateX(24px);
          background-color: white;
        }

        .cut-type-labels {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }

        .cut-type-labels .active {
          color: var(--color-text-primary);
          font-weight: 500;
        }

        .form-row.coolant-row {
          grid-template-columns: 1fr;
          display: flex;
          align-items: center;
          gap: 0;
          justify-content: space-between;
        }

        .coolant-label {
          font-weight: 500;
          color: var(--color-text-primary);
          font-size: 0.9rem;
          min-width: 80px;
        }

        .coolant-controls {
          display: flex;
          gap: 20px;
          flex: 1;
        }

        .toggle-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .toggle-group label:first-child {
          font-size: 0.85rem;
          color: var(--color-text-secondary);
        }

        .form-card {
          background: var(--color-surface-muted);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-medium);
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15);
        }

        .form-card-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text-primary);
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--color-border);
          text-align: center;
        }

        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }
          .form-cards-container {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="boring-layout">
        <div class="boring-content">
          <form id="boringForm" novalidate>
            <div class="form-cards-container">
              <div class="form-card">
                <div class="form-card-title">Dimensions</div>
              <div class="form-row">
                <div class="form-group">
                  <label class="cut-type-label">Cut</label>
                  <div class="cut-type-toggle">
                    <div class="cut-type-labels">
                      <span id="innerLabel" class="${settings.cutType === 'inner' ? 'active' : ''}">Inner</span>
                    </div>
                    <label class="toggle-switch">
                      <input type="checkbox" id="cutType" ${settings.cutType === 'outer' ? 'checked' : ''}>
                      <span class="toggle-slider"></span>
                    </label>
                    <div class="cut-type-labels">
                      <span id="outerLabel" class="${settings.cutType === 'outer' ? 'active' : ''}">Outer</span>
                    </div>
                  </div>
                </div>
                <div class="form-group">
                  <label for="diameter">Diameter (${distanceUnit})</label>
                  <input type="number" id="diameter" min="0.1" step="0.1" value="${settings.diameter}" required>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="xCount">X-Count</label>
                  <input type="number" id="xCount" min="1" max="200" step="1" value="${settings.xCount}" required>
                </div>
                <div class="form-group">
                  <label for="xDistance">X-Distance (${distanceUnit})</label>
                  <input type="number" id="xDistance" min="0.1" step="0.1" value="${settings.xDistance}" required>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="yCount">Y-Count</label>
                  <input type="number" id="yCount" min="1" max="200" step="1" value="${settings.yCount}" required>
                </div>
                <div class="form-group">
                  <label for="yDistance">Y-Distance (${distanceUnit})</label>
                  <input type="number" id="yDistance" min="0.1" step="0.1" value="${settings.yDistance}" required>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="depth">Depth (${distanceUnit})</label>
                  <input type="number" id="depth" min="0.1" step="0.1" value="${settings.depth}" required>
                </div>
                <div class="form-group">
                  <label for="pitch">Pitch (${distanceUnit})</label>
                  <input type="number" id="pitch" min="0.1" max="10" step="0.1" value="${settings.pitch}" required>
                </div>
              </div>
            </div>

            <div class="form-card">
              <div class="form-card-title">Machine Settings</div>
              <div class="form-row">
                <div class="form-group">
                  <label for="bitDiameter">Bit Diameter (${distanceUnit})</label>
                  <input type="number" id="bitDiameter" min="0.1" step="0.01" value="${settings.toolDiameter}" required>
                </div>
                <div class="form-group">
                  <label for="feedRate">Feed Rate</label>
                  <input type="number" id="feedRate" min="1" step="1" value="${settings.feedRate}" required>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label for="spindleRPM">Spindle RPM</label>
                  <input type="number" id="spindleRPM" min="1" max="24000" step="100" value="${settings.spindleRPM}" required>
                </div>
                <div class="form-group">
                  <label for="spindleDelay">Spindle Delay</label>
                  <input type="number" id="spindleDelay" min="0" max="30" step="1" value="${settings.spindleDelay}" required>
                </div>
              </div>

              <div class="form-row coolant-row">
                <div class="coolant-label">Mist Coolant</div>
                <div class="coolant-control">
                  <label class="toggle-switch">
                    <input type="checkbox" id="mistM7" ${settings.mistM7 ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
              <div class="form-row coolant-row">
                <div class="coolant-label">Flood Coolant</div>
                <div class="coolant-control">
                  <label class="toggle-switch">
                    <input type="checkbox" id="floodM8" ${settings.floodM8 ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
            </div>
          </form>
        </div>

        <div class="plugin-dialog-footer">
          <div class="button-group">
            <button type="button" class="btn btn-secondary" onclick="window.postMessage({type: 'close-plugin-dialog'}, '*')">Close</button>
            <button type="button" class="btn btn-primary" onclick="document.getElementById('boringForm').requestSubmit()">Generate</button>
          </div>
        </div>
      </div>

      <script>
        (function() {
          const isImperial = ${isImperial};

          // Validation configuration
          const validationRules = isImperial ? {
            xCount: { min: 1, max: 200, label: 'X-Count', integer: true },
            yCount: { min: 1, max: 200, label: 'Y-Count', integer: true },
            xDistance: { min: 0.004, max: Infinity, label: 'X-Distance' },
            yDistance: { min: 0.004, max: Infinity, label: 'Y-Distance' },
            diameter: { min: 0.004, max: Infinity, label: 'Diameter' },
            depth: { min: 0.004, max: Infinity, label: 'Depth' },
            bitDiameter: { min: 0.004, max: Infinity, label: 'Bit Diameter' },
            pitch: { min: 0.1, max: 10, label: 'Pitch' },
            feedRate: { min: 1, max: Infinity, label: 'Feed Rate' },
            spindleRPM: { min: 1, max: 24000, label: 'Spindle RPM', integer: true },
            spindleDelay: { min: 0, max: 30, label: 'Spindle Delay', integer: true }
          } : {
            xCount: { min: 1, max: 200, label: 'X-Count', integer: true },
            yCount: { min: 1, max: 200, label: 'Y-Count', integer: true },
            xDistance: { min: 0.1, max: Infinity, label: 'X-Distance' },
            yDistance: { min: 0.1, max: Infinity, label: 'Y-Distance' },
            diameter: { min: 0.1, max: Infinity, label: 'Diameter' },
            depth: { min: 0.1, max: Infinity, label: 'Depth' },
            bitDiameter: { min: 0.1, max: Infinity, label: 'Bit Diameter' },
            pitch: { min: 0.1, max: 10, label: 'Pitch' },
            feedRate: { min: 1, max: Infinity, label: 'Feed Rate' },
            spindleRPM: { min: 1, max: 24000, label: 'Spindle RPM', integer: true },
            spindleDelay: { min: 0, max: 30, label: 'Spindle Delay', integer: true }
          };

          // Create tooltip element
          const tooltip = document.createElement('div');
          tooltip.style.cssText = \`
            position: fixed;
            background-color: #d32f2f;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 0.85rem;
            z-index: 10000;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          \`;
          tooltip.style.setProperty('white-space', 'nowrap');
          document.body.appendChild(tooltip);

          // Arrow element
          const arrow = document.createElement('div');
          arrow.style.cssText = \`
            position: absolute;
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid #d32f2f;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
          \`;
          tooltip.appendChild(arrow);

          function showTooltip(element, message) {
            const rect = element.getBoundingClientRect();
            tooltip.textContent = message;
            tooltip.appendChild(arrow); // Re-append arrow after textContent

            tooltip.style.left = rect.left + (rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - 10) + 'px';
            tooltip.style.transform = 'translate(-50%, -100%)';
            tooltip.style.opacity = '1';

            element.style.borderColor = '#d32f2f';
            element.focus();
          }

          function hideTooltip() {
            tooltip.style.opacity = '0';
            setTimeout(() => {
              tooltip.style.left = '-9999px';
            }, 200);
          }

          function validateInput(id, value) {
            const rules = validationRules[id];
            if (!rules) return null;

            const num = parseFloat(value);

            if (isNaN(num)) {
              return \`\${rules.label} must be a valid number\`;
            }

            if (rules.integer && !Number.isInteger(num)) {
              return \`\${rules.label} must be a whole number\`;
            }

            if (num < rules.min) {
              return \`\${rules.label} must be at least \${rules.min}\`;
            }

            if (num > rules.max) {
              return \`\${rules.label} must not exceed \${rules.max}\`;
            }

            // Special validation: xDistance and yDistance must be >= diameter
            if (id === 'xDistance' || id === 'yDistance') {
              const diameterInput = document.getElementById('diameter');
              if (diameterInput) {
                const diameter = parseFloat(diameterInput.value);
                if (!isNaN(diameter) && num < diameter) {
                  return \`\${rules.label} must be at least the Diameter (\${diameter})\`;
                }
              }
            }

            // Special validation: diameter must be >= toolDiameter
            if (id === 'diameter') {
              const bitDiameterInput = document.getElementById('bitDiameter');
              if (bitDiameterInput) {
                const bitDiameter = parseFloat(bitDiameterInput.value);
                if (!isNaN(bitDiameter) && num < bitDiameter) {
                  return \`\${rules.label} must be at least the Bit Diameter (\${bitDiameter})\`;
                }
              }
            }

            return null;
          }

          function validateAllInputs() {
            for (const id in validationRules) {
              const element = document.getElementById(id);
              if (!element) continue;

              const error = validateInput(id, element.value);
              if (error) {
                showTooltip(element, error);
                return false;
              }
            }
            return true;
          }

          // Add input listeners
          for (const id in validationRules) {
            const element = document.getElementById(id);
            if (element) {
              element.addEventListener('input', function() {
                this.style.borderColor = '';
                hideTooltip();
              });

              element.addEventListener('blur', function() {
                const error = validateInput(id, this.value);
                if (error) {
                  showTooltip(this, error);
                  setTimeout(hideTooltip, 3000);
                }
              });
            }
          }

          // When diameter changes, re-validate xDistance and yDistance
          const diameterInput = document.getElementById('diameter');
          if (diameterInput) {
            diameterInput.addEventListener('input', function() {
              const xDistanceInput = document.getElementById('xDistance');
              const yDistanceInput = document.getElementById('yDistance');

              if (xDistanceInput) {
                xDistanceInput.style.borderColor = '';
              }
              if (yDistanceInput) {
                yDistanceInput.style.borderColor = '';
              }
              hideTooltip();
            });
          }

          // When bitDiameter changes, clear diameter validation error
          const bitDiameterInput = document.getElementById('bitDiameter');
          if (bitDiameterInput) {
            bitDiameterInput.addEventListener('input', function() {
              if (diameterInput) {
                diameterInput.style.borderColor = '';
              }
              hideTooltip();
            });
          }

          function generateBoringGcode(params) {
            const {
              xCount, xDistance, yCount, yDistance, diameter, depth,
              cutType, bitDiameter, pitch, feedRate, plungeFeedRate,
              spindleRPM, spindleDelay, mistM7, floodM8, isImperial
            } = params;

            const safeHeight = isImperial ? (5 * 0.0393701).toFixed(3) : '5.000';
            const unitsCode = isImperial ? 'G20' : 'G21';
            const unitsLabel = isImperial ? 'inch' : 'mm';

            // Calculate toolpath radius
            const holeRadius = diameter / 2;
            const toolRadius = bitDiameter / 2;
            let pathRadius;

            if (cutType === 'inner') {
              pathRadius = holeRadius - toolRadius;
            } else {
              pathRadius = holeRadius + toolRadius;
            }

            // Pitch is the Z distance per full revolution (360 degrees)
            // No calculation needed - pitch directly equals Z increment per revolution
            const zIncrement = pitch;

            let gcode = [];
            gcode.push('(Boring Operation)');
            gcode.push(\`(Pattern: \${xCount} x \${yCount} holes)\`);
            gcode.push(\`(Hole Diameter: \${diameter}\${unitsLabel}, Depth: \${depth}\${unitsLabel})\`);
            gcode.push(\`(Cut Type: \${cutType})\`);
            gcode.push(\`(Bit Diameter: \${bitDiameter}\${unitsLabel})\`);
            gcode.push(\`(Pitch: \${pitch}\${unitsLabel} per revolution)\`);
            gcode.push(\`(X-Distance: \${xDistance}\${unitsLabel}, Y-Distance: \${yDistance}\${unitsLabel})\`);
            gcode.push('');
            gcode.push(\`\${unitsCode} ; \${isImperial ? 'Imperial' : 'Metric'} units\`);
            gcode.push('G17 ; XY plane selection');
            gcode.push('G90 ; Absolute positioning');
            gcode.push('G94 ; Feed rate per minute');
            gcode.push('');
            gcode.push('G53 G0 Z0 ; Move to machine Z0');
            gcode.push('');

            // Generate holes in grid pattern
            let holeNumber = 0;
            for (let yi = 0; yi < yCount; yi++) {
              for (let xi = 0; xi < xCount; xi++) {
                holeNumber++;
                const holeX = xi * xDistance;
                const holeY = yi * yDistance;

                gcode.push(\`(Hole \${holeNumber}/\${xCount * yCount} at X\${holeX.toFixed(3)} Y\${holeY.toFixed(3)})\`);

                // Start coolant and spindle (if first hole)
                if (holeNumber === 1) {
                  if (mistM7) {
                    gcode.push('M7 ; Mist coolant on');
                  }
                  if (floodM8) {
                    gcode.push('M8 ; Flood coolant on');
                  }
                  if (spindleRPM > 0) {
                    gcode.push(\`M3 S\${spindleRPM} ; Start spindle\`);
                    if (spindleDelay > 0) {
                      gcode.push(\`G4 P\${spindleDelay} ; Wait \${spindleDelay} seconds\`);
                    }
                  }
                }

                // Calculate lead-in start position (like Fusion: below center, slightly inside radius)
                const minEntryOffset = isImperial ? 0.005 : 0.1;
                const entryOffsetCandidate = Math.max(pathRadius * 0.0125, toolRadius * 0.25, minEntryOffset);
                const entryOffset = Math.min(pathRadius * 0.05, entryOffsetCandidate, pathRadius * 0.5);
                const approachStartOffset = Math.max(entryOffset, Math.min(pathRadius * 0.8, entryOffset * 2.5));
                const startX = holeX + pathRadius - approachStartOffset;
                const arcStartX = holeX + pathRadius - entryOffset;
                const startY = holeY - entryOffset; // Start below center
                const rampXTravel = Math.max(arcStartX - startX, 0);

                // Move to start position
                gcode.push(\`G0 X\${startX.toFixed(3)} Y\${startY.toFixed(3)}\`);
                gcode.push(\`G0 Z\${safeHeight}\`);

                // Rapid to 2mm above starting point
                const slowPlungeStart = isImperial ? (2 * 0.0393701) : 2;
                gcode.push(\`G0 Z\${slowPlungeStart.toFixed(3)}\`);

                // Slow plunge to starting depth (clamped to requested depth)
                const startDepth = Math.min(depth, zIncrement * 0.5);
                const rampTargetDepth = Math.min(depth, zIncrement);
                const rampDepthDiff = Math.max(0, rampTargetDepth - startDepth);
                gcode.push(\`G1 Z\${(-startDepth).toFixed(3)} F\${plungeFeedRate}\`);

                // Lead-in ramp moves toward edge (like Fusion 360)
                const leadInSteps = 7;
                for (let step = 1; step <= leadInSteps; step++) {
                  const progress = step / leadInSteps;
                  const xPos = startX + (rampXTravel * progress);
                  const zPos = -(startDepth + (rampDepthDiff * progress));
                  gcode.push(\`X\${xPos.toFixed(3)} Z\${zPos.toFixed(3)}\`);
                }

                // Quarter-circle arc to transition onto boring circle (KEY FIX!)
                // Arc from current position to edge at Y=holeY
                const arcCenterYOffset = entryOffset; // J value relative to current position
                gcode.push(\`G3 X\${(holeX + pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I0 J\${arcCenterYOffset.toFixed(3)} F\${feedRate}\`);

                // Helical boring using two semicircles per revolution
                let currentDepth = rampTargetDepth;
                const depthTolerance = 1e-6;
                const zIncrementPerSemicircle = zIncrement / 2;
                let atPlusX = true; // Track current position (start at +X after quarter-circle)

                // Do helical passes down to depth using two semicircles per revolution
                while (currentDepth < depth - depthTolerance) {
                  // First semicircle: +X to -X (top half, CCW)
                  const firstHalfDepth = Math.min(depth, currentDepth + zIncrementPerSemicircle);
                  gcode.push(\`G3 X\${(holeX - pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I\${(-pathRadius).toFixed(3)} J0 Z\${(-firstHalfDepth).toFixed(3)} F\${feedRate}\`);
                  currentDepth = firstHalfDepth;
                  atPlusX = false;

                  if (currentDepth >= depth - depthTolerance) break;

                  // Second semicircle: -X to +X (bottom half, CCW)
                  const secondHalfDepth = Math.min(depth, currentDepth + zIncrementPerSemicircle);
                  gcode.push(\`G3 X\${(holeX + pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I\${pathRadius.toFixed(3)} J0 Z\${(-secondHalfDepth).toFixed(3)} F\${feedRate}\`);
                  currentDepth = secondHalfDepth;
                  atPlusX = true;
                }

                // Final cleanup pass at full depth (one full circle from current position)
                if (atPlusX) {
                  // At +X, do full circle: +X to -X to +X
                  gcode.push(\`G3 X\${(holeX - pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I\${(-pathRadius).toFixed(3)} J0 F\${feedRate}\`);
                  gcode.push(\`G3 X\${(holeX + pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I\${pathRadius.toFixed(3)} J0 F\${feedRate}\`);
                } else {
                  // At -X, do full circle: -X to +X to -X
                  gcode.push(\`G3 X\${(holeX + pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I\${pathRadius.toFixed(3)} J0 F\${feedRate}\`);
                  gcode.push(\`G3 X\${(holeX - pathRadius).toFixed(3)} Y\${holeY.toFixed(3)} I\${(-pathRadius).toFixed(3)} J0 F\${feedRate}\`);
                }

                // Retract
                gcode.push(\`G0 Z\${safeHeight}\`);
                gcode.push('');
              }
            }

            gcode.push('G53 G0 Z0 ; Return to machine Z0');
            if (mistM7 || floodM8) {
              gcode.push('M9 ; Coolant off');
            }
            if (spindleRPM > 0) {
              gcode.push('M5 ; Stop spindle');
            }
            gcode.push('M30 ; Program end');

            return gcode.join('\\n');
          }

          // Handle cut type toggle
          const cutTypeToggle = document.getElementById('cutType');
          const innerLabel = document.getElementById('innerLabel');
          const outerLabel = document.getElementById('outerLabel');

          function updateCutTypeLabels() {
            if (cutTypeToggle.checked) {
              innerLabel.classList.remove('active');
              outerLabel.classList.add('active');
            } else {
              innerLabel.classList.add('active');
              outerLabel.classList.remove('active');
            }
          }

          cutTypeToggle.addEventListener('change', updateCutTypeLabels);

          // Handle X-Count and Y-Count changes to enable/disable distance inputs
          const xCountInput = document.getElementById('xCount');
          const xDistanceInput = document.getElementById('xDistance');
          const yCountInput = document.getElementById('yCount');
          const yDistanceInput = document.getElementById('yDistance');

          function updateDistanceInputs() {
            const xCount = parseInt(xCountInput.value);
            const yCount = parseInt(yCountInput.value);
            const diameter = parseFloat(diameterInput.value);

            // Enable/disable distance inputs
            xDistanceInput.disabled = xCount <= 1;
            yDistanceInput.disabled = yCount <= 1;

            // Auto-set distance to diameter if count > 1 and distance < diameter
            if (xCount > 1 && !isNaN(diameter)) {
              const xDistance = parseFloat(xDistanceInput.value);
              if (isNaN(xDistance) || xDistance < diameter) {
                xDistanceInput.value = diameter;
              }
            }

            if (yCount > 1 && !isNaN(diameter)) {
              const yDistance = parseFloat(yDistanceInput.value);
              if (isNaN(yDistance) || yDistance < diameter) {
                yDistanceInput.value = diameter;
              }
            }
          }

          xCountInput.addEventListener('input', updateDistanceInputs);
          yCountInput.addEventListener('input', updateDistanceInputs);

          // Also update when diameter changes
          diameterInput.addEventListener('input', updateDistanceInputs);

          // Initialize on load
          updateDistanceInputs();

          document.getElementById('boringForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            // Validate all inputs
            if (!validateAllInputs()) {
              return;
            }

            // Get form values
            const xCount = parseInt(document.getElementById('xCount').value);
            const xDistance = parseFloat(document.getElementById('xDistance').value);
            const yCount = parseInt(document.getElementById('yCount').value);
            const yDistance = parseFloat(document.getElementById('yDistance').value);
            const diameter = parseFloat(document.getElementById('diameter').value);
            const depth = parseFloat(document.getElementById('depth').value);
            const cutType = cutTypeToggle.checked ? 'outer' : 'inner';
            const bitDiameter = parseFloat(document.getElementById('bitDiameter').value);
            const pitch = parseFloat(document.getElementById('pitch').value);
            const feedRate = parseFloat(document.getElementById('feedRate').value);
            const spindleRPM = parseInt(document.getElementById('spindleRPM').value);
            const spindleDelay = parseInt(document.getElementById('spindleDelay').value);
            const mistM7 = document.getElementById('mistM7').checked;
            const floodM8 = document.getElementById('floodM8').checked;

            const displayValues = {
              xCount,
              xDistance,
              yCount,
              yDistance,
              diameter,
              depth,
              cutType,
              bitDiameter,
              pitch,
              feedRate,
              spindleRPM,
              spindleDelay,
              mistM7,
              floodM8
            };

            // Get current saved plungeFeedRate from settings
            const response = await fetch('/api/plugins/com.ncsender.toolbench/settings');
            const savedSettings = response.ok ? await response.json() : {};
            const convertToDisplay = (value) => isImperial ? parseFloat((value * 0.0393701).toFixed(4)) : value;
            const currentPlungeFeedRate = convertToDisplay(savedSettings.boring?.plungeFeedRate ?? 200);

            // Convert to metric for storage
            const convertToMetric = (value) => isImperial ? value * 25.4 : value;

            const settingsToSave = {
              boring: {
                xCount: displayValues.xCount,
                xDistance: convertToMetric(displayValues.xDistance),
                yCount: displayValues.yCount,
                yDistance: convertToMetric(displayValues.yDistance),
                diameter: convertToMetric(displayValues.diameter),
                depth: convertToMetric(displayValues.depth),
                cutType: displayValues.cutType,
                toolDiameter: convertToMetric(displayValues.bitDiameter),
                pitch: convertToMetric(displayValues.pitch),
                feedRate: convertToMetric(displayValues.feedRate),
                plungeFeedRate: convertToMetric(currentPlungeFeedRate),
                spindleRPM: displayValues.spindleRPM,
                spindleDelay: displayValues.spindleDelay,
                mistM7: displayValues.mistM7,
                floodM8: displayValues.floodM8
              }
            };

            // Generate G-code
            const gcodeParams = {
              xCount: displayValues.xCount,
              xDistance: displayValues.xDistance,
              yCount: displayValues.yCount,
              yDistance: displayValues.yDistance,
              diameter: displayValues.diameter,
              depth: displayValues.depth,
              cutType: displayValues.cutType,
              bitDiameter: displayValues.bitDiameter,
              pitch: displayValues.pitch,
              feedRate: displayValues.feedRate,
              plungeFeedRate: currentPlungeFeedRate,
              spindleRPM: displayValues.spindleRPM,
              spindleDelay: displayValues.spindleDelay,
              mistM7: displayValues.mistM7,
              floodM8: displayValues.floodM8,
              isImperial
            };

            const gcode = generateBoringGcode(gcodeParams);

            // Save settings
            fetch('/api/plugins/com.ncsender.toolbench/settings', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(settingsToSave)
            }).catch(err => console.error('Failed to save settings:', err));

            // Upload file
            const formData = new FormData();
            const blob = new Blob([gcode], { type: 'text/plain' });
            formData.append('file', blob, 'Boring.nc');

            try {
              const uploadResponse = await fetch('/api/gcode-files', {
                method: 'POST',
                body: formData
              });

              if (uploadResponse.ok) {
                window.postMessage({ type: 'close-plugin-dialog' }, '*');
              } else {
                alert('Failed to upload G-code file');
              }
            } catch (error) {
              console.error('Upload error:', error);
              alert('Error uploading G-code file');
            }
          });
        })();
      </script>
    `);
  }, { clientOnly: true }); // Only show to the client who clicked
}

export async function onUnload() {
  console.log('Planer plugin unloaded');
}
