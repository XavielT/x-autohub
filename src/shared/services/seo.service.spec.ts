import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  const content = (selector: string) => document.head.querySelector<HTMLMetaElement>(selector)?.content;
  const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href');

  let seo: SeoService;

  beforeEach(() => {
    seo = TestBed.inject(SeoService);
  });

  afterEach(() => {
    seo.reset();
    document.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]').forEach((m) => m.remove());
  });

  it('pone el título, la descripción y las etiquetas de Open Graph y Twitter', () => {
    seo.set({
      title: 'Alfombras | X AutoHub',
      description: 'Juego de alfombras de goma reforzada.',
      path: '/tienda/p/alfombras-8',
      image: 'https://xautohubrd.com/assets/imgs/alfombras.jpg',
      type: 'product',
    });

    expect(TestBed.inject(Title).getTitle()).toBe('Alfombras | X AutoHub');
    expect(content('meta[name="description"]')).toBe('Juego de alfombras de goma reforzada.');
    expect(content('meta[property="og:type"]')).toBe('product');
    expect(content('meta[property="og:title"]')).toBe('Alfombras | X AutoHub');
    expect(content('meta[property="og:description"]')).toBe('Juego de alfombras de goma reforzada.');
    expect(content('meta[property="og:image"]')).toBe('https://xautohubrd.com/assets/imgs/alfombras.jpg');
    expect(content('meta[name="twitter:title"]')).toBe('Alfombras | X AutoHub');
    expect(content('meta[name="twitter:image"]')).toBe('https://xautohubrd.com/assets/imgs/alfombras.jpg');
  });

  it('las URLs son las canónicas del sitio, no las de donde se corra', () => {
    seo.set({ title: 'x', description: 'y', path: '/tienda/p/alfombras-8' });

    expect(content('meta[property="og:url"]')).toBe('https://xautohubrd.com/tienda/p/alfombras-8');
    expect(canonical()).toBe('https://xautohubrd.com/tienda/p/alfombras-8');
  });

  it('una imagen relativa se vuelve absoluta (un rastreador no la podría resolver)', () => {
    seo.set({ title: 'x', description: 'y', path: '/tienda', image: 'assets/imgs/hub-parts/a.jpg' });

    expect(content('meta[property="og:image"]')).toBe('https://xautohubrd.com/assets/imgs/hub-parts/a.jpg');
  });

  it('sin imagen usa la del sitio, y el tipo por defecto es website', () => {
    seo.set({ title: 'x', description: 'y', path: '/tienda' });

    expect(content('meta[property="og:image"]')).toBe('https://xautohubrd.com/icon-512.png');
    expect(content('meta[property="og:type"]')).toBe('website');
  });

  it('poner las de otra página reemplaza las anteriores, sin duplicar etiquetas ni el canónico', () => {
    seo.set({ title: 'Uno', description: 'a', path: '/tienda/p/uno' });
    seo.set({ title: 'Dos', description: 'b', path: '/tienda/p/dos' });

    expect(document.head.querySelectorAll('meta[property="og:title"]').length).toBe(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(content('meta[property="og:title"]')).toBe('Dos');
    expect(canonical()).toBe('https://xautohubrd.com/tienda/p/dos');
  });

  it('noindex pone la etiqueta robots, y la siguiente pagina (o reset) la quita', () => {
    seo.set({ title: 'Vendida', description: 'x', path: '/car-details/1', noindex: true });
    expect(content('meta[name="robots"]')).toBe('noindex');

    seo.set({ title: 'Otra', description: 'x', path: '/car-details/2' });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();

    seo.set({ title: 'Vendida', description: 'x', path: '/car-details/1', noindex: true });
    seo.reset();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('sin noindex no hay etiqueta robots', () => {
    seo.set({ title: 'Viva', description: 'x', path: '/car-details/1' });
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('reset() vuelve a lo del sitio: título, descripción y sin canónico ni etiquetas de Twitter propias', () => {
    seo.set({ title: 'Uno', description: 'a', path: '/tienda/p/uno', image: 'assets/x.jpg', type: 'product' });

    seo.reset();

    expect(TestBed.inject(Title).getTitle()).toBe('X AutoHub — Todo lo que tu carro necesita');
    expect(content('meta[property="og:title"]')).toBe('X AutoHub — Todo lo que tu carro necesita');
    expect(content('meta[property="og:type"]')).toBe('website');
    expect(content('meta[property="og:image"]')).toBe('https://xautohubrd.com/icon-512.png');
    expect(canonical()).toBeUndefined();
    expect(TestBed.inject(Meta).getTag('name="twitter:title"')).toBeNull();
  });
});
