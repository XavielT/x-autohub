import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { PROOF_MAX_BYTES } from '../models/order.model';
import { SocialMedia } from '../models/social-hub.model';

/** Límites que espejean los del bucket (ver 0003_storage.sql). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Lo que acepta el bucket `payment-proofs` (migración 0018): foto o PDF, hasta 10 MB. */
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/**
 * Subida de imágenes a Supabase Storage.
 *
 * **En `listings` y `avatars` la ruta empieza con el uid del dueño**
 * (`<uid>/<archivo>`), porque las políticas de esos buckets comparan esa primera
 * carpeta contra `auth.uid()`. Si cambias ese formato, se rompe su seguridad.
 *
 * `inventory` funciona distinto: el permiso lo decide `is_admin()`, no la ruta,
 * así que ahí la primera carpeta es el tipo de contenido. Ver migración 0008.
 *
 * En modo mock devuelve data URLs, que es lo que el formulario de publicar ya
 * usaba: así la vista previa y el flujo funcionan sin backend.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly supabase = inject(SupabaseService);

  /** Valida un archivo antes de subirlo. Devuelve el error o null. */
  validate(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Solo se aceptan imágenes JPG, PNG o WebP.';
    }
    if (file.size > MAX_FILE_BYTES) {
      return 'Cada imagen debe pesar menos de 5 MB.';
    }
    return null;
  }

  /** Valida un comprobante de pago antes de subirlo. Devuelve el error o null. */
  validateProof(file: File): string | null {
    if (!PROOF_TYPES.includes(file.type)) {
      return 'El comprobante tiene que ser una foto (JPG, PNG, WebP) o un PDF.';
    }
    if (file.size > PROOF_MAX_BYTES) {
      return 'El comprobante debe pesar menos de 10 MB.';
    }
    return null;
  }

  /**
   * Sube el comprobante de un pedido y devuelve la **ruta** dentro del bucket
   * (`<order_id>/<archivo>`), no una URL: `payment-proofs` es privado y no tiene
   * URL pública. La primera carpeta es el id del pedido, y de eso depende la
   * política del bucket (`order_accepts_proof`).
   *
   * No guarda nada en el pedido: eso lo hace `OrderService` con
   * `attach_payment_proof()`, que comprueba que el archivo esté de verdad.
   */
  uploadPaymentProof(file: File, orderId: string): Observable<string> {
    const path = `${orderId}/${this.uniqueName(file.name)}`;

    if (this.supabase.shouldUseMockData()) {
      return of(path);
    }

    return from(
      this.supabase.db.storage.from('payment-proofs').upload(path, file, {
        contentType: file.type,
        upsert: false,
      }),
    ).pipe(
      map((res) => {
        if (res.error) {
          console.error('[storage] comprobante', res.error);
          throw new Error('No pudimos subir el comprobante. Intenta de nuevo.');
        }
        return res.data.path;
      }),
    );
  }

  /**
   * Un enlace de diez minutos para ver un comprobante. Solo lo consigue un admin
   * (o el dueño del pedido): la política de lectura del bucket lo decide, no esta
   * función.
   */
  getPaymentProofUrl(path: string): Observable<string> {
    if (this.supabase.shouldUseMockData()) {
      return of('assets/imgs/hub-parts/disco-brembo-gtr.jpg');
    }

    return from(this.supabase.db.storage.from('payment-proofs').createSignedUrl(path, 600)).pipe(
      map((res) => {
        if (res.error || !res.data) {
          console.error('[storage] enlace del comprobante', res.error);
          throw new Error('No pudimos abrir el comprobante.');
        }
        return res.data.signedUrl;
      }),
    );
  }

  /**
   * Sube las imágenes de una publicación y devuelve sus URLs públicas, en el
   * mismo orden en que llegaron.
   */
  uploadListingImages(files: File[], userId: string): Observable<string[]> {
    if (files.length === 0) return of([]);

    if (this.supabase.shouldUseMockData()) {
      return forkJoin(files.map((file) => this.toDataUrl(file)));
    }

    return forkJoin(files.map((file) => this.uploadOne(file, userId, 'listings')));
  }

  /**
   * Sube las fotos y videos de una publicación del feed (bucket `social-media`, 0045) y devuelve
   * su tipo y URL pública, en el orden en que llegaron. La primera carpeta es el uid.
   */
  uploadSocialMedia(files: File[], userId: string): Observable<SocialMedia[]> {
    if (files.length === 0) return of([]);
    const typeOf = (file: File): SocialMedia['type'] => (file.type.startsWith('video/') ? 'video' : 'image');

    if (this.supabase.shouldUseMockData()) {
      return forkJoin(files.map((file) => this.toDataUrl(file).pipe(map((url) => ({ type: typeOf(file), url })))));
    }

    return forkJoin(
      files.map((file) => this.uploadOne(file, userId, 'social-media').pipe(map((url) => ({ type: typeOf(file), url })))),
    );
  }

  /** Sube el avatar del usuario y devuelve su URL pública. */
  uploadAvatar(file: File, userId: string): Observable<string> {
    if (this.supabase.shouldUseMockData()) {
      return this.toDataUrl(file);
    }
    return this.uploadOne(file, userId, 'avatars');
  }

  /**
   * Sube imágenes del inventario propio (catálogo, Auto Hub, noticias).
   *
   * Va al bucket `inventory`, no a `listings`: ese es para los clasificados de la
   * comunidad y su política exige que la ruta empiece por el uid de quien sube.
   * El inventario oficial no pertenece a una persona, así que aquí la carpeta es
   * el tipo de contenido y el permiso lo decide `is_admin()`. Ver migración 0008.
   */
  uploadInventoryImages(
    files: File[],
    kind: 'piezas' | 'vehiculos' | 'noticias' | 'servicios',
  ): Observable<string[]> {
    if (files.length === 0) return of([]);

    if (this.supabase.shouldUseMockData()) {
      return forkJoin(files.map((file) => this.toDataUrl(file)));
    }

    return forkJoin(files.map((file) => this.uploadOne(file, kind, 'inventory')));
  }

  /**
   * Sube una foto de un trabajo realizado (antes o después) al bucket público
   * `service-works`, que solo un admin puede escribir (migración 0019). Devuelve su URL
   * pública.
   */
  uploadServiceWorkImage(file: File): Observable<string> {
    if (this.supabase.shouldUseMockData()) return this.toDataUrl(file);
    return this.uploadOne(file, 'trabajos', 'service-works');
  }

  /**
   * Borra imágenes del bucket `inventory` a partir de sus URLs públicas.
   *
   * Se usa al editar un artículo: si se le quita una foto, el objeto quedaría en
   * Storage para siempre sin que nada lo referencie, ocupando espacio que nadie
   * puede encontrar ni liberar desde la interfaz.
   *
   * **Ignora cualquier URL que no sea de este bucket.** Las filas sembradas
   * apuntan a `assets/imgs/...`, que son archivos del repo: intentar borrarlos
   * como si fueran objetos de Storage no haría nada, pero pedirlo sería un error
   * de razonamiento que conviene cortar aquí.
   *
   * Un fallo al borrar no interrumpe nada: el artículo ya se guardó bien y una
   * imagen huérfana es un problema de limpieza, no de datos.
   */
  removeInventoryImages(urls: string[]): Observable<void> {
    const paths = urls
      .map((url) => this.inventoryPath(url))
      .filter((path): path is string => path !== null);

    if (paths.length === 0 || this.supabase.shouldUseMockData()) {
      return of(undefined);
    }

    return from(this.supabase.db.storage.from('inventory').remove(paths)).pipe(
      map((res) => {
        if (res.error) console.error('[storage] limpieza de imágenes', res.error);
      }),
    );
  }

  /** Ruta dentro del bucket `inventory`, o null si la URL no es de ahí. */
  private inventoryPath(url: string): string | null {
    const marker = '/storage/v1/object/public/inventory/';
    const at = url.indexOf(marker);
    return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
  }

  /**
   * @param folder Primera carpeta de la ruta. En `listings` y `avatars` **tiene
   *   que ser el uid**, porque las políticas lo comparan contra `auth.uid()`; en
   *   `inventory` es el tipo de contenido.
   */
  private uploadOne(
    file: File,
    folder: string,
    bucket: 'listings' | 'avatars' | 'inventory' | 'service-works' | 'social-media',
  ): Observable<string> {
    const path = `${folder}/${this.uniqueName(file.name)}`;

    return from(
      this.supabase.db.storage.from(bucket).upload(path, file, {
        cacheControl: '31536000',
        upsert: false,
      }),
    ).pipe(
      map((res) => {
        if (res.error) {
          console.error('[storage]', res.error);
          throw new Error('No pudimos subir uno de los archivos. Intenta de nuevo.');
        }
        return this.supabase.db.storage.from(bucket).getPublicUrl(res.data.path).data.publicUrl;
      }),
    );
  }

  /**
   * Nombre único y seguro para la URL: sin acentos, espacios ni caracteres
   * raros, y con marca de tiempo para evitar colisiones.
   */
  private uniqueName(originalName: string): string {
    const dot = originalName.lastIndexOf('.');
    const ext = (dot >= 0 ? originalName.slice(dot + 1) : 'jpg').toLowerCase();
    const base = (dot >= 0 ? originalName.slice(0, dot) : originalName)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // marcas de acento ya separadas por NFD
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40);

    const suffix = Math.random().toString(36).slice(2, 8);
    return `${Date.now()}-${base || 'imagen'}-${suffix}.${ext}`;
  }

  private toDataUrl(file: File): Observable<string> {
    return new Observable<string>((subscriber) => {
      const reader = new FileReader();
      reader.onload = () => {
        subscriber.next(reader.result as string);
        subscriber.complete();
      };
      reader.onerror = () => subscriber.error(new Error('No pudimos leer la imagen.'));
      reader.readAsDataURL(file);
    });
  }
}
