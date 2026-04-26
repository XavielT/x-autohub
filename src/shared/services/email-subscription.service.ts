import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class EmailSubscriptionService {
  
  //TODO: Implement the real api
  private apiUrl = 'https://tu-api.com/subscribe'; 

  constructor(private http: HttpClient) {}

  subscribe(email: string): Observable<any> {
    return this.http.post(this.apiUrl, { email });
  }
}