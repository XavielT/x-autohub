import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HomeWelcome } from '../../components/home-welcome/home-welcome';
import { PageCounterOverview } from '../../components/page-counter-overview/page-counter-overview';
import { RouterModule } from '@angular/router';
import { HomeFeaturedVehicles } from '../../components/home-featured-vehicles/home-featured-vehicles';
import { HomeFeaturedCatalog } from '../../components/home-featured-catalog/home-featured-catalog';
import { HomeNews } from '../../components/home-news/home-news';
import { ClubChannel } from '../../../shared/components/club-channel/club-channel';

@Component({
  selector: 'app-home',
  imports: [HomeWelcome, PageCounterOverview, RouterModule, HomeFeaturedVehicles, HomeFeaturedCatalog, HomeNews, ClubChannel,],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
}
