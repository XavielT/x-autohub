import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AdminServicesService, DayDraft, ServiceDraft, WorkDraft, slugify, validateService } from './admin-services.service';

describe('AdminServicesService (mock)', () => {
  let admin: AdminServicesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    admin = TestBed.inject(AdminServicesService);
  });

  const errorOf = async (obs: Parameters<typeof firstValueFrom>[0]) => {
    try {
      await firstValueFrom(obs);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const draft = (over: Partial<ServiceDraft> = {}): ServiceDraft => ({
    id: null, title: 'Alineación', slug: '', icon: 'assets/icons/repair-hub-icon.svg', description: 'Alineación y balanceo',
    longDescription: '', category: 'mecanica', priceFrom: null, durationMinutes: 60, isBookable: true, images: [],
    sortOrder: 110, isActive: true, ...over,
  });

  describe('servicios', () => {
    it('trae todos, incluidos los apagados', async () => {
      const saved = await firstValueFrom(admin.saveService(draft({ isActive: false })));

      const all = await firstValueFrom(admin.getServices());
      expect(all.some((s) => s.id === saved.id && !s.isActive)).toBe(true);
    });

    it('un servicio nuevo sin slug lo recibe del título, sin acentos', async () => {
      const saved = await firstValueFrom(admin.saveService(draft({ title: 'Alineación y balanceo' })));

      expect(saved.slug).toBe('alineacion-y-balanceo');
    });

    it('un precio vacío es "a cotizar"', async () => {
      const saved = await firstValueFrom(admin.saveService(draft({ priceFrom: null })));

      expect(saved.priceFrom).toBeNull();
    });

    it('editar conserva el id y reemplaza lo demás', async () => {
      const created = await firstValueFrom(admin.saveService(draft()));
      await firstValueFrom(admin.saveService(draft({ id: created.id, title: 'Alineación 3D', slug: created.slug })));

      const all = await firstValueFrom(admin.getServices());
      expect(all.filter((s) => s.id === created.id)).toHaveLength(1);
      expect(all.find((s) => s.id === created.id)?.title).toBe('Alineación 3D');
    });

    it('dos servicios no comparten slug', async () => {
      expect(await errorOf(admin.saveService(draft({ title: 'Otro', slug: 'frenos' })))).toBe('Ese registro ya existe.');
    });

    it('valida lo mínimo con el mensaje de lo que falta', () => {
      expect(validateService(draft({ title: ' ' }))).toBe('Escribe el nombre del servicio.');
      expect(validateService(draft({ icon: '' }))).toBe('Elige un icono.');
      expect(validateService(draft({ description: '' }))).toBe('Escribe la descripción corta.');
      expect(validateService(draft({ durationMinutes: 0 }))).toMatch(/duración/);
      expect(validateService(draft({ priceFrom: -1 }))).toBe('El precio no puede ser negativo.');
      expect(validateService(draft())).toBeNull();
    });

    it('slugify espeja xah_slugify() de Postgres', () => {
      expect(slugify('Carga y reparación de A/C')).toBe('carga-y-reparacion-de-a-c');
      expect(slugify('  Niño Ñandú  ')).toBe('nino-nandu');
    });
  });

  describe('horario', () => {
    const day = (over: Partial<DayDraft> = {}): DayDraft => ({
      weekday: 1, open: true, opensAt: '08:00', closesAt: '17:00', slotMinutes: 60, capacity: 2, ruleId: null, ...over,
    });

    it('guardar la semana deja solo los días abiertos, y ya no son de ejemplo', async () => {
      await firstValueFrom(admin.saveWeek([day({ weekday: 1 }), day({ weekday: 2, open: false }), day({ weekday: 3 })]));

      const rules = await firstValueFrom(admin.getAvailability());
      expect(rules.map((r) => r.weekday)).toEqual([1, 3]);
      expect(rules.every((r) => !r.isExample)).toBe(true);
    });

    it('un taller que cierra antes de abrir se rechaza', async () => {
      expect(await errorOf(admin.saveWeek([day({ opensAt: '17:00', closesAt: '08:00' })]))).toBe(
        'El taller tiene que cerrar después de abrir.',
      );
    });

    it('una franja de menos de 5 minutos o sin cupo se rechaza', async () => {
      expect(await errorOf(admin.saveWeek([day({ slotMinutes: 1 })]))).toMatch(/5 minutos/);
      expect(await errorOf(admin.saveWeek([day({ capacity: 0 })]))).toMatch(/1 cupo/);
    });

    it('un día cerrado con horas absurdas no estorba: solo valen las de los días abiertos', async () => {
      await firstValueFrom(admin.saveWeek([day({ open: false, opensAt: '17:00', closesAt: '08:00' })]));
    });
  });

  describe('cierres', () => {
    const from = new Date('2026-12-24T12:00:00Z');
    const to = new Date('2026-12-26T12:00:00Z');

    it('se agregan, salen ordenados y se quitan', async () => {
      const b = await firstValueFrom(admin.addBlackout({ startsAt: from, endsAt: to, reason: ' Navidad ' }));
      await firstValueFrom(admin.addBlackout({ startsAt: new Date('2026-11-01T12:00:00Z'), endsAt: new Date('2026-11-02T12:00:00Z'), reason: 'Feriado' }));

      const list = await firstValueFrom(admin.getBlackouts());
      expect(list.map((x) => x.reason)).toEqual(['Feriado', 'Navidad']);

      await firstValueFrom(admin.removeBlackout(b.id));
      expect((await firstValueFrom(admin.getBlackouts())).map((x) => x.reason)).toEqual(['Feriado']);
    });

    it('un cierre que termina antes de empezar se rechaza', async () => {
      expect(await errorOf(admin.addBlackout({ startsAt: to, endsAt: from, reason: '' }))).toBe(
        'El cierre tiene que terminar después de empezar.',
      );
    });
  });

  describe('citas', () => {
    it('trae las de ejemplo ordenadas por fecha', async () => {
      const list = await firstValueFrom(admin.getAppointments());

      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.map((a) => +a.scheduledAt)).toEqual([...list.map((a) => +a.scheduledAt)].sort((a, b) => a - b));
    });

    it('requested → confirmed guarda la nota que verá el cliente', async () => {
      await firstValueFrom(admin.setAppointmentStatus('mock-cita-1', 'confirmed', ' Te esperamos '));

      const a = (await firstValueFrom(admin.getAppointments())).find((x) => x.id === 'mock-cita-1')!;
      expect(a.status).toBe('confirmed');
      expect(a.statusNote).toBe('Te esperamos');
    });

    it('no se salta un paso: de requested no se va a done', async () => {
      expect(await errorOf(admin.setAppointmentStatus('mock-cita-1', 'done'))).toBe('Una cita requested no puede pasar a done.');
    });

    it('una cita hecha ya no se mueve, y una que no existe se rechaza', async () => {
      expect(await errorOf(admin.setAppointmentStatus('mock-cita-3', 'cancelled'))).toBe('Una cita done no puede pasar a cancelled.');
      expect(await errorOf(admin.setAppointmentStatus('nope', 'confirmed'))).toBe('Esa cita no existe.');
    });

    it('con "desde" solo trae las de esa fecha en adelante', async () => {
      const future = await firstValueFrom(admin.getAppointments(new Date()));

      expect(future.every((a) => a.scheduledAt >= new Date(Date.now() - 1000))).toBe(true);
    });
  });

  describe('trabajos', () => {
    const work = (over: Partial<WorkDraft> = {}): WorkDraft => ({
      id: null, title: 'Cambio de batería', description: '', serviceId: 6, beforeImage: null, afterImage: 'a.jpg',
      vehicleText: 'Civic 2018', doneAt: '2026-10-01', isPublished: true, ...over,
    });

    it('trae todos, también los borradores', async () => {
      await firstValueFrom(admin.saveWork(work({ isPublished: false, afterImage: null })));

      expect((await firstValueFrom(admin.getWorks())).some((w) => !w.isPublished)).toBe(true);
    });

    it('para publicar hace falta al menos la foto del después', async () => {
      expect(await errorOf(admin.saveWork(work({ afterImage: null })))).toBe(
        'Para publicar un trabajo hace falta al menos la foto del después.',
      );
    });

    it('un borrador sin fotos sí se guarda', async () => {
      const saved = await firstValueFrom(admin.saveWork(work({ isPublished: false, afterImage: null })));

      expect(saved.isPublished).toBe(false);
    });

    it('sin título no se guarda', async () => {
      expect(await errorOf(admin.saveWork(work({ title: ' ' })))).toBe('Escribe el título del trabajo.');
    });

    it('se borra', async () => {
      const saved = await firstValueFrom(admin.saveWork(work()));
      await firstValueFrom(admin.deleteWork(saved.id));

      expect((await firstValueFrom(admin.getWorks())).some((w) => w.id === saved.id)).toBe(false);
    });

    it('guardar con fotos nuevas las sube y deja su dirección en el trabajo', async () => {
      const saved = await firstValueFrom(
        admin.saveWorkWithImages(work({ afterImage: null, beforeImage: null }), {
          after: new File(['x'], 'despues.jpg', { type: 'image/jpeg' }),
        }),
      );

      expect(saved.afterImage).toBeTruthy();
      expect(saved.beforeImage).toBeNull();
    });
  });
});
