import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HubMarketService } from '../../../shared/services/hub-market.service';
import { HubMarketItemModel } from '../../../shared/models/hub-market-item.model';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-publicar',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './publicar.html',
  styleUrl: './publicar.scss',
})
export class PublicarComponent {
  publishForm: FormGroup;
  selectedFiles: File[] = [];
  imagePreviews: string[] = [];
  isDragOver = false;

  categories = [
    { value: 'vehiculos', label: 'Vehículos' },
    { value: 'piezas', label: 'Piezas' },
    { value: 'accesorios', label: 'Accesorios' }
  ];

  constructor(
    private fb: FormBuilder,
    private hubMarketService: HubMarketService,
    private router: Router
  ) {
    this.publishForm = this.fb.group({
      category: ['', Validators.required],
      title: ['', Validators.required],
      description: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      location: ['', Validators.required],
      year: [null],
      mileage: [null],
      hp: [null],
      zeroTo100: [null],
      topSpeed: [null],
      condition: ['']
    });
  }

  get isVehicle(): boolean {
    return this.publishForm.get('category')?.value === 'vehiculos';
  }

  get isPartOrAccessory(): boolean {
    return ['piezas', 'accesorios'].includes(this.publishForm.get('category')?.value);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      Array.from(input.files).forEach(file => this.handleFile(file));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => this.handleFile(file));
    }
  }

  private handleFile(file: File): void {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result && !this.imagePreviews.includes(result)) {
          this.selectedFiles.push(file);
          this.imagePreviews.push(result);
        }
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.imagePreviews.splice(index, 1);
  }

  //price format / input format
  formatPriceDisplay(event: Event): void {
    const input = event.target as HTMLInputElement;

    // Delete all that's not code
    const raw = input.value.replace(/\D/g, '');
    const numeric = Number(raw);

    // Refeesh fom control with the nue value
    this.publishForm.get('price')?.setValue(numeric, { emiEvent: false });

    // Format displayed number with ","
    input.value = numeric > 0 ? numeric.toLocaleString('en-US') : '';
  }

  onSubmit(): void {
    if (this.publishForm.valid && this.imagePreviews.length > 0) {
      const formValue = this.publishForm.value;
      const newItem: HubMarketItemModel = {
        id: Date.now(), // Temporal, en API sería generado
        category: formValue.category,
        title: formValue.title,
        description: formValue.description,
        price: formValue.price,
        //image: this.imagePreviews[0],
        images: this.imagePreviews,
        sellerName: 'Usuario Actual', // Temporal, vendría de auth
        location: formValue.location,
        ...(formValue.category === 'vehiculos' && {
          vehicleSpecs: {
            year: formValue.year,
            mileage: formValue.mileage,
            hp: formValue.hp || undefined,
            zeroTo100: formValue.zeroTo100 || undefined,
            topSpeed: formValue.topSpeed || undefined
          }
        })
      };

      this.hubMarketService.addItem(newItem);
      this.router.navigate(['/hub-market']);
    }
  }
}