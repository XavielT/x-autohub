import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NewCard } from '../../../shared/components/new-card/new-card';
import { NewCardModel } from '../../../shared/models/new-card.model';
import { NewsService } from '../../../shared/services/news.service';

@Component({
  selector: 'app-home-news',
  imports: [NewCard],
  templateUrl: './home-news.html',
  styleUrl: './home-news.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeNews implements OnInit {
  private readonly newsService = inject(NewsService);

  readonly news = signal<NewCardModel[]>([]);

  ngOnInit(): void {
    this.newsService.getAll().subscribe((news) => this.news.set(news));
  }
}
