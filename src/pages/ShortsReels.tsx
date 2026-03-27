import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  ArrowLeft, Plus, Trash2, Play, Upload, Link2,
  GripVertical, Sparkles, Video, Home, X,
  ZoomIn, ZoomOut, Maximize2, Download, Layers, Menu,
  ChevronDown, ChevronUp, Eye
} from "lucide-react";

/* ─── Types ─── */
interface NodeData {
  label?: string;
  imageUrl?: string;
  file?: File;
  prompt?: string;
  model?: string;
  aspect?: string;
  generating?: boolean;
  videoReady?: boolean;
  creative?: any;
  ugcAspects?: string[];
  audioFile?: File;
  audioName?: string;
}

interface CanvasNode {
  id: string;
  type: "image" | "creation-block" | "preview";
  x: number;
  y: number;
  data: NodeData;
  parentBlockId?: string;
}

interface CanvasConnection {
  id: string;
  fromId: string;
  toId: string;
}

/* ─── Helpers ─── */
let nodeCounter = 0;
const newId = () => `node-${++nodeCounter}-${Date.now()}`;

const UGC_ASPECTS = [
  "Pessoa real falando para a câmera (talking head)",
  "Iluminação natural e cenário casual",
  "Enquadramento close-up ou meio-corpo",
  "Movimentos de câmera orgânicos",
  "Texto overlay com fontes modernas",
  "Transições rápidas e dinâmicas",
  "Legendas automáticas estilo TikTok/Reels",
  "Hook forte nos primeiros 3 segundos",
  "CTA claro e direto no final",
  "Música de fundo trending",
  "Demonstração do produto em uso real",
  "Depoimento autêntico com emoção",
  "Storytelling pessoal (antes/depois)",
  "Efeitos nativos da plataforma",
  "Duração ideal entre 15-60 segundos",
];

