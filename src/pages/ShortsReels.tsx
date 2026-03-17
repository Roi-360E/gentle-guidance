import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Video, Scissors, Image, LayoutGrid, Sparkles,
  Send, User, Lock, Wand2, Upload, FileText, Zap, Home,
  Settings, Film, PenTool, Eye, Copy, Download, RefreshCw,
  ChevronLeft, ChevronRight, Lightbulb, Search, Monitor
} from "lucide-react";

const tabs = [
  { id: "criar-anuncio", label: "Criar Anúncio", icon: PenTool, available: true },
  { id: "buscar-anuncios", label: "Buscar Anúncios", icon: Search, available: false },
  { id: "criar-criativo", label: "Criar Criativo", icon: Sparkles, available: true },
  { id: "criar-carrossel", label: "Criar Carrossel", icon: LayoutGrid, available: false },
  { id: "galerias", label: "Galeria", icon: Image, available: false },
  { id: "editor-video", label: "Editor de Vídeo", icon: Monitor, available: false },
  { id: "shorts-reels", label: "Shorts & Reels", icon: Film, available: false },
  { id: "cortes", label: "Cortes IA", icon: Scissors, available: false },
  { id: "publicar", label: "Publicar", icon: Send, available: false },
  { id: "perfil", label: "Meu Perfil", icon: User, available: false },
];

const guideSteps = [
  {
    icon: Sparkles,
    title: "Preencha os dados",
    description: "Insira o nome do produto, descrição e público-alvo para que a IA entenda seu negócio.",
    tip: "Quanto mais detalhes você fornecer, melhor será o resultado!",
  },
  {
    icon: Wand2,
    title: "Use o Magic Prompt",
    description: "Digite uma frase curta sobre seu produto e a IA preenche tudo automaticamente.",
    tip: "Funciona melhor com nome do produto + nicho + objetivo.",
  },
  {
    icon: Image,
    title: "Adicione referências",
    description: "Envie imagens de concorrentes ou do seu produto para inspirar a IA.",
    tip: "Até 3 imagens de referência para melhores resultados.",
  },
  {
    icon: Eye,
    title: "Revise o resultado",
    description: "Confira o anúncio gerado e ajuste o que precisar antes de publicar.",
    tip: "Você pode regenerar quantas vezes quiser!",
  },
  {
    icon: Copy,
    title: "Copie e publique",
    description: "Copie o texto gerado e use nas suas campanhas de anúncios.",
    tip: "Funciona para Facebook Ads, Instagram, Google Ads e mais.",
  },
];

type CreateMode = "zero" | "concorrente";

