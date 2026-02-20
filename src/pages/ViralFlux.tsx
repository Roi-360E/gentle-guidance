import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Zap, Target, MessageSquare, ShieldCheck, Sparkles, BookOpen, Layout, ChevronRight, CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import screenshot1 from "@/assets/viral-flux/screenshot-1.png";
import screenshot2 from "@/assets/viral-flux/screenshot-2.png";
import screenshot3 from "@/assets/viral-flux/screenshot-3.png";
import screenshot4 from "@/assets/viral-flux/screenshot-4.png";
import screenshot5 from "@/assets/viral-flux/screenshot-5.png";
import screenshot6 from "@/assets/viral-flux/screenshot-6.png";
import screenshot7 from "@/assets/viral-flux/screenshot-7.png";

/* ─── helpers ─── */
function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

const glowBtn =
  "relative overflow-hidden bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] text-white font-bold text-lg px-10 py-5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_40px_rgba(139,92,246,.45)] before:absolute before:inset-0 before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent)] before:translate-x-[-200%] hover:before:translate-x-[200%] before:transition-transform before:duration-700";

/* ─── page ─── */
export default function ViralFlux() {
  return (
    <div className="min-h-screen bg-[#050505] text-gray-100 overflow-x-hidden font-['Inter',sans-serif]">
      {/* Grid background */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: "linear-gradient(rgba(139,92,246,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,.06) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* NAV */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#050505]/80 border-b border-white/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-7 w-7 text-[#8B5CF6]" />
            <span className="font-['JetBrains_Mono',monospace] font-bold text-xl tracking-tight bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
              VIRAL FLUX
            </span>
          </div>
          <a href="#oferta">
            <Button className={glowBtn + " !text-sm !px-6 !py-3"}>COMEÇAR AGORA</Button>
          </a>
        </div>
      </nav>

      <div className="relative z-10">
        {/* ═══════ HERO ═══════ */}
        <Section className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-32 md:pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <span className="inline-block mb-6 px-4 py-1.5 rounded-full text-xs font-['JetBrains_Mono',monospace] tracking-widest uppercase bg-[#8B5CF6]/10 text-[#8B5CF6] border border-[#8B5CF6]/20">
              Plataforma #1 em Criativos de Performance
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6">
              Fature 10k multiplicando{" "}
              <span className="bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                seus anúncios
              </span>{" "}
              com a Inteligência do Viral Flux.
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-10 leading-relaxed">
              A ferramenta que transforma 17 roteiros em <strong className="text-white">100+ criativos validados</strong>. Use a lógica de concatenação dos grandes players para escalar no Facebook e TikTok Ads <strong className="text-white">sem esforço</strong>.
            </p>
            <a href="#oferta">
              <Button className={glowBtn}>
                QUERO MEU ACESSO AGORA <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
            <p className="mt-4 text-sm text-gray-500">Seus vídeos ficam prontos em menos de 1 minuto</p>
          </motion.div>

          {/* Hero mockup */}
          <motion.div
            className="mt-16 relative mx-auto max-w-5xl"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.9 }}
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-[#8B5CF6]/20 to-[#06B6D4]/20 blur-3xl rounded-3xl" />
            <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_80px_rgba(139,92,246,.15)]">
              <img src={screenshot1} alt="Viral Flux Dashboard" className="w-full" loading="lazy" />
              {/* Neon pulse overlay */}
              <div className="absolute inset-0 pointer-events-none border-2 border-[#06B6D4]/20 rounded-2xl animate-pulse" />
            </div>
          </motion.div>
        </Section>

        {/* ═══════ PILARES ═══════ */}
        <Section className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-center text-3xl md:text-5xl font-bold mb-4">
            Os 3 Pilares do{" "}
            <span className="bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">Método</span>
          </h2>
          <p className="text-center text-gray-400 mb-16 max-w-2xl mx-auto">
            A estrutura de criativos que os maiores players do mercado usam para escalar campanhas ao máximo.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Target,
                title: "O GANCHO",
                desc: "Interrompa o scroll e prenda a atenção nos primeiros 3 segundos. A nossa IA gera ganchos que param o polegar.",
                color: "#8B5CF6",
              },
              {
                icon: MessageSquare,
                title: "O CORPO",
                desc: "Explicação lógica gerada pela nossa IA para criar desejo imediato. Argumentos calibrados para convencer.",
                color: "#7C3AED",
              },
              {
                icon: Zap,
                title: "O CTA",
                desc: "Chamadas para ação milimetricamente calculadas para conversão. Cada CTA é otimizado para clique.",
                color: "#06B6D4",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.6 }}
                className="group relative rounded-2xl p-8 bg-white/[.02] backdrop-blur-lg border border-white/5 hover:border-[color:var(--c)]/40 transition-all duration-500 hover:shadow-[0_0_40px_var(--c-glow)]"
                style={{ "--c": card.color, "--c-glow": card.color + "25" } as React.CSSProperties}
              >
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-6" style={{ background: card.color + "15" }}>
                  <card.icon className="h-7 w-7" style={{ color: card.color }} />
                </div>
                <h3 className="font-['JetBrains_Mono',monospace] text-xl font-bold mb-3">{card.title}</h3>
                <p className="text-gray-400 leading-relaxed">{card.desc}</p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ═══════ SCREENSHOTS SHOWCASE ═══════ */}
        <Section className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-center text-3xl md:text-5xl font-bold mb-4">
            Veja a <span className="bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">Máquina</span> em Ação
          </h2>
          <p className="text-center text-gray-400 mb-16 max-w-2xl mx-auto">
            De uploads até criativos prontos — tudo automatizado em minutos.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            {[
              { img: screenshot4, label: "Upload de Ganchos, Corpos e CTAs — 10x5x2 = 100 vídeos" },
              { img: screenshot6, label: "Configurações de processamento e geração automática" },
              { img: screenshot3, label: "Combinações geradas e prontas para download" },
              { img: screenshot7, label: "Preview do criativo com legendas automáticas" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
                className="rounded-2xl overflow-hidden border border-white/5 bg-white/[.02] hover:border-[#8B5CF6]/30 transition-all duration-500"
              >
                <img src={item.img} alt={item.label} className="w-full" loading="lazy" />
                <div className="px-6 py-4">
                  <p className="text-sm text-gray-400">{item.label}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Extra: RoteiroPRO IA + full dashboard */}
          <div className="grid md:grid-cols-3 gap-8 mt-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-2xl overflow-hidden border border-white/5 bg-white/[.02] flex items-center justify-center p-8"
            >
              <img src={screenshot5} alt="RoteiroPRO IA — Copywriter com IA" className="max-h-[400px] rounded-xl" loading="lazy" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="md:col-span-2 rounded-2xl overflow-hidden border border-white/5 bg-white/[.02]"
            >
              <img src={screenshot2} alt="Dashboard completo do Viral Flux" className="w-full" loading="lazy" />
              <div className="px-6 py-4">
                <p className="text-sm text-gray-400">Processamento completo com status em tempo real</p>
              </div>
            </motion.div>
          </div>
        </Section>

        {/* ═══════ AUTORIDADE ═══════ */}
        <Section className="max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="relative rounded-2xl p-10 md:p-16 bg-gradient-to-br from-[#8B5CF6]/5 to-[#06B6D4]/5 border border-white/5">
            <Sparkles className="h-10 w-10 text-[#8B5CF6] mx-auto mb-6" />
            <h2 className="text-2xl md:text-4xl font-bold mb-6">
              Desenvolvido por quem entende o{" "}
              <span className="bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                código por trás do lucro
              </span>
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed max-w-2xl mx-auto">
              São <strong className="text-white">10 anos de experiência</strong> em tecnologia condensados em uma ferramenta que resolve a falta de criativos para quem escala sério. Cada linha de código foi pensada para performance e resultado.
            </p>
          </div>
        </Section>

        {/* ═══════ OFERTA ═══════ */}
        <Section className="max-w-4xl mx-auto px-6 py-20" >
          <div id="oferta" className="scroll-mt-24 relative rounded-3xl overflow-hidden">
            <div className="absolute -inset-1 bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] rounded-3xl blur-sm opacity-60" />
            <div className="relative bg-[#0A0A0F] rounded-3xl p-10 md:p-16 border border-white/10">
              <h2 className="text-center text-3xl md:text-5xl font-bold mb-3">
                Sua Escala Infinita por um{" "}
                <span className="bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                  Preço Ridículo
                </span>
              </h2>
              <p className="text-center text-gray-400 mb-12">Acesso completo à plataforma + todos os bônus</p>

              {/* Pricing */}
              <div className="text-center mb-10">
                <p className="text-gray-500 line-through text-2xl mb-2">R$ 497,00</p>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-sm text-gray-400">Apenas</span>
                  <span className="text-6xl md:text-7xl font-extrabold bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                    R$ 67,90
                  </span>
                </div>
                <p className="text-gray-500 mt-2 text-sm">Pagamento único · Acesso vitalício</p>
              </div>

              {/* Bônus */}
              <div className="grid md:grid-cols-3 gap-6 mb-12">
                {[
                  { icon: Sparkles, title: "Gerador de Roteiros Automático", desc: "IA integrada que cria roteiros validados" },
                  { icon: BookOpen, title: "Masterclass de Copywriting", desc: "Aulas com técnicas avançadas de conversão" },
                  { icon: Layout, title: "Template N8N de Automação", desc: "Fluxo pronto para escalar campanhas" },
                ].map((bonus, i) => (
                  <div key={i} className="rounded-xl p-6 bg-white/[.03] border border-white/5">
                    <bonus.icon className="h-8 w-8 text-[#06B6D4] mb-4" />
                    <h4 className="font-bold mb-2">{bonus.title}</h4>
                    <p className="text-sm text-gray-400">{bonus.desc}</p>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="text-center">
                <Button className={glowBtn + " text-xl px-14 py-7"}>
                  QUERO MEU ACESSO AGORA <ChevronRight className="ml-2 h-6 w-6" />
                </Button>
                <div className="flex items-center justify-center gap-6 mt-6 text-sm text-gray-500">
                  <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> Garantia de 7 dias</span>
                  <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> Pagamento seguro</span>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══════ FEATURES LIST ═══════ */}
        <Section className="max-w-4xl mx-auto px-6 py-20">
          <h2 className="text-center text-3xl md:text-4xl font-bold mb-12">
            Tudo que você <span className="bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">recebe</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              "Concatenação automática Gancho + Corpo + CTA",
              "100+ criativos gerados em minutos",
              "RoteiroPRO IA — copywriter com IA integrada",
              "Legendas automáticas com IA",
              "Preview instantâneo de cada vídeo",
              "Download individual ou em lote",
              "Publicação direta no Instagram",
              "Suporte a formatos Vertical, Horizontal e Feed",
              "Resolução 720p otimizada para Ads",
              "Pré-processamento e normalização de vídeos",
            ].map((feat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-4 rounded-xl bg-white/[.02] border border-white/5"
              >
                <CheckCircle2 className="h-5 w-5 text-[#06B6D4] shrink-0" />
                <span className="text-gray-300">{feat}</span>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* ═══════ FOOTER ═══════ */}
        <footer className="border-t border-white/5 py-10">
          <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[#8B5CF6]" />
              <span className="font-['JetBrains_Mono',monospace] font-bold bg-gradient-to-r from-[#8B5CF6] to-[#06B6D4] bg-clip-text text-transparent">
                VIRAL FLUX
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-gray-300 transition-colors">Suporte</a>
              <a href="#" className="hover:text-gray-300 transition-colors">Política de Privacidade</a>
              <a href="#" className="hover:text-gray-300 transition-colors">Termos de Uso</a>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Lock className="h-4 w-4" />
              <span>Conexão SSL segura</span>
            </div>
          </div>
          <p className="text-center text-xs text-gray-600 mt-6">
            © {new Date().getFullYear()} Viral Flux. Todos os direitos reservados.
          </p>
        </footer>
      </div>
    </div>
  );
}
