import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ReplyDraftService } from '../../services/reply-draft.service';
import { WaDraft } from './wa-draft';

describe('WaDraft (bloque 10: mensajes de WhatsApp sin bot)', () => {
  const draft = vi.fn();

  function montar() {
    TestBed.configureTestingModule({ providers: [{ provide: ReplyDraftService, useValue: { draft } }] });
    const fixture = TestBed.createComponent(WaDraft);
    fixture.componentRef.setInput('kind', 'order');
    fixture.componentRef.setInput('targetId', 'o1');
    fixture.componentRef.setInput('phone', '8095550134');
    fixture.componentRef.setInput('fallback', 'Hola Maria, tu pedido #1042 va en camino.');
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => draft.mockReset());

  it('cerrado no pide nada a la IA', () => {
    montar();

    expect(draft).not.toHaveBeenCalled();
  });

  it('al abrirlo pide un borrador y lo pone en un texto editable, rotulado como de la IA', () => {
    draft.mockReturnValue(of('Hola Maria, tu pedido 1042 va en camino. — X AutoHub'));
    const { fixture, c, el } = montar();

    c.toggle();
    fixture.detectChanges();

    expect(draft).toHaveBeenCalledWith('order', 'o1', 1);
    expect(c.text()).toContain('va en camino');
    expect(c.fromAi()).toBe(true);
    expect(el.textContent).toContain('borrador de la IA: revísalo antes de enviar');
    expect(el.querySelector('textarea')).not.toBeNull();
  });

  it('si la IA no está, usa la plantilla sin IA', () => {
    draft.mockReturnValue(of(null));
    const { fixture, c, el } = montar();

    c.toggle();
    fixture.detectChanges();

    expect(c.text()).toBe('Hola Maria, tu pedido #1042 va en camino.');
    expect(c.fromAi()).toBe(false);
    expect(el.textContent).toContain('plantilla: edítala si quieres');
  });

  it('lo que se edita es lo que se manda: el enlace usa el texto editado, al teléfono del cliente', () => {
    draft.mockReturnValue(of(null));
    const { fixture, c, el } = montar();
    c.toggle();
    c.edit({ target: { value: 'Hola, ya lo despachamos & sale hoy' } } as unknown as Event);
    fixture.detectChanges();

    const href = el.querySelector('a')?.getAttribute('href') ?? '';
    expect(href).toContain('wa.me/18095550134');
    expect(decodeURIComponent(href)).toContain('ya lo despachamos & sale hoy');
    expect(href).not.toContain('despachamos & sale');
  });

  it('"Otra versión" pide la siguiente (1, 2, 3 y vuelve a empezar)', () => {
    draft.mockReturnValue(of('texto'));
    const { c } = montar();

    c.toggle();
    c.another();
    c.another();
    c.another();

    expect(draft.mock.calls.map((call) => call[2])).toEqual([1, 2, 3, 1]);
  });

  it('abrir WhatsApp avisa, pero no manda nada por su cuenta', () => {
    draft.mockReturnValue(of(null));
    const { fixture, c, el } = montar();
    let opened = 0;
    c.opened.subscribe(() => opened++);
    c.toggle();
    fixture.detectChanges();

    (el.querySelector('a') as HTMLAnchorElement).click();

    expect(opened).toBe(1);
    expect(el.querySelector('a')?.getAttribute('target')).toBe('_blank');
    expect(el.querySelector('a')?.getAttribute('rel')).toContain('noopener');
  });

  it('el aviso dice que nada se manda solo', () => {
    draft.mockReturnValue(of(null));
    const { fixture, c, el } = montar();
    c.toggle();
    fixture.detectChanges();

    expect(el.textContent).toContain('No se manda nada solo');
  });
});
