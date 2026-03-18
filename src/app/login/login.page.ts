import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

type LoginStep = 'phone' | 'otp';

@Component({
  selector: 'app-login',
  standalone: false,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toastController = inject(ToastController);
  private authService = inject(AuthService);

  adminLoginEnabled = environment.adminLoginEnabled === true;

  adminForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]],
  });

  phoneForm: FormGroup = this.fb.group({
    phone: [
      '',
      [
        Validators.required,
        Validators.pattern(/^\+?[0-9]{7,15}$/),
      ],
    ],
  });

  otpForm: FormGroup = this.fb.group({
    otp: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[0-9]{6}$/),
      ],
    ],
  });

  step: LoginStep = 'phone';

  isSendingOtp = false;
  isVerifyingOtp = false;
  isAdminSigningIn = false;

  private lastSentMobileNo: string | null = null;

  goBack() {
    if (this.step === 'otp') {
      this.step = 'phone';
      return;
    }
  }

  startMobileLogin() {
    this.step = 'phone';
  }

  async continueWithGoogle() {
    await this.presentToast('Google login is not enabled. Use mobile OTP.', 'medium');
  }

  async sendOtp() {
    if (this.isSendingOtp) return;

    if (this.phoneForm.invalid) {
      this.phoneForm.markAllAsTouched();
      return;
    }

    const mobileNo = this.normalizeMobileNo(String(this.phoneForm.value.phone ?? ''));
    if (!mobileNo) {
      await this.presentToast('Please enter a valid mobile number.', 'danger');
      return;
    }
    this.isSendingOtp = true;
    try {
      await firstValueFrom(this.authService.sendOtp(mobileNo));
      this.lastSentMobileNo = mobileNo;

      await this.presentToast(`OTP sent to ${this.maskPhone(mobileNo)}`);
      this.otpForm.reset();
      this.step = 'otp';
    } catch (err: any) {
      await this.presentToast(this.extractErrorMessage(err) || 'Failed to send OTP.', 'danger');
    } finally {
      this.isSendingOtp = false;
    }
  }

  async verifyOtp() {
    if (this.isVerifyingOtp) return;

    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    const otp = String(this.otpForm.value.otp ?? '').trim();
    this.isVerifyingOtp = true;
    try {
      if (!this.lastSentMobileNo) {
        await this.presentToast('Please request an OTP first.', 'danger');
        this.step = 'phone';
        return;
      }

      try {
        const res = await firstValueFrom(this.authService.verifyOtp(this.lastSentMobileNo, otp));
        const ok = await this.persistAuthPayload(res, 'customer', { mobileNo: this.lastSentMobileNo });
        if (!ok) return;

        await this.presentToast('Verified! Redirecting...', 'success');
        this.router.navigateByUrl('/home', { replaceUrl: true });
        return;
      } catch (err: any) {
        await this.presentToast(this.extractErrorMessage(err) || 'Invalid OTP. Please try again.', 'danger');
        return;
      }

      await this.presentToast('Verified! Redirecting…', 'success');
      return;
    } finally {
      this.isVerifyingOtp = false;
    }
  }

  async resendOtp() {
    if (!this.lastSentMobileNo) {
      this.step = 'phone';
      return;
    }
    this.phoneForm.patchValue({ phone: this.lastSentMobileNo });
    await this.sendOtp();
  }

  async adminSignIn() {
    if (this.isAdminSigningIn) return;

    if (this.adminForm.invalid) {
      this.adminForm.markAllAsTouched();
      return;
    }

    const email = String(this.adminForm.value.email ?? '').trim();
    const password = String(this.adminForm.value.password ?? '');

      this.isAdminSigningIn = true;
      try {
        const res = await firstValueFrom(this.authService.adminLogin(email, password));
        const ok = await this.persistAuthPayload(res, 'admin', { email });
        if (!ok) return;
        await this.presentToast('Welcome, Admin.', 'success');
        this.router.navigateByUrl('/home', { replaceUrl: true });
      } catch (err: any) {
        await this.presentToast(this.extractErrorMessage(err) || 'Admin login failed.', 'danger');
      } finally {
      this.isAdminSigningIn = false;
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'medium' = 'medium') {
    const toast = await this.toastController.create({
      message,
      duration: 1500,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  private normalizeMobileNo(value: string): string | null {
    const digits = String(value || '').replace(/\D+/g, '');
    if (!digits) return null;
    if (digits.length < 10) return null;
    if (digits.length === 10) return digits;
    return digits.slice(-10);
  }

  private async persistAuthPayload(
    payload: any,
    fallbackRole: 'admin' | 'customer',
    opts?: { mobileNo?: string; email?: string },
  ): Promise<boolean> {
    const token = payload?.token || payload?.accessToken;
    if (!token) {
      await this.presentToast('Login failed: token missing.', 'danger');
      return false;
    }

    const user = payload?.user;
    if (user?.active === false) {
      await this.presentToast('Your account is disabled. Please contact support.', 'danger');
      return false;
    }

    const role = this.normalizeRole(user?.role) || fallbackRole;
    const mobileNo = user?.mobileNo || opts?.mobileNo;
    const email = payload?.email ?? user?.email ?? opts?.email;

    try {
      localStorage.setItem('vs_auth_token', String(token));
      localStorage.setItem('vs_role', role);
      localStorage.setItem('vs_display_name', role === 'admin' ? 'Admin' : 'Customer');

      localStorage.setItem('vs_login_at_ms', String(Date.now()));
      // localStorage.setItem('vs_auth_payload', JSON.stringify(payload));

      // if (user != null) localStorage.setItem('vs_user_json', JSON.stringify(user));
      if (user?.id != null) localStorage.setItem('vs_user_id', String(user.id));

      if (mobileNo) localStorage.setItem('vs_phone', String(mobileNo));
      if (email != null) localStorage.setItem('vs_email', String(email));

      if (role === 'admin') {
        localStorage.removeItem('vs_customer_code');
      }

      if (typeof user?.subscriptionActive === 'boolean') {
        localStorage.setItem('vs_subscription_backend_active', user.subscriptionActive ? '1' : '0');
        if (!user.subscriptionActive) localStorage.removeItem('vs_subscription_paid_until');
      }

      const expiryMs = this.parseExpiryMs(user?.subscriptionExpiry);
      if (expiryMs != null) {
        localStorage.setItem('vs_subscription_backend_expiry_ms', String(expiryMs));
        if (expiryMs > Date.now()) localStorage.setItem('vs_subscription_paid_until', String(expiryMs));
      }
    } catch {
      /* ignore */
    }

    return true;
  }

  private normalizeRole(value: any): 'admin' | 'customer' | null {
    const v = String(value || '').toUpperCase();
    if (!v) return null;
    if (v.includes('ADMIN')) return 'admin';
    if (v.includes('CUSTOMER') || v.includes('USER')) return 'customer';
    return null;
  }

  private parseExpiryMs(value: any): number | null {
    if (value == null) return null;
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed) && !Number.isNaN(parsed)) return parsed;
    return null;
  }

  private extractErrorMessage(err: any): string | null {
    const msg = err?.error?.message || err?.error?.error || err?.message;
    if (!msg) return null;
    return String(msg);
  }

  private maskPhone(phone: string): string {
    const normalized = phone.replace(/\s+/g, '');
    if (normalized.length <= 4) return normalized;
    const tail = normalized.slice(-3);
    return `${normalized.slice(0, Math.min(2, normalized.length - 3))}•••${tail}`;
  }


}
