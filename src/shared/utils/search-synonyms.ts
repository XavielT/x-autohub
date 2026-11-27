/**
 * Los sinónimos de la búsqueda: términos que la gente usa como si fueran lo mismo ("parachoques", "bumper", "defensa").
 *
 * La verdad vive en Postgres (`search_synonym_groups`, migración 0067), que el panel edita. Esta lista es su espejo para el modo
 * simulado y arranca igual que la siembra de esa migración: si cambias una, cambia la otra.
 * Todo va en minúsculas y sin tildes (como los normaliza el trigger de la base).
 */
export const DEFAULT_SEARCH_SYNONYMS: readonly (readonly string[])[] = [
  ['parachoques', 'parachoque', 'bumper', 'bomper', 'defensa', 'defensas'],
  ['llanta', 'llantas', 'goma', 'gomas', 'neumatico', 'neumaticos', 'caucho', 'cauchos', 'tire', 'tires'],
  ['aro', 'aros', 'rin', 'rines', 'rim', 'rims', 'mag', 'mags', 'wheel', 'wheels'],
  ['faro', 'faros', 'farola', 'farolas', 'headlight', 'headlights', 'pantalla', 'pantallas', 'headlamp', 'headlamps', 'head light', 'head lights'],
  ['calavera', 'calaveras', 'stop', 'stops', 'taillight', 'taillights', 'tail light', 'tail lights'],
  ['bocina', 'bocinas', 'parlante', 'parlantes', 'altavoz', 'altavoces', 'bafle', 'bafles', 'speaker', 'speakers'],
  ['corneta', 'cornetas', 'claxon', 'klaxon', 'horn'],
  ['amortiguador', 'amortiguadores', 'shock', 'shocks', 'strut', 'struts'],
  ['freno', 'frenos', 'brake', 'brakes'],
  ['pastilla', 'pastillas', 'balata', 'balatas', 'brake pad', 'brake pads'],
  ['disco', 'discos', 'rotor', 'rotores'],
  ['aceite', 'aceites', 'lubricante', 'lubricantes', 'oil'],
  ['filtro', 'filtros', 'filter', 'filters'],
  ['bateria', 'baterias', 'acumulador', 'acumuladores', 'battery'],
  ['bujia', 'bujias', 'spark plug', 'spark plugs'],
  ['radiador', 'radiadores', 'radiator'],
  ['mofle', 'mofles', 'silenciador', 'silenciadores', 'muffler', 'escape', 'exhaust', 'catback', 'cat back'],
  ['espejo', 'espejos', 'retrovisor', 'retrovisores', 'mirror', 'mirrors'],
  ['alfombra', 'alfombras', 'tapete', 'tapetes', 'floor mat', 'floor mats'],
  ['volante', 'timon', 'steering wheel'],
  ['limpiaparabrisas', 'limpiaparabrisa', 'wiper', 'wipers', 'plumilla', 'plumillas', 'escobilla', 'escobillas'],
  ['gato', 'gatos', 'jack'],
  ['scanner', 'escaner', 'obd', 'obd2', 'diagnostico'],
  ['cera', 'ceras', 'wax', 'encerado'],
  ['shampoo', 'champu', 'jabon'],
  ['intake', 'admision'],
  ['subwoofer', 'woofer', 'sub'],
  ['amplificador', 'amplificadores', 'amp', 'planta', 'plantas'],
  ['radio', 'estereo', 'stereo', 'head unit'],
  ['alternador', 'alternator'],
  ['clutch', 'embrague', 'croche'],
  ['bobina', 'bobinas', 'coil', 'coils'],
  ['termostato', 'thermostat'],
  ['spoiler', 'aleron', 'alerones', 'wing'],
  ['bombillo', 'bombillos', 'bombilla', 'bombillas', 'bulb', 'bulbs', 'foco', 'focos'],
  ['torquimetro', 'torquimetros', 'llave torque', 'torque wrench'],
  ['estabilizadora', 'estabilizador', 'sway bar', 'stabilizer bar'],
  ['aspiradora', 'aspiradoras', 'vacuum'],
  ['pasacorriente', 'pasacorrientes', 'cable puente', 'jumper cable', 'jumper cables'],
  ['turbo', 'turbos', 'turbocompresor', 'turbocharger'],
  ['inyector', 'inyectores', 'injector', 'injectors'],
  ['correa', 'correas', 'banda', 'bandas', 'belt', 'belts'],
  ['empacadura', 'empacaduras', 'gasket', 'gaskets', 'junta', 'juntas'],
  ['anticongelante', 'refrigerante', 'coolant', 'antifreeze'],
  ['ventilador', 'ventiladores', 'fan', 'fans', 'abanico', 'abanicos'],
  ['compresor', 'compresores', 'compressor'],
  ['capo', 'hood'],
  ['parrilla', 'parrillas', 'grille', 'grill'],
  ['guardafango', 'guardafangos', 'guardalodo', 'guardalodos', 'fender', 'fenders'],
  ['neblinero', 'neblineros', 'fog light', 'fog lights', 'fog lamp', 'foglight'],
  ['catalizador', 'catalizadores', 'catalytic converter', 'cat converter'],
];

