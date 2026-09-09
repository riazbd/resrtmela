/**
 * Where the guest's money actually goes.
 *
 * A payment gateway is an adapter, not an architecture. Which one is in use
 * should change one configured name — not the booking code, not the intent
 * table, not the webhook handler's shape.
 *
 * SSLCommerz is the one that matters here: a single integration covers bKash,
 * Nagad, Rocket and cards in Bangladesh, which is why it beats integrating
 * each wallet separately. It stays inert until a merchant account exists,
 * because that account is the owner's to open — and until then the mock
 * gateway keeps working exactly as it did, so the flow can be built, tested
 * and demonstrated without one.
 */

export interface CheckoutRequest {
  providerRef: string;
  amount: number;
  currency: string;
  method: "BKASH" | "NAGAD" | "CARD" | "BANK";
  bookingCode: string;
  resortName: string;
  guest: { name: string; email?: string | null; phone?: string | null };
  /** where the gateway sends the guest back to */
  returnUrl: string;
  /** where the gateway posts the result, server to server */
  callbackUrl: string;
}

export interface CheckoutSession {
  /** where to send the guest's browser */
  checkoutUrl: string;
  /** the gateway's own id for this session, when it issues one */
  sessionRef?: string;
}

export interface GatewayCallback {
  providerRef: string;
  trxId: string;
  amount: number;
  status: "paid" | "failed";
}

export interface PaymentGateway {
  readonly name: string;
  readonly configured: boolean;
  checkout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Turns whatever the gateway posted into the one shape the rest of the
   * system understands — and, crucially, verifies it came from the gateway.
   */
  parseCallback(body: Record<string, unknown>): Promise<GatewayCallback>;
}

/**
 * The gateway used when no merchant account is configured.
 *
 * Not a stub to be replaced: it is how the flow is developed, demonstrated to
 * a resort owner, and tested. It hosts its own confirm page inside this API.
 */
export class MockGateway implements PaymentGateway {
  readonly name = "mock";
  readonly configured = true;

  async checkout(request: CheckoutRequest): Promise<CheckoutSession> {
    return { checkoutUrl: `/mock-checkout/${request.providerRef}` };
  }

  async parseCallback(body: Record<string, unknown>): Promise<GatewayCallback> {
    return {
      providerRef: String(body.providerRef ?? body.ref ?? ""),
      trxId: String(body.trxId ?? "MOCK"),
      amount: Number(body.amount ?? 0),
      status: body.status === "failed" ? "failed" : "paid",
    };
  }
}

/**
 * SSLCommerz.
 *
 * Credentials come from the environment because they are secrets, not
 * settings: they belong in the deployment, not in a database the super admin
 * browses. Everything else about the integration — which methods are offered,
 * what the guest sees — is already tenant configuration elsewhere.
 *
 * The sandbox and live hosts differ only by subdomain, which is why the flag
 * is a boolean rather than a URL somebody can typo into production.
 */
export class SslCommerzGateway implements PaymentGateway {
  readonly name = "sslcommerz";

  constructor(
    private readonly storeId: string,
    private readonly storePassword: string,
    private readonly live: boolean,
  ) {}

  get configured(): boolean {
    return Boolean(this.storeId && this.storePassword);
  }

  private get host(): string {
    return this.live ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutSession> {
    const form = new URLSearchParams({
      store_id: this.storeId,
      store_passwd: this.storePassword,
      total_amount: request.amount.toFixed(2),
      currency: request.currency,
      tran_id: request.providerRef,
      success_url: request.returnUrl,
      fail_url: request.returnUrl,
      cancel_url: request.returnUrl,
      ipn_url: request.callbackUrl,
      cus_name: request.guest.name,
      cus_email: request.guest.email || "guest@example.com",
      cus_phone: request.guest.phone || "",
      // SSLCommerz rejects a session with empty address fields, and a resort
      // booking has no shipping: the documented value for "not shipped" is 'NO'
      shipping_method: "NO",
      product_name: `${request.resortName} — ${request.bookingCode}`,
      product_category: "accommodation",
      product_profile: "travel-vertical",
    });

    const res = await fetch(`${this.host}/gwprocess/v4/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = (await res.json()) as { status?: string; GatewayPageURL?: string; failedreason?: string; sessionkey?: string };
    if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
      throw Object.assign(new Error(`Payment gateway refused the session: ${data.failedreason ?? data.status ?? "unknown"}`), {
        status: 502,
      });
    }
    return { checkoutUrl: data.GatewayPageURL, sessionRef: data.sessionkey };
  }

  /**
   * A gateway callback is an unauthenticated POST from the public internet.
   *
   * Anyone can send one claiming a booking is paid, so the posted values are
   * never trusted: the transaction is re-read from SSLCommerz's own validation
   * endpoint using the store credentials, and only that answer is believed.
   */
  async parseCallback(body: Record<string, unknown>): Promise<GatewayCallback> {
    const providerRef = String(body.tran_id ?? "");
    const valId = String(body.val_id ?? "");
    if (!providerRef || !valId) {
      throw Object.assign(new Error("Malformed gateway callback"), { status: 400 });
    }

    const url = new URL(`${this.host}/validator/api/validationserverAPI.php`);
    url.searchParams.set("val_id", valId);
    url.searchParams.set("store_id", this.storeId);
    url.searchParams.set("store_passwd", this.storePassword);
    url.searchParams.set("format", "json");

    const res = await fetch(url);
    const data = (await res.json()) as {
      status?: string;
      tran_id?: string;
      amount?: string;
      bank_tran_id?: string;
    };

    // VALID / VALIDATED are both success; anything else is not paid
    const ok = data.status === "VALID" || data.status === "VALIDATED";
    if (data.tran_id && data.tran_id !== providerRef) {
      throw Object.assign(new Error("Gateway callback does not match its transaction"), { status: 400 });
    }
    return {
      providerRef,
      trxId: data.bank_tran_id ?? valId,
      amount: Number(data.amount ?? 0),
      status: ok ? "paid" : "failed",
    };
  }
}

/**
 * The gateway this deployment uses.
 *
 * Falls back to the mock rather than throwing: a platform with no merchant
 * account should still take bookings, and a resort should still be able to
 * walk through the payment flow before the account exists.
 */
/**
 * Nest injection token for the gateway.
 *
 * `PaymentGateway` is an interface, so it does not exist at runtime and Nest
 * has nothing to resolve a constructor parameter typed with it — it injects
 * `undefined` and the whole application fails to boot. A default parameter
 * value does not save it: Nest resolves every parameter itself and never falls
 * back to the default. The tests build this service by hand, so nothing caught
 * it until the API booted on a real server.
 */
export const PAYMENT_GATEWAY = "PAYMENT_GATEWAY";

export function gatewayFromEnv(env: NodeJS.ProcessEnv = process.env): PaymentGateway {
  const ssl = new SslCommerzGateway(
    env.SSLCOMMERZ_STORE_ID ?? "",
    env.SSLCOMMERZ_STORE_PASSWORD ?? "",
    env.SSLCOMMERZ_LIVE === "1",
  );
  return ssl.configured ? ssl : new MockGateway();
}