const ShortsReels = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  /* Access gate */
  const [accessChecked, setAccessChecked] = useState(false);
  useEffect(() => {
    if (!user) return;
    const check = async () => {
      const my = new Date().toISOString().substring(0, 7);
      const { data: usage } = await supabase.from("video_usage").select("plan").eq("user_id", user.id).eq("month_year", my).single();
      const pk = usage?.plan || "free";
      const { data: plan } = await supabase.from("subscription_plans").select("has_shorts_reels").eq("plan_key", pk).eq("is_active", true).maybeSingle();
      if ((plan as any)?.has_shorts_reels) { setAccessChecked(true); return; }
      navigate("/");
    };
    check();
  }, [user, navigate]);

  /* Canvas state */
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  /* Drag state */
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  /* Canvas pan & zoom */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const lastTouchDist = useRef<number | null>(null);

  /* ─── Add image node ─── */
  const addImageNode = useCallback(() => {
    const id = newId();
    setNodes((prev) => [
      ...prev,
      { id, type: "image", x: 80 + Math.random() * 120, y: 120 + Math.random() * 200, data: { label: "Imagem", imageUrl: "" } },
    ]);
    setShowMobileMenu(false);
  }, []);

  /* ─── Add creation block ─── */
  const addCreationBlock = useCallback(() => {
    const id = newId();
    const blockCount = nodes.filter(n => n.type === "creation-block").length;
    setNodes((prev) => [
      ...prev,
      {
        id,
        type: "creation-block",
        x: 400 + blockCount * 50,
        y: 200 + blockCount * 40,
        data: {
          label: `Bloco de Criação ${blockCount + 1}`,
          prompt: "",
          model: "Rosto para vídeo (Alta qualidade)",
          aspect: "9:16 (Vertical)",
        },
      },
    ]);
    setShowMobileMenu(false);
  }, [nodes]);

  /* ─── Generate creative via AI ─── */
  const handleGenerate = useCallback(async (blockId: string) => {
    const block = nodes.find(n => n.id === blockId);
    if (!block) return;

    // Get connected images
    const connectedImageIds = connections
      .filter(c => c.toId === blockId)
      .map(c => c.fromId);
    const connectedImages = nodes.filter(n => connectedImageIds.includes(n.id) && n.type === "image");

    // Build image descriptions
    const imageDescriptions = connectedImages
      .map((img, i) => img.data.imageUrl ? `Imagem ${i + 1} enviada pelo usuário` : `Imagem ${i + 1} (sem arquivo)`)
      .filter(Boolean);

    // Mark as generating
    setNodes((prev) =>
      prev.map((n) => n.id === blockId ? { ...n, data: { ...n.data, generating: true } } : n)
    );

    try {
      const { data, error } = await supabase.functions.invoke("generate-video-creative", {
        body: {
          prompt: block.data.prompt || "Criar um criativo impactante",
          model: block.data.model || "Rosto para vídeo (Alta qualidade)",
          aspect: block.data.aspect || "9:16 (Vertical)",
          imageDescriptions,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const creative = data?.creative;
      const previewId = newId();

      setNodes((prev) => {
        const updated = prev.map((n) =>
          n.id === blockId ? { ...n, data: { ...n.data, generating: false } } : n
        );
        return [
          ...updated,
          {
            id: previewId,
            type: "preview" as const,
            x: block.x + (isMobile ? 20 : 380),
            y: block.y + (isMobile ? 450 : 0),
            data: {
              label: "Preview",
              videoReady: true,
              creative,
              ugcAspects: creative?.ugc_aspects,
            },
            parentBlockId: blockId,
          },
        ];
      });

      setConnections((prev) => [
        ...prev,
        { id: `conn-${Date.now()}`, fromId: blockId, toId: previewId },
      ]);

      toast.success("Criativo gerado com sucesso!");
    } catch (err: any) {
      console.error("Generation error:", err);
      setNodes((prev) =>
        prev.map((n) => n.id === blockId ? { ...n, data: { ...n.data, generating: false } } : n)
      );
      toast.error(err?.message || "Erro ao gerar criativo");
    }
  }, [nodes, connections, isMobile]);

  /* ─── Generate avatar via clone-avatar-local ─── */
  const handleAvatarGenerate = useCallback(async (blockId: string) => {
    const block = nodes.find(n => n.id === blockId);
    if (!block) return;

    // Get connected face images
    const connectedImageIds = connections.filter(c => c.toId === blockId).map(c => c.fromId);
    const connectedImages = nodes.filter(n => connectedImageIds.includes(n.id) && n.type === "image" && n.data.file);

    if (connectedImages.length === 0) {
      toast.error("Conecte pelo menos uma imagem de rosto ao bloco");
      return;
    }

    setNodes(prev => prev.map(n => n.id === blockId ? { ...n, data: { ...n.data, generating: true } } : n));

    try {
      const faceFile = connectedImages[0].data.file!;
      const formData = new FormData();
      formData.append("face_image", faceFile);
      formData.append("prompt", block.data.prompt || "Criar um vídeo com avatar falando");
      formData.append("aspect", block.data.aspect || "9:16");
      if (block.data.audioFile) {
        formData.append("audio", block.data.audioFile);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/clone-avatar-local`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token || ""}`,
          },
          body: formData,
        }
      );

      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || "Erro ao gerar avatar");

      const creative = data.creative;
      const previewId = newId();

      setNodes(prev => {
        const updated = prev.map(n => n.id === blockId ? { ...n, data: { ...n.data, generating: false } } : n);
        return [
          ...updated,
          {
            id: previewId,
            type: "preview" as const,
            x: block.x + (isMobile ? 20 : 380),
            y: block.y + (isMobile ? 450 : 0),
            data: { label: "Avatar Preview", videoReady: true, creative },
            parentBlockId: blockId,
          },
        ];
      });

      setConnections(prev => [...prev, { id: `conn-${Date.now()}`, fromId: blockId, toId: previewId }]);
      toast.success("Avatar gerado com sucesso!");
    } catch (err: any) {
      console.error("Avatar generation error:", err);
      setNodes(prev => prev.map(n => n.id === blockId ? { ...n, data: { ...n.data, generating: false } } : n));
      toast.error(err?.message || "Erro ao gerar avatar");
    }
  }, [nodes, connections, isMobile]);

  /* ─── Upload image to node ─── */
  const handleImageUpload = useCallback((nodeId: string, file: File) => {
    const url = URL.createObjectURL(file);
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, imageUrl: url, file } } : n
      )
    );
  }, []);

  /* ─── Remove node ─── */
  const removeNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId && n.parentBlockId !== nodeId));
    setConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId));
  }, []);

  /* ─── Update node data ─── */
  const updateNodeData = useCallback((nodeId: string, key: string, value: string) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n
      )
    );
  }, []);

  /* ─── Connections ─── */
  const startConnection = useCallback((nodeId: string) => {
    if (connectingFrom) {
      if (connectingFrom !== nodeId) {
        const id = `conn-${Date.now()}`;
        setConnections((prev) => [...prev, { id, fromId: connectingFrom, toId: nodeId }]);
      }
      setConnectingFrom(null);
    } else {
      setConnectingFrom(nodeId);
    }
  }, [connectingFrom]);

  /* ─── Mouse Drag handlers ─── */
  const onNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.ctrlKey || e.metaKey) {
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY };
        return;
      }
      e.stopPropagation();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      dragOffset.current = {
        x: e.clientX / zoom - node.x - pan.x,
        y: e.clientY / zoom - node.y - pan.y,
      };
      setDragging(nodeId);
    },
    [nodes, zoom, pan]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) {
        const x = e.clientX / zoom - dragOffset.current.x - pan.x;
        const y = e.clientY / zoom - dragOffset.current.y - pan.y;
        setNodes((prev) =>
          prev.map((n) => (n.id === dragging ? { ...n, x, y } : n))
        );
      } else if (isPanning.current) {
        setPan((p) => ({
          x: p.x + (e.clientX - panStart.current.x) / zoom,
          y: p.y + (e.clientY - panStart.current.y) / zoom,
        }));
        panStart.current = { x: e.clientX, y: e.clientY };
      }
    },
    [dragging, zoom, pan]
  );

  const onMouseUp = useCallback(() => {
    setDragging(null);
    isPanning.current = false;
    lastTouchDist.current = null;
  }, []);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }
    const tag = (e.target as HTMLElement).tagName.toLowerCase();
    const isCanvasBg = e.target === canvasRef.current || (e.target as HTMLElement).classList.contains("canvas-bg");
    const isSvgArea = tag === "svg" || tag === "path" || tag === "circle" || tag === "g";
    if (isCanvasBg || isSvgArea) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  /* ─── Touch handlers ─── */
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.sqrt(dx * dx + dy * dy);
      return;
    }
    if (e.touches.length === 1) {
      const target = e.target as HTMLElement;
      const isCanvasBg = target === canvasRef.current || target.classList.contains("canvas-bg");
      if (isCanvasBg) {
        isPanning.current = true;
        panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / lastTouchDist.current;
      setZoom((z) => Math.min(2, Math.max(0.3, z * scale)));
      lastTouchDist.current = dist;
      return;
    }
    if (dragging && e.touches.length === 1) {
      const touch = e.touches[0];
      const x = touch.clientX / zoom - dragOffset.current.x - pan.x;
      const y = touch.clientY / zoom - dragOffset.current.y - pan.y;
      setNodes((prev) =>
        prev.map((n) => (n.id === dragging ? { ...n, x, y } : n))
      );
    } else if (isPanning.current && e.touches.length === 1) {
      const touch = e.touches[0];
      setPan((p) => ({
        x: p.x + (touch.clientX - panStart.current.x) / zoom,
        y: p.y + (touch.clientY - panStart.current.y) / zoom,
      }));
      panStart.current = { x: touch.clientX, y: touch.clientY };
    }
  }, [dragging, zoom, pan]);

  const onTouchEnd = useCallback(() => {
    setDragging(null);
    isPanning.current = false;
    lastTouchDist.current = null;
  }, []);

  const onNodeTouchStart = useCallback(
    (e: React.TouchEvent, nodeId: string) => {
      if (e.touches.length !== 1) return;
      e.stopPropagation();
      const touch = e.touches[0];
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      dragOffset.current = {
        x: touch.clientX / zoom - node.x - pan.x,
        y: touch.clientY / zoom - node.y - pan.y,
      };
      setDragging(nodeId);
    },
    [nodes, zoom, pan]
  );

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setZoom((z) => Math.min(2, Math.max(0.3, z - e.deltaY * 0.002)));
    } else {
      setPan((p) => ({
        x: p.x - e.deltaX / zoom,
        y: p.y - e.deltaY / zoom,
      }));
    }
  }, [zoom]);

  const getNodeCenter = (node: CanvasNode) => {
    const w = node.type === "creation-block" ? (isMobile ? 260 : 320) : node.type === "preview" ? (isMobile ? 260 : 340) : (isMobile ? 130 : 160);
    const h = node.type === "creation-block" ? 400 : node.type === "preview" ? 320 : 180;
    return { x: node.x + w / 2, y: node.y + h / 2 };
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectingFrom(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!accessChecked) return null;

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-background overflow-hidden">
      {/* ─── Top Bar ─── */}
      <header className="h-12 sm:h-14 border-b border-border bg-background flex items-center justify-between px-2 sm:px-4 z-20 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <h1 className="text-sm sm:text-lg font-bold text-foreground truncate">Criador de Vídeos I.A</h1>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" onClick={addImageNode}>
            <Plus className="h-4 w-4" />
            <span className="hidden md:inline">Adicionar</span> Imagem
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={addCreationBlock}>
            <Layers className="h-4 w-4" />
            <span className="hidden md:inline">Bloco de</span> Criação
          </Button>
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-2" onClick={() => navigate("/")}>
            <Home className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex sm:hidden items-center gap-1">
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>
              <ZoomOut className="h-3 w-3" />
            </Button>
            <span className="text-[10px] text-muted-foreground w-8 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
              <ZoomIn className="h-3 w-3" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMobileMenu(!showMobileMenu)}>
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {showMobileMenu && (
        <div className="sm:hidden absolute top-12 right-2 z-30 bg-background border border-border rounded-xl shadow-lg p-2 flex flex-col gap-1 min-w-[180px]">
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-foreground" onClick={addImageNode}>
            <Plus className="h-4 w-4" /> Adicionar Imagem
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-blue-600" onClick={addCreationBlock}>
            <Layers className="h-4 w-4" /> Bloco de Criação
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setShowMobileMenu(false); }}>
            <Maximize2 className="h-4 w-4" /> Resetar Vista
          </Button>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground" onClick={() => { navigate("/"); setShowMobileMenu(false); }}>
            <Home className="h-4 w-4" /> Início
          </Button>
        </div>
      )}

      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none px-4" style={{ top: 48 }}>
          <div className="text-center pointer-events-auto max-w-xs">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <Sparkles className="h-7 w-7 sm:h-8 sm:w-8 text-blue-400" />
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-foreground mb-1.5 sm:mb-2">Criador de Vídeos I.A</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">Adicione imagens, conecte a um bloco de criação e gere criativos com inteligência artificial</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" size="sm" className="gap-2 text-xs sm:text-sm" onClick={addImageNode}>
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Imagem
              </Button>
              <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm" onClick={addCreationBlock}>
                <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Bloco de Criação
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Canvas ─── */}
      <div
        ref={canvasRef}
        className="flex-1 relative cursor-grab active:cursor-grabbing canvas-bg touch-none"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x * zoom}px ${pan.y * zoom}px`,
        }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {connections.map((conn) => {
            const from = nodes.find((n) => n.id === conn.fromId);
            const to = nodes.find((n) => n.id === conn.toId);
            if (!from || !to) return null;
            const a = getNodeCenter(from);
            const b = getNodeCenter(to);
            const ax = (a.x + pan.x) * zoom;
            const ay = (a.y + pan.y) * zoom;
            const bx = (b.x + pan.x) * zoom;
            const by = (b.y + pan.y) * zoom;
            const cpx1 = ax + (bx - ax) * 0.5;
            const cpx2 = bx - (bx - ax) * 0.5;
            return (
              <g key={conn.id}>
                <path d={`M ${ax} ${ay} C ${cpx1} ${ay}, ${cpx2} ${by}, ${bx} ${by}`} stroke="#3b82f6" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                <circle cx={bx} cy={by} r="5" fill="#3b82f6" />
              </g>
            );
          })}
        </svg>

        <div className="absolute inset-0 z-10" style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "0 0" }}>
          {nodes.map((node) => {
            if (node.type === "image") {
              return (
                <ImageNode
                  key={node.id} node={node} isMobile={isMobile}
                  onMouseDown={onNodeMouseDown} onTouchStart={onNodeTouchStart}
                  onUpload={handleImageUpload} onRemove={removeNode}
                  onConnect={startConnection}
                  isConnecting={connectingFrom !== null} isConnectingFrom={connectingFrom === node.id}
                />
              );
            }
            if (node.type === "creation-block") {
              const imageCount = connections.filter((c) => c.toId === node.id).length;
              return (
                <CreationBlockNode
                  key={node.id} node={node} isMobile={isMobile}
                  onMouseDown={onNodeMouseDown} onTouchStart={onNodeTouchStart}
                  onConnect={startConnection}
                  isConnecting={connectingFrom !== null} isConnectingFrom={connectingFrom === node.id}
                  imageCount={imageCount} onGenerate={handleGenerate}
                  onRemove={removeNode} onUpdateData={updateNodeData}
                />
              );
            }
            if (node.type === "preview") {
              return (
                <PreviewNode
                  key={node.id} node={node} isMobile={isMobile}
                  onMouseDown={onNodeMouseDown} onTouchStart={onNodeTouchStart}
                  onConnect={startConnection}
                  isConnecting={connectingFrom !== null} isConnectingFrom={connectingFrom === node.id}
                  onRemove={removeNode}
                />
              );
            }
            return null;
          })}
        </div>

        {connectingFrom && (
          <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium shadow-lg z-30 animate-pulse whitespace-nowrap">
            Toque em outro bloco para conectar
          </div>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════ */
/* ─── Image Node ─── */
/* ═══════════════════════════════════════════════ */
interface ImageNodeProps {
  node: CanvasNode; isMobile: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onTouchStart: (e: React.TouchEvent, id: string) => void;
  onUpload: (nodeId: string, file: File) => void;
  onRemove: (nodeId: string) => void;
  onConnect: (nodeId: string) => void;
  isConnecting: boolean; isConnectingFrom: boolean;
}

function ImageNode({ node, isMobile, onMouseDown, onTouchStart, onUpload, onRemove, onConnect, isConnecting, isConnectingFrom }: ImageNodeProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const w = isMobile ? 130 : 160;
  return (
    <div
      className={`absolute select-none group ${isConnectingFrom ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
      style={{ left: node.x, top: node.y, width: w }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onTouchStart={(e) => onTouchStart(e, node.id)}
    >
      <div className="bg-background rounded-2xl shadow-lg border border-border overflow-hidden hover:shadow-xl transition-shadow">
        <div className="flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 bg-muted border-b border-border cursor-move">
          <div className="flex items-center gap-1">
            <GripVertical className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />
            <span className="text-[10px] sm:text-xs font-medium text-muted-foreground">Imagem</span>
          </div>
          <div className="flex gap-1">
            <button onClick={(e) => { e.stopPropagation(); onConnect(node.id); }} className="p-0.5 rounded hover:bg-blue-100" title="Conectar">
              <Link2 className="h-3 w-3 text-blue-500" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.id); }} className="p-0.5 rounded hover:bg-red-100" title="Remover">
              <Trash2 className="h-3 w-3 text-destructive" />
            </button>
          </div>
        </div>
        <div
          className="w-full aspect-square bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/70 transition-colors"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        >
          {node.data.imageUrl ? (
            <img src={node.data.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center p-2 sm:p-3">
              <Upload className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground mx-auto mb-1" />
              <span className="text-[9px] sm:text-[10px] text-muted-foreground">Toque para enviar</span>
            </div>
          )}
        </div>
        {isConnecting && !isConnectingFrom && (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-6 sm:h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-pulse"
          >
            <Plus className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(node.id, f); }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── Creation Block Node ─── */
/* ═══════════════════════════════════════════════ */
interface CreationBlockProps {
  node: CanvasNode; isMobile: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onTouchStart: (e: React.TouchEvent, id: string) => void;
  onConnect: (nodeId: string) => void;
  isConnecting: boolean; isConnectingFrom: boolean;
  imageCount: number;
  onGenerate: (blockId: string) => void;
  onAvatarGenerate: (blockId: string) => void;
  onRemove: (nodeId: string) => void;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
  onUpdateNodeFile: (nodeId: string, key: string, file: File) => void;
}

function CreationBlockNode({
  node, isMobile, onMouseDown, onTouchStart, onConnect, isConnecting, isConnectingFrom,
  imageCount, onGenerate, onRemove, onUpdateData,
}: CreationBlockProps) {
  const { prompt = "", model = "Rosto para vídeo (Alta qualidade)", aspect = "9:16 (Vertical)", generating } = node.data;
  const w = isMobile ? 260 : 320;
  const [showUgcAspects, setShowUgcAspects] = useState(false);
  const isUGC = model.toLowerCase().includes("ugc");

  return (
    <div
      className={`absolute select-none group ${isConnectingFrom ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl" : ""}`}
      style={{ left: node.x, top: node.y, width: w }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onTouchStart={(e) => onTouchStart(e, node.id)}
    >
      <div className="bg-background rounded-2xl shadow-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-muted border-b border-border cursor-move">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <GripVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{node.data.label || "Bloco de Criação"}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onConnect(node.id); }} className="p-1 rounded hover:bg-blue-100" title="Conectar">
              <Link2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.id); }} className="p-1 rounded hover:bg-red-100" title="Remover">
              <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <div>
            <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Modelo I.A</label>
            <select
              value={model}
              onChange={(e) => onUpdateData(node.id, "model", e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-foreground"
            >
              <option>Rosto para vídeo (Alta qualidade)</option>
              <option>Produto showcase</option>
              <option>UGC estilo natural</option>
            </select>
          </div>

          {/* UGC Aspects panel */}
          {isUGC && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg overflow-hidden">
              <button
                onClick={(e) => { e.stopPropagation(); setShowUgcAspects(!showUgcAspects); }}
                className="w-full flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-purple-700"
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Aspectos UGC Aplicados ({UGC_ASPECTS.length})
                </span>
                {showUgcAspects ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              {showUgcAspects && (
                <div className="px-2 sm:px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
                  {UGC_ASPECTS.map((aspect, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-[9px] sm:text-[10px] text-purple-600">
                      <span className="text-purple-400 mt-0.5">✓</span>
                      <span>{aspect}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-blue-700">
            Conecte até 5 imagens
            <span className="float-right font-bold">{imageCount}/5</span>
          </div>

          <div>
            <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Aspecto</label>
            <select
              value={aspect}
              onChange={(e) => onUpdateData(node.id, "aspect", e.target.value)}
              className="w-full bg-muted border border-border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-foreground"
            >
              <option>9:16 (Vertical)</option>
              <option>16:9 (Horizontal)</option>
              <option>1:1 (Feed)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] sm:text-xs font-medium text-muted-foreground mb-1 block">Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => onUpdateData(node.id, "prompt", e.target.value)}
              placeholder={isUGC ? "Ex: Mostre uma pessoa usando o produto e fazendo um review autêntico..." : "Descreva o criativo que deseja gerar..."}
              className="min-h-[60px] sm:min-h-[80px] text-xs sm:text-sm bg-muted border-border resize-none text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-9 sm:h-11 gap-2 text-xs sm:text-sm disabled:opacity-60"
            onClick={(e) => { e.stopPropagation(); onGenerate(node.id); }}
            disabled={!!generating}
          >
            {generating ? (
              <>
                <div className="h-3.5 w-3.5 sm:h-4 sm:w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando com I.A...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Criar Criativo com I.A
              </>
            )}
          </Button>
        </div>

        {isConnecting && !isConnectingFrom && (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-6 sm:h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-pulse"
          >
            <Plus className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── Preview Node ─── */
/* ═══════════════════════════════════════════════ */
interface PreviewNodeProps {
  node: CanvasNode; isMobile: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onTouchStart: (e: React.TouchEvent, id: string) => void;
  onConnect: (nodeId: string) => void;
  isConnecting: boolean; isConnectingFrom: boolean;
  onRemove: (nodeId: string) => void;
}

function PreviewNode({ node, isMobile, onMouseDown, onTouchStart, onConnect, isConnecting, isConnectingFrom, onRemove }: PreviewNodeProps) {
  const w = isMobile ? 280 : 360;
  const [showScript, setShowScript] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const [currentScene, setCurrentScene] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creative = node.data.creative;

  // Get scenes with images
  const scenesWithImages = (creative?.scenes || []).filter((s: any) => s.generated_image);
  const allScenes = creative?.scenes || [];

  // Auto-play slideshow
  useEffect(() => {
    if (isPlaying && scenesWithImages.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentScene((prev) => (prev + 1) % scenesWithImages.length);
      }, 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, scenesWithImages.length]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  return (
    <div
      className={`absolute select-none group ${isConnectingFrom ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl" : ""}`}
      style={{ left: node.x, top: node.y, width: w }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
      onTouchStart={(e) => onTouchStart(e, node.id)}
    >
      <div className="bg-background rounded-2xl shadow-lg border border-border overflow-hidden">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-muted border-b border-border cursor-move">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <GripVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
              {creative?.title || "Preview"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="bg-green-100 text-green-700 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium">
              I.A ✓
            </span>
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.id); }} className="p-1 rounded hover:bg-red-100" title="Remover">
              <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-destructive" />
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-4 space-y-3" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          {creative && (
            <>
              {/* Video Player / Image Slideshow */}
              {scenesWithImages.length > 0 && (
                <div className="relative w-full aspect-[9/16] bg-black rounded-xl overflow-hidden">
                  <img
                    src={scenesWithImages[currentScene]?.generated_image}
                    alt={`Cena ${currentScene + 1}`}
                    className="w-full h-full object-cover transition-opacity duration-500"
                  />
                  {/* Overlay with scene info */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    {scenesWithImages[currentScene]?.text_overlay && (
                      <p className="text-white text-xs sm:text-sm font-bold text-center mb-2 drop-shadow-lg">
                        {scenesWithImages[currentScene].text_overlay}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-white/70 text-[10px]">
                        Cena {currentScene + 1}/{scenesWithImages.length}
                      </span>
                      <span className="text-white/70 text-[10px]">
                        {scenesWithImages[currentScene]?.duration || "3s"}
                      </span>
                    </div>
                    {/* Progress dots */}
                    <div className="flex gap-1 justify-center mt-2">
                      {scenesWithImages.map((_: any, i: number) => (
                        <button
                          key={i}
                          onClick={(e) => { e.stopPropagation(); setCurrentScene(i); }}
                          className={`h-1.5 rounded-full transition-all ${
                            i === currentScene ? "w-4 bg-white" : "w-1.5 bg-white/40"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Play/Pause button */}
                  <button
                    onClick={togglePlay}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/60 transition-all"
                  >
                    {isPlaying ? (
                      <div className="flex gap-1">
                        <div className="w-1.5 h-5 bg-white rounded-full" />
                        <div className="w-1.5 h-5 bg-white rounded-full" />
                      </div>
                    ) : (
                      <Play className="h-5 w-5 text-white ml-0.5" />
                    )}
                  </button>
                  {/* Navigation arrows */}
                  {scenesWithImages.length > 1 && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCurrentScene((prev) => (prev - 1 + scenesWithImages.length) % scenesWithImages.length); }}
                        className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60"
                      >
                        <ChevronUp className="h-4 w-4 -rotate-90" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setCurrentScene((prev) => (prev + 1) % scenesWithImages.length); }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60"
                      >
                        <ChevronDown className="h-4 w-4 -rotate-90" />
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Fallback if no images generated */}
              {scenesWithImages.length === 0 && (
                <div className="w-full aspect-[9/16] bg-gray-900 rounded-xl flex items-center justify-center">
                  <div className="text-center p-4">
                    <Video className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                    <span className="text-[10px] text-gray-500">Imagens não puderam ser geradas</span>
                  </div>
                </div>
              )}

              {creative.total_duration && (
                <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                  <span>Duração: {creative.total_duration}</span>
                  {creative.music_suggestion && (
                    <span className="truncate ml-2">🎵 {creative.music_suggestion.substring(0, 30)}</span>
                  )}
                </div>
              )}

              {/* Script */}
              <div className="bg-muted rounded-lg overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowScript(!showScript); }}
                  className="w-full flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-foreground"
                >
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Roteiro
                  </span>
                  {showScript ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showScript && (
                  <div className="px-2 sm:px-3 pb-2 max-h-48 overflow-y-auto">
                    <div className="prose prose-xs text-[10px] sm:text-xs text-muted-foreground">
                      <ReactMarkdown>{creative.script || creative.creative_notes || ""}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Scenes */}
              {allScenes.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg overflow-hidden">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowScenes(!showScenes); }}
                    className="w-full flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-medium text-blue-700"
                  >
                    <span>🎬 {allScenes.length} Cenas</span>
                    {showScenes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {showScenes && (
                    <div className="px-2 sm:px-3 pb-2 space-y-2 max-h-48 overflow-y-auto">
                      {allScenes.map((scene: any, i: number) => (
                        <div key={i} className="bg-white rounded-lg p-2 border border-blue-100">
                          {scene.generated_image && (
                            <img src={scene.generated_image} alt={`Cena ${i + 1}`} className="w-full h-20 object-cover rounded mb-1.5" />
                          )}
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-blue-800">Cena {scene.number || i + 1}</span>
                            <span className="text-[9px] text-blue-500">{scene.duration}</span>
                          </div>
                          <p className="text-[9px] sm:text-[10px] text-blue-600">{scene.description}</p>
                          {scene.text_overlay && (
                            <p className="text-[9px] text-blue-400 mt-1 italic">"{scene.text_overlay}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* UGC Aspects */}
              {creative.ugc_aspects && (
                <div className="bg-purple-50 border border-purple-100 rounded-lg px-2 sm:px-3 py-1.5 sm:py-2">
                  <span className="text-[10px] sm:text-xs font-medium text-purple-700 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> UGC Otimizado — {creative.ugc_aspects.length} aspectos aplicados
                  </span>
                </div>
              )}
            </>
          )}

          {/* Placeholder if no creative */}
          {!creative && (
            <div className="w-full aspect-[9/16] bg-gray-900 rounded-xl flex items-center justify-center">
              <div className="text-center">
                <Video className="h-8 w-8 sm:h-10 sm:w-10 text-gray-600 mx-auto mb-2" />
                <span className="text-[10px] sm:text-xs text-gray-500">Aguardando geração...</span>
              </div>
            </div>
          )}

          <Button className="w-full bg-foreground hover:bg-foreground/90 text-background rounded-xl h-9 sm:h-10 gap-2 text-xs sm:text-sm font-medium">
            <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            Exportar Criativo
          </Button>
        </div>

        {isConnecting && !isConnectingFrom && (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-6 sm:h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-pulse"
          >
            <Plus className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ShortsReels;
