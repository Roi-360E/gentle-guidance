import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      return jsonResponse({ error: "Payment provider not configured" }, 500);
    }

    const body = await req.json();
    const { cardToken, selectedPlan, payerEmail, identificationType, identificationNumber } = body;

    if (!cardToken || !selectedPlan) {
      return jsonResponse({ error: "Missing cardToken or selectedPlan" }, 400);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Validate that the plan exists
    const { data: planData, error: planError } = await adminClient
      .from("subscription_plans")
      .select("plan_key, name, price, tokens")
      .eq("plan_key", selectedPlan)
      .eq("is_active", true)
      .single();

    if (planError || !planData || planData.price <= 0) {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }

    // Check if user already has a subscription
    const { data: existingSub } = await adminClient
      .from("user_subscriptions")
      .select("id, status")
      .eq("user_id", userId)
      .single();

    if (existingSub) {
      return jsonResponse({ error: "Subscription already exists" }, 409);
    }

    // 1. Create or find Mercado Pago customer
    const email = payerEmail || userEmail;
    
    const searchRes = await fetch(
      `https://api.mercadopago.com/v1/customers/search?email=${encodeURIComponent(email)}`,
      { headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` } }
    );
    const searchData = await searchRes.json();
    
    let customerId: string;
    
    if (searchData.results?.length > 0) {
      customerId = searchData.results[0].id;
    } else {
      const createRes = await fetch("https://api.mercadopago.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          identification: identificationType && identificationNumber ? {
            type: identificationType,
            number: identificationNumber,
          } : undefined,
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error("Failed to create MP customer:", errText);
        return jsonResponse({ error: "Failed to create payment customer" }, 500);
      }

      const customerData = await createRes.json();
      customerId = customerData.id;
    }

    // 2. Charge immediately using card token
    const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;
    const chargePayload = {
      transaction_amount: Number(planData.price),
      token: cardToken,
      description: `Plano ${planData.name} - EscalaXPro`,
      installments: 1,
      payer: {
        email,
        identification: identificationType && identificationNumber ? {
          type: identificationType,
          number: identificationNumber,
        } : undefined,
      },
      notification_url: webhookUrl,
    };

    const chargeRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `signup-${userId}-${Date.now()}`,
      },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeRes.json();
    console.log(`[save-card] Charge result for user ${userId}: status=${chargeData.status}`);

    if (chargeData.status !== "approved") {
      return jsonResponse({ 
        error: `Pagamento não aprovado: ${chargeData.status_detail || chargeData.status}. Verifique os dados do cartão.` 
      }, 400);
    }

    // 3. Save card to customer for future recurring charges
    const saveCardRes = await fetch(`https://api.mercadopago.com/v1/customers/${customerId}/cards`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: cardToken }),
    });

    let cardId = null;
    if (saveCardRes.ok) {
      const savedCard = await saveCardRes.json();
      cardId = savedCard.id;
    } else {
      console.warn("[save-card] Could not save card for recurring, but initial payment was approved");
    }

    // 4. Create subscription record - ACTIVE immediately (paid)
    const nextChargeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: subError } = await adminClient
      .from("user_subscriptions")
      .insert({
        user_id: userId,
        selected_plan: selectedPlan,
        status: "active",
        trial_ends_at: new Date().toISOString(),
        mp_customer_id: customerId,
        mp_card_id: cardId,
        next_charge_at: nextChargeAt,
        last_charge_at: new Date().toISOString(),
        charge_attempts: 0,
      });

    if (subError) {
      console.error("Failed to create subscription:", subError);
      return jsonResponse({ error: "Failed to create subscription" }, 500);
    }

    // 5. Create payment record
    await adminClient
      .from("payments")
      .insert({
        user_id: userId,
        plan: selectedPlan,
        amount: planData.price,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        pix_tx_id: String(chargeData.id),
      });

    // 6. Grant access - set user plan in video_usage
    const monthYear = new Date().toISOString().slice(0, 7);
    const { data: existingUsage } = await adminClient
      .from("video_usage")
      .select("id")
      .eq("user_id", userId)
      .eq("month_year", monthYear)
      .single();

    if (existingUsage) {
      await adminClient
        .from("video_usage")
        .update({ plan: selectedPlan, token_balance: planData.tokens })
        .eq("id", existingUsage.id);
    } else {
      await adminClient
        .from("video_usage")
        .insert({
          user_id: userId,
          month_year: monthYear,
          plan: selectedPlan,
          video_count: 0,
          token_balance: planData.tokens,
        });
    }

    console.log(`[save-card] ✅ Payment approved and plan activated for user ${userId}, plan ${selectedPlan}`);

    return jsonResponse({
      success: true,
      selectedPlan,
    });

  } catch (e) {
    console.error("save-card error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
