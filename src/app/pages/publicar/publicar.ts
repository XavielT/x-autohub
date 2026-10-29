import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { StorageService } from '../../../shared/services/storage.service';
import { AuthService } from '../../../shared/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { HubMarketCategory, HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { ImageUploader } from '../../../shared/components/image-uploader/image-uploader';
import { LocationSelect } from '../../../shared/ui/location-select/location-select';
import { SearchableSelect } from '../../../shared/ui/searchable-select/searchable-select';
import {
  RequiredField,
  focusFirstInvalid,
  missingFieldsMessage,
} from '../../../shared/forms/required-fields';
import { drPhoneValidator, normalizeDrPhone } from '../../../shared/utils/phone';

@Component({
  selector: 'app-publicar',
  imports: [ReactiveFormsModule, LocationSelect, ImageUploader, SearchableSelect],
  templateUrl: './publicar.html',
  styleUrl: './publicar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Publicar {
  private readonly fb = inject(FormBuilder);
  private readonly hubMarketService = inject(HubMarketService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Las fotos ya comprimidas, en el orden en que se suben (la primera es la portada). */
  readonly selectedFiles = signal<File[]>([]);

  readonly isSubmitting = signal(false);

  /**
   * La caja de imágenes no es un control, así que no tiene `touched` propio: sin
   * esto mostraría el error en rojo desde que se abre la página, antes de que el
   * usuario intente nada.
   */
  readonly imagesTouched = signal(false);

  readonly categories = [
    { value: 'vehiculos', label: 'Vehículos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' },
  ];

  readonly publishForm = this.fb.nonNullable.group({
    category: ['', Validators.required],
    title: ['', Validators.required],
    description: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(1)]],
    location: ['', Validators.required],
    // Opcional: sin él la publicación sale igual, solo que sin botón de
    // WhatsApp. Por eso no entra en `requiredFields()`.
    contactPhone: ['', drPhoneValidator],
    year: [null as number | null],
    mileage: [null as number | null],
    hp: [null as number | null],
    zeroTo100: [null as number | null],
    topSpeed: [null as number | null],
    condition: [''],
  });

  constructor() {
    // Año y kilometraje solo son obligatorios cuando la ficha de vehículo está a
    // la vista. Antes se rellenaban en silencio al guardar (`?? new Date()...`,
    // `?? 0`), así que una publicación podía salir con el año equivocado sin que
    // nadie lo notara. Ahora se piden, y al cambiar de categoría se limpian para
    // no bloquear un envío por un campo que ya no se muestra.
    this.publishForm.controls.category.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.syncVehicleValidators());

    // El teléfono del perfil, como punto de partida. Va en un `effect` y no en
    // el valor inicial del control porque con Supabase la sesión se restaura de
    // forma asíncrona: al construirse el componente `auth.user()` todavía puede
    // ser `null` aunque haya sesión (la misma razón por la que los guards
    // esperan `whenReady()`). Con mocks llega en la primera pasada.
    //
    // `pristine` es lo que impide que sobreescriba lo que el usuario ya escribió
    // si el perfil termina de cargar tarde.
    effect(() => {
      const phone = this.auth.user()?.phone;
      const control = this.publishForm.controls.contactPhone;
      if (phone && control.pristine && !control.value) {
        control.setValue(phone);
      }
    });
  }

  private syncVehicleValidators(): void {
    const { year, mileage } = this.publishForm.controls;

    for (const control of [year, mileage]) {
      if (this.isVehicle) {
        control.addValidators(Validators.required);
      } else {
        control.removeValidators(Validators.required);
        control.setValue(null);
      }
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  get isVehicle(): boolean {
    return this.publishForm.controls.category.value === 'vehiculos';
  }

  get isPartOrAccessory(): boolean {
    return ['piezas', 'accesorios'].includes(this.publishForm.controls.category.value);
  }

  // --- Realimentación de campos obligatorios -------------------------------

  /**
   * Los campos obligatorios en el orden en que aparecen en la pantalla.
   *
   * Es la única fuente de la que salen el aviso que los nombra, el foco al
   * primero que falta y el orden de ambos. `images` va primero porque la caja de
   * imágenes está arriba del formulario.
   */
  requiredFields(): RequiredField[] {
    const c = this.publishForm.controls;
    const fields: RequiredField[] = [
      { key: 'images', label: 'Imágenes', invalid: this.selectedFiles().length === 0 },
      { key: 'category', label: 'Categoría', invalid: c.category.invalid },
      { key: 'title', label: 'Título', invalid: c.title.invalid },
      { key: 'description', label: 'Descripción', invalid: c.description.invalid },
      { key: 'price', label: 'Precio', invalid: c.price.invalid },
      { key: 'location', label: 'Ubicación', invalid: c.location.invalid },
    ];

    if (this.isVehicle) {
      fields.push(
        { key: 'year', label: 'Año', invalid: c.year.invalid },
        { key: 'mileage', label: 'Kilometraje', invalid: c.mileage.invalid },
      );
    }

    return fields;
  }

  /** true cuando hay que pintar el error de un control ya tocado. */
  showError(field: keyof typeof this.publishForm.controls): boolean {
    const control = this.publishForm.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  /** La caja de imágenes en rojo: solo tras el primer intento de envío. */
  get showImagesError(): boolean {
    return this.imagesTouched() && this.selectedFiles().length === 0;
  }

  setCategory(value: string | number | null): void {
    const control = this.publishForm.controls.category;
    control.setValue(String(value ?? ''));
    control.markAsDirty();
    control.markAsTouched();
  }

  formatPriceDisplay(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/\D/g, '');
    const numeric = Number(raw);

    this.publishForm.controls.price.setValue(numeric, { emitEvent: false });
    input.value = numeric > 0 ? numeric.toLocaleString('es-DO') : '';
  }

  onSubmit(): void {
    // Se marca todo tocado antes de mirar qué falta, para que los mensajes por
    // campo aparezcan a la vez que el aviso que los nombra.
    this.publishForm.markAllAsTouched();
    this.imagesTouched.set(true);

    const missing = missingFieldsMessage(this.requiredFields());
    if (missing) {
      this.toast.show(missing, 'error');
      focusFirstInvalid(this.host.nativeElement, this.requiredFields());
      return;
    }

    // El teléfono no falta —es opcional— pero puede estar mal escrito, y eso no
    // lo cubre `requiredFields()`. Sin esta comprobación el número inválido se
    // normalizaría a `undefined` en silencio y la publicación saldría sin botón
    // de WhatsApp, que es justo lo que el usuario quiso poner.
    if (this.publishForm.controls.contactPhone.invalid) {
      this.toast.show('Escribe un teléfono válido, ej. 809 555 0134.', 'error');
      focusFirstInvalid(this.host.nativeElement, [
        { key: 'contactPhone', label: 'Teléfono de contacto', invalid: true },
      ]);
      return;
    }

    const user = this.auth.user();
    if (!user) {
      // El authGuard ya protege esta ruta; esto cubre que la sesión expire
      // mientras el formulario estaba abierto.
      this.toast.show('Tu sesión expiró. Vuelve a iniciar sesión.', 'error');
      void this.router.navigate(['/login'], { queryParams: { returnUrl: '/publicar' } });
      return;
    }

    this.isSubmitting.set(true);
    const form = this.publishForm.getRawValue();

    // Primero las imágenes: sin URLs no tiene sentido crear la publicación.
    this.storage
      .uploadListingImages(this.selectedFiles(), user.id)
      .pipe(
        switchMap((imageUrls) => {
          const item: Omit<HubMarketItemModel, 'id'> = {
            category: form.category as HubMarketCategory,
            title: form.title,
            description: form.description,
            price: form.price,
            images: imageUrls,
            location: form.location,
            sellerName: user.displayName,
            // Se guarda normalizado (solo dígitos): es lo que exige el check de
            // la migración 0010 y lo que `buildWaLink` espera recibir.
            contactPhone: normalizeDrPhone(form.contactPhone) ?? undefined,
            condition: form.condition === 'new' || form.condition === 'used' ? form.condition : undefined,
            ...(form.category === 'vehiculos' && {
              vehicleSpecs: {
                year: form.year ?? new Date().getFullYear(),
                mileage: form.mileage ?? 0,
                hp: form.hp ?? undefined,
                zeroTo100: form.zeroTo100 ?? undefined,
                topSpeed: form.topSpeed ?? undefined,
              },
            }),
          };

          return this.hubMarketService.publish(
            item,
            user.id,
            user.displayName,
            this.auth.canModerate(),
          );
        }),
      )
      .subscribe({
        next: (created) => {
          this.isSubmitting.set(false);
          // Quien modera publica directo; al resto hay que decirle que su
          // artículo todavía no se ve, o va a buscarlo en Hub Market y va a
          // pensar que se perdió.
          const canModerate = this.auth.canModerate();
          this.toast.show(
            canModerate
              ? 'Publicada. Como moderador, tu publicación no necesita aprobación y ya está en Hub Market.'
              : 'Recibimos tu publicación. La revisa un moderador y te aparecerá como "Pendiente" en tu perfil hasta que se apruebe.',
          );

          // A quien modera se le lleva a su publicación, que ya está visible. Al
          // resto, a /perfil: es la única pantalla donde puede ver la suya
          // mientras espera revisión, con su distintivo "Pendiente". Mandarlo a
          // Hub Market —donde todavía no sale— parecía que se había perdido.
          void this.router.navigate([
            canModerate ? (created.detailRoute ?? '/hub-market') : '/perfil',
          ]);
        },
        error: (error: Error) => {
          this.isSubmitting.set(false);
          this.toast.show(error.message || 'No pudimos publicar tu artículo.', 'error');
        },
      });
  }
}
