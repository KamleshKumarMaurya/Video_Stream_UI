import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export type RazorpayCheckoutSuccess = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
};

export type RazorpayCheckoutOptions = {
  keyId?: string;
  orderId?: string;
  subscriptionId?: string;
  amount?: number; // paise (required for one-time payment)
  currency?: string;
  name?: string;
  description?: string;
  themeColor?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
};

@Injectable({
  providedIn: 'root',
})
export class RazorpayService {
  private loadingPromise: Promise<void> | null = null;
  private loaded = false;

  async loadSdk(): Promise<void> {
    if (this.loaded && window.Razorpay) return;
    if (this.loadingPromise) return this.loadingPromise;

    const existing = document.getElementById('razorpay-checkout');
    if (existing && window.Razorpay) {
      this.loaded = true;
      return;
    }

    this.loadingPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'razorpay-checkout';
      script.async = true;
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';

      script.onload = () => {
        this.loaded = true;
        resolve();
      };
      script.onerror = () => {
        this.loadingPromise = null;
        reject(new Error('Failed to load Razorpay Checkout.'));
      };

      document.body.appendChild(script);
    });

    return this.loadingPromise;
  }

  async openCheckout(opts: RazorpayCheckoutOptions): Promise<RazorpayCheckoutSuccess> {
    await this.loadSdk();
    if (!window.Razorpay) throw new Error('Razorpay SDK not available.');

    const keyId = opts.keyId || (environment as any)?.razorpayKeyId;
    if (!keyId || String(keyId).includes('YOUR_RAZORPAY_KEY_ID')) {
      throw new Error('Razorpay key id not configured (environment.razorpayKeyId).');
    }

    const isSubscription = !!opts.subscriptionId;
    const amount = Number(opts.amount);
    if (!isSubscription) {
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid amount.');
    }

    const currency = (opts.currency || (environment as any)?.razorpayCurrency || 'INR') as string;

    return new Promise<RazorpayCheckoutSuccess>((resolve, reject) => {
      const options: any = {
        key: String(keyId),
        currency,
        name: opts.name || 'VideoStory',
        description: opts.description,
        prefill: opts.prefill,
        notes: opts.notes,
        theme: { color: opts.themeColor || '#0C001C' },
        modal: {
          ondismiss: () => reject(new Error('Checkout closed.')),
        },
        handler: (response: RazorpayCheckoutSuccess) => resolve(response),
      };

      if (opts.orderId) options.order_id = opts.orderId;
      if (opts.subscriptionId) options.subscription_id = opts.subscriptionId;
      if (!isSubscription) options.amount = Math.round(amount);
      const instance = new window.Razorpay(options);
      instance.on('payment.failed', (resp: any) => {
        const msg = resp?.error?.description || resp?.error?.reason || 'Payment failed.';
        reject(new Error(String(msg)));
      });

      try {
        instance.open();
      } catch (e) {
        reject(e);
      }
    });
  }
}
