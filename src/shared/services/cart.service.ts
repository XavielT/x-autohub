import { Injectable, signal, computed } from '@angular/core';
import { HubPartModel } from '../models/hub-part.model'; // ajusta el path si es diferente

export interface CartItem {
  part: HubPartModel;
  quantity: number;
}

@Injectable({
  providedIn: 'root'
})
export class CartService {

  // Private state
  private _items = signal<CartItem[]>([]);
  private _isOpen = signal<boolean>(false);

  // Exposing the items as readonly, so u can use it
  items = this._items.asReadonly();
  isOpen = this._isOpen.asReadonly();

  // Total amount of items in the cart
  totalItems = computed(() =>
    this._items().reduce((acc, item) => acc + item.quantity, 0)
  );

  // Total Price
  totalPrice = computed(() =>
    this._items().reduce((acc, item) => acc + (item.part.price * item.quantity), 0)
  );

  addToCart(part: HubPartModel): void {
    const current = this._items();
    const existing = current.find(i => i.part.id === part.id);

    if (existing) {
      // If exists, just add more of that item
      this._items.set(
        current.map(i => i.part.id === part.id
          ? { ...i, quantity: i.quantity + 1 }
          : i
        )
      );
    } else {
      this._items.set([...current, { part, quantity: 1 }]);
    }
  }

  removeFromCart(partId: number): void {
    this._items.set(this._items().filter(i => i.part.id !== partId));
  }

  toggleCart(): void {
    this._isOpen.set(!this._isOpen());
  }

  closePanel(): void {
    this._isOpen.set(false);
  }

  clearCart(): void {
    this._items.set([]);
  }
}