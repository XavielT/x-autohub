import { Injectable, inject } from '@angular/core';
import { Observable, from, map, of } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toSocialClub, toSocialEvent, toSocialPost } from '../../core/supabase/mappers';
import { unwrap } from '../../core/supabase/supabase-error';
import { SocialClubModel, SocialEventModel, SocialPostModel } from '../models/social-hub.model';
import { SOCIAL_CLUBS_MOCK, SOCIAL_EVENTS_MOCK, SOCIAL_POSTS_MOCK } from '../data/social-hub.mock';

/** El nombre y la insignia salen del perfil cuando la publicación tiene autor real. */
const POST_SELECT = '*, profiles(display_name, is_verified)';

@Injectable({ providedIn: 'root' })
export class SocialHubService {
  private readonly supabase = inject(SupabaseService);

  getPosts(): Observable<SocialPostModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        [...SOCIAL_POSTS_MOCK].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    }

    return from(
      this.supabase.db
        .from('social_posts')
        .select(POST_SELECT)
        .order('created_at', { ascending: false })
        .limit(50),
    ).pipe(map((res) => unwrap(res).map(toSocialPost)));
  }

  getClubs(): Observable<SocialClubModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        [...SOCIAL_CLUBS_MOCK].sort(
          (a, b) =>
            Number(b.isOfficial ?? false) - Number(a.isOfficial ?? false) || b.members - a.members,
        ),
      );
    }

    return from(
      this.supabase.db
        .from('social_clubs')
        .select('*')
        .order('is_official', { ascending: false })
        .order('members', { ascending: false }),
    ).pipe(map((res) => unwrap(res).map(toSocialClub)));
  }

  getEvents(): Observable<SocialEventModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(
        [...SOCIAL_EVENTS_MOCK].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
      );
    }

    return from(
      this.supabase.db.from('social_events').select('*').order('event_date', { ascending: true }),
    ).pipe(map((res) => unwrap(res).map(toSocialEvent)));
  }

  /**
   * Publica en el feed. `authorId` debe ser el usuario en sesión: la política
   * RLS rechaza cualquier otra cosa.
   */
  publishPost(
    post: Pick<SocialPostModel, 'text' | 'tags'> &
      Partial<Pick<SocialPostModel, 'imageUrl' | 'authorClub'>>,
    authorId: string,
    authorName: string,
  ): Observable<SocialPostModel> {
    if (this.supabase.shouldUseMockData()) {
      const created: SocialPostModel = {
        id: Math.max(0, ...SOCIAL_POSTS_MOCK.map((p) => p.id)) + 1,
        authorName,
        authorClub: post.authorClub,
        createdAt: new Date().toISOString(),
        text: post.text,
        imageUrl: post.imageUrl,
        tags: post.tags,
        likes: 0,
        comments: 0,
      };
      SOCIAL_POSTS_MOCK.unshift(created);
      return of(created);
    }

    return from(
      this.supabase.db
        .from('social_posts')
        .insert({
          author_id: authorId,
          author_name: authorName,
          author_club: post.authorClub ?? null,
          text: post.text,
          image_url: post.imageUrl ?? null,
          tags: post.tags,
        })
        .select(POST_SELECT)
        .single(),
    ).pipe(map((res) => toSocialPost(unwrap(res))));
  }
}
