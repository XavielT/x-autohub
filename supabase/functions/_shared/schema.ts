// Validador de esquemas mínimo (sin librerías). La IA responde JSON; esto decide si se acepta.
//
// Un esquema es uno de:
//   { t: 'string', max?, enum?, nullable?, optional? }
//   { t: 'number', min?, max?, int?, nullable?, optional? }
//   { t: 'boolean', nullable?, optional? }
//   { t: 'array', of: Schema, max?, nullable?, optional? }
//   { t: 'object', props: { campo: Schema }, nullable?, optional? }   (los campos extra se ignoran y se descartan)

export type Schema =
  | { t: 'string'; max?: number; enum?: readonly string[]; nullable?: boolean; optional?: boolean }
  | { t: 'number'; min?: number; max?: number; int?: boolean; nullable?: boolean; optional?: boolean }
  | { t: 'boolean'; nullable?: boolean; optional?: boolean }
  | { t: 'array'; of: Schema; max?: number; nullable?: boolean; optional?: boolean }
  | { t: 'object'; props: Record<string, Schema>; nullable?: boolean; optional?: boolean };

export type Checked = { ok: true; value: unknown } | { ok: false; error: string };

export function check(schema: Schema, value: unknown, at = '$'): Checked {
  if (value === undefined) return schema.optional ? { ok: true, value: undefined } : { ok: false, error: `${at}: falta` };
  if (value === null) return schema.nullable ? { ok: true, value: null } : { ok: false, error: `${at}: no puede ser nulo` };

  switch (schema.t) {
    case 'string': {
      if (typeof value !== 'string') return { ok: false, error: `${at}: debe ser texto` };
      if (schema.enum && !schema.enum.includes(value)) return { ok: false, error: `${at}: valor fuera de la lista` };
      // Se recorta en vez de rechazar: un texto largo no vale un reintento pagado.
      return { ok: true, value: schema.max ? value.slice(0, schema.max) : value };
    }
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, error: `${at}: debe ser número` };
      if (schema.int && !Number.isInteger(value)) return { ok: false, error: `${at}: debe ser entero` };
      if (schema.min !== undefined && value < schema.min) return { ok: false, error: `${at}: menor que ${schema.min}` };
      if (schema.max !== undefined && value > schema.max) return { ok: false, error: `${at}: mayor que ${schema.max}` };
      return { ok: true, value };
    }
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true, value } : { ok: false, error: `${at}: debe ser booleano` };
    case 'array': {
      if (!Array.isArray(value)) return { ok: false, error: `${at}: debe ser lista` };
      const items = schema.max ? value.slice(0, schema.max) : value;
      const out: unknown[] = [];
      for (let i = 0; i < items.length; i++) {
        const r = check(schema.of, items[i], `${at}[${i}]`);
        if (!r.ok) return r;
        out.push(r.value);
      }
      return { ok: true, value: out };
    }
    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: `${at}: debe ser objeto` };
      const out: Record<string, unknown> = {};
      for (const [k, s] of Object.entries(schema.props)) {
        const r = check(s, (value as Record<string, unknown>)[k], `${at}.${k}`);
        if (!r.ok) return r;
        if (r.value !== undefined) out[k] = r.value;
      }
      return { ok: true, value: out };
    }
  }
}

/** Saca el primer objeto JSON de un texto (con o sin ```json```). */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('sin JSON');
  }
}
