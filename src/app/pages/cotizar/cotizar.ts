import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ServiceModel } from '../../../shared/models/service.model';
import { AuthService } from '../../../shared/services/auth.service';
import { MAX_QUOTE_PHOTOS, QuoteService } from '../../../shared/services/quote.service';
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { isValidDrPhone } from '../../../shared/utils/phone';
import { SAFETY_NOTE, isSafetyRelated } from '../../../shared/utils/quote-safety';
import { quoteLink, quoteMessage } from '../../../shared/utils/quote-message';

/** Cuántas fotos se aceptan (y se suben de verdad, a un bucket privado que solo ve el taller). */
export const MAX_PHOTOS = MAX_QUOTE_PHOTOS;

/**
 * /servicios/cotizar — pedir una cotización al taller.
 *
 * La solicitud **se guarda** (con o sin cuenta; migración 0055) con su código `XAH-C-0001`, y las fotos se **suben de verdad**: el equipo las ve en
 * /admin/taller/solicitudes junto a un resumen que prepara la IA para el mecánico. La conversación sigue por WhatsApp (no hay bot): al terminar se
 * abre `wa.me` con un mensaje que lleva el código y lo que escribió. Si lo que cuenta toca frenos, dirección o combustible, se le muestra una nota fija
 * y sobria ("si sientes que no es seguro, no manejes el vehículo y avísanos").
 */
@Component({
  selector: 'app-cotizar',
  imports: [FormsModule, RouterLink],
  templateUrl: './cotizar.html',
  styleUrl: './cotizar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cotizar {
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(ServiceCatalogService);
  private readonly vehicles = inject(VehicleService);
  private readonly picker = inject(VehiclePickerService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly quotes = inject(QuoteService);
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly maxPhotos = MAX_PHOTOS;
  readonly safetyNote = SAFETY_NOTE;

  readonly services = toSignal(this.catalog.getServices(), { initialValue: [] as ServiceModel[] });

  /** El servicio pedido (`?service=slug`), o vacío para "otro". */
  readonly serviceSlug = signal('');
  readonly name = signal('');
  readonly vehicle = signal('');
  readonly details = signal('');
  readonly phone = signal('');
  readonly photos = signal<File[]>([]);
  /** Honeypot: un campo escondido que una persona no llena. */
  readonly website = signal('');
  readonly submitted = signal(false);
  readonly isSending = signal(false);
  /** La solicitud ya guardada: su código y lo que se mandó (para el mensaje de WhatsApp). */
  readonly sent = signal<{ code: string; photos: number } | null>(null);

  /** El vehículo elegido en "Mi vehículo", si hay uno. */
  readonly pickedVehicle = this.vehicles.selectedLabel;

  readonly service = computed(() => this.services().find((s) => s.slug === this.serviceSlug()) ?? null);

  readonly nameInvalid = computed(() => this.name().trim().length < 2);
  readonly phoneInvalid = computed(() => !isValidDrPhone(this.phone()));
  readonly missingDetails = computed(() => this.details().trim().length < 5);
  /** Lo que cuenta toca frenos, dirección o combustible: se le muestra la nota de seguridad de una vez. */
  readonly showSafetyNote = computed(() => isSafetyRelated(this.details()));

  private messageInput() {
    return {
      vehicle: this.vehicle(),
      details: this.details(),
      phone: this.phone(),
      serviceTitle: this.service()?.title ?? null,
      photos: this.sent()?.photos ?? this.photos().length,
      code: this.sent()?.code ?? null,
    };
  }

  readonly message = computed(() => quoteMessage(this.messageInput()));

  constructor() {
    this.title.setTitle('Cotizar un servicio | X AutoHub');

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
      this.serviceSlug.set(q.get('service') ?? '');
    });

    // Con un vehículo ya elegido y sin nada escrito, se ofrece como punto de partida.
    effect(() => {
      const picked = this.pickedVehicle();
      untracked(() => {
        if (picked && !this.vehicle().trim()) this.vehicle.set(picked);
      });
    });

    // Y el nombre y el teléfono de quien tiene sesión.
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        if (user?.phone && !this.phone()) this.phone.set(user.phone);
        if (user?.displayName && !this.name()) this.name.set(user.displayName);
      });
    });
  }

  pickVehicle(): void {
    this.picker.open();
  }

  onPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';

    const room = MAX_PHOTOS - this.photos().length;
    if (picked.length > room) this.toast.show(`Máximo ${MAX_PHOTOS} fotos.`, 'error');
    this.photos.update((all) => [...all, ...picked.slice(0, Math.max(0, room))]);
  }

  removePhoto(index: number): void {
    this.photos.update((all) => all.filter((_, i) => i !== index));
  }

  /** Guarda la solicitud (con las fotos) y muestra el código. WhatsApp se abre con un botón, después. */
  send(): void {
    this.submitted.set(true);
    if (this.isSending()) return;

    if (this.nameInvalid()) return void this.toast.show('Escribe tu nombre.', 'error');
    if (this.missingDetails()) return void this.toast.show('Cuéntanos qué le pasa a tu vehículo o qué necesitas.', 'error');
    if (this.phoneInvalid()) return void this.toast.show('Revisa el teléfono: tiene que ser un número dominicano.', 'error');

    const garage = this.vehicles.garage();
    const selected = this.vehicles.selected();
    const profileVehicleId = selected ? (garage.find((g) => g.makeId === selected.makeId && g.modelId === selected.modelId && g.year === selected.year)?.id ?? null) : null;

    this.isSending.set(true);
    this.quotes
      .create({
        name: this.name(),
        phone: this.phone(),
        description: this.details(),
        vehicleText: this.vehicle(),
        profileVehicleId,
        serviceId: this.service()?.id ?? null,
        photos: this.photos(),
        website: this.website(),
      })
      .subscribe({
        next: ({ code }) => {
          this.isSending.set(false);
          this.sent.set({ code, photos: this.photos().length });
        },
        error: (e: Error) => {
          this.isSending.set(false);
          this.toast.show(e.message || 'No pudimos guardar tu solicitud. Escríbenos por WhatsApp.', 'error');
        },
      });
  }

  /** Abre WhatsApp con el mensaje que lleva el código de la solicitud. */
  openWhatsApp(): void {
    window.open(quoteLink(this.messageInput()), '_blank', 'noopener,noreferrer');
  }
}
