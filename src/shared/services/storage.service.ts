import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';

/** Límites que espejean los del bucket (ver 0003_storage.sql). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
      return 'Solo se aceptan imagenes JPG, PNG o WebP.';
    }
    if (file.size > MAX_FILE_BYTES) {
      return 'Cada imagen debe pesar menos de 5 MB.';
    }
    return null;
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
    kind: 'piezas' | 'vehiculos' | 'noticias',
  ): Observable<string[]> {
    if (files.length === 0) return of([]);

    if (this.supabase.shouldUseMockData()) {
      return forkJoin(files.map((file) => this.toDataUrl(file)));
    }

    return forkJoin(files.map((file) => this.uploadOne(file, kind, 'inventory')));
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
        if (res.error) console.error('[storage] limpieza de imagenes', res.error);
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
    bucket: 'listings' | 'avatars' | 'inventory',
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
          throw new Error('No pudimos subir una de las imagenes. Intenta de nuevo.');
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
