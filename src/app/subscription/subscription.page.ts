import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { Plan, PlanService } from '../services/plan.service';
import { AdminService } from '../services/admin.service';
import { PaymentService } from '../services/payment.service';
import { RazorpayService } from '../services/razorpay.service';

type UserRole = 'admin' | 'customer';

@Component({
  selector: 'app-subscription',
  templateUrl: './subscription.page.html',
  styleUrls: ['./subscription.page.scss'],
  standalone: false,
})
export class SubscriptionPage implements OnInit {
  private router = inject(Router);
  private planService = inject(PlanService);
  private adminService = inject(AdminService);
  private paymentService = inject(PaymentService);
  private razorpayService = inject(RazorpayService);
  private toastController = inject(ToastController);
  private loadingController = inject(LoadingController);

  role: UserRole = 'customer';
  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'profile';

  trialDays = 7;

  subscriptionBackendActive = false;
  subscriptionBackendExpiryMs: number | null = null;
  trialPlanUsed: boolean | null = null;
  isCheckingSubscriptionState = false;

  plans: Plan[] = [];
  isLoadingPlans = false;
  selectedPlanId: number | null = null;

  isProcessingPayment = false;
  razorpayError: string | null = null;

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get selectedPlan(): Plan | null {
    if (!this.selectedPlanId) return null;
    return this.plans.find(p => p.id === this.selectedPlanId) || null;
  }

  get isSubscriptionActive(): boolean {
    if (this.isAdmin) return true;
    if (this.subscriptionBackendExpiryMs != null) return this.subscriptionBackendExpiryMs > Date.now();
    return this.subscriptionBackendActive === true;
  }

  get canStartTrial(): boolean {
    const plan = this.selectedPlan;
    if (!plan || plan.trialAvailable !== true) return false;
    if (this.trialPlanUsed === true) return false;
    if (this.trialPlanUsed == null) return false;
    return true;
  }

  canUseTrial(plan: Plan | null | undefined): boolean {
    if (!plan || plan.trialAvailable !== true) return false;
    if (this.trialPlanUsed === true) return false;
    if (this.trialPlanUsed == null) return false;
    return true;
  }

  get primaryCtaLabel(): string {
    if (this.isAdmin) return 'Premium Active';
    if (this.isSubscriptionActive) return 'Premium Active';
    if (this.isProcessingPayment) return 'Processing...';
    if (this.isLoadingPlans) return 'Loading plans...';
    if (!this.selectedPlan) return 'Select a plan';

    const plan = this.selectedPlan;
    const trialAvailable = plan.trialAvailable === true;

    if (trialAvailable && this.canUseTrial(plan)) {
      const trialDays = plan.trialDurationDays || this.trialDays;
      const trialPrice = plan.trialPrice != null ? `₹${plan.trialPrice}` : 'Free';
      return `Start ${trialDays}-Day Trial (${trialPrice})`;
    }

    return `Subscribe - ₹${this.formatMoney(plan.price)}`;
  }

  get isPrimaryCtaDisabled(): boolean {
    if (this.isAdmin) return true;
    if (this.isSubscriptionActive) return true;
    if (this.isProcessingPayment) return true;
    if (this.isLoadingPlans) return true;
    if (!this.selectedPlan) return true;
    return false;
  }

  ngOnInit(): void {
    this.loadState();
    this.loadPlans();
  }

  ionViewWillEnter(): void {
    this.loadState();
    this.loadPlans();
  }

  private loadState(): void {
    try {
      const role = localStorage.getItem('vs_role');
      if (role === 'admin' || role === 'customer') this.role = role;
    } catch {
      /* ignore */
    }

    this.readBackendSubscriptionState();
    this.clearLegacySubscriptionKeys();
    void this.refreshSubscriptionStateFromBackend();
  }

  private readBackendSubscriptionState(): void {
    try {
      const active = localStorage.getItem('vs_subscription_backend_active');
      this.subscriptionBackendActive = active === '1' || active === 'true';

      const expiryStr = localStorage.getItem('vs_subscription_backend_expiry_ms');
      const expiryNum = expiryStr ? Number(expiryStr) : NaN;
      this.subscriptionBackendExpiryMs = Number.isFinite(expiryNum) && expiryNum > 0 ? expiryNum : null;
    } catch {
      this.subscriptionBackendActive = false;
      this.subscriptionBackendExpiryMs = null;
    }
  }

