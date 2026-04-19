import { Component } from '@angular/core';
import { HomeWelcome } from '../../components/home-welcome/home-welcome';
import { PageCounterOverview } from '../../components/page-counter-overview/page-counter-overview';
import { RouterModule } from '@angular/router';


@Component({
  selector: 'app-home',
  imports: [HomeWelcome, PageCounterOverview, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {

}
