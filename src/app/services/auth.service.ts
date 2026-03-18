import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type SendOtpRequest = { mobileNo: string };
export type VerifyOtpRequest = { mobileNo: string; otp: string };
export type AuthUser = {
  id: number;
  name?: string | null;
  email?: string | null;
  mobileNo?: string | null;
  role?: string | null;
  subscriptionActive?: boolean | null;
  active?: boolean | null;
  subscriptionExpiry?: string | number | null;
};

export type VerifyOtpResponse = {
  token: string;
  email?: string | null;
  user?: AuthUser | null;
};

export type AdminLoginRequest = { email: string; password: string };
export type AdminLoginResponse = {
  token?: string;
  accessToken?: string;
  email?: string | null;
  user?: AuthUser | null;
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private base = `${environment.apiBase}/api`;

  private headers = new HttpHeaders({
    'ngrok-skip-browser-warning': 'true',
  });

  sendOtp(mobileNo: string): Observable<any> {
    const body: SendOtpRequest = { mobileNo };
    return this.http.post(`${this.base}/auth/mobile/send-otp`, body, { headers: this.headers });
  }

  verifyOtp(mobileNo: string, otp: string): Observable<VerifyOtpResponse> {
    const body: VerifyOtpRequest = { mobileNo, otp };
    return this.http.post<VerifyOtpResponse>(`${this.base}/auth/mobile/verify-otp`, body, { headers: this.headers });
  }

  adminLogin(email: string, password: string): Observable<AdminLoginResponse> {
    const body: AdminLoginRequest = { email, password };
    return this.http.post<AdminLoginResponse>(`${this.base}/auth/login`, body, { headers: this.headers });
  }
}