  private async refreshSubscriptionStateFromBackend(): Promise<void> {
    if (this.isAdmin) return;
    if (this.isCheckingSubscriptionState) return;

    const userId = this.getUserIdFromStorage();
    if (userId == null) return;

    this.isCheckingSubscriptionState = true;
    try {
      const res: any = await firstValueFrom(this.adminService.getCustomer(userId));

      const active = !!res?.subscriptionActive;
      const expiryMs = this.parseExpiryMs(res?.subscriptionExpiryDate ?? res?.subscriptionExpiry ?? res?.subscriptionExpiryMs);
      this.subscriptionBackendActive = active;
      this.subscriptionBackendExpiryMs = expiryMs;

      const trialUsed = this.pickFirstBoolean(
        res?.isTrialPlanUsed,
        res?.trialPlanUsed,
        res?.trialUsed,
        res?.isTrialUsed,
        res?.trialConsumed,
        res?.isTrialConsumed,
      );
      this.trialPlanUsed = typeof trialUsed === 'boolean' ? trialUsed : false;

      try {
        localStorage.setItem('vs_subscription_backend_active', active ? '1' : '0');
        if (expiryMs != null) localStorage.setItem('vs_subscription_backend_expiry_ms', String(expiryMs));
        else localStorage.removeItem('vs_subscription_backend_expiry_ms');
      } catch {
        /* ignore */
      }
    } catch {
      this.trialPlanUsed = true;
    } finally {
      this.isCheckingSubscriptionState = false;
    }
  }

  private clearLegacySubscriptionKeys(): void {
    try {
      localStorage.removeItem('vs_subscription_active');
      localStorage.removeItem('vs_subscription_trial_started_at');
      localStorage.removeItem('vs_subscription_trial_days');
      localStorage.removeItem('vs_subscription_paid_until');
      localStorage.removeItem('vs_subscription_plan_months');
      localStorage.removeItem('vs_subscription_plan_id');
      localStorage.removeItem('vs_subscription_plan_name');
      localStorage.removeItem('vs_subscription_plan_days');
    } catch {
      /* ignore */
    }
  }

  private getUserIdFromStorage(): number | null {
    try {
      const idStr = localStorage.getItem('vs_user_id');
      const id = idStr ? Number(idStr) : NaN;
      return Number.isFinite(id) ? id : null;
    } catch {
      return null;
    }
  }

  private loadPlans(): void {
    if (this.isLoadingPlans) return;
    if (this.isAdmin) return;

    this.isLoadingPlans = true;
    this.planService.getPlans().subscribe({
      next: (plans) => {
        this.plans = Array.isArray(plans) ? plans : [];
        this.isLoadingPlans = false;
        this.ensureSelectedPlan();
      },
      error: async (err) => {
        this.plans = [];
        this.isLoadingPlans = false;
        await this.presentToast('Failed to load subscription plans.', 'danger');
      },
    });
  }

  private ensureSelectedPlan(): void {
    if (this.selectedPlanId && this.selectedPlan) return;
    const best = this.pickBestPlan(this.plans);
    const selected = best || this.plans[0] || null;

    this.selectedPlanId = selected?.id ?? null;
  }

  private pickBestPlan(plans: Plan[]): Plan | null {
    if (!plans?.length) return null;
    return [...plans].sort((a, b) => (Number(b.durationDays) || 0) - (Number(a.durationDays) || 0))[0] || null;
  }

  onPrimaryCta(): void {
    if (this.isAdmin) return;
    if (this.isSubscriptionActive) return;
    if (!this.selectedPlan) return;

    const plan = this.selectedPlan;
    if (this.canUseTrial(plan)) {
      void this.buySubscription(plan.id, plan.trialPrice, true);
      return;
    }

    void this.buySubscription(plan.id, plan.price, false);
  }

  selectPlan(plan: Plan): void {
    if (this.isProcessingPayment) return;
    this.selectedPlanId = plan?.id ?? null;
    this.razorpayError = null;
  }

