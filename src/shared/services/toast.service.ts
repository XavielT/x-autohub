import { Injectable, signal } from '@angular/core';

export interface ToastModel {
  id: number;
  message: string;
  type: 'success' | 'error';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<ToastModel[]>([]);
  toasts = this._toasts.asReadonly();

  show(message: string, type: 'success' | 'error' = 'success'): void {
    const id = Date.now();
    this._toasts.set([...this._toasts(), { id, message, type }]);

    // Cooldown in 3s
    setTimeout(() => this.remove(id), 3000);
  }

  private remove(id: number): void {
    this._toasts.set(this._toasts().filter(t => t.id !== id));
  }
}