CREATE TABLE public.admin_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view settings" ON public.admin_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert settings" ON public.admin_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update settings" ON public.admin_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.admin_settings (key, value) VALUES (
  'recovery_agent_prompt',
  'Você é um assistente de vendas amigável e persuasivo da EscalaXPro. Seu objetivo é convencer o cliente a fazer sua primeira recarga. Seja simpático, use o nome do cliente, destaque os benefícios da plataforma e crie urgência. Mantenha a mensagem curta (máximo 3 parágrafos) e adequada para WhatsApp.'
);