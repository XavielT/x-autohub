/**
 * Marca un perfil como administrador.
 *
 *   node scripts/make-admin.mjs tu@correo.com
 *
 * Equivale al UPDATE que documenta docs/BACKEND.md, pero sin abrir el SQL
 * Editor. Usa la clave `service_role` para saltarse RLS, y por eso la lee de
 * `.env.local` — un archivo ignorado por git que nunca se compila dentro de la
 * app. Ver el aviso de seguridad en ese mismo archivo.
 *
 * El usuario tiene que haberse registrado antes: el perfil lo crea el trigger
 * `on_auth_user_created`, no este script.
 */

import { readFile } from 'node:fs/promises';

const ENV_FILE = new URL('../.env.local', import.meta.url);

/** Lee .env.local sin depender de una librería. */
async function loadEnv() {
  let raw;
  try {
    raw = await readFile(ENV_FILE, 'utf8');
  } catch {
    throw new Error(
      'No encontré .env.local. Créalo con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ' +
        '(ver docs/BACKEND.md).',
    );
  }

  const env = {};
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

const email = process.argv[2];
if (!email) {
  console.error('Uso: node scripts/make-admin.mjs tu@correo.com');
  process.exit(1);
}

const env = await loadEnv();
const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local.');
  process.exit(1);
}

const response = await fetch(
  `${url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
  {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ is_admin: true, is_verified: true }),
  },
);

if (!response.ok) {
  console.error(`Error ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const rows = await response.json();

if (rows.length === 0) {
  console.error(
    `No hay ningún perfil con el correo ${email}. Regístrate primero en /registro: ` +
      'el perfil lo crea el trigger al momento del registro.',
  );
  process.exit(1);
}

const { id, display_name, is_admin, is_verified } = rows[0];
console.log(`Listo: ${display_name || email} ya es admin.`);
console.log(`  id          ${id}`);
console.log(`  is_admin    ${is_admin}`);
console.log(`  is_verified ${is_verified}`);