  private async buySubscription(planId: number, amount: any, useTrial: boolean): Promise<void> {
    if (this.isProcessingPayment) return;

    this.isProcessingPayment = true;
    this.razorpayError = null;
    const initLoading = await this.loadingController.create({ message: 'Initializing...' });
    await initLoading.present();

    let initDismissed = false;
    try {
      const initRes = await firstValueFrom(this.paymentService.initiateSubscription(planId, useTrial));
      const orderId = String(initRes?.message || '').trim();
      if (!orderId) throw new Error('Failed to start subscription.');

      await initLoading.dismiss();
      initDismissed = true;

      const plan = this.plans.find(p => p.id === planId) || null;
      const description = useTrial ? '7-Day Trial' : (plan?.name || 'Subscription');
      const response = await this.razorpayService.openCheckout({
        orderId,
        currency: 'INR',
        name: 'VideoStory',
        description,
        amount: Number(amount) * 100 || 0,
        themeColor: '#0C001C',
        prefill: this.getRazorpayPrefill(),
        notes: {
          planId: String(planId),
          trial: useTrial ? '1' : '0',
        },
      });

      const verifyLoading = await this.loadingController.create({ message: 'Verifying...' });
      await verifyLoading.present();
      try {
        const captureRes: any = await firstValueFrom(
          this.paymentService.verifyPaymnent({
            orderId,
            ...response,
            trial: useTrial,
          }),
        );
        if (captureRes?.status !== "200") {
          const msg = captureRes?.message ? String(captureRes.message) : 'Payment verification failed.';
          throw new Error(msg);
        }
        await this.presentToast(captureRes?.message ? captureRes.message : 'Subscription Activated Successfully!', 'success');
        if (captureRes.data) {
          this.activateBackendFromApiResponse(captureRes?.data);
          this.router.navigateByUrl('/home', { replaceUrl: true });
        }
      } finally {
        await verifyLoading.dismiss();
      }
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Payment cancelled.';
      if (msg !== 'Checkout closed.') {
        this.razorpayError = msg;
        await this.presentToast(msg, 'danger');
      }
    } finally {
      this.isProcessingPayment = false;
      if (!initDismissed) {
        try {
          await initLoading.dismiss();
        } catch {
          /* ignore */
        }
      }
    }
  }

  private activateBackendFromApiResponse(apiRes: any): void {
    this.subscriptionBackendActive = apiRes.subscriptionActive === true;
    this.subscriptionBackendExpiryMs = apiRes.subscriptionExpiry != null ? new Date(apiRes.subscriptionExpiry).getTime() : null;
    try {
      localStorage.setItem('vs_subscription_backend_active',this.subscriptionBackendActive ? '1' : '0');
      if (this.subscriptionBackendExpiryMs != null) {
        localStorage.setItem('vs_subscription_backend_expiry_ms',String(this.subscriptionBackendExpiryMs));
      } else {
        localStorage.removeItem('vs_subscription_backend_expiry_ms');
      }
    } catch {
      /* ignore */
    }
  }

  isBestPlan(plan: Plan): boolean {
    const best = this.pickBestPlan(this.plans);
    return !!best && best.id === plan?.id;
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

  private getRazorpayPrefill(): { name?: string; email?: string; contact?: string } | undefined {
    try {
      const name = (localStorage.getItem('vs_display_name') || '').trim();
      const email = (localStorage.getItem('vs_email') || '').trim();
      const contact = (localStorage.getItem('vs_phone') || '').trim();

      const prefill: any = {};
      if (name) prefill.name = name;
      if (email) prefill.email = email;
      if (contact) prefill.contact = contact;

      return Object.keys(prefill).length ? prefill : undefined;
    } catch {
      return undefined;
    }
  }

  setBottomTab(tab: 'home' | 'explore' | 'create' | 'library' | 'profile'): void {
    this.activeBottomTab = tab;
    if (tab === 'profile') {
      this.router.navigateByUrl('/profile');
      return;
    }
    if (tab === 'home') {
      this.router.navigateByUrl('/home?tab=home');
      return;
    }
    if (tab === 'explore') {
      this.router.navigateByUrl('/home?tab=explore');
      return;
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger' | 'medium' = 'medium'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1800,
      position: 'bottom',
      color,
    });
    await toast.present();
  }

  formatMoney(value: number | null | undefined): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return n % 1 === 0 ? String(n.toFixed(0)) : String(n.toFixed(2));
  }

  perMonthLabel(plan: Plan): string {
    const price = Number(plan?.price);
    const days = Number(plan?.durationDays);
    if (!Number.isFinite(price) || !Number.isFinite(days) || days <= 0) return '';
    const perMonth = price / Math.max(1, days / 30);
    return `₹${this.formatMoney(perMonth)} / month`;
  }
}
