// Recorre rutas a 320, 390 y 768px (emulando un móvil) y dice cuáles desbordan a lo ancho, con los elementos culpables.
//   node scripts/mobile-audit.mjs <base> <ruta>...      (en Git Bash, con MSYS_NO_PATHCONV=1 delante: si no, /ruta se convierte en una ruta de Windows)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(process.cwd() + '/package.json');
const WebSocket = require('ws');
const [base, ...routes] = process.argv.slice(2);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9334', '--user-data-dir=' + process.env.TEMP + '/edge-audit', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40; i++) {
  try { tabs = await (await fetch('http://127.0.0.1:9334/json')).json(); if (tabs.find((t) => t.type === 'page')) break; } catch {}
  await sleep(500);
}
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0;
const send = (method, params = {}) => new Promise((resolve) => {
  const n = ++id;
  const on = (d) => { const m = JSON.parse(d); if (m.id === n) { ws.off('message', on); resolve(m.result); } };
  ws.on('message', on);
  ws.send(JSON.stringify({ id: n, method, params }));
});
await send('Page.enable');
for (const width of [320, 390, 768]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true });
  for (const r of routes) {
    await send('Page.navigate', { url: base + r });
    await sleep(4500);
    const res = await send('Runtime.evaluate', {
      expression: `(() => { const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
        let culprit = ''; if (sw > cw) { const all = [...document.querySelectorAll('body *')]; const wide = all.filter(e => e.getBoundingClientRect().right > cw + 1 && getComputedStyle(e).position !== 'fixed'); culprit = wide.slice(0, 3).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + Math.round(e.getBoundingClientRect().right)).join(', '); }
        return JSON.stringify({ sw, cw, culprit }); })()`,
      returnByValue: true,
    });
    const v = JSON.parse(res.result.value);
    console.log(`${v.sw > v.cw ? 'DESBORDA' : 'ok      '} ${width} ${r} ${v.sw > v.cw ? v.sw + ' > ' + v.cw + '  ' + v.culprit : ''}`);
  }
}
ws.close();
edge.kill();
process.exit(0);
