import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NewCardModel } from '../../../shared/models/new-card.model';
import { NEWS_MOCK } from '../../../shared/models/new-card.mock';

@Component({
  selector: 'app-new-details',
  imports: [],
  templateUrl: './new-details.html',
  styleUrl: './new-details.scss',
})
export class NewDetails implements OnInit {
  new: NewCardModel | undefined;
  //TODO: implements a real Api inyection in this component

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.new = NEWS_MOCK.find(n => n.id === id);
  }
}
