import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { SocialHubService } from '../../../shared/services/social-hub.service';
import { AuthService } from '../../../shared/services/auth.service';
import { SocialHubTab } from '../../../shared/models/social-hub.model';
import { HomeWelcome } from '../../components/home-welcome/home-welcome';
import { ClubChannel } from '../../../shared/components/club-channel/club-channel';

interface TabOption {
  value: SocialHubTab;
  label: string;
}

@Component({
  selector: 'app-social-hub',
  imports: [DatePipe, DecimalPipe, RouterLink, HomeWelcome, ClubChannel],
  templateUrl: './social-hub.html',
  styleUrl: './social-hub.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialHub {
  private readonly socialHub = inject(SocialHubService);
  private readonly auth = inject(AuthService);

  readonly isLoggedIn = this.auth.isLoggedIn;

  readonly activeTab = signal<SocialHubTab>('feed');

  readonly tabs: readonly TabOption[] = [
    { value: 'feed', label: 'Feed' },
    { value: 'clubes', label: 'Clubes' },
    { value: 'eventos', label: 'Eventos' },
  ];

  readonly posts = toSignal(this.socialHub.getPosts(), { initialValue: [] });
  readonly clubs = toSignal(this.socialHub.getClubs(), { initialValue: [] });
  readonly events = toSignal(this.socialHub.getEvents(), { initialValue: [] });

  /** Las pestañas: es donde aterrizan los botones del hero. */
  private readonly tabsAnchor = viewChild<ElementRef<HTMLElement>>('tabsAnchor');

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

  /** "hace 3 dias" en vez de una fecha absoluta, que lee mejor en un feed. */
  relativeTime(isoDate: string): string {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const minutes = Math.floor(diffMs / 60_000);

    if (minutes < 1) return 'ahora mismo';
    if (minutes < 60) return `hace ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `hace ${days} ${days === 1 ? 'dia' : 'dias'}`;

    const months = Math.floor(days / 30);
    return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  }
}
