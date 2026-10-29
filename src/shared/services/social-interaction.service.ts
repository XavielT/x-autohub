import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, from, map, of, throwError } from 'rxjs';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { toSocialComment } from '../../core/supabase/mappers';
import { translateDbError, unwrap } from '../../core/supabase/supabase-error';
import { SocialCommentModel } from '../models/social-hub.model';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

/** El select de un comentario: el nombre y la foto salen del perfil (una sola clave foránea a `profiles`). */
const COMMENT_SELECT = 'id, post_id, author_id, text, created_at, profiles(display_name, avatar_url)';

/**
 * Me gusta y comentarios del feed de la comunidad (migración 0045).
 *
 * Sin sesión se puede leer pero no dar me gusta ni comentar. En modo simulado todo vive en memoria.
 * El número que muestra cada publicación sale de la base (`social_posts.likes`, que mueve un
 * trigger); aquí solo se sabe **cuáles** me gusta dio esta persona, para pintar el corazón y
 * ajustar el número al instante sin volver a pedir la lista.
 */
@Injectable({ providedIn: 'root' })
export class SocialInteractionService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly _liked = signal<ReadonlySet<number>>(new Set());
  /** Las publicaciones a las que esta persona les dio me gusta. */
  readonly liked = this._liked.asReadonly();

  /**
   * Lo que ya estaba dado al cargar: el `likes` que trae cada publicación ya lo incluye, así que
   * el número que se pinta es `likes + (dado ahora) − (dado al cargar)`.
   */
  private baseline: ReadonlySet<number> = new Set();
  private readonly pending = new Set<number>();
  private mockComments: SocialCommentModel[] = [];
  private mockId = 0;

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => this.loadLiked(user?.id ?? null));
    });
  }

  isLiked(postId: number): boolean {
    return this._liked().has(postId);
  }

  /** El total que se muestra de una publicación, con lo que esta persona haya cambiado desde que cargó. */
  likeCount(postId: number, serverLikes: number): number {
    return Math.max(0, serverLikes + (this.isLiked(postId) ? 1 : 0) - (this.baseline.has(postId) ? 1 : 0));
  }

  /** Da o quita el me gusta. Devuelve si quedó dado. Si la base lo rechaza, se deshace. */
  toggleLike(postId: number): Observable<boolean> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      this.toast.show('Inicia sesión para dar me gusta.', 'error');
      return of(false);
    }
    if (this.pending.has(postId)) return of(this.isLiked(postId));

    const adding = !this.isLiked(postId);
    this.setLocal(postId, adding);
    if (this.supabase.shouldUseMockData()) return of(adding);

    this.pending.add(postId);
    const query = adding
      ? this.supabase.db.from('social_post_likes').insert({ post_id: postId, user_id: userId })
      : this.supabase.db.from('social_post_likes').delete().eq('post_id', postId).eq('user_id', userId);

    return new Observable<boolean>((subscriber) => {
      const undo = (message: string) => {
        this.pending.delete(postId);
        this.setLocal(postId, !adding);
        this.toast.show(message, 'error');
        subscriber.next(!adding);
        subscriber.complete();
      };
      Promise.resolve(query).then(
        (res) => {
          if (res.error) return undo(translateDbError(res.error));
          this.pending.delete(postId);
          subscriber.next(adding);
          subscriber.complete();
        },
        () => undo('No pudimos guardar tu me gusta. Revisa tu conexión.'),
      );
    });
  }

  getComments(postId: number): Observable<SocialCommentModel[]> {
    if (this.supabase.shouldUseMockData()) {
      return of(this.mockComments.filter((c) => c.postId === postId));
    }

    return from(
      this.supabase.db
        .from('social_post_comments')
        .select(COMMENT_SELECT)
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(100),
    ).pipe(map((res) => unwrap(res).map(toSocialComment)));
  }

  addComment(postId: number, text: string): Observable<SocialCommentModel> {
    const user = this.auth.user();
    const clean = text.trim();
    if (!user) return throwError(() => new Error('Inicia sesión para comentar.'));
    if (clean.length < 1 || clean.length > 500) {
      return throwError(() => new Error('El comentario debe tener entre 1 y 500 caracteres.'));
    }

    if (this.supabase.shouldUseMockData()) {
      const created: SocialCommentModel = {
        id: ++this.mockId,
        postId,
        authorId: user.id,
        authorName: user.displayName,
        authorAvatarUrl: user.avatarUrl,
        text: clean,
        createdAt: new Date().toISOString(),
      };
      this.mockComments = [...this.mockComments, created];
      return of(created);
    }

    return from(
      this.supabase.db
        .from('social_post_comments')
        .insert({ post_id: postId, author_id: user.id, text: clean })
        .select(COMMENT_SELECT)
        .single(),
    ).pipe(map((res) => toSocialComment(unwrap(res))));
  }

  deleteComment(comment: SocialCommentModel): Observable<void> {
    if (this.supabase.shouldUseMockData()) {
      this.mockComments = this.mockComments.filter((c) => c.id !== comment.id);
      return of(undefined);
    }

    return from(this.supabase.db.from('social_post_comments').delete().eq('id', comment.id)).pipe(
      map((res) => {
        if (res.error) throw new Error('No pudimos borrar el comentario.');
      }),
    );
  }

  private setLocal(postId: number, liked: boolean): void {
    this._liked.update((current) => {
      const next = new Set(current);
      if (liked) next.add(postId);
      else next.delete(postId);
      return next;
    });
  }

  private loadLiked(userId: string | null): void {
    this._liked.set(new Set());
    this.baseline = new Set();
    if (!userId || this.supabase.shouldUseMockData()) return;

    this.supabase.db
      .from('social_post_likes')
      .select('post_id')
      .then((res) => {
        // La sesión pudo cambiar mientras la consulta volvía.
        if (this.auth.user()?.id !== userId || res.error) return;
        const ids = new Set((res.data ?? []).map((row) => row.post_id));
        this.baseline = ids;
        this._liked.set(new Set(ids));
      });
  }
}
