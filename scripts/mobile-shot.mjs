// Captura una pagina con emulacion de movil (Edge headless por CDP) y dice si desborda a lo ancho.
//   node scripts/mobile-shot.mjs <url> <ancho> <alto> <salida.png>
// `sw` > `cw` en la salida = hay desbordamiento horizontal. Redimensionar la ventana del navegador NO sirve: un Chrome/Edge
// de escritorio no baja de ~500px de ancho, y un headless con --window-size tampoco; hay que emular el dispositivo.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const require = createRequire(process.cwd() + '/package.json');
const WebSocket = require('ws');
const [url, w, h, out] = process.argv.slice(2);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9333', '--user-data-dir=' + process.env.TEMP + '/edge-shot', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40; i++) {
  try { tabs = await (await fetch('http://127.0.0.1:9333/json')).json(); if (tabs.find((t) => t.type === 'page')) break; } catch {}
  await sleep(500);
}
const tab = tabs.find((t) => t.type === 'page');
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  const n = ++id;
  const on = (d) => { const m = JSON.parse(d); if (m.id === n) { ws.off('message', on); resolve(m.result); } };
  ws.on('message', on);
  ws.send(JSON.stringify({ id: n, method, params }));
});
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: true });
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(7000);
// Baja y sube para que las imagenes perezosas carguen.
await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)' });
await sleep(1500);
await send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)' });
await sleep(800);
const info = await send('Runtime.evaluate', { expression: 'JSON.stringify({sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: innerWidth})', returnByValue: true });
console.log(info.result.value);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
ws.close();
edge.kill();
process.exit(0);
