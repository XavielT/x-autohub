import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BookedAppointment,
  ServiceModel,
  Slot,
} from '../../../shared/models/service.model';
import { OrderView, PickupAddress } from '../../../shared/models/order.model';
import { AppointmentService } from '../../../shared/services/appointment.service';
import { AuthService } from '../../../shared/services/auth.service';
import { OrderService } from '../../../shared/services/order.service';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { SiteSettingsService } from '../../../shared/services/site-settings.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService, sameVehicle } from '../../../shared/services/vehicle.service';
import { WEEKDAY_HEADERS, buildMonth, monthHasBookableDay, shiftMonth } from '../../../shared/utils/calendar';
import { storeWhatsAppLink } from '../../../shared/utils/contact';
import { formatDuration } from '../../../shared/utils/format-duration';
import { buildIcs } from '../../../shared/utils/ics';
import { isValidDrPhone, normalizeDrPhone } from '../../../shared/utils/phone';
import { formatDay, formatTime, formatWhen, localDate, weekdayOf } from '../../../shared/utils/service-time';
import { GuestAvisos } from '../../../shared/components/guest-avisos/guest-avisos';

import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
export type AgendarStep = 1 | 2 | 3;

/** El mensaje con el que se avisa por WhatsApp de una cita ya agendada. */
export function appointmentWhatsAppMessage(
  number: number,
  serviceTitle: string,
  when: string,
  vehicle: string,
): string {
  return [
    `Hola X AutoHub, acabo de agendar la cita #${number}.`,
    `Servicio: ${serviceTitle}`,
    `Cuándo: ${when}`,
    ...(vehicle.trim() ? [`Vehículo: ${vehicle.trim()}`] : []),
  ].join('\n');
}

/**
 * /servicios/agendar — agendar una cita en tres pasos: **servicio → día y hora →
 * datos**. La cita nace `requested`; la confirma el equipo.
 *
 * Lo que se muestra como libre sale de `available_slots()` y **se vuelve a validar al
 * confirmar** (`book_appointment()`): si alguien tomó la hora mientras se llenaba el
 * formulario, vuelve al paso 2 con un mensaje y las horas al día. El calendario es de
 * hecho a mano (sin librería) y sus días se calculan en hora de Santo Domingo.
 */
