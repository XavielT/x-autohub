import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthService } from './auth.service';
import { FavoriteService } from './favorite.service';
import { ProductService } from './product.service';
import { ToastService } from './toast.service';
import { UserModel } from '../models/user.model';

const USER: UserModel = {
  id: 'u-1',
  displayName: 'Quien sea',
  email: 'quien@ejemplo.com',
  role: 'user',
  createdAt: '2026-08-15T00:00:00Z',
};

describe('FavoriteService (mock)', () => {
  let user: WritableSignal<UserModel | null>;
  const toast = { show: vi.fn() };

  function servicio() {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: ToastService, useValue: toast },
      ],
    });
    return TestBed.inject(FavoriteService);
  }

  beforeEach(() => {
    toast.show.mockClear();
    user = signal<UserModel | null>(null);
  });

  it('sin sesion no guarda nada y avisa que hay que entrar', async () => {
    const favs = servicio();
    expect(await firstValueFrom(favs.toggle(1))).toBe(false);
    expect(favs.ids()).toEqual([]);
    expect(toast.show).toHaveBeenCalledWith(expect.stringContaining('Inicia sesion'), 'error');
  });

  it('con sesion guarda y quita, y el mas nuevo va primero', async () => {
    user.set(USER);
    const favs = servicio();

    expect(await firstValueFrom(favs.toggle(1))).toBe(true);
    expect(await firstValueFrom(favs.toggle(2))).toBe(true);
    expect(favs.ids()).toEqual([2, 1]);
    expect(favs.isFavorite(1)).toBe(true);
    expect(favs.count()).toBe(2);

    expect(await firstValueFrom(favs.toggle(1))).toBe(false);
    expect(favs.ids()).toEqual([2]);
    expect(favs.isFavorite(1)).toBe(false);
  });

  it('al cerrar sesion los favoritos se vacian', async () => {
    user.set(USER);
    const favs = servicio();
    await firstValueFrom(favs.toggle(1));
    expect(favs.count()).toBe(1);

    user.set(null);
    TestBed.tick();
    expect(favs.count()).toBe(0);
  });

  it('list() devuelve los productos guardados en el orden de los favoritos', async () => {
    user.set(USER);
    const favs = servicio();
    const todos = await firstValueFrom(TestBed.inject(ProductService).getAll());
    const [a, b] = todos;

    await firstValueFrom(favs.toggle(a.id));
    await firstValueFrom(favs.toggle(b.id));

    const lista = await firstValueFrom(favs.list());
    expect(lista.map((p) => p.id)).toEqual([b.id, a.id]);
  });
});

describe('ProductService.getByIds (mock)', () => {
  it('respeta el orden pedido y se salta lo que no existe', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { user: signal(null) } }],
    });
    const products = TestBed.inject(ProductService);
    const [a, b] = await firstValueFrom(products.getAll());

    const r = await firstValueFrom(products.getByIds([b.id, 999999, a.id]));
    expect(r.map((p) => p.id)).toEqual([b.id, a.id]);
    expect(await firstValueFrom(products.getByIds([]))).toEqual([]);
  });
});
