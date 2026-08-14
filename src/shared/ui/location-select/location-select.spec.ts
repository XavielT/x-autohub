import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Component } from '@angular/core';

import { LocationSelect } from './location-select';

/** Anfitrion minimo: es la forma en que las paginas lo usan de verdad. */
@Component({
  imports: [ReactiveFormsModule, LocationSelect],
  template: `<app-location-select [formControl]="control" [invalid]="control.invalid" />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true, validators: [Validators.required] });
}

describe('LocationSelect como ControlValueAccessor', () => {
  async function montar() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const select = fixture.debugElement.children[0].componentInstance as LocationSelect;
    return { fixture, host: fixture.componentInstance, select };
  }

  it('muestra el valor que le escribe el formulario', async () => {
    const { host, select } = await montar();

    host.control.setValue('La Romana');

    expect(select.value()).toBe('La Romana');
    expect(select.isOutsideList()).toBe(false);
  });

  it('propaga al formulario lo que se elige', async () => {
    const { host, select } = await montar();

    select.select({ name: 'Puerto Plata', lat: 19.79, lng: -70.69 });

    expect(host.control.value).toBe('Puerto Plata');
  });

  it('cierra el panel al elegir', async () => {
    const { select } = await montar();
    select.open();
    expect(select.isOpen()).toBe(true);

    select.select({ name: 'Azua', lat: 18.45, lng: -70.73 });

    expect(select.isOpen()).toBe(false);
  });

  it('el control obligatorio queda valido en cuanto se elige', async () => {
    const { host, select } = await montar();
    expect(host.control.invalid).toBe(true);

    select.select({ name: 'Santiago', lat: 19.45, lng: -70.7 });

    expect(host.control.valid).toBe(true);
  });

  it('conserva un valor que no esta en la lista, en vez de vaciarlo', async () => {
    // Es el caso de los datos que ya existen: "Santo Domingo Este" y "Punta Cana"
    // estan hoy en la base. Si el control los descartara al abrir un formulario
    // de edicion, guardar un cambio de precio borraria la ubicacion.
    const { host, select } = await montar();

    host.control.setValue('Santo Domingo Este');

    expect(select.value()).toBe('Santo Domingo Este');
    expect(select.isOutsideList()).toBe(true);
    // Y el formulario sigue teniendo el valor original mientras nadie elija otro.
    expect(host.control.value).toBe('Santo Domingo Este');
  });

  it('trata null como vacio y no revienta', async () => {
    const { select } = await montar();

    select.writeValue(null);

    expect(select.value()).toBe('');
    expect(select.isOutsideList()).toBe(false);
  });

  it('respeta que el formulario lo deshabilite', async () => {
    const { host, select } = await montar();

    host.control.disable();
    expect(select.isDisabled()).toBe(true);

    select.toggle();
    expect(select.isOpen()).toBe(false);
  });

  it('filtra la lista con lo que se escribe', async () => {
    const { select } = await montar();

    select.query.set('roman');

    expect(select.options().map((o) => o.name)).toEqual(['La Romana']);
  });

  describe('teclado', () => {
    function tecla(key: string): KeyboardEvent {
      return new KeyboardEvent('keydown', { key, cancelable: true });
    }

    it('las flechas mueven el resaltado y dan la vuelta', async () => {
      const { select } = await montar();
      select.open();
      select.query.set('santiago'); // Santiago, Santiago Rodríguez

      select.onSearchKeydown(tecla('ArrowDown'));
      expect(select.activeIndex()).toBe(1);
      // Al final vuelve al principio, para no quedarse trabado abajo.
      select.onSearchKeydown(tecla('ArrowDown'));
      expect(select.activeIndex()).toBe(0);
      select.onSearchKeydown(tecla('ArrowUp'));
      expect(select.activeIndex()).toBe(1);
    });

    it('Enter elige la resaltada', async () => {
      const { host, select } = await montar();
      select.open();
      select.query.set('santiago');
      select.onSearchKeydown(tecla('ArrowDown'));

      select.onSearchKeydown(tecla('Enter'));

      expect(host.control.value).toBe('Santiago Rodríguez');
    });

    it('Escape cierra sin elegir nada', async () => {
      const { host, select } = await montar();
      select.open();

      select.onSearchKeydown(tecla('Escape'));

      expect(select.isOpen()).toBe(false);
      expect(host.control.value).toBe('');
    });

    it('al filtrar, el resaltado vuelve arriba', async () => {
      const { select } = await montar();
      select.open();
      select.onSearchKeydown(tecla('ArrowDown'));
      select.onSearchKeydown(tecla('ArrowDown'));
      expect(select.activeIndex()).toBe(2);

      // Sin esto el indice podria apuntar fuera de la lista nueva.
      select.onQueryInput({ target: { value: 'azua' } } as unknown as Event);

      expect(select.activeIndex()).toBe(0);
    });
  });
});
