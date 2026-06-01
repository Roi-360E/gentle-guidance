import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[stripe-checkout] ${s}${d ? ` ${JSON.stringify(d)}` : ""}`);

type CheckoutCurrency = "eur" | "usd";

const toCheckoutCurrency = (value: unknown): CheckoutCurrency => {
  const currency = typeof value === "string" ? value.toLowerCase() : "eur";
  if (currency !== "eur" && currency !== "usd") {
    throw new Error("Currency must be EUR or USD");
  }
  return currency;
};

const centsFromPrice = (value: unknown, currency: CheckoutCurrency): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Plan has no ${currency.toUpperCase()} price configured`);
  }
  return Math.round(amount * 100);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !userData.user?.email) throw new Error("Not authenticated");
    const user = userData.user;
    log("user", { id: user.id, email: user.email });

    // Parse body
    const { plan_key, currency: rawCurrency } = await req.json();
    if (!plan_key || typeof plan_key !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(plan_key)) {
      throw new Error("plan_key required");
    }
    const currency = toCheckoutCurrency(rawCurrency);

    // Service client for DB writes
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Load plan
    const { data: plan, error: planErr } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("plan_key", plan_key)
      .eq("is_active", true)
      .single();
    if (planErr || !plan) throw new Error("Plan not found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ===== Lazy sync: ensure Stripe product + price match current DB price =====
    const configuredPrice = currency === "eur" ? plan.price_eur : plan.price_usd;
    const currentAmountCents = centsFromPrice(configuredPrice, currency);
    const currentPrice = Number(configuredPrice);
    let productId: string | null = plan.stripe_product_id ?? null;
    let priceId: string | null = null;

    // Create product if missing
    if (!productId) {
      const product = await stripe.products.create({
        name: plan.name,
        metadata: { plan_key: plan.plan_key, plan_id: plan.id },
      });
      productId = product.id;
      log("created product", { productId });
    } else {
      // Keep product name in sync
      try {
        await stripe.products.update(productId, { name: plan.name });
      } catch (e) {
        log("product update failed (continuing)", { e: String(e) });
      }
    }

    // Reuse an active monthly Stripe price for the selected currency/amount, or create one.
    const existingPrices = await stripe.prices.list({
      product: productId,
      currency,
      active: true,
      limit: 100,
    });

    priceId = existingPrices.data.find((price) =>
      price.unit_amount === currentAmountCents &&
      price.currency === currency &&
      price.recurring?.interval === "month"
    )?.id ?? null;

    if (!priceId) {
      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: currentAmountCents,
        currency,
        recurring: { interval: "month" },
        metadata: { plan_key: plan.plan_key, currency },
      });
      priceId = newPrice.id;
      log("created price", { priceId, currentPrice, currency });
    }

    const planUpdate: Record<string, unknown> = { stripe_product_id: productId };
    if (currency === "eur") {
      planUpdate.stripe_price_id = priceId;
      planUpdate.stripe_synced_price_eur = currentPrice;
    }

    await admin.from("subscription_plans").update(planUpdate).eq("id", plan.id);
    log("price ready", { priceId, currentPrice, currency });

    // Find or create Stripe customer for this user
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = req.headers.get("origin") || "https://dear-data-wrangler.lovable.app";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/obrigado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/planos`,
      metadata: { user_id: user.id, plan_key: plan.plan_key, currency },
    });

    log("session created", { id: session.id });
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
