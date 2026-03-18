import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/api`;

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'ngrok-skip-browser-warning': 'true',
    });

    const token = this.getAuthToken();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);

    return headers;
  }

  private getAuthToken(): string | null {
    try {
      return (
        localStorage.getItem('vs_auth_token') ||
        localStorage.getItem('vs_token') ||
        localStorage.getItem('auth_token') ||
        localStorage.getItem('token')
      );
    } catch {
      return null;
    }
  }

  extractCustomers(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    const content = res?.content ?? res?.data ?? res?.customers;
    return Array.isArray(content) ? content : [];
  }

  getCustomers(opts?: { page?: number; size?: number }): Observable<any> {
    let params = new HttpParams();
    if (opts?.page != null) params = params.set('page', String(opts.page));
    if (opts?.size != null) params = params.set('size', String(opts.size));
    return this.http.get(`${this.base}/admin/customers`, { headers: this.buildHeaders(), params });
  }

  getCustomer(customerId: string | number): Observable<any> {
    return this.http.get(`${this.base}/admin/customers/${customerId}`, { headers: this.buildHeaders() });
  }

  updateCustomerStatus(customerId: string | number, active: boolean): Observable<any> {
    const params = new HttpParams().set('active', String(active));
    return this.http.put(`${this.base}/admin/customers/${customerId}/status`, null, { headers: this.buildHeaders(), params });
  }
}
