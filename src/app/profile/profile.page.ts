import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AdminService } from '../services/admin.service';
import { StoryService } from '../services/story.service';
import { WishlistService, WishlistStory } from '../services/wishlist.service';
import { DownloadService } from '../services/download.service';

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
  storyService = inject(StoryService);
  private wishlistService = inject(WishlistService);
  private downloadService = inject(DownloadService);

  role: UserRole = 'customer';
  phone = '';
  email = '';
  customerCode = '';

  subscriptionPlan = 'Standard';
  subscriptionStatus: 'Active' | 'Inactive' = 'Inactive';
  subscriptionNote = '';
  subscriptionActive = false;
  isTrialActive = false;
  subscriptionExpiryLabel = '';
  subscriptionRemainingDays: number | null = null;
  isLoadingSubscription = false;
  wishlistItems: WishlistStory[] = [];
  downloadCount = 0;

  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'profile';

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get bottomNavItems(): any[] {
    if (this.isAdmin) {
      return [
        { id: 'home', label: 'Home', icon: 'home-outline' },
        { id: 'explore', label: 'Explore', icon: 'compass-outline' },
        { id: 'create', icon: 'add-outline', center: true, ariaLabel: 'Create' },
        { id: 'library', label: 'User', icon: 'play-outline' },
        { id: 'profile', label: 'Profile', icon: 'person-outline' },
      ];
    }

    return [
      { id: 'home', label: 'Home', icon: 'home-outline' },
      { id: 'explore', label: 'Explore', icon: 'compass-outline' },
      { id: 'profile', label: 'Profile', icon: 'person-outline' },
    ];
  }

  get profileIdentityLabel(): string {
    return this.isAdmin ? 'EMAIL' : 'MOBILE NUMBER';
  }

  get profileIdentityValue(): string {
    return this.isAdmin ? (this.email || '—') : (this.phone || '—');
  }

  ngOnInit(): void {
    this.refresh();
  }

  ionViewWillEnter(): void {
    this.refresh();
    this.refreshWishlist();
    void this.refreshDownloads();
  }

  private refresh(): void {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;

      const phone = localStorage.getItem('vs_phone');
      if (phone) this.phone = phone;
      else this.phone = '';

      const email = localStorage.getItem('vs_email');
      if (email) this.email = email;
      else this.email = '';

      const custCode = localStorage.getItem('vs_customer_code');
      if (custCode) this.customerCode = custCode;
      else this.customerCode = '';

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

  private refreshWishlist(): void {
    if (this.role !== 'customer') {
      this.wishlistItems = [];
      return;
    }

    this.wishlistItems = this.wishlistService.getItems();
  }

  private async refreshDownloads(): Promise<void> {
    if (this.isAdmin) {
      this.downloadCount = 0;
      return;
    }

    try {
      this.downloadCount = await this.downloadService.getDownloadCountForCurrentUser();
    } catch {
      this.downloadCount = 0;
    }
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
        const explicitTrialActive = this.pickFirstBoolean(
          res?.trialActive,
          res?.isTrialActive,
          res?.onTrial,
          res?.isOnTrial,
          res?.trialPlanActive,
          res?.isTrialPlanActive,
        );

        const normalPlanActive = this.pickFirstBoolean(
          res?.isNormalPlanActive,
          res?.normalPlanActive,
          res?.isPaidPlanActive,
          res?.paidPlanActive,
        );

        const activeFlag = !!res?.subscriptionActive || explicitTrialActive === true;
        const inferredTrialActive = activeFlag && normalPlanActive === false;
        const trialActive = explicitTrialActive === true || inferredTrialActive;
        const expiryRaw = trialActive
          ? (res?.trialExpiryDate ?? res?.trialExpiry ?? res?.trialEndDate ?? res?.subscriptionExpiryDate ?? res?.subscriptionExpiry)
          : (res?.subscriptionExpiryDate ?? res?.subscriptionExpiry ?? res?.subscriptionExpiryMs);

        const expiryMs = this.parseExpiryMs(expiryRaw);
        const now = Date.now();
        const notExpired = expiryMs == null ? true : expiryMs > now;
        const isActive = activeFlag && notExpired;

        this.isTrialActive = trialActive && isActive;
        this.subscriptionActive = isActive;
        this.subscriptionStatus = isActive ? 'Active' : 'Inactive';

        const planName = this.isTrialActive
          ? '7 Days Trial'
          : (res?.activePlanName || res?.planName || res?.subscriptionPlanName || 'Standard');
        this.subscriptionPlan = String(planName || 'Standard');

        if (isActive && expiryMs != null) {
          this.subscriptionExpiryLabel = this.isTrialActive
            ? `Trial ends: ${this.formatDateTime(expiryMs)}`
            : `Expires: ${this.formatDateTime(expiryMs)}`;
          this.subscriptionRemainingDays = this.remainingDays(expiryMs);
        } else if (!isActive && expiryMs != null) {
          this.subscriptionExpiryLabel = `Expired: ${this.formatDateTime(expiryMs)}`;
          this.subscriptionRemainingDays = null;
        } else {
          this.subscriptionExpiryLabel = '';
          this.subscriptionRemainingDays = null;
        }

        this.subscriptionNote = this.isTrialActive
          ? 'Trial plan is active.'
          : (isActive ? 'Subscription is active.' : 'No active subscription. Subscribe to unlock more.');

        try {
          localStorage.setItem('vs_subscription_backend_active', isActive ? '1' : '0');
          if (expiryMs != null) localStorage.setItem('vs_subscription_backend_expiry_ms', String(expiryMs));
          else localStorage.removeItem('vs_subscription_backend_expiry_ms');
        } catch {
          /* ignore */
        }

        this.isLoadingSubscription = false;
      },
      error: () => {
        this.subscriptionPlan = 'Standard';
        this.subscriptionActive = false;
        this.subscriptionStatus = 'Inactive';
        this.isTrialActive = false;
        this.subscriptionExpiryLabel = '';
        this.subscriptionRemainingDays = null;
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

  private pickFirstBoolean(...values: any[]): boolean | null {
    for (const v of values) {
      if (typeof v === 'boolean') return v;
    }
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

  private formatDateTime(value: any): string {
    const num = Number(value);
    const d = Number.isFinite(num) ? new Date(num) : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private remainingDays(expiryMs: number): number {
    const leftMs = Math.max(0, expiryMs - Date.now());
    return Math.max(0, Math.ceil(leftMs / (24 * 60 * 60 * 1000)));
  }

  openSubscription(): void {
    this.router.navigateByUrl('/subscription');
  }

  openDownloads(): void {
    this.router.navigateByUrl('/downloads');
  }

  openWishlistStory(storyId: string | number): void {
    if (storyId == null || storyId === '') return;
    this.router.navigateByUrl(`/story/${storyId}`);
  }

  removeWishlistItem(item: WishlistStory, ev: Event): void {
    ev.stopPropagation();
    const removed = this.wishlistService.removeStory(item.id);
    if (removed) {
      this.refreshWishlist();
    }
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
  }
}
