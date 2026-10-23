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
import { ServiceCatalogService } from '../../../shared/services/service-catalog.service';
import { ToastService } from '../../../shared/services/toast.service';
import { VehiclePickerService } from '../../../shared/services/vehicle-picker.service';
import { VehicleService } from '../../../shared/services/vehicle.service';
import { isValidDrPhone } from '../../../shared/utils/phone';
import { quoteLink, quoteMessage } from '../../../shared/utils/quote-message';

/** Cuántas fotos se aceptan. No se suben a ningún lado: ver el comentario del componente. */
export const MAX_PHOTOS = 3;

/**
 * /servicios/cotizar — una herramienta para **redactar** el mensaje de WhatsApp de una
 * cotización.
 *
 * No guarda nada en la base: arma el texto con el vehículo, lo que pasa y el teléfono,
 * y abre `wa.me`. Las fotos tampoco se suben (no hay a dónde): si el cliente dice que
 * tiene, el formulario le explica que las mande por WhatsApp y el mensaje se lo
 * recuerda. Decirlo de frente es mejor que aceptar un archivo que nadie va a ver.
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
  private readonly title = inject(Title);
  private readonly destroyRef = inject(DestroyRef);

  readonly maxPhotos = MAX_PHOTOS;

  readonly services = toSignal(this.catalog.getServices(), { initialValue: [] as ServiceModel[] });

  /** El servicio pedido (`?service=slug`), o vacío para "otro". */
  readonly serviceSlug = signal('');
  readonly vehicle = signal('');
  readonly details = signal('');
  readonly phone = signal('');
  /** Cuántas fotos dijo que tiene. Los archivos no se guardan. */
  readonly photoCount = signal(0);
  readonly submitted = signal(false);

  /** El vehículo elegido en "Mi vehículo", si hay uno. */
  readonly pickedVehicle = this.vehicles.selectedLabel;

  readonly service = computed(() => this.services().find((s) => s.slug === this.serviceSlug()) ?? null);

  readonly phoneInvalid = computed(() => this.phone().trim() !== '' && !isValidDrPhone(this.phone()));
  readonly missingDetails = computed(() => !this.details().trim());

  readonly message = computed(() =>
    quoteMessage({
      vehicle: this.vehicle(),
      details: this.details(),
      phone: this.phone(),
      serviceTitle: this.service()?.title ?? null,
      photos: this.photoCount(),
    }),
  );

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

    // Y el teléfono de quien tiene sesión.
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        if (user?.phone && !this.phone()) this.phone.set(user.phone);
      });
    });
  }

  pickVehicle(): void {
    this.picker.open();
  }

  onPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const count = input.files?.length ?? 0;

    if (count > MAX_PHOTOS) {
      this.toast.show(`Máximo ${MAX_PHOTOS} fotos. Mándalas por WhatsApp.`, 'error');
    }

    this.photoCount.set(Math.min(count, MAX_PHOTOS));
    // Los archivos no se guardan: solo se cuenta cuántos son.
    input.value = '';
  }

  /** Abre WhatsApp con el mensaje armado. No guarda nada. */
  send(): void {
    this.submitted.set(true);

    if (this.missingDetails()) {
      this.toast.show('Cuéntanos qué le pasa a tu vehículo o qué necesitas.', 'error');
      return;
    }
    if (this.phoneInvalid()) {
      this.toast.show('Revisa el teléfono: tiene que ser un número dominicano.', 'error');
      return;
    }

    const url = quoteLink({
      vehicle: this.vehicle(),
      details: this.details(),
      phone: this.phone(),
      serviceTitle: this.service()?.title ?? null,
      photos: this.photoCount(),
    });

    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