const ShortsReels = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("criar-anuncio");
  const [createMode, setCreateMode] = useState<CreateMode>("zero");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [magicPrompt, setMagicPrompt] = useState("");
  const [generatedAd, setGeneratedAd] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [guideStep, setGuideStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accessChecked, setAccessChecked] = useState(false);

  // Check if user has access via plan or admin role
  useEffect(() => {
    if (!user) return;
    const checkAccess = async () => {
      // Check admin
      const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
      if (isAdmin) { setAccessChecked(true); return; }
      // Check plan feature
      const monthYear = new Date().toISOString().substring(0, 7);
      const { data: usage } = await supabase.from('video_usage').select('plan').eq('user_id', user.id).eq('month_year', monthYear).single();
      const planKey = usage?.plan || 'free';
      const { data: planData } = await supabase.from('subscription_plans').select('has_shorts_reels').eq('plan_key', planKey).eq('is_active', true).maybeSingle();
      if ((planData as any)?.has_shorts_reels) { setAccessChecked(true); return; }
      navigate('/');
    };
    checkAccess();
  }, [user, navigate]);

  const userName = user?.email?.split("@")[0] || "Usuário";

  if (!accessChecked) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedAd(
        `🚀 ${productName || "Seu Produto"}\n\n${description || "Descrição incrível do seu produto que vai converter muito!"}\n\n✅ Resultados comprovados\n✅ Garantia de satisfação\n✅ Suporte exclusivo\n\n👉 Clique no link e garanta o seu agora!`
      );
      setIsGenerating(false);
    }, 2000);
  };

  const renderAdForm = () => (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
      {/* Left Panel: Form */}
      <div className="space-y-0">
        {/* Dados do Anúncio Card */}
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
          <h3 className="text-lg font-bold text-foreground mb-0.5 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Dados do Anúncio
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            Preencha as informações para gerar seu anúncio
          </p>

          <div className="border-b border-border mb-5" />

          {/* Create mode toggle */}
          <div className="flex gap-0 mb-6 bg-muted/20 rounded-lg p-1">
            <button
              onClick={() => setCreateMode("zero")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                createMode === "zero"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Criar do Zero
            </button>
            <button
              onClick={() => setCreateMode("concorrente")}
              className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                createMode === "concorrente"
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Search className="h-4 w-4" />
              Superar Concorrente
            </button>
          </div>

          {/* Magic Prompt Section - inside the card */}
          <div className="bg-muted/10 border border-border rounded-xl p-4 mb-6">
            <h4 className="text-sm font-bold text-foreground mb-0.5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              MAGIC PROMPT — UM CLIQUE ✨
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Digite um produto, serviço ou URL de referência e preencha tudo automaticamente.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Ex: Lançamento curso de marketing digital para iniciantes"
                value={magicPrompt}
                onChange={(e) => setMagicPrompt(e.target.value)}
                className="bg-muted/20 border-border flex-1"
              />
              <Button
                size="icon"
                className="bg-primary text-primary-foreground shrink-0 h-10 w-10"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Imagens de Referência Section - inside the card */}
          <div className="bg-muted/10 border border-border rounded-xl p-4 mb-6">
            <h4 className="text-sm font-bold text-foreground mb-0.5 flex items-center gap-2">
              🖼️ Imagens de Referência (opcional)
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Ex: Envie anúncios de concorrentes ou imagens de produtos para inspiração
            </p>
            <div className="flex gap-3 items-start">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-1.5 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors w-24 shrink-0"
              >
                <Upload className="h-5 w-5" />
                <span className="text-[11px]">Adicionar</span>
              </button>
              {referenceImages.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {referenceImages.map((img, i) => (
                    <div key={i} className="bg-muted/20 rounded-lg px-3 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />
                      {img.name}
                      <button
                        className="text-destructive hover:text-destructive/80 ml-1"
                        onClick={() => setReferenceImages(referenceImages.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {referenceImages.length}/3 imagens de referência
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  const newFiles = Array.from(e.target.files).slice(0, 3 - referenceImages.length);
                  setReferenceImages([...referenceImages, ...newFiles].slice(0, 3));
                }
              }}
            />
          </div>

          {/* Product Name */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-foreground mb-1.5 block">
              Nome do Produto/Serviço *
            </label>
            <Input
              placeholder="Ex: Masterclass de Instagram para Negócios Locais"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="bg-muted/20 border-border"
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-foreground mb-1.5 block">
              Descrição *
            </label>
            <Textarea
              placeholder="Ex: Aprenda a atrair clientes todos os dias pelo Instagram com estratégias testadas por +5.000 alunos. Conteúdo prático em vídeo, templates editáveis e suporte por 1 ano."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-muted/20 border-border min-h-[100px]"
            />
          </div>

          {/* Generate Button */}
          <Button
            className="w-full gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold h-12 text-base"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                Gerar Anúncio com IA
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Right Panel */}
      <div className="space-y-5">
        {/* Guia Rápido Carousel */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-primary">Guia Rápido</span>
            <span className="text-xs text-muted-foreground">{guideStep + 1} / {guideSteps.length}</span>
          </div>

          <div className="text-center py-4">
            <div className="bg-primary/10 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-4">
              {(() => {
                const StepIcon = guideSteps[guideStep].icon;
                return <StepIcon className="h-7 w-7 text-primary" />;
              })()}
            </div>
            <h4 className="text-base font-bold text-foreground mb-2">
              {guideSteps[guideStep].title}
            </h4>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
              {guideSteps[guideStep].description}
            </p>
            <div className="bg-muted/20 border border-border rounded-lg px-3 py-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0" />
              {guideSteps[guideStep].tip}
            </div>
          </div>

          {/* Carousel controls */}
          <div className="flex items-center justify-between mt-4">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setGuideStep(Math.max(0, guideStep - 1))}
              disabled={guideStep === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex gap-1.5">
              {guideSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setGuideStep(i)}
                  className={`rounded-full transition-all ${
                    i === guideStep
                      ? "w-6 h-2 bg-primary"
                      : "w-2 h-2 bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setGuideStep(Math.min(guideSteps.length - 1, guideStep + 1))}
              disabled={guideStep === guideSteps.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Resultado Card */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">Resultado</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Seu anúncio gerado pela IA
              </p>
            </div>
            {generatedAd && (
              <div className="flex gap-1.5">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => navigator.clipboard.writeText(generatedAd)} title="Copiar">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={handleGenerate} title="Regenerar">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {generatedAd ? (
            <>
              <div className="bg-muted/20 border border-border rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                  {generatedAd}
                </pre>
              </div>
              <div className="mt-4 flex gap-2">
                <Button className="flex-1 gap-2" variant="outline" onClick={() => navigator.clipboard.writeText(generatedAd)}>
                  <Copy className="h-4 w-4" />
                  Copiar
                </Button>
                <Button className="flex-1 gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground" onClick={handleGenerate}>
                  <RefreshCw className="h-4 w-4" />
                  Regenerar
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-muted/10 border border-dashed border-border rounded-lg p-8 text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Preencha o formulário e clique em gerar
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              EscalaXPro
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2" onClick={() => navigate("/")}>
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground gap-2" onClick={() => navigate("/")}>
              Sair
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Welcome Section */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            Olá, {userName}! 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Crie anúncios persuasivos em segundos com inteligência artificial.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.available && setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-all shrink-0
                ${activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : tab.available
                    ? "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                    : "bg-card/50 border border-border/50 text-muted-foreground/50 cursor-not-allowed"
                }
              `}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {!tab.available && <Lock className="h-3 w-3 opacity-50" />}
            </button>
          ))}
        </div>

        {/* Main Content */}
        {(activeTab === "criar-anuncio" || activeTab === "criar-criativo") ? (
          renderAdForm()
        ) : (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Em breve</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Esta funcionalidade está em desenvolvimento e será liberada em breve. Fique ligado!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShortsReels;
