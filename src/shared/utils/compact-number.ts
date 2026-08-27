/**
 * Formato compacto para los contadores del home: 1234 → "1.2K".
 *
 * Existe porque la sección ya tenía un estilo ("280+", "1.3K", "2.8K") escrito a
 * mano en el HTML, y los números reales tienen que entrar en ese mismo hueco:
 * un "1,347" de cuatro dígitos rompe la fila y se lee como precio, no como
 * cantidad.
 *
 * **No** se usa `Intl.NumberFormat(..., { notation: 'compact' })** aunque sería
 * lo primero que uno busca: con el locale del sitio (`es-DO`) devuelve "1.3 mil"
 * y "2.8 M", que no es lo que dice el diseño. Y tampoco se usa
 * `toLocaleString('en-US')` —que es la trampa que documenta CLAUDE.md— porque
 * aquí no se está formateando un número para leerlo, se está construyendo una
 * etiqueta de la marca. Todo sale de aritmética, sin locale de por medio.
 *
 * Reglas:
 *
 *   0…999          tal cual              →  "7", "280"
 *   1.000…9.999    un decimal, sin `.0`  →  "1.2K", "2K"
 *   10.000…999.999 sin decimales         →  "12K", "340K"
 *   1.000.000+     lo mismo con M        →  "1.4M", "23M"
 *
 * El decimal desaparece a partir de cinco cifras a propósito: "12.3K" es más
 * ruido que información, y es lo mismo que hace cualquier contador que se haya
 * visto.
 */
export function compactNumber(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0';

  const rounded = Math.round(value);
  if (rounded < 1000) return String(rounded);

  const scale = rounded < 1_000_000 ? { divisor: 1000, suffix: 'K' } : { divisor: 1_000_000, suffix: 'M' };
  const scaled = rounded / scale.divisor;

  // Un decimal solo mientras la parte entera tenga una cifra.
  const text =
    scaled < 10
      ? // `Math.round(x * 10) / 10` y no `toFixed(1)`: toFixed deja "2.0K".
        String(Math.round(scaled * 10) / 10)
      : String(Math.round(scaled));

  return `${text}${scale.suffix}`;
}
