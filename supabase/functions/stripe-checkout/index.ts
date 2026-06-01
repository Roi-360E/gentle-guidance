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
    const { plan_key } = await req.json();
    if (!plan_key || typeof plan_key !== "string") throw new Error("plan_key required");

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
    if (!plan.price_eur || Number(plan.price_eur) <= 0)
      throw new Error("Plan has no EUR price configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // ===== Lazy sync: ensure Stripe product + price match current DB price =====
    const currentPriceEur = Number(plan.price_eur);
    const currentAmountCents = Math.round(currentPriceEur * 100);
    let productId: string | null = plan.stripe_product_id ?? null;
    let priceId: string | null = plan.stripe_price_id ?? null;
    const syncedPrice = plan.stripe_synced_price_eur != null
      ? Number(plan.stripe_synced_price_eur)
      : null;

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

    // Create or rotate price if missing or amount changed
    const priceChanged = syncedPrice == null || syncedPrice !== currentPriceEur;
    if (!priceId || priceChanged) {
      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: currentAmountCents,
        currency: "eur",
        recurring: { interval: "month" },
        metadata: { plan_key: plan.plan_key },
      });

      // Archive the old one
      if (priceId && priceId !== newPrice.id) {
        try {
          await stripe.prices.update(priceId, { active: false });
        } catch (e) {
          log("old price archive failed (continuing)", { e: String(e) });
        }
      }
      priceId = newPrice.id;

      await admin
        .from("subscription_plans")
        .update({
          stripe_product_id: productId,
          stripe_price_id: priceId,
          stripe_synced_price_eur: currentPriceEur,
        })
        .eq("id", plan.id);
      log("price synced", { priceId, currentPriceEur });
    }

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
      metadata: { user_id: user.id, plan_key: plan.plan_key },
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
