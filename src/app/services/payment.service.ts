import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MessageResponse = {
  message?: string | null;
  subscriptionActive?: boolean | null;
  subscriptionExpiryMs?: number | string | null;
  subscriptionExpiry?: number | string | null;
  subscriptionExpiryDate?: number | string | null;
};

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/api/payments`;

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

  // Backend should return a Razorpay `subscriptionId` in `message`.
  initiateSubscription(planId: number, useTrial: boolean): Observable<MessageResponse> {
    const params = new HttpParams().set('planId', String(planId)).set('trial', String(useTrial));
    return this.http.post<MessageResponse>(`${this.base}/initiate`, null, {
      headers: this.buildHeaders(),
      params,
    });
  }

  verifyPaymnent(paymentData: {
    orderId?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    trial: boolean;
  }): Observable<MessageResponse> {
    let params = new HttpParams().set('orderId',String(paymentData.orderId)).set('trial', String(paymentData.trial));
    if (paymentData.razorpay_payment_id) params = params.set('paymentId', String(paymentData.razorpay_payment_id));
    if (paymentData.razorpay_signature) params = params.set('signature', String(paymentData.razorpay_signature));

    return this.http.post<MessageResponse>(`${this.base}/verify`, null, {
      headers: this.buildHeaders(),
      params,
    });
  }


  // Verifies payment/signature on backend and activates subscription.
  capturePayment(paymentData: {
    razorpay_subscription_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    planId: number;
    trial: boolean;
  }): Observable<MessageResponse> {
    let params = new HttpParams().set('planId', String(paymentData.planId)).set('trial', String(paymentData.trial));
    if (paymentData.razorpay_subscription_id) params = params.set('subscriptionId', String(paymentData.razorpay_subscription_id));
    if (paymentData.razorpay_payment_id) params = params.set('paymentId', String(paymentData.razorpay_payment_id));
    if (paymentData.razorpay_signature) params = params.set('signature', String(paymentData.razorpay_signature));

    return this.http.post<MessageResponse>(`${this.base}/capture`, null, {
      headers: this.buildHeaders(),
      params,
    });
  }
}
