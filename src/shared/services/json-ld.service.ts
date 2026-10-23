import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { serializeJsonLd } from '../utils/structured-data';

/**
 * Pone y quita los bloques `<script type="application/ld+json">` del `<head>`.
 *
 * Cada bloque tiene una clave (`product`, `service`): poner la misma otra vez lo
 * reemplaza y `null` lo quita, así que una ficha que cambia de producto no deja el
 * bloque del anterior. La CSP (`script-src 'self'`) no los toca: un bloque JSON-LD no
 * es código y el navegador no lo ejecuta.
 */
@Injectable({ providedIn: 'root' })
export class JsonLdService {
  private readonly doc = inject(DOCUMENT);

  set(key: string, data: unknown | null): void {
    const existing = this.doc.head.querySelector<HTMLScriptElement>(`script[data-ld="${key}"]`);

    if (data === null || data === undefined) {
      existing?.remove();
      return;
    }

    const script = existing ?? this.doc.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-ld', key);
    script.textContent = serializeJsonLd(data);
    if (!existing) this.doc.head.appendChild(script);
  }
}