/** Minúsculas, sin tildes y con los espacios colapsados: la forma en que la base guarda cada término. */
export function normalizeTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Los términos de todo grupo al que pertenece la palabra (ella incluida): igual que `xah_synonyms()`. Un grupo contiene la palabra
 * si la trae completa o, desde 4 letras, si la palabra es el comienzo de un término ("bump" → bumper).
 */
export function synonymsOf(word: string, groups: readonly (readonly string[])[] = DEFAULT_SEARCH_SYNONYMS): string[] {
  const w = normalizeTerm(word);
  if (w.length < 2) return [];
  const found = new Set<string>();
  for (const group of groups) {
    if (group.some((t) => t === w || (w.length >= 4 && t.startsWith(w)))) group.forEach((t) => found.add(t));
  }
  return [...found];
}

/**
 * Normaliza lo que escribe el admin para un grupo nuevo: sin repetidos, sin vacíos, con la misma validación que el trigger.
 * Lanza un `Error` con el mensaje que se le muestra.
 */
export function normalizeSynonymTerms(raw: readonly string[]): string[] {
  const terms = [...new Set(raw.map(normalizeTerm).filter((t) => t !== ''))];
  if (terms.length < 2) throw new Error('Un grupo necesita al menos dos términos distintos.');
  if (terms.length > 14) throw new Error('Un grupo admite hasta 14 términos.');
  if (terms.some((t) => t.length < 2 || t.length > 40)) throw new Error('Cada término tiene entre 2 y 40 letras.');
  return terms;
}

/** Variantes que ayudan a encontrar pero que no se ofrecen como atajo (faltas de ortografía comunes). */
const HIDDEN_FROM_RELATED = new Set(['parachoque', 'bomper']);

/**
 * Otras formas de buscar lo mismo, para ofrecerlas como atajos ("bumper" → parachoques, defensa). Solo para una búsqueda de una
 * palabra (o una frase que sea justo un término): con varias palabras no se sabe qué parte reemplazar. Se saltan los plurales de
 * un término que ya está y lo que ya se escribió.
 */

export function relatedTerms(query: string, groups: readonly (readonly string[])[] = DEFAULT_SEARCH_SYNONYMS, limit = 6): string[] {
  const q = normalizeTerm(query);
  if (q.length < 2) return [];
  const asWord = !q.includes(' ');
  const out: string[] = [];

  for (const group of groups) {
    const belongs = group.some((t) => t === q || (asWord && q.length >= 4 && t.startsWith(q)));
    if (!belongs) continue;
    const shown = group.filter((t) => !HIDDEN_FROM_RELATED.has(t));
    for (const term of shown) {
      const isPlural = term.endsWith('s') && shown.includes(term.slice(0, -1));
      if (term === q || term.startsWith(q) || isPlural || out.includes(term)) continue;
      out.push(term);
    }
  }
  return out.slice(0, limit);
}

/**
 * ¿El texto responde a lo que se buscó? Para listas que se filtran en el navegador (Hub Market): cada palabra de la consulta tiene
 * que estar dentro del texto (a medias también, como antes) o estar escrita con uno de sus sinónimos ("bumper" encuentra "parachoques").
 * Sin acentos ni mayúsculas. Una consulta vacía lo encuentra todo.
 */
export function textMatchesQuery(text: string, query: string, groups: readonly (readonly string[])[] = DEFAULT_SEARCH_SYNONYMS): boolean {
  const q = normalizeTerm(query);
  if (q === '') return true;
  const hay = normalizeTerm(text);
  if (hay.includes(q)) return true;

  const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
  const joined = ` ${tokens.join(' ')} `;
  return q.split(' ').every(
    (word) =>
      hay.includes(word) ||
      synonymsOf(word, groups).some((term) => term !== word && (term.includes(' ') ? joined.includes(` ${term} `) : tokens.includes(term))),
  );
}
