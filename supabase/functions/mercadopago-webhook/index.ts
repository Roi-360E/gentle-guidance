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
    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      console.error("MERCADOPAGO_ACCESS_TOKEN not configured");
      return jsonResponse({ error: "Server misconfigured" }, 500);
    }

    // Use service role to update payments
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Mercado Pago sends notifications via query params or body
    const url = new URL(req.url);
    let topic = url.searchParams.get("topic") || url.searchParams.get("type");
    let resourceId = url.searchParams.get("id");

    // Also check body for IPN v2
    if (!topic || !resourceId) {
      try {
        const body = await req.json();
        topic = body.type || body.topic || topic;
        resourceId = body.data?.id ? String(body.data.id) : resourceId;
      } catch {
        // body might be empty
      }
    }

    console.log(`[MP Webhook] Received: topic=${topic}, id=${resourceId}`);

    // We only care about payment notifications
    if (topic !== "payment" && topic !== "merchant_order") {
      return jsonResponse({ received: true });
    }

    if (!resourceId) {
      return jsonResponse({ error: "No resource ID" }, 400);
    }

    // If it's a merchant_order, fetch the order to get payment IDs
    if (topic === "merchant_order") {
      const orderRes = await fetch(`https://api.mercadopago.com/merchant_orders/${resourceId}`, {
        headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
      });
      if (!orderRes.ok) {
        console.error("Failed to fetch merchant order:", await orderRes.text());
        return jsonResponse({ received: true });
      }
      const order = await orderRes.json();
      
      // Process each payment in the order
      for (const payment of (order.payments || [])) {
        if (payment.status === "approved") {
          await processApprovedPayment(supabase, MP_ACCESS_TOKEN, String(payment.id));
        }
      }
      return jsonResponse({ received: true });
    }

    // Direct payment notification
    await processApprovedPayment(supabase, MP_ACCESS_TOKEN, resourceId);

    return jsonResponse({ received: true });
  } catch (e) {
    console.error("mercadopago-webhook error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function processApprovedPayment(
  supabase: ReturnType<typeof createClient>,
  accessToken: string,
  mpPaymentId: string
) {
  // Fetch payment details from Mercado Pago
  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!paymentRes.ok) {
    console.error(`Failed to fetch payment ${mpPaymentId}:`, await paymentRes.text());
    return;
  }

  const mpPayment = await paymentRes.json();
  console.log(`[MP Webhook] Payment ${mpPaymentId}: status=${mpPayment.status}, ref=${mpPayment.external_reference}`);

  if (mpPayment.status !== "approved") {
    console.log(`[MP Webhook] Payment ${mpPaymentId} not approved (${mpPayment.status}), skipping`);
    return;
  }

  const internalPaymentId = mpPayment.external_reference;
  if (!internalPaymentId) {
    console.error(`[MP Webhook] Payment ${mpPaymentId} has no external_reference`);
    return;
  }

  // Get our internal payment record
  const { data: payment, error: fetchErr } = await supabase
    .from("payments")
    .select("*")
    .eq("id", internalPaymentId)
    .single();

  if (fetchErr || !payment) {
    console.error(`[MP Webhook] Payment record not found: ${internalPaymentId}`, fetchErr);
    return;
  }

  if (payment.status === "confirmed") {
    console.log(`[MP Webhook] Payment ${internalPaymentId} already confirmed, skipping`);
    return;
  }

  // Confirm the payment
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("payments")
    .update({
      status: "confirmed",
      confirmed_at: now,
      pix_tx_id: String(mpPaymentId),
    })
    .eq("id", internalPaymentId);

  if (updateErr) {
    console.error(`[MP Webhook] Failed to confirm payment:`, updateErr);
    return;
  }

  // Update user's plan in video_usage
  const monthYear = new Date().toISOString().substring(0, 7); // YYYY-MM
  
  // Check if usage record exists
  const { data: existing } = await supabase
    .from("video_usage")
    .select("*")
    .eq("user_id", payment.user_id)
    .eq("month_year", monthYear)
    .single();

  // Define token allocation per plan
  const planTokens: Record<string, number> = {
    professional: 200,
    enterprise: 999999, // unlimited
  };
  const newTokens = planTokens[payment.plan] || 50;

  if (existing) {
    // Renew: reset token balance + video count for the new billing cycle
    await supabase
      .from("video_usage")
      .update({
        plan: payment.plan,
        token_balance: newTokens,
        video_count: 0,
      })
      .eq("id", existing.id);
  } else {
    await supabase
      .from("video_usage")
      .insert({
        user_id: payment.user_id,
        month_year: monthYear,
        plan: payment.plan,
        video_count: 0,
        token_balance: newTokens,
      });
  }

  console.log(`[MP Webhook] ✅ Payment ${internalPaymentId} confirmed! Plan: ${payment.plan} for user: ${payment.user_id}`);
}
