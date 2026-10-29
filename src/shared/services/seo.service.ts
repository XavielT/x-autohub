import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { SITE_URL, absoluteUrl } from '../utils/structured-data';

/** Lo que una página le dice a los buscadores y a la vista previa de WhatsApp. */
export interface SeoPage {
  title: string;
  description: string;
  /** La ruta dentro del sitio (`/tienda/p/disco-1`): de ahí salen `og:url` y el canónico. */
  path: string;
  /** Una imagen, relativa (`assets/…`) o absoluta. Vacía = la del sitio. */
  image?: string;
  type?: 'website' | 'product';
  /** No indexar esta página (una publicación vendida o vencida: su ficha sigue abierta, pero ya no se anuncia). */
  noindex?: boolean;
}

const DEFAULT_TITLE = 'X AutoHub — Todo lo que tu carro necesita';
const DEFAULT_DESCRIPTION =
  'Accesorios y piezas para tu carro, con taller propio, en República Dominicana. Encuentra lo que le sirve a tu vehículo, instálalo con nosotros y mira además vehículos y la comunidad automotriz.';
const DEFAULT_SOCIAL_DESCRIPTION = 'Accesorios, piezas y taller en República Dominicana. Elige tu vehículo y mira lo que le sirve.';
const DEFAULT_IMAGE = 'og-default.jpg';

/**
 * El título, la descripción y las etiquetas de redes de cada página.
 *
 * Sin esto, pegar un enlace de una ficha en WhatsApp enseña el título y el ícono del sitio, no
 * el producto: los rastreadores de vista previa no ejecutan JavaScript, así que solo ven lo que
 * trae el HTML. Las páginas que se prerenderizan al construir (`app.routes.server.ts`) salen con
 * estas etiquetas ya puestas.
 *
 * Las URLs son las **canónicas** (`SITE_URL`) y las imágenes siempre absolutas: un rastreador no
 * resuelve `assets/…` contra nada.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);

  /** Pone las etiquetas de una página. Recortar y limpiar el texto es cosa de quien llama. */
  set(page: SeoPage): void {
    const url = absoluteUrl(page.path);
    const image = absoluteUrl(page.image || DEFAULT_IMAGE);

    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'description', content: page.description });

    this.meta.updateTag({ property: 'og:type', content: page.type ?? 'website' });
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: url });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    this.setCanonical(url);
    this.setRobots(page.noindex === true);
  }

  /** Vuelve a lo que trae `index.html`. Se llama al salir de una página que puso las suyas. */
  reset(): void {
    this.title.setTitle(DEFAULT_TITLE);
    this.meta.updateTag({ name: 'description', content: DEFAULT_DESCRIPTION });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:title', content: DEFAULT_TITLE });
    this.meta.updateTag({ property: 'og:description', content: DEFAULT_SOCIAL_DESCRIPTION });
    this.meta.updateTag({ property: 'og:url', content: SITE_URL });
    this.meta.updateTag({ property: 'og:image', content: absoluteUrl(DEFAULT_IMAGE) });
    this.meta.removeTag("name='twitter:title'");
    this.meta.removeTag("name='twitter:description'");
    this.meta.removeTag("name='twitter:image'");

    this.setCanonical(null);
    this.setRobots(false);
  }

  /** `noindex` mientras la página lo pida; al salir, se quita. */
  private setRobots(noindex: boolean): void {
    if (noindex) this.meta.updateTag({ name: 'robots', content: 'noindex' });
    else this.meta.removeTag("name='robots'");
  }

  private setCanonical(url: string | null): void {
    const existing = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (url === null) {
      existing?.remove();
      return;
    }

    const link = existing ?? this.doc.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', url);
    if (!existing) this.doc.head.appendChild(link);
  }
}
