// Mide FCP, LCP (con su elemento y todos los candidatos) y bytes de rutas en un móvil emulado: 390px, CPU x4 y "Slow 4G" de Lighthouse, sin
// caché y sin service worker. Contra localhost NO sirve para comparar (el servidor de prueba no comprime): mide producción.
//   MSYS_NO_PATHCONV=1 node scripts/mobile-perf.mjs <base> <ruta>...
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(process.cwd() + '/package.json');
const WebSocket = require('ws');
const [base, ...routes] = process.argv.slice(2);
const dir = process.env.TEMP + '/edge-perf-' + Date.now();
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9336', '--user-data-dir=' + dir, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40; i++) {
  try { tabs = await (await fetch('http://127.0.0.1:9336/json')).json(); if (tabs.find((t) => t.type === 'page')) break; } catch {}
  await sleep(500);
}
const ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0;
let bytes = 0;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.method === 'Network.loadingFinished') bytes += m.params.encodedDataLength; });
const send = (method, params = {}) => new Promise((resolve) => {
  const n = ++id;
  const on = (d) => { const m = JSON.parse(d); if (m.id === n) { ws.off('message', on); resolve(m.result); } };
  ws.on('message', on);
  ws.send(JSON.stringify({ id: n, method, params }));
});
await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
// "Slow 4G" de Lighthouse: 1.6 Mbps abajo, 150 ms de latencia.
await send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
for (const r of routes) {
  bytes = 0;
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__m = { lcp: 0, fcp: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; (window.__m.all = window.__m.all || []).push(Math.round(e.startTime) + ':' + (e.element ? e.element.tagName : '?')); window.__m.el = (e.element ? e.element.tagName + '.' + String(e.element.className).split(' ')[0] : '?') + ' ' + (e.url || '').slice(-60) + ' ' + e.size; } }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });`,
  });
  await send('Page.navigate', { url: base + r });
  await sleep(14000);
  const v = (await send('Runtime.evaluate', { expression: 'JSON.stringify(Object.assign(window.__m, { res: performance.getEntriesByType("resource").filter(e => e.name.endsWith(".js")).map(e => e.name.split("/").pop().slice(0, 14) + "@" + Math.round(e.responseEnd) + "(" + Math.round(e.encodedBodySize / 1024) + "KB)").sort((a, b) => parseInt(b.split("(")[1]) - parseInt(a.split("(")[1])).slice(0, 6).join(" ") }))', returnByValue: true })).result?.value;
  const m = JSON.parse(v || '{}');
  console.log(`${r.padEnd(45)} FCP ${Math.round(m.fcp)} ms   LCP ${Math.round(m.lcp)} ms [${m.el}] ${(m.all || []).join(' ')}   ${(bytes / 1024).toFixed(0)} KB transferidos`);
  if (m.res) console.log('   JS: ' + m.res);
}
ws.close();
edge.kill();
process.exit(0);
