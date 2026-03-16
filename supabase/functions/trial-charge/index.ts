import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      return jsonResponse({ error: "Payment provider not configured" }, 500);
    }

    const now = new Date().toISOString();

    // Find subscriptions due for charging (pending_charge after first use, or recurring active)
    const { data: dueSubscriptions, error: fetchErr } = await supabase
      .from("user_subscriptions")
      .select("*")
      .in("status", ["pending_charge", "active"])
      .lte("next_charge_at", now)
      .not("mp_customer_id", "is", null)
      .not("mp_card_id", "is", null);

    if (fetchErr) {
      console.error("Failed to fetch due subscriptions:", fetchErr);
      return jsonResponse({ error: "Failed to fetch subscriptions" }, 500);
    }

    console.log(`[trial-charge] Found ${dueSubscriptions?.length || 0} subscriptions to process`);

    const results: any[] = [];

    for (const sub of (dueSubscriptions || [])) {
      try {
        // Get plan price
        const { data: planData } = await supabase
          .from("subscription_plans")
          .select("plan_key, name, price, tokens")
          .eq("plan_key", sub.selected_plan)
          .eq("is_active", true)
          .single();

        if (!planData || planData.price <= 0) {
          console.error(`[trial-charge] Invalid plan ${sub.selected_plan} for user ${sub.user_id}`);
          continue;
        }

        // Get customer's saved cards
        const cardsRes = await fetch(
          `https://api.mercadopago.com/v1/customers/${sub.mp_customer_id}/cards`,
          { headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` } }
        );

        if (!cardsRes.ok) {
          console.error(`[trial-charge] Failed to get cards for customer ${sub.mp_customer_id}`);
          await blockSubscription(supabase, sub);
          results.push({ userId: sub.user_id, status: "blocked", reason: "no_cards" });
          continue;
        }

        const cards = await cardsRes.json();
        const savedCard = cards.find((c: any) => c.id === sub.mp_card_id) || cards[0];

        if (!savedCard) {
          console.error(`[trial-charge] No saved card for user ${sub.user_id}`);
          await blockSubscription(supabase, sub);
          results.push({ userId: sub.user_id, status: "blocked", reason: "no_card" });
          continue;
        }

        // Create payment record
        const { data: payment } = await supabase
          .from("payments")
          .insert({
            user_id: sub.user_id,
            plan: sub.selected_plan,
            amount: planData.price,
            status: "pending",
          })
          .select()
          .single();

        if (!payment) {
          console.error(`[trial-charge] Failed to create payment for user ${sub.user_id}`);
          continue;
        }

        // Charge using saved card
        const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;
        const chargePayload = {
          transaction_amount: Number(planData.price),
          token: savedCard.id,
          description: `Plano ${planData.name} - Recorrente - Escala de Criativo`,
          installments: 1,
          payment_method_id: savedCard.payment_method?.id || savedCard.payment_method_id,
          payer: {
            id: sub.mp_customer_id,
            type: "customer",
          },
          external_reference: payment.id,
          notification_url: webhookUrl,
        };

        const chargeRes = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": `recurring-${sub.id}-${new Date().toISOString().slice(0, 10)}`,
          },
          body: JSON.stringify(chargePayload),
        });

        const chargeData = await chargeRes.json();
        console.log(`[trial-charge] Charge result for user ${sub.user_id}: status=${chargeData.status}`);

        if (chargeData.status === "approved") {
          // Payment approved - activate/renew subscription
          const nextChargeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

          await supabase
            .from("user_subscriptions")
            .update({
              status: "active",
              last_charge_at: new Date().toISOString(),
              next_charge_at: nextChargeAt,
              charge_attempts: 0,
            })
            .eq("id", sub.id);

          // Confirm payment
          await supabase
            .from("payments")
            .update({
              status: "confirmed",
              confirmed_at: new Date().toISOString(),
              pix_tx_id: String(chargeData.id),
            })
            .eq("id", payment.id);

          // Renew tokens
          const monthYear = new Date().toISOString().slice(0, 7);
          const ttsCredits = sub.selected_plan === "unlimited" ? 1000 : 0;

          const { data: existingUsage } = await supabase
            .from("video_usage")
            .select("id")
            .eq("user_id", sub.user_id)
            .eq("month_year", monthYear)
            .single();

          if (existingUsage) {
            await supabase
              .from("video_usage")
              .update({
                plan: sub.selected_plan,
                token_balance: planData.tokens,
                video_count: 0,
                tts_credits: ttsCredits,
              })
              .eq("id", existingUsage.id);
          } else {
            await supabase
              .from("video_usage")
              .insert({
                user_id: sub.user_id,
                month_year: monthYear,
                plan: sub.selected_plan,
                video_count: 0,
                token_balance: planData.tokens,
                tts_credits: ttsCredits,
              });
          }

          results.push({ userId: sub.user_id, status: "charged", plan: sub.selected_plan });
          console.log(`[trial-charge] ✅ User ${sub.user_id} charged successfully for plan ${sub.selected_plan}`);

        } else {
          // Payment failed - block immediately
          await supabase
            .from("payments")
            .update({ status: "failed", pix_tx_id: String(chargeData.id || "") })
            .eq("id", payment.id);

          await blockSubscription(supabase, sub);
          results.push({ userId: sub.user_id, status: "blocked", reason: chargeData.status_detail || chargeData.status });
          console.log(`[trial-charge] ❌ User ${sub.user_id} charge failed: ${chargeData.status_detail}`);
        }

      } catch (err) {
        console.error(`[trial-charge] Error processing user ${sub.user_id}:`, err);
        results.push({ userId: sub.user_id, status: "error", reason: String(err) });
      }
    }

    return jsonResponse({ processed: results.length, results });

  } catch (e) {
    console.error("trial-charge error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function blockSubscription(supabase: any, sub: any) {
  // Block subscription
  await supabase
    .from("user_subscriptions")
    .update({
      status: "blocked",
      charge_attempts: (sub.charge_attempts || 0) + 1,
    })
    .eq("id", sub.id);

  // Downgrade to free plan
  const monthYear = new Date().toISOString().slice(0, 7);
  await supabase
    .from("video_usage")
    .update({ plan: "free", token_balance: 0 })
    .eq("user_id", sub.user_id)
    .eq("month_year", monthYear);

  console.log(`[trial-charge] 🚫 User ${sub.user_id} blocked - payment failed`);
}
