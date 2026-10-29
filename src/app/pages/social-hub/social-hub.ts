import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SocialHubService } from '../../../shared/services/social-hub.service';
import { SeoService } from '../../../shared/services/seo.service';
import { AuthService } from '../../../shared/services/auth.service';
import { SocialHubTab, SocialPostModel } from '../../../shared/models/social-hub.model';
import { HomeWelcome } from '../../components/home-welcome/home-welcome';
import { PostComposer } from '../../../shared/components/post-composer/post-composer';
import { Skeleton } from '../../../shared/ui/skeleton/skeleton';
import { SocialPost } from '../../../shared/components/social-post/social-post';
import { ClubChannel } from '../../../shared/components/club-channel/club-channel';

interface TabOption {
  value: SocialHubTab;
  label: string;
}

@Component({
  selector: 'app-social-hub',
  imports: [DatePipe, DecimalPipe, RouterLink, HomeWelcome, ClubChannel, SocialPost, PostComposer, Skeleton],
  templateUrl: './social-hub.html',
  styleUrl: './social-hub.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialHub {
  private readonly socialHub = inject(SocialHubService);
  private readonly auth = inject(AuthService);

  private readonly seo = inject(SeoService);

  readonly isLoggedIn = this.auth.isLoggedIn;

  constructor() {
    this.seo.set({
      title: 'Comunidad — Clubes y eventos | X AutoHub',
      description:
        'La comunidad automotriz de X AutoHub: publicaciones, clubes y eventos de carros en República Dominicana.',
      path: '/social-hub',
    });
    inject(DestroyRef).onDestroy(() => this.seo.reset());
  }

  readonly activeTab = signal<SocialHubTab>('feed');

  readonly tabs: readonly TabOption[] = [
    { value: 'feed', label: 'Feed' },
    { value: 'clubes', label: 'Clubes' },
    { value: 'eventos', label: 'Eventos' },
  ];

  readonly posts = toSignal(this.socialHub.getPosts());
  /** Lo que esta persona publicó desde que abrió la página: sale arriba sin volver a pedir el feed. */
  private readonly justPublished = signal<SocialPostModel[]>([]);
  readonly feed = computed(() => [...this.justPublished(), ...(this.posts() ?? [])]);
  /** El feed todavía no llegó (y nada propio que enseñar). */
  readonly isLoadingFeed = computed(() => this.posts() === undefined && this.justPublished().length === 0);
  readonly clubs = toSignal(this.socialHub.getClubs(), { initialValue: [] });
  readonly events = toSignal(this.socialHub.getEvents(), { initialValue: [] });

  /** Las pestañas: es donde aterrizan los botones del hero. */
  private readonly tabsAnchor = viewChild<ElementRef<HTMLElement>>('tabsAnchor');

  onPublished(post: SocialPostModel): void {
    this.justPublished.update((all) => [post, ...all]);
  }

  selectTab(tab: SocialHubTab): void {
    this.activeTab.set(tab);
  }

  /**
   * Los botones del hero ("Ver clubes", "Ver eventos"): cambian a esa pestaña y
   * bajan hasta ella. Son anclas dentro de la página, no rutas.
   */
  showTab(tab: SocialHubTab): void {
    this.selectTab(tab);
    this.tabsAnchor()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
