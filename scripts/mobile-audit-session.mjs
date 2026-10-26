// Como mobile-audit.mjs, pero entra primero con un usuario simulado: sirve para las páginas que piden sesión (/perfil, /admin…).
// Solo funciona contra un build en modo simulado (`useMockData: true` en src/environments/environment.ts, SIN commitear, y
// `ng build --configuration development --output-path <dir>`; el build de producción usa environment.production.ts), servido con
// fallback a index.html. Perfil de Edge limpio en cada corrida: un service worker de una corrida anterior sirve la app vieja.
//   node scripts/mobile-audit-session.mjs <base> <email> <ruta>...      (email: admin@x.test es admin, mod@ moderador, prueba@ usuario de prueba)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(process.cwd() + '/package.json');
const WebSocket = require('ws');
const [base, email, ...routes] = process.argv.slice(2);
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--remote-debugging-port=9335', '--user-data-dir=' + process.env.TEMP + '/edge-audit2', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 40; i++) {
  try { tabs = await (await fetch('http://127.0.0.1:9335/json')).json(); if (tabs.find((t) => t.type === 'page')) break; } catch {}
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
const run = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: base + '/login' });
await sleep(3500);
console.log('login:', await run(`(async () => {
  const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
  const em = document.querySelector('#login-email');
  const pw = document.querySelector('input[type=password]');
  if (!em || !pw) return 'sin formulario';
  set(em, '${email}'); set(pw, 'Prueba12345');
  document.querySelector('.auth__form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 2000));
  return location.pathname + ' | alerta: ' + ((document.querySelector('.auth__alert')||{}).textContent||'-') + ' | ls: ' + Object.keys(localStorage).join(',') + ' | ss: ' + Object.keys(sessionStorage).join(',') + ' | btn: ' + (document.querySelector('.auth__form button[type=submit]')||{}).textContent;
})()`));
for (const width of [320, 390, 768]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: true });
  for (const r of routes) {
    await send('Page.navigate', { url: base + r });
    await sleep(3500);
    const v = JSON.parse(await run(`(() => { const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
      let culprit = ''; if (sw > cw) { const all = [...document.querySelectorAll('body *')]; const wide = all.filter(e => e.getBoundingClientRect().right > cw + 1 && getComputedStyle(e).position !== 'fixed'); culprit = wide.slice(0, 3).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ' ' + Math.round(e.getBoundingClientRect().right)).join(', '); }
      return JSON.stringify({ sw, cw, culprit, path: location.pathname }); })()`));
    console.log(`${v.sw > v.cw ? 'DESBORDA' : 'ok      '} ${width} ${r}${v.path !== r.split('?')[0] ? ' (acabo en ' + v.path + ')' : ''} ${v.sw > v.cw ? v.sw + ' > ' + v.cw + '  ' + v.culprit : ''}`);
  }
}
ws.close();
edge.kill();
process.exit(0);
