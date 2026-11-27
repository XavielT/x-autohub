import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the persistent shell around the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    // Navbar, footer, carrito y toasts viven fuera del <router-outlet>,
    // asi que deben existir en cualquier ruta.
    expect(compiled.querySelector('app-navbar')).toBeTruthy();
    expect(compiled.querySelector('app-footer')).toBeTruthy();
    expect(compiled.querySelector('app-cart-modal')).toBeTruthy();
    expect(compiled.querySelector('app-toast')).toBeTruthy();
  });

  it('la tecla / lleva el cursor al buscador, salvo que ya se esté escribiendo', async () => {
    const fixture = TestBed.createComponent(App);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const search = fixture.nativeElement.querySelector('app-navbar input[type="search"]') as HTMLInputElement;
    expect(search).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(search);

    search.blur();
    const otro = document.createElement('input');
    document.body.appendChild(otro);
    otro.focus();
    otro.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(otro);
    otro.remove();
    fixture.nativeElement.remove();
  });
});
