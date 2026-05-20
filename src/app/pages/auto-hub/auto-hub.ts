import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoHubModel } from '../../../shared/models/auto-hub.model';
import { AutoHubService } from '../../../shared/services/auto-hub.service';
import { AutohubCard } from '../../../shared/components/autohub-card/autohub-card';

@Component({
  selector: 'app-auto-hub',
  imports: [FormsModule, AutohubCard],
  templateUrl: './auto-hub.html',
  styleUrl: './auto-hub.scss',
})
export class AutoHub implements OnInit{

  allAutos: AutoHubModel[] = [];

  filteredAutos: AutoHubModel[] = [];
  searchQuery: string = '';
  selectedCategory: string = '';

  onSearch(): void {
    this.applyFilters();
  }

  /*onCategorySelect(category: string): void {
    this.selectedCategory = this.selectedCategory === category ? '' : category;
    this.applyFilters();
  }*/

  private applyFilters(): void {
    this.filteredAutos = this.allAutos.filter((auto: AutoHubModel) => {
      const matchesSearch = auto.brand.toLowerCase()
        .includes(this.searchQuery.toLowerCase()) ||
        auto.model.toLowerCase().includes(this.searchQuery.toLowerCase());

        return matchesSearch;

      /*const matchesCategory = this.selectedCategory
        ? part.category === this.selectedCategory
        : true;
        
      return matchesSearch && matchesCategory;*/
    });
  }

  constructor(
    private autoHubService: AutoHubService,
    //private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.allAutos = this.autoHubService.getAll();
    this.filteredAutos = [...this.allAutos];

    /*const categoryFromUrl = this.route.snapshot.queryParamMap.get('category');
    if (categoryFromUrl && this.categories.some((category) => category.value === categoryFromUrl)) {
      this.selectedCategory = categoryFromUrl;
      this.applyFilters();
    }*/
  }

}
