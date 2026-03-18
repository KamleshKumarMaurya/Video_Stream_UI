import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../services/admin.service';

type UserRole = 'admin' | 'customer';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit {
  private router = inject(Router);
  private adminService = inject(AdminService);

  role: UserRole = 'customer';
  phone = '';
  customerCode = '';

  subscriptionPlan = 'Standard';
  subscriptionStatus: 'Active' | 'Inactive' = 'Inactive';
  subscriptionNote = '';
  subscriptionActive = false;
  trialDaysLeft = 0;
  isLoadingSubscription = false;

  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'profile';

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  ngOnInit(): void {
    this.refresh();
  }

  ionViewWillEnter(): void {
    this.refresh();
  }

  private refresh(): void {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;

      const phone = localStorage.getItem('vs_phone');
      if (phone) this.phone = phone;

      const custCode = localStorage.getItem('vs_customer_code');
      if (custCode) this.customerCode = custCode;

      if (this.role === 'admin') {
        this.subscriptionPlan = 'Premium';
        this.subscriptionActive = true;
        this.subscriptionStatus = 'Active';
        this.subscriptionNote = 'Creator Studio access enabled';
        return;
      }
    } catch {
      /* ignore */
    }

    this.loadSubscriptionFromApi();
  }

  private loadSubscriptionFromApi(): void {
    if (this.isLoadingSubscription) return;
    if (this.role !== 'customer') return;

    const userId = this.getUserId();
    if (userId == null) {
      this.subscriptionPlan = 'Standard';
      this.subscriptionActive = false;
      this.subscriptionStatus = 'Inactive';
      this.subscriptionNote = 'Unable to identify user. Please login again.';
      return;
    }

    this.isLoadingSubscription = true;
    this.adminService.getCustomer(userId).subscribe({
      next: (res: any) => {
        const active = !!res?.subscriptionActive;
        this.subscriptionActive = active;
        this.subscriptionStatus = active ? 'Active' : 'Inactive';
        this.subscriptionPlan = res?.activePlanName || 'Standard';
        const expiry = res?.subscriptionExpiryDate;
        this.subscriptionNote = active
          ? (expiry ? `Valid until ${this.formatDate(expiry)}` : 'Subscription active')
          : 'No active subscription. Subscribe to unlock more.';
        this.isLoadingSubscription = false;
      },
      error: () => {
        this.subscriptionPlan = 'Standard';
        this.subscriptionActive = false;
        this.subscriptionStatus = 'Inactive';
        this.subscriptionNote = 'Could not fetch subscription status.';
        this.isLoadingSubscription = false;
      },
    });
  }

  private getUserId(): number | null {
    try {
      const idStr = localStorage.getItem('vs_user_id');
      const id = idStr ? Number(idStr) : NaN;
      if (Number.isFinite(id)) return id;

      const userJson = localStorage.getItem('vs_user_json');
      if (!userJson) return null;
      const user = JSON.parse(userJson);
      const fromUser = Number(user?.id);
      return Number.isFinite(fromUser) ? fromUser : null;
    } catch {
      return null;
    }
  }

  private formatDate(value: any): string {
    const num = Number(value);
    const d = Number.isFinite(num) ? new Date(num) : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }

  openSubscription(): void {
    this.router.navigateByUrl('/subscription');
  }

  logout(): void {
    try {
      localStorage.removeItem('vs_auth_token');
      localStorage.removeItem('vs_token');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');

      localStorage.removeItem('vs_role');
      localStorage.removeItem('vs_customer_code');
      localStorage.removeItem('vs_display_name');
      localStorage.removeItem('vs_phone');
      localStorage.removeItem('vs_email');
      localStorage.removeItem('vs_user_id');
      localStorage.removeItem('vs_user_json');
      localStorage.removeItem('vs_login_at_ms');
      localStorage.removeItem('vs_subscription_active');
      localStorage.removeItem('vs_subscription_trial_started_at');
      localStorage.removeItem('vs_subscription_paid_until');
      localStorage.removeItem('vs_subscription_plan_months');
      localStorage.removeItem('vs_subscription_plan_id');
      localStorage.removeItem('vs_subscription_plan_name');
      localStorage.removeItem('vs_subscription_plan_days');
      localStorage.removeItem('vs_subscription_backend_active');
      localStorage.removeItem('vs_subscription_backend_expiry_ms');
    } catch {
      /* ignore */
    }
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  setBottomTab(tab: 'home' | 'explore' | 'create' | 'library' | 'profile'): void {
    this.activeBottomTab = tab;
    if (tab === 'profile') return;

    if (tab === 'home') {
      this.router.navigateByUrl('/home?tab=home');
      return;
    }
    if (tab === 'explore') {
      this.router.navigateByUrl('/home?tab=explore');
      return;
    }
    if (tab === 'create') {
      if (!this.isAdmin) return;
      this.router.navigateByUrl('/stories/add');
      return;
    }
    if (tab === 'library') {
      if (!this.isAdmin) return;
      this.router.navigateByUrl('/users');
      return;
    }
    // eslint-disable-next-line no-console
    console.log('Bottom tab tapped:', tab);
  }
}
