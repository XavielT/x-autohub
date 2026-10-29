import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { SocialHubService } from './social-hub.service';

/**
 * Desde la 0045 `social_post_likes` es una segunda vía entre `social_posts` y `profiles`; un embed
 * `profiles(...)` sin nombrar la clave responde PGRST201 y el feed queda en "Cargando…". Esto no lo
 * ve ningún modo simulado: la prueba mira que el select nombre la clave.
 */
describe('SocialHubService.getPosts (modo real)', () => {
  it('pide el autor con la clave foránea nombrada', async () => {
    const select = vi.fn();
    const chain = {
      select: (columns: string) => {
        select(columns);
        return chain;
      },
      order: () => chain,
      limit: () => Promise.resolve({ data: [], error: null }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: { shouldUseMockData: () => false, db: { from: () => chain } } },
      ],
    });

    await firstValueFrom(TestBed.inject(SocialHubService).getPosts());

    expect(select).toHaveBeenCalledWith(expect.stringContaining('profiles!social_posts_author_id_fkey('));
  });
});
