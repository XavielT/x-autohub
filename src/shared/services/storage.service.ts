import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';

/** Límites que espejean los del bucket (ver 0003_storage.sql). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Subida de imágenes a Supabase Storage.
 *
 * La ruta siempre empieza con el uid del dueño (`<uid>/<archivo>`) porque las
 * políticas del bucket comparan esa primera carpeta contra `auth.uid()`. Si
 * cambias el formato de la ruta, se rompe la seguridad del bucket.
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

  private uploadOne(file: File, userId: string, bucket: 'listings' | 'avatars'): Observable<string> {
    const path = `${userId}/${this.uniqueName(file.name)}`;

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
