import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { StorageService } from './storage.service';

/**
 * `getPublicUrl()` es sincrónico: por el proxy `db` nunca responde y la subida se quedaba colgada
 * (todas las fotos de /publicar, avatares y servicios, desde la 2.29.0). Esta prueba usa un cliente
 * real de mentira que **solo** expone `client()`; si el servicio vuelve a usar `db`, no termina.
 */
describe('StorageService.uploadOne (modo real)', () => {
  function montar(uploadError: unknown = null) {
    const upload = vi.fn(() => Promise.resolve(uploadError ? { data: null, error: uploadError } : { data: { path: 'u/foto.jpg' }, error: null }));
    const client = {
      storage: {
        from: (bucket: string) => ({
          upload,
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
        }),
      },
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          // `db` lanza si se toca: así el test falla fuerte si alguien vuelve a usar el proxy.
          useValue: {
            shouldUseMockData: () => false,
            client: () => Promise.resolve(client),
            get db() {
              throw new Error('no se debe usar db para subir archivos');
            },
          },
        },
      ],
    });
    return { service: TestBed.inject(StorageService), upload };
  }

  it('sube por el cliente real y devuelve la URL pública', async () => {
    const { service, upload } = montar();
    const file = new File(['x'], 'Foto Grande.jpg', { type: 'image/jpeg' });

    const [media] = await firstValueFrom(service.uploadSocialMedia([file], 'u1'));

    expect(upload).toHaveBeenCalledTimes(1);
    expect(media).toEqual({ type: 'image', url: 'https://x.supabase.co/storage/v1/object/public/social-media/u/foto.jpg' });
  });

  it('un error de Storage se traduce a un mensaje, no se cuelga', async () => {
    const { service } = montar({ message: 'denied' });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });

    await expect(firstValueFrom(service.uploadListingImages([file], 'u1'))).rejects.toThrow(/No pudimos subir/);
  });
});
