import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Upload, Type, Plus, ArrowLeft, SplitSquareHorizontal, Columns2, PanelTop, Camera } from "lucide-react";
import { useNavigate } from "react-router-dom";

type SplitMode = "50/50" | "60/40" | "40/60" | "pip";

const ShortsReels = () => {
  const navigate = useNavigate();
  const [topVideo, setTopVideo] = useState<File | null>(null);
  const [bottomVideo, setBottomVideo] = useState<File | null>(null);
  const [topVideoUrl, setTopVideoUrl] = useState<string | null>(null);
  const [bottomVideoUrl, setBottomVideoUrl] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("50/50");
  const [position, setPosition] = useState(50);
  const [transparency, setTransparency] = useState(0);
  const [texts, setTexts] = useState<string[]>([]);
  const topInputRef = useRef<HTMLInputElement>(null);
  const bottomInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = (file: File, slot: "top" | "bottom") => {
    const url = URL.createObjectURL(file);
    if (slot === "top") {
      setTopVideo(file);
      setTopVideoUrl(url);
    } else {
      setBottomVideo(file);
      setBottomVideoUrl(url);
    }
  };

  const splitPercent = () => {
    switch (splitMode) {
      case "50/50": return { top: 50, bottom: 50 };
      case "60/40": return { top: 60, bottom: 40 };
      case "40/60": return { top: 40, bottom: 60 };
      case "pip": return { top: 75, bottom: 25 };
    }
  };

  const split = splitPercent();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Shorts & Reels
          </h1>
        </div>
        <span className="text-xs text-muted-foreground">🚧 Em breve</span>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 p-4 lg:p-6 max-w-7xl mx-auto">
        {/* Left: Preview */}
        <div className="flex-1">
          <div className="mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className="text-primary">👁</span> Preview — Shorts / Reels
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Formato 9:16 — Arraste os vídeos para personalizar</p>
          </div>

          {/* Split mode buttons */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {([
              { mode: "50/50" as SplitMode, icon: <SplitSquareHorizontal className="h-3 w-3" />, label: "Split 50/50" },
              { mode: "60/40" as SplitMode, icon: <Columns2 className="h-3 w-3" />, label: "Split 60/40" },
              { mode: "40/60" as SplitMode, icon: <PanelTop className="h-3 w-3" />, label: "Split 40/60" },
              { mode: "pip" as SplitMode, icon: <Camera className="h-3 w-3" />, label: "PIP (Câmera)" },
            ]).map(({ mode, icon, label }) => (
              <Button
                key={mode}
                size="sm"
                variant={splitMode === mode ? "default" : "outline"}
                className={splitMode === mode ? "bg-primary text-primary-foreground" : "border-border text-muted-foreground"}
                onClick={() => setSplitMode(mode)}
              >
                {icon}
                <span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>

          {/* Video preview area */}
          <div className="relative bg-card border border-border rounded-xl overflow-hidden mx-auto" style={{ width: 280, aspectRatio: "9/16" }}>
            {/* Top video */}
            <div
              className="w-full overflow-hidden relative"
              style={{ height: splitMode === "pip" ? "100%" : `${split.top}%` }}
            >
              {topVideoUrl ? (
                <video
                  src={topVideoUrl}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <button
                  onClick={() => topInputRef.current?.click()}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors bg-muted/30"
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-xs">Vídeo de Cima</span>
                </button>
              )}
            </div>

            {/* Divider line */}
            {splitMode !== "pip" && (
              <div className="w-full h-[2px] bg-gradient-to-r from-primary to-accent" />
            )}

            {/* Bottom video */}
            <div
              className={splitMode === "pip"
                ? "absolute bottom-3 right-3 w-[35%] aspect-square rounded-lg overflow-hidden border-2 border-primary shadow-lg"
                : "w-full overflow-hidden"
              }
              style={splitMode !== "pip" ? { height: `${split.bottom}%` } : undefined}
            >
              {bottomVideoUrl ? (
                <video
                  src={bottomVideoUrl}
                  className="w-full h-full object-cover"
                  style={{ opacity: 1 - transparency / 100 }}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <button
                  onClick={() => bottomInputRef.current?.click()}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors bg-muted/30"
                >
                  <Upload className="h-6 w-6" />
                  <span className="text-xs">Vídeo de Baixo</span>
                </button>
              )}
            </div>

            {/* Text overlays */}
            {texts.map((text, i) => (
              <div
                key={i}
                className="absolute left-1/2 -translate-x-1/2 text-primary-foreground font-bold text-sm bg-primary/70 px-3 py-1 rounded"
                style={{ top: `${20 + i * 12}%` }}
              >
                {text}
              </div>
            ))}
          </div>

          {/* Hidden file inputs */}
          <input ref={topInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0], "top")} />
          <input ref={bottomInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0], "bottom")} />
        </div>

        {/* Right: Controls */}
        <div className="w-full lg:w-80 space-y-6">
          {/* Videos section */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-semibold mb-3 text-sm">Vídeos</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm">{topVideo ? topVideo.name : "Vídeo de Cima"}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-accent hover:text-primary" onClick={() => topInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm">{bottomVideo ? bottomVideo.name : "Vídeo de Baixo"}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-accent hover:text-primary" onClick={() => bottomInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Divisor section */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="font-semibold mb-3 text-sm">Divisor</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">
                  Posição ({position}%)
                </label>
                <Slider
                  value={[position]}
                  onValueChange={([v]) => setPosition(v)}
                  max={80}
                  min={20}
                  step={1}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-2 block">
                  Transparência ({transparency}%)
                </label>
                <Slider
                  value={[transparency]}
                  onValueChange={([v]) => setTransparency(v)}
                  max={100}
                  min={0}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Texts section */}
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Type className="h-4 w-4" /> Textos
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-border"
                onClick={() => {
                  const text = prompt("Digite o texto:");
                  if (text) setTexts([...texts, text]);
                }}
              >
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            {texts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                Clique em "Adicionar" para inserir texto
              </p>
            ) : (
              <div className="space-y-1">
                {texts.map((t, i) => (
                  <div key={i} className="text-xs bg-muted/30 rounded p-2 flex justify-between items-center">
                    <span>{t}</span>
                    <button
                      className="text-destructive text-xs hover:underline"
                      onClick={() => setTexts(texts.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortsReels;
