/**
 * ToolBench Plugin - Node.js Lifecycle Wrapper
 * Thin wrapper for the community (Node.js) version.
 * Reads config.html and shows it as a dialog.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const resolveServerPort = (pluginSettings = {}, appSettings = {}) => {
  const appPort = Number.parseInt(appSettings?.senderPort, 10);
  if (Number.isFinite(appPort)) return appPort;
  const pluginPort = Number.parseInt(pluginSettings?.port, 10);
  if (Number.isFinite(pluginPort)) return pluginPort;
  return 8090;
};

function showTool(ctx, toolLabel, storedSettings, currentAppSettings) {
  const serverPort = resolveServerPort(storedSettings, currentAppSettings);
  const initialConfigJson = JSON.stringify(storedSettings)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  let html = readFileSync(join(__dirname, 'config.html'), 'utf-8');
  html = html.replace('__SERVER_PORT__', String(serverPort));
  html = html.replace('__INITIAL_CONFIG__', initialConfigJson);
  html = html.replace('__TOOL_MENU_LABEL__', toolLabel);

  ctx.showDialog(toolLabel, html, { size: 'large' });
}

export async function onLoad(ctx) {
  ctx.log('ToolBench plugin loaded');

  ctx.registerToolMenu('Planer', async () => {
    ctx.log('Planer tool opened');
    showTool(ctx, 'Planer', ctx.getSettings() || {}, ctx.getAppSettings() || {});
  }, { clientOnly: true, icon: 'planer.png' });

  ctx.registerToolMenu('Jointer/Cutter', async () => {
    ctx.log('Jointer/Cutter tool opened');
    showTool(ctx, 'Jointer/Cutter', ctx.getSettings() || {}, ctx.getAppSettings() || {});
  }, { clientOnly: true, icon: 'jointer.png' });

  ctx.registerToolMenu('Boring', async () => {
    ctx.log('Boring tool opened');
    showTool(ctx, 'Boring', ctx.getSettings() || {}, ctx.getAppSettings() || {});
  }, { clientOnly: true, icon: 'boring.png' });
}

export async function onUnload(ctx) {
  ctx.log('ToolBench plugin unloaded');
}
