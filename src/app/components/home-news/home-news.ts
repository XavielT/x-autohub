import { Component, OnInit } from '@angular/core';
import { NewCard } from '../../../shared/components/new-card/new-card';
import { NewCardModel } from '../../../shared/models/new-card.model';
import { NEWS_MOCK } from '../../../shared/models/new-card.mock';

@Component({
  selector: 'app-home-news',
  imports: [NewCard,],
  templateUrl: './home-news.html',
  styleUrl: './home-news.scss',
})
export class HomeNews implements OnInit {
  news: NewCardModel[] = [];

  ngOnInit(): void {
    this.news = NEWS_MOCK;
  }
}
