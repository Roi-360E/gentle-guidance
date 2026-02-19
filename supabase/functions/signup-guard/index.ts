import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Disposable email domains (subset for server-side validation)
const DISPOSABLE_DOMAINS = [
  "guerrillamail.com","guerrillamail.net","tempmail.com","temp-mail.org",
  "10minutemail.com","throwaway.email","mailinator.com","yopmail.com",
  "sharklasers.com","grr.la","pokemail.net","trashmail.com","trashmail.net",
  "dispostable.com","maildrop.cc","getnada.com","mohmal.com","fakeinbox.com",
  "emailondeck.com","emailfake.com","burnermail.io","dropmail.me","getairmail.com",
  "mailnesia.com","tempinbox.com","discardmail.com","harakirimail.com",
  "mailexpire.com","tempmailer.com","spamgourmet.com","mailcatch.com",
  "jetable.org","mintemail.com","wegwerfmail.de","mailnull.com",
  "deadaddress.com","spamfree24.org","mailsac.com","guerrillamailblock.com",
  "spam4.me","crazymailing.com","mytemp.email","discard.email",
  "temp-mail.io","nada.email","nada.ltd","crazy.email",
];

const TRUSTED_DOMAINS = [
  "gmail.com","googlemail.com","outlook.com","outlook.com.br",
  "hotmail.com","hotmail.com.br","live.com","live.com.br","msn.com",
  "yahoo.com","yahoo.com.br","ymail.com",
  "icloud.com","me.com","mac.com",
  "protonmail.com","proton.me","pm.me",
  "uol.com.br","bol.com.br","terra.com.br","ig.com.br",
  "globo.com","globomail.com","r7.com",
  "zoho.com","zohomail.com","aol.com","mail.com",
  "gmx.com","gmx.net","fastmail.com","fastmail.fm",
  "tutanota.com","tuta.io",
];

const MAX_SIGNUPS_PER_IP_PER_DAY = 2;
const MAX_ACCOUNTS_PER_FINGERPRINT = 1;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, fingerprint, cpfHash } = body;

    if (!email) {
      return new Response(
        JSON.stringify({ allowed: false, reason: "Email é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const domain = email.split("@")[1]?.toLowerCase();

    // 1. Check disposable domain
    if (!domain || DISPOSABLE_DOMAINS.includes(domain)) {
      return new Response(
        JSON.stringify({ allowed: false, reason: "Emails temporários não são permitidos. Use Gmail, Outlook ou outro provedor confiável." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check whitelist
    if (!TRUSTED_DOMAINS.includes(domain)) {
      return new Response(
        JSON.stringify({ allowed: false, reason: "Provedor de email não aceito. Use Gmail, Outlook, Yahoo, iCloud ou outro provedor confiável." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client IP
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || 
               req.headers.get("cf-connecting-ip") || 
               "unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Check fingerprint limit
    if (fingerprint) {
      const { count: fpCount } = await supabase
        .from("signup_guards")
        .select("*", { count: "exact", head: true })
        .eq("device_fingerprint", fingerprint);

      if (fpCount !== null && fpCount >= MAX_ACCOUNTS_PER_FINGERPRINT) {
        return new Response(
          JSON.stringify({ allowed: false, reason: "Limite de contas por dispositivo atingido. Cada dispositivo permite apenas 1 conta." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Check IP cooldown (max 2 signups per IP per 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: ipCount } = await supabase
      .from("signup_guards")
      .select("*", { count: "exact", head: true })
      .eq("ip_address", ip)
      .gte("created_at", oneDayAgo);

    if (ipCount !== null && ipCount >= MAX_SIGNUPS_PER_IP_PER_DAY) {
      return new Response(
        JSON.stringify({ allowed: false, reason: "Muitos cadastros recentes deste endereço. Tente novamente em 24 horas." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Check CPF uniqueness
    if (cpfHash) {
      const { data: existingCpf } = await supabase
        .from("profiles")
        .select("id")
        .eq("cpf_hash", cpfHash)
        .maybeSingle();

      if (existingCpf) {
        return new Response(
          JSON.stringify({ allowed: false, reason: "Este CPF já está vinculado a uma conta existente." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // All checks passed — record the signup attempt
    await supabase.from("signup_guards").insert({
      ip_address: ip,
      device_fingerprint: fingerprint || null,
      email_domain: domain,
    });

    return new Response(
      JSON.stringify({ allowed: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("signup-guard error:", error);
    return new Response(
      JSON.stringify({ allowed: false, reason: "Erro ao validar cadastro. Tente novamente." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
