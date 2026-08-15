import { TestFlagged, canSeeTestItems, visibleTo } from './test-visibility';
import { UserModel } from '../models/user.model';

/**
 * El predicado que decide quién ve el contenido de prueba.
 *
 * Es la única definición del lado del cliente, así que un fallo aquí se nota en
 * los cuatro pilares a la vez. Fija la regla en positivo (quién sí) y en
 * negativo (quién no), que es lo que de verdad importa: un artículo de prueba
 * visible para un visitante es el bug que esta fase existe para evitar.
 */
describe('test-visibility', () => {
  const base: UserModel = {
    id: 'u-1',
    displayName: 'Quien sea',
    email: 'quien@ejemplo.com',
    role: 'user',
    createdAt: '2026-08-15T00:00:00Z',
  };

  const normal: UserModel = base;
  const testUser: UserModel = { ...base, isTestUser: true };
  const moderador: UserModel = { ...base, role: 'moderador' };
  const admin: UserModel = { ...base, role: 'admin', isAdmin: true };

  describe('canSeeTestItems', () => {
    it('sin sesion, no', () => {
      expect(canSeeTestItems(null)).toBe(false);
      expect(canSeeTestItems(undefined)).toBe(false);
    });

    it('un usuario normal, no', () => {
      expect(canSeeTestItems(normal)).toBe(false);
    });

    it('un usuario de prueba, si — aunque siga siendo `user`', () => {
      expect(canSeeTestItems(testUser)).toBe(true);
      expect(testUser.role).toBe('user');
    });

    it('moderador y admin, si — por su rol, sin necesidad de la marca', () => {
      expect(canSeeTestItems(moderador)).toBe(true);
      expect(canSeeTestItems(admin)).toBe(true);
      expect(moderador.isTestUser).toBeUndefined();
    });
  });

  describe('visibleTo', () => {
    // El tipo explícito es necesario: `TestFlagged` solo tiene propiedades
    // opcionales, así que un `{ id: 1 }` suelto no lo satisface (TypeScript lo
    // rechaza por no tener nada en común con el tipo débil).
    interface Item extends TestFlagged {
      id: number;
    }

    const normalItem: Item = { id: 1 };
    const testItem: Item = { id: 2, isTest: true };
    const items: Item[] = [normalItem, testItem];

    it('a quien no puede ver lo de prueba le quita esas filas', () => {
      expect(items.filter(visibleTo(null))).toEqual([normalItem]);
      expect(items.filter(visibleTo(normal))).toEqual([normalItem]);
    });

    it('a quien si puede, se las deja todas', () => {
      expect(items.filter(visibleTo(testUser))).toEqual(items);
      expect(items.filter(visibleTo(moderador))).toEqual(items);
      expect(items.filter(visibleTo(admin))).toEqual(items);
    });

    it('`isTest` ausente cuenta como false: el contenido viejo no desaparece', () => {
      const puedeVer = visibleTo<TestFlagged>(null);

      expect(puedeVer({ isTest: undefined })).toBe(true);
      expect(puedeVer({})).toBe(true);
      expect(puedeVer({ isTest: false })).toBe(true);
    });
  });
});