@Component({
  selector: 'app-agendar',
  imports: [Skeleton, FormsModule, RouterLink, GuestAvisos],
  templateUrl: './agendar.html',
  styleUrl: './agendar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Agendar {
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(ServiceCatalogService);
  private readonly appointments = inject(AppointmentService);
  private readonly orders = inject(OrderService);
  private readonly settings = inject(SiteSettingsService);
  readonly auth = inject(AuthService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly stepLabels = ['Servicio', 'Día y hora', 'Tus datos'] as const;
  readonly weekdayHeaders = WEEKDAY_HEADERS;

  readonly step = signal<AgendarStep>(1);
  readonly services = signal<ServiceModel[]>([]);
  readonly isLoadingServices = signal(true);

  readonly serviceId = signal<number | null>(null);
  /** El pedido del que viene la instalación (`?order=`), si lo hay. */
  readonly order = signal<OrderView | null>(null);
  private orderId: string | null = null;

  // --- Paso 2: calendario y horas ---
  readonly today = signal(localDate(new Date()));
  readonly viewYear = signal(Number(localDate(new Date()).slice(0, 4)));
  readonly viewMonth = signal(Number(localDate(new Date()).slice(5, 7)));
  /** Los días de la semana en que el taller abre. Vacío = todavía no se sabe: no se apaga ninguno. */
  readonly openWeekdays = signal<ReadonlySet<number>>(new Set());
  readonly selectedDate = signal<string | null>(null);
  readonly slots = signal<Slot[]>([]);
  readonly isLoadingSlots = signal(false);
  readonly slotsError = signal(false);
  readonly selectedSlot = signal<Date | null>(null);

  // --- Paso 3: datos ---
  readonly contactName = signal('');
  readonly contactPhone = signal('');
  readonly vehicle = signal('');
  readonly notes = signal('');
  readonly attempted = signal(false);
  readonly isBooking = signal(false);

  // --- Confirmación ---
  readonly booked = signal<BookedAppointment | null>(null);
  readonly pickup = signal<PickupAddress | null>(null);

  readonly service = computed(() => this.services().find((s) => s.id === this.serviceId()) ?? null);
  readonly duration = computed(() => formatDuration(this.service()?.durationMinutes ?? 0));
  readonly month = computed(() => buildMonth(this.viewYear(), this.viewMonth(), this.today()));

  readonly canGoPrev = computed(() => {
    const prev = shiftMonth(this.viewYear(), this.viewMonth(), -1);
    return monthHasBookableDay(prev.year, prev.month, this.today());
  });
  readonly canGoNext = computed(() => {
    const next = shiftMonth(this.viewYear(), this.viewMonth(), 1);
    return monthHasBookableDay(next.year, next.month, this.today());
  });

  readonly selectedDayLabel = computed(() => {
    const date = this.selectedDate();
    return date ? formatDay(new Date(`${date}T12:00:00-04:00`)) : '';
  });

  /** El vehículo elegido en "Mi vehículo", si hay uno. */
  readonly pickedVehicle = this.vehicles.selectedLabel;

  readonly whenLabel = computed(() => {
    const at = this.booked()?.scheduledAt ?? this.selectedSlot();
    return at ? formatWhen(at) : '';
  });

  readonly phoneInvalid = computed(() => !isValidDrPhone(this.contactPhone()));

  readonly whatsappLink = computed(() => {
    const b = this.booked();
    const s = this.service();
    if (!b || !s) return storeWhatsAppLink();
    return storeWhatsAppLink(appointmentWhatsAppMessage(b.number, s.title, formatWhen(b.scheduledAt), this.vehicle()));
  });

  constructor() {
    this.title.setTitle('Agendar una cita | X AutoHub');

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      const id = Number(q.get('service'));
      this.serviceId.set(Number.isInteger(id) && id > 0 ? id : null);
      this.orderId = q.get('order');
      if (this.orderId) {
        this.orders.getOrder(this.orderId).subscribe({ next: (o) => this.order.set(o), error: () => undefined });
      }
    });

    this.catalog.getServices().subscribe({
      next: (all) => {
        // Uno que no se agenda se cotiza por WhatsApp: no se ofrece aquí.
        this.services.set(all.filter((s) => s.isBookable));
        this.isLoadingServices.set(false);

        // Con el servicio ya elegido (viene de la ficha o del pedido) se salta al día y la hora.
        if (this.service() && this.step() === 1) this.goTo(2);
        else if (!this.service()) this.serviceId.set(null);
      },
      error: () => this.isLoadingServices.set(false),
    });

    // Un día en que el taller no abre (el domingo, hoy) no se ofrece: ahorra un clic a una
    // pantalla que diría "no hay horas". Si falla la lectura, no se apaga nada.
    this.catalog.getAvailability().subscribe({
      next: (rules) => this.openWeekdays.set(new Set(rules.map((r) => r.weekday))),
      error: () => undefined,
    });

    this.settings.getPickupAddress().subscribe({
      next: (a) => this.pickup.set(a && !a.isExample ? a : null),
      error: () => undefined,
    });

    // Quien tiene sesión no vuelve a escribir su nombre ni su teléfono.
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        if (user) {
          if (!this.contactName()) this.contactName.set(user.displayName);
          if (!this.contactPhone() && user.phone) this.contactPhone.set(user.phone);
        }
      });
    });

    // Y el vehículo que ya eligió, como punto de partida.
    effect(() => {
      const picked = this.pickedVehicle();
      untracked(() => {
        if (picked && !this.vehicle().trim()) this.vehicle.set(picked);
      });
    });
  }

  // --- Navegación ------------------------------------------------------------

  chooseService(id: number): void {
    this.serviceId.set(id);
    // Cambiar de servicio puede cambiar las horas libres (uno apagado, otro encendido).
    this.selectedSlot.set(null);
    if (this.selectedDate()) this.loadSlots(this.selectedDate()!);
  }

  next(): void {
    const current = this.step();

    if (current === 1 && !this.service()) {
      this.toast.show('Elige el servicio que necesitas.', 'error');
      return;
    }
    if (current === 2 && !this.selectedSlot()) {
      this.toast.show('Elige el día y la hora.', 'error');
      return;
    }

    if (current < 3) this.goTo((current + 1) as AgendarStep);
  }

  back(): void {
    if (this.step() > 1) this.goTo((this.step() - 1) as AgendarStep);
  }

  /** Solo se vuelve a un paso ya recorrido. */
  jumpTo(step: AgendarStep): void {
    if (step < this.step()) this.goTo(step);
  }

  private goTo(step: AgendarStep): void {
    this.step.set(step);
    afterNextRender(
      () => document.querySelector<HTMLElement>('[data-step-heading]')?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }

  // --- Paso 2: el calendario -------------------------------------------------

  shiftMonthBy(delta: -1 | 1): void {
    if ((delta === -1 && !this.canGoPrev()) || (delta === 1 && !this.canGoNext())) return;
    const next = shiftMonth(this.viewYear(), this.viewMonth(), delta);
    this.viewYear.set(next.year);
    this.viewMonth.set(next.month);
  }

  /** ¿El taller no abre ese día de la semana? */
  isClosedDay(date: string | null): boolean {
    const open = this.openWeekdays();
    return date !== null && open.size > 0 && !open.has(weekdayOf(date));
  }

  pickDay(date: string): void {
    this.selectedDate.set(date);
    this.selectedSlot.set(null);
    this.loadSlots(date);
  }

  private loadSlots(date: string): void {
    const id = this.serviceId();
    if (id === null) return;

    this.isLoadingSlots.set(true);
    this.slotsError.set(false);
    this.slots.set([]);

    this.appointments.getSlots(id, date).subscribe({
      next: (slots) => {
        // Si mientras tanto eligió otro día, esta respuesta ya no vale.
        if (this.selectedDate() !== date) return;
        this.slots.set(slots);
        this.isLoadingSlots.set(false);
      },
      error: () => {
        this.slotsError.set(true);
        this.isLoadingSlots.set(false);
      },
    });
  }

  pickSlot(slot: Slot): void {
    this.selectedSlot.set(slot.at);
  }

  timeLabel(slot: Slot): string {
    return formatTime(slot.at);
  }

  isSelected(slot: Slot): boolean {
    const chosen = this.selectedSlot();
    return chosen !== null && +chosen === +slot.at;
  }

  // --- Paso 3: datos y confirmar ---------------------------------------------

  pickVehicle(): void {
    this.picker.open();
  }

  /** Si el texto sigue siendo el del vehículo elegido, la cita lo liga con el del garaje. */
  private garageVehicleId(): number | null {
    const picked = this.vehicles.selected();
    if (!picked || this.vehicle().trim() !== this.pickedVehicle()) return null;
    return (
      this.vehicles
        .garage()
        .find((v) => sameVehicle(v, picked))?.id ?? null
    );
  }

  invalid(field: 'name' | 'phone' | 'vehicle'): boolean {
    if (!this.attempted()) return false;
    switch (field) {
      case 'name':
        return !this.contactName().trim();
      case 'phone':
        return this.phoneInvalid();
      case 'vehicle':
        return !this.vehicle().trim();
    }
  }

  confirm(): void {
    this.attempted.set(true);

    const slot = this.selectedSlot();
    const service = this.service();
    if (!service || !slot) {
      this.goTo(service ? 2 : 1);
      return;
    }

    if (this.invalid('name') || this.invalid('phone') || this.invalid('vehicle')) {
      const missing = [
        this.invalid('name') ? 'Nombre' : null,
        this.invalid('phone') ? 'Teléfono' : null,
        this.invalid('vehicle') ? 'Vehículo' : null,
      ].filter(Boolean);
      this.toast.show(`Te falta completar: ${missing.join(', ')}.`, 'error');
      return;
    }

    this.isBooking.set(true);

    this.appointments
      .book({
        serviceId: service.id,
        scheduledAt: slot,
        contactName: this.contactName().trim(),
        contactPhone: normalizeDrPhone(this.contactPhone()) ?? this.contactPhone().trim(),
        vehicleText: this.vehicle().trim(),
        profileVehicleId: this.garageVehicleId(),
        orderId: this.orderId,
        notes: this.notes().trim(),
      })
      .subscribe({
        next: (booked) => {
          this.isBooking.set(false);
          this.booked.set(booked);
          this.title.setTitle(`Cita #${booked.number} | X AutoHub`);
        },
        error: (error: Error) => {
          this.isBooking.set(false);
          this.toast.show(error.message || 'No pudimos agendar tu cita.', 'error');

          // Lo más común: la hora se llenó mientras se llenaba el formulario. Se vuelve a
          // las horas, ya actualizadas, en vez de dejar al cliente con un botón que no hace nada.
          if (/hora ya no est[aá] disponible/i.test(error.message)) {
            this.selectedSlot.set(null);
            if (this.selectedDate()) this.loadSlots(this.selectedDate()!);
            this.goTo(2);
          }
        },
      });
  }

  // --- Confirmación ----------------------------------------------------------

  /** El `.ics` de la cita, generado aquí: no hay servidor que lo arme. */
  addToCalendar(): void {
    const b = this.booked();
    const s = this.service();
    if (!b || !s) return;

    const ics = buildIcs({
      uid: `${b.id}@xautohubrd.com`,
      start: b.scheduledAt,
      durationMinutes: s.durationMinutes,
      summary: `Cita en X AutoHub: ${s.title}`,
      description: [`Cita #${b.number} (por confirmar).`, this.vehicle().trim() ? `Vehículo: ${this.vehicle().trim()}` : '']
        .filter(Boolean)
        .join('\n'),
      location: this.pickup()?.address,
    });

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `cita-${b.number}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /** Otra cita: vuelve al principio sin recargar la página. */
  reset(): void {
    this.booked.set(null);
    this.selectedSlot.set(null);
    this.selectedDate.set(null);
    this.slots.set([]);
    this.attempted.set(false);
    this.notes.set('');
    this.step.set(1);
  }
}
