import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Plan, PlanService } from '../services/plan.service';

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
  private toastController = inject(ToastController);

  role: UserRole = 'customer';
  activeBottomTab: 'home' | 'explore' | 'create' | 'library' | 'profile' = 'profile';

  trialDays = 7;
  trialStartedAtMs: number | null = null;
  paidUntilMs: number | null = null;

  plans: Plan[] = [];
  isLoadingPlans = false;
  selectedPlanId: number | null = null;

  get isAdmin(): boolean {
    return this.role === 'admin';
  }

  get selectedPlan(): Plan | null {
    if (!this.selectedPlanId) return null;
    return this.plans.find(p => p.id === this.selectedPlanId) || null;
  }

  get isTrialActive(): boolean {
    if (!this.trialStartedAtMs) return false;
    return Date.now() < this.trialStartedAtMs + this.trialDays * 24 * 60 * 60 * 1000;
  }

  get isPaidActive(): boolean {
    if (!this.paidUntilMs) return false;
    return Date.now() < this.paidUntilMs;
  }

  get primaryCtaLabel(): string {
    if (this.isAdmin) return 'Premium Active';
    if (this.isLoadingPlans) return 'Loading plans...';
    if (!this.selectedPlan) return 'Select a plan';

    const plan = this.selectedPlan;
    const trialAvailable = plan.trialAvailable === true;

    if (!this.trialStartedAtMs && trialAvailable) {
      const trialDays = plan.trialDurationDays || this.trialDays;
      const trialPrice = plan.trialPrice != null ? `₹${plan.trialPrice}` : 'Free';
      return `Start ${trialDays}-Day Trial (${trialPrice})`;
    }

    if (this.isTrialActive) return `Trial Active (${this.daysLeftInTrial()}d left)`;

    return `Subscribe - ₹${this.formatMoney(plan.price)}`;
  }

  get isPrimaryCtaDisabled(): boolean {
    if (this.isAdmin) return true;
    if (this.isTrialActive) return true;
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

      const trialDays = localStorage.getItem('vs_subscription_trial_days');
      const trialDaysNum = trialDays ? Number(trialDays) : NaN;
      if (Number.isFinite(trialDaysNum) && trialDaysNum > 0) this.trialDays = trialDaysNum;

      const trial = localStorage.getItem('vs_subscription_trial_started_at');
      this.trialStartedAtMs = trial ? Number(trial) : null;
      if (this.trialStartedAtMs != null && !Number.isFinite(this.trialStartedAtMs)) this.trialStartedAtMs = null;

      const paidUntil = localStorage.getItem('vs_subscription_paid_until');
      this.paidUntilMs = paidUntil ? Number(paidUntil) : null;
      if (this.paidUntilMs != null && !Number.isFinite(this.paidUntilMs)) this.paidUntilMs = null;

      const plan = localStorage.getItem('vs_subscription_plan_months');
      const planNum = plan ? Number(plan) : NaN;

      const planId = localStorage.getItem('vs_subscription_plan_id');
      const planIdNum = planId ? Number(planId) : NaN;
      if (Number.isFinite(planIdNum)) this.selectedPlanId = planIdNum;

      // Backward compatibility: if only months stored, we will map after plans load.
      if (planNum === 3 || planNum === 6 || planNum === 12) {
        // no-op here; mapping happens once plans are fetched
      }
    } catch {
      /* ignore */
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
        // eslint-disable-next-line no-console
        console.error('Failed to load plans', err);
        this.plans = [];
        this.isLoadingPlans = false;
        await this.presentToast('Failed to load subscription plans.', 'danger');
      },
    });
  }

  private ensureSelectedPlan(): void {
    if (this.selectedPlanId && this.selectedPlan) return;

    // Try mapping old `vs_subscription_plan_months` -> durationDays
    let desiredDays: number | null = null;
    try {
      const planMonths = Number(localStorage.getItem('vs_subscription_plan_months'));
      if (planMonths === 3) desiredDays = 90;
      if (planMonths === 6) desiredDays = 180;
      if (planMonths === 12) desiredDays = 365;
    } catch {
      /* ignore */
    }

    const byDays = desiredDays != null ? this.plans.find(p => Number(p.durationDays) === desiredDays) : null;
    const best = this.pickBestPlan(this.plans);
    const selected = byDays || best || this.plans[0] || null;

    this.selectedPlanId = selected?.id ?? null;
    if (this.selectedPlanId != null) {
      try {
        localStorage.setItem('vs_subscription_plan_id', String(this.selectedPlanId));
      } catch {
        /* ignore */
      }
    }
  }

  private pickBestPlan(plans: Plan[]): Plan | null {
    if (!plans?.length) return null;
    return [...plans].sort((a, b) => (Number(b.durationDays) || 0) - (Number(a.durationDays) || 0))[0] || null;
  }

  onPrimaryCta(): void {
    if (this.isAdmin) return;
    if (!this.selectedPlan) return;

    const plan = this.selectedPlan;
    const trialAvailable = plan.trialAvailable === true;

    if (!this.trialStartedAtMs && trialAvailable) {
      const now = Date.now();
      this.trialStartedAtMs = now;
      this.trialDays = Number(plan.trialDurationDays) > 0 ? Number(plan.trialDurationDays) : this.trialDays;
      try {
        localStorage.setItem('vs_subscription_trial_started_at', String(now));
        localStorage.setItem('vs_subscription_trial_days', String(this.trialDays));
        localStorage.setItem('vs_subscription_active', '1');
        localStorage.setItem('vs_subscription_plan_id', String(plan.id));
        localStorage.setItem('vs_subscription_plan_name', String(plan.name));
      } catch {
        /* ignore */
      }
      this.router.navigateByUrl('/profile', { replaceUrl: true });
      return;
    }

    if (!this.isTrialActive) {
      this.subscribeNow();
    }
  }

  selectPlan(plan: Plan): void {
    this.selectedPlanId = plan?.id ?? null;
    try {
      if (this.selectedPlanId != null) localStorage.setItem('vs_subscription_plan_id', String(this.selectedPlanId));
    } catch {
      /* ignore */
    }
  }

  subscribeNow(): void {
    if (this.isAdmin) return;
    const plan = this.selectedPlan;
    if (!plan) return;
    const now = Date.now();
    const paidUntil = now + Number(plan.durationDays) * 24 * 60 * 60 * 1000;
    this.paidUntilMs = paidUntil;
    try {
      localStorage.setItem('vs_subscription_paid_until', String(paidUntil));
      localStorage.setItem('vs_subscription_active', '1');
      localStorage.setItem('vs_subscription_plan_id', String(plan.id));
      localStorage.setItem('vs_subscription_plan_name', String(plan.name));
      localStorage.setItem('vs_subscription_plan_days', String(plan.durationDays));

      const months = this.monthsFromDurationDays(plan.durationDays);
      if (months) localStorage.setItem('vs_subscription_plan_months', String(months));
    } catch {
      /* ignore */
    }
    this.router.navigateByUrl('/profile', { replaceUrl: true });
  }

  isBestPlan(plan: Plan): boolean {
    const best = this.pickBestPlan(this.plans);
    return !!best && best.id === plan?.id;
  }

  private monthsFromDurationDays(days: number): 3 | 6 | 12 | null {
    const d = Number(days);
    if (d === 90) return 3;
    if (d === 180) return 6;
    if (d === 365) return 12;
    return null;
  }

  daysLeftInTrial(): number {
    if (!this.trialStartedAtMs) return 0;
    const end = this.trialStartedAtMs + this.trialDays * 24 * 60 * 60 * 1000;
    const leftMs = Math.max(0, end - Date.now());
    return Math.max(0, Math.ceil(leftMs / (24 * 60 * 60 * 1000)));
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
