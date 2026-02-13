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
      return jsonResponse({ error: "MERCADOPAGO_ACCESS_TOKEN not configured" }, 500);
    }

    const body = await req.json();
    const { plan, paymentMethod } = body as { plan: string; paymentMethod?: string };

    const plans: Record<string, { title: string; price: number }> = {
      professional: { title: "Plano Profissional - Escala de Criativo", price: 97.00 },
      enterprise: { title: "Plano Empresarial - Escala de Criativo", price: 297.00 },
    };

    const selectedPlan = plans[plan];
    if (!selectedPlan) {
      return jsonResponse({ error: "Invalid plan" }, 400);
    }

    // Create payment record in pending status
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        plan,
        amount: selectedPlan.price,
        status: "pending",
      })
      .select()
      .single();

    if (paymentError) {
      console.error("Payment insert error:", paymentError);
      return jsonResponse({ error: "Failed to create payment record" }, 500);
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

    // If user wants Pix specifically, create a Pix payment directly
    if (paymentMethod === "pix") {
      const pixPayload = {
        transaction_amount: selectedPlan.price,
        description: selectedPlan.title,
        payment_method_id: "pix",
        payer: {
          email: userEmail || "cliente@escala.com",
        },
        external_reference: payment.id,
        notification_url: webhookUrl,
      };

      const pixRes = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": payment.id,
        },
        body: JSON.stringify(pixPayload),
      });

      if (!pixRes.ok) {
        const errText = await pixRes.text();
        console.error("MercadoPago Pix error:", errText);
        return jsonResponse({ error: "Failed to create Pix payment", details: errText }, 500);
      }

      const pixData = await pixRes.json();

      // Update payment with MP payment ID
      await supabase.from("payments").update({
        pix_tx_id: String(pixData.id),
      }).eq("id", payment.id);

      return jsonResponse({
        type: "pix",
        paymentId: payment.id,
        mpPaymentId: pixData.id,
        qrCode: pixData.point_of_interaction?.transaction_data?.qr_code,
        qrCodeBase64: pixData.point_of_interaction?.transaction_data?.qr_code_base64,
        ticketUrl: pixData.point_of_interaction?.transaction_data?.ticket_url,
        expiresAt: pixData.date_of_expiration,
      });
    }

    // Otherwise, create a Checkout Pro preference (supports all payment methods)
    const preferencePayload = {
      items: [{
        title: selectedPlan.title,
        quantity: 1,
        unit_price: selectedPlan.price,
        currency_id: "BRL",
      }],
      payer: {
        email: userEmail || "cliente@escala.com",
      },
      external_reference: payment.id,
      notification_url: webhookUrl,
      back_urls: {
        success: `${req.headers.get("origin") || "https://deploysites.online"}?payment=success`,
        failure: `${req.headers.get("origin") || "https://deploysites.online"}?payment=failure`,
        pending: `${req.headers.get("origin") || "https://deploysites.online"}?payment=pending`,
      },
      auto_return: "approved",
    };

    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferencePayload),
    });

    if (!prefRes.ok) {
      const errText = await prefRes.text();
      console.error("MercadoPago preference error:", errText);
      return jsonResponse({ error: "Failed to create checkout", details: errText }, 500);
    }

    const prefData = await prefRes.json();

    return jsonResponse({
      type: "checkout",
      paymentId: payment.id,
      initPoint: prefData.init_point,
      sandboxInitPoint: prefData.sandbox_init_point,
    });

  } catch (e) {
    console.error("mercadopago-checkout error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
