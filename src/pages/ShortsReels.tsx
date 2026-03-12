import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowLeft, Video, Scissors, Image, LayoutGrid, Sparkles,
  Send, User, Lock, Wand2, Upload, FileText, Zap, Home,
  Settings, Film, PenTool, Eye, Copy, Download, RefreshCw
} from "lucide-react";

const tabs = [
  { id: "criar-anuncio", label: "Criar Anúncio", icon: PenTool, available: true },
  { id: "criar-campanha", label: "Criar Campanha", icon: Zap, available: false },
  { id: "criar-criacao", label: "Criar Criação", icon: Sparkles, available: false },
  { id: "galerias", label: "Galerias", icon: Image, available: false },
  { id: "editor-video", label: "Editor de Vídeo", icon: Video, available: false },
  { id: "shorts-reels", label: "Shorts & Reels", icon: Film, available: false },
  { id: "cortes", label: "Cortes IA", icon: Scissors, available: false },
  { id: "publicar", label: "Publicar", icon: Send, available: false },
  { id: "perfil", label: "Meu Perfil", icon: User, available: false },
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userName = user?.email?.split("@")[0] || "Usuário";

  const handleGenerate = async () => {
    setIsGenerating(true);
    // Simulating generation
    setTimeout(() => {
      setGeneratedAd(
        `🚀 ${productName || "Seu Produto"}\n\n${description || "Descrição incrível do seu produto que vai converter muito!"}\n\n✅ Resultados comprovados\n✅ Garantia de satisfação\n✅ Suporte exclusivo\n\n👉 Clique no link e garanta o seu agora!`
      );
      setIsGenerating(false);
    }, 2000);
  };

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
            Crie anúncios persuasivos em segundos com inteligência artificial
          </p>
        </div>

        {/* Tab Navigation - Scrollable */}
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
        {activeTab === "criar-anuncio" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel: Form */}
            <div className="space-y-5">
              {/* Dados do Anúncio Card */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-base font-semibold text-foreground mb-1">📝 Dados do Anúncio</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Preencha as informações para gerar seu anúncio
                </p>

                {/* Create mode toggle */}
                <div className="flex gap-2 mb-5">
                  <button
                    onClick={() => setCreateMode("zero")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      createMode === "zero"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    Criar do Zero
                  </button>
                  <button
                    onClick={() => setCreateMode("concorrente")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                      createMode === "concorrente"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/30 text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    Superar Concorrente
                  </button>
                </div>

                {/* Product Name */}
                <div className="mb-4">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Nome do Produto/Serviço
                  </label>
                  <Input
                    placeholder="Ex: Curso de Marketing Digital para Influenciadores"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    className="bg-muted/20 border-border"
                  />
                </div>

                {/* Description */}
                <div className="mb-4">
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Descrição*
                  </label>
                  <Textarea
                    placeholder="Preencha o formulário e clique em gerar"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="bg-muted/20 border-border min-h-[80px]"
                  />
                </div>
              </div>

              {/* Magic Prompt Card */}
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-semibold text-foreground">MAGIC PROMPT — UM CLIQUE</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Informe o nome do produto, defina a publicação para que a intenção alcance a região desejada.
                </p>
                <Textarea
                  placeholder="Ex: Lançamento, curso de marketing digital para influenciadores"
                  value={magicPrompt}
                  onChange={(e) => setMagicPrompt(e.target.value)}
                  className="bg-muted/20 border-border min-h-[70px] mb-3"
                />
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold"
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

              {/* Reference Images Card */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-base font-semibold text-foreground mb-1">🖼️ Imagens de Referência (opcional)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Adicione imagens para melhorar a geração do anúncio
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                >
                  <Upload className="h-8 w-8" />
                  <span className="text-sm">Clique para enviar imagens</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      setReferenceImages(Array.from(e.target.files));
                    }
                  }}
                />
                {referenceImages.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
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
            </div>

            {/* Right Panel: Result */}
            <div>
              <div className="bg-card border border-border rounded-xl p-5 sticky top-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      Resultado
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Seu anúncio gerado por IA
                    </p>
                  </div>
                  {generatedAd && (
                    <div className="flex gap-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => navigator.clipboard.writeText(generatedAd)}
                        title="Copiar"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={handleGenerate}
                        title="Regenerar"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {generatedAd ? (
                  <div className="bg-muted/20 border border-border rounded-lg p-4">
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                      {generatedAd}
                    </pre>
                  </div>
                ) : (
                  <div className="bg-muted/10 border border-dashed border-border rounded-lg p-8 sm:p-12 text-center">
                    <div className="bg-primary/10 rounded-full w-14 h-14 flex items-center justify-center mx-auto mb-3">
                      <Sparkles className="h-7 w-7 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Preencha o formulário e clique em <span className="text-primary font-medium">"Gerar Anúncio com IA"</span> para ver o resultado aqui.
                    </p>
                  </div>
                )}

                {generatedAd && (
                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1 gap-2" variant="outline" onClick={() => navigator.clipboard.writeText(generatedAd)}>
                      <Copy className="h-4 w-4" />
                      Copiar Texto
                    </Button>
                    <Button className="flex-1 gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground" onClick={handleGenerate}>
                      <RefreshCw className="h-4 w-4" />
                      Regenerar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Locked tab placeholder */
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
