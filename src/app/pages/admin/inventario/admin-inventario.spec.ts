import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminInventario } from './admin-inventario';
import { AdminCatalogService } from '../../../../shared/services/admin-catalog.service';
import { ToastService } from '../../../../shared/services/toast.service';

describe('AdminInventario (piezas de la tienda)', () => {
  const show = vi.fn();

  function montar() {
    show.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { show } }] });
    const fixture = TestBed.createComponent(AdminInventario);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const catalog = TestBed.inject(AdminCatalogService);
    return { fixture, c, el, catalog };
  }

  /** Llena el formulario con una pieza valida; lo que cada caso quiera cambiar lo pisa despues. */
  function llenar(c: AdminInventario, cambios: Record<string, unknown> = {}) {
    c.partForm.patchValue({
      name: 'Pieza nueva',
      brand: 'Marca',
      categoryId: 6,
      price: 1000,
      stock: 5,
      ...cambios,
    });
    c.existingImages.set(['assets/imgs/hub-parts/disco-brembo-gtr.jpg']);
  }

  it('carga las piezas, las categorias y los servicios', () => {
    const { c } = montar();

    expect(c.parts().length).toBe(5);
    expect(c.categories().length).toBe(12);
    expect(c.services().length).toBe(10);
    expect(c.isLoading()).toBe(false);
  });

  it('el selector de categoria ofrece las 12 de primer nivel y deshabilita la opcion vacia', () => {
    const { fixture, c, el } = montar();
    c.startCreate();
    fixture.detectChanges();

    const select = el.querySelector<HTMLSelectElement>('select[formcontrolname="categoryId"]')!;
    const opciones = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(opciones.length).toBe(13); // la vacia + las 12
    expect(opciones).toContain('Frenos');
    expect(select.options[0].disabled).toBe(true);
  });

  it('una categoria con hijas se ofrece agrupada, con su opcion general', async () => {
    const { fixture, c, el, catalog } = montar();
    const frenos = c.categories().find((x) => x.slug === 'frenos')!;
    const hija = await new Promise<{ id: number }>((resolve) =>
      catalog.createCategory({ name: 'Discos', parentId: frenos.id, sortOrder: 10 }).subscribe(resolve),
    );
    c.categories.set(await new Promise((resolve) => catalog.getCategories().subscribe(resolve)));
    c.startCreate();
    fixture.detectChanges();

    const grupo = el.querySelector('optgroup[label="Frenos"]');
    expect(grupo).not.toBeNull();
    expect(grupo?.textContent).toContain('Frenos (general)');
    expect(grupo?.textContent).toContain('Discos');
    expect(hija.id).toBeGreaterThan(0);
  });

  it('un formulario nuevo nace en stock, especifico y sin categoria elegida', () => {
    const { c } = montar();
    c.startCreate();

    const f = c.partForm.getRawValue();
    expect(f.fulfillment).toBe('stock');
    expect(f.fitmentType).toBe('specific'); // no se promete compatibilidad por omision
    expect(f.categoryId).toBeNull();
    expect(c.partForm.invalid).toBe(true);
    expect(c.fitments()).toEqual([]);
    expect(c.specs()).toEqual({});
  });

  describe('reglas que cruzan campos', () => {
    it('una oferta igual o menor que el precio es un error; mayor, no', () => {
      const { c } = montar();
      c.startCreate();
      llenar(c);
      c.partForm.markAllAsTouched();

      c.partForm.patchValue({ compareAtPrice: 1000 });
      expect(c.partRuleError('compareAtLow')).toBe(true);
      c.partForm.patchValue({ compareAtPrice: 900 });
      expect(c.partRuleError('compareAtLow')).toBe(true);
      c.partForm.patchValue({ compareAtPrice: 1500 });
      expect(c.partRuleError('compareAtLow')).toBe(false);
      c.partForm.patchValue({ compareAtPrice: null });
      expect(c.partRuleError('compareAtLow')).toBe(false);
    });

    it('un articulo bajo pedido sin dias de entrega es un error', () => {
      const { c } = montar();
      c.startCreate();
      llenar(c);
      c.partForm.markAllAsTouched();

      c.partForm.patchValue({ fulfillment: 'on_order', leadTimeDays: null });
      expect(c.partRuleError('leadTimeMissing')).toBe(true);
      expect(c.partForm.valid).toBe(false);

      c.partForm.patchValue({ leadTimeDays: 10 });
      expect(c.partRuleError('leadTimeMissing')).toBe(false);
      expect(c.partForm.valid).toBe(true);
    });

    it('un articulo en stock no pide dias de entrega', () => {
      const { c } = montar();
      c.startCreate();
      llenar(c, { fulfillment: 'stock', leadTimeDays: null });

      expect(c.partRuleError('leadTimeMissing')).toBe(false);
      expect(c.partForm.valid).toBe(true);
    });

    it('el slug solo admite minusculas, numeros y guiones, y vacio vale', () => {
      const { c } = montar();
      c.startCreate();
      llenar(c);

      for (const bien of ['', 'disco-gtr', 'disco-gtr-1', 'a1']) {
        c.partForm.patchValue({ slug: bien });
        expect(c.partForm.controls.slug.valid).toBe(true);
      }
      for (const mal of ['Disco GTR', 'disco_gtr', '-disco', 'disco-', 'disco--gtr', 'ñandú']) {
        c.partForm.patchValue({ slug: mal });
        expect(c.partForm.controls.slug.valid).toBe(false);
      }
    });

    it('el formulario cambia de campos: stock si es de inventario, dias si es bajo pedido', () => {
      const { fixture, c, el } = montar();
      c.startCreate();
      llenar(c);
      fixture.detectChanges();
      expect(el.querySelector('input[formcontrolname="stock"]')).not.toBeNull();
      expect(el.querySelector('input[formcontrolname="leadTimeDays"]')).toBeNull();

      c.partForm.patchValue({ fulfillment: 'on_order' });
      fixture.detectChanges();
      expect(el.querySelector('input[formcontrolname="stock"]')).toBeNull();
      expect(el.querySelector('input[formcontrolname="leadTimeDays"]')).not.toBeNull();
    });

    it('el editor de compatibilidad solo sale para un especifico, y el de servicio para un instalable', () => {
      const { fixture, c, el } = montar();
      c.startCreate();
      llenar(c, { fitmentType: 'specific', installable: false });
      fixture.detectChanges();
      expect(el.querySelector('app-fitment-editor')).not.toBeNull();
      expect(el.querySelector('select[formcontrolname="installationServiceId"]')).toBeNull();

      c.partForm.patchValue({ fitmentType: 'universal', installable: true });
      fixture.detectChanges();
      expect(el.querySelector('app-fitment-editor')).toBeNull();
      expect(el.querySelector('select[formcontrolname="installationServiceId"]')).not.toBeNull();
    });
  });

  describe('guardar', () => {
    it('crea la pieza y guarda su compatibilidad cuando es especifica', () => {
      const { c, catalog } = montar();
      const replace = vi.spyOn(catalog, 'replaceFitments').mockReturnValue(of(undefined));
      c.startCreate();
      llenar(c, { fitmentType: 'specific' });
      const f = { makeId: 1, modelId: 10, yearFrom: 2010, yearTo: 2020 };
      c.fitments.set([f]);

      c.submitPart();

      expect(c.parts()[0].name).toBe('Pieza nueva');
      expect(replace).toHaveBeenCalledWith(c.parts()[0].id, [f]);
      expect(c.isCreating()).toBe(false);
      expect(show).toHaveBeenCalledWith('"Pieza nueva" agregada al catalogo.');
    });

    it('una pieza universal no lleva compatibilidad: se manda la lista vacia', () => {
      const { c, catalog } = montar();
      const replace = vi.spyOn(catalog, 'replaceFitments').mockReturnValue(of(undefined));
      c.startCreate();
      llenar(c, { fitmentType: 'universal' });
      c.fitments.set([{ makeId: 1, modelId: null, yearFrom: null, yearTo: null }]);

      c.submitPart();

      expect(replace).toHaveBeenCalledWith(c.parts()[0].id, []);
    });

    it('guarda las opciones con la pieza, comparando con lo que había al abrir', () => {
      const { c, catalog } = montar();
      vi.spyOn(catalog, 'replaceFitments').mockReturnValue(of(undefined));
      const save = vi.spyOn(catalog, 'saveVariants').mockReturnValue(of({ deactivated: [] }));
      c.startCreate();
      llenar(c, { fitmentType: 'universal', variantLabel: 'Color' });
      const lista = [{ id: null, name: 'Negro', sku: '', imageUrls: [], stock: 4, isActive: true }];
      c.variants.set(lista);

      c.submitPart();

      expect(save).toHaveBeenCalledWith(c.parts()[0].id, lista, []);
    });

    it('con opciones que se ofrecen, el stock de la pieza es la suma (no lo escrito a mano)', () => {
      const { c, catalog } = montar();
      vi.spyOn(catalog, 'replaceFitments').mockReturnValue(of(undefined));
      vi.spyOn(catalog, 'saveVariants').mockReturnValue(of({ deactivated: [] }));
      c.startCreate();
      llenar(c, { fitmentType: 'universal', stock: 99 });
      c.variants.set([
        { id: null, name: 'Negro', sku: '', imageUrls: [], stock: 4, isActive: true },
        { id: null, name: 'Gris', sku: '', imageUrls: [], stock: 3, isActive: true },
        { id: null, name: 'Beige', sku: '', imageUrls: [], stock: 50, isActive: false },
      ]);

      c.submitPart();

      expect(c.parts()[0].stock).toBe(7);
    });

    it('una lista de opciones con problemas no se guarda, y no sube nada', () => {
      const { c, catalog } = montar();
      const save = vi.spyOn(catalog, 'saveVariants');
      const antes = c.parts().length;
      c.startCreate();
      llenar(c, { fitmentType: 'universal' });
      c.variants.set([
        { id: null, name: 'Negro', sku: '', imageUrls: [], stock: 1, isActive: true },
        { id: null, name: 'negro', sku: '', imageUrls: [], stock: 1, isActive: true },
      ]);

      c.submitPart();

      expect(c.parts().length).toBe(antes);
      expect(save).not.toHaveBeenCalled();
      expect(show).toHaveBeenCalledWith('Hay dos opciones llamadas "negro".', 'error');
    });

    it('si una opción con pedidos se apagó en lugar de borrarse, se avisa', () => {
      const { c, catalog } = montar();
      vi.spyOn(catalog, 'replaceFitments').mockReturnValue(of(undefined));
      vi.spyOn(catalog, 'saveVariants').mockReturnValue(of({ deactivated: ['Rojo'] }));
      c.startCreate();
      llenar(c, { fitmentType: 'universal' });

      c.submitPart();

      expect(show).toHaveBeenCalledWith('No se pueden borrar las opciones con pedidos: quedaron apagadas (Rojo).');
    });

    it('no guarda un formulario invalido ni uno sin imagen', () => {
      const { c } = montar();
      const antes = c.parts().length;
      c.startCreate();

      c.submitPart();
      expect(c.parts().length).toBe(antes);
      expect(show).toHaveBeenCalledWith('Revisa los campos marcados.', 'error');

      llenar(c);
      c.existingImages.set([]);
      c.submitPart();
      expect(c.parts().length).toBe(antes);
      expect(show).toHaveBeenCalledWith('Agrega al menos una imagen.', 'error');
    });

    it('un articulo bajo pedido sin plazo no se guarda', () => {
      const { c } = montar();
      const antes = c.parts().length;
      c.startCreate();
      llenar(c, { fulfillment: 'on_order', leadTimeDays: null });

      c.submitPart();

      expect(c.parts().length).toBe(antes);
    });

    it('el stock de una pieza con opciones es la suma y no se escribe a mano', () => {
      const { fixture, c, el } = montar();
      c.startCreate();
      fixture.detectChanges();
      expect(el.querySelector('input[formcontrolname="stock"]')).not.toBeNull();

      c.variants.set([{ id: null, name: 'Negro', sku: '', imageUrls: [], stock: 6, isActive: true }]);
      fixture.detectChanges();

      expect(el.querySelector('input[formcontrolname="stock"]')).toBeNull();
      expect(el.querySelector('.adm-inv__note strong')?.textContent).toBe('6');
    });

    it('editar una pieza con opciones las trae, y la lista marca la suma sin campo editable', () => {
      const { fixture, c, el, catalog } = montar();
      vi.spyOn(catalog, 'getVariants').mockReturnValue(of([{ id: 1, name: 'Negro', sku: '', imageUrls: [], stock: 6, isActive: true }]));

      c.startEdit(1);
      fixture.detectChanges();

      expect(c.variants().map((x) => x.name)).toEqual(['Negro']);
      expect(el.querySelector('app-variant-editor')).not.toBeNull();
    });

    it('editar una pieza abre el formulario con sus datos y su compatibilidad', () => {
      const { c } = montar();
      c.setTab('piezas');

      c.startEdit(1);

      expect(c.editingId()).toBe(1);
      expect(c.partForm.controls.name.value).toBe('Disco ventilado GTR 355mm');
      expect(c.partForm.controls.categoryId.value).toBe(6);
      expect(c.isLoadingOne()).toBe(false);
    });
  });

  describe('pestanas', () => {
    it('hay cinco, y las dos nuevas no tienen boton de "nueva pieza"', () => {
      const { fixture, c, el } = montar();

      const etiquetas = Array.from(el.querySelectorAll('.adm-inv__tab')).map((t) =>
        t.textContent?.replace(/\s+/g, ' ').trim(),
      );
      expect(etiquetas.length).toBe(5);
      expect(etiquetas.some((t) => t?.startsWith('Auto Hub'))).toBe(true);
      expect(el.querySelector('.adm-inv__new')).not.toBeNull();

      c.setTab('categorias');
      fixture.detectChanges();
      expect(el.querySelector('.adm-inv__new')).toBeNull();
      expect(el.querySelector('app-admin-categorias')).not.toBeNull();

      c.setTab('marcas');
      fixture.detectChanges();
      expect(el.querySelector('.adm-inv__new')).toBeNull();
      expect(el.querySelector('app-admin-marcas')).not.toBeNull();
    });

    it('la lista de piezas muestra categoria, SKU y si es bajo pedido', () => {
      const { el } = montar();
      const texto = el.textContent ?? '';

      expect(texto).toContain('XAH-000001');
      expect(texto).toContain('Frenos');
      expect(texto).toContain('Bajo pedido'); // el coilover del mock
    });
  });
});
