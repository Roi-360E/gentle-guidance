import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Plus, Trash2, Play, Image, Upload, Link2,
  GripVertical, Sparkles, Video, Home, Lock, X, Move,
  ZoomIn, ZoomOut, Maximize2
} from "lucide-react";

/* ─── Types ─── */
interface CanvasNode {
  id: string;
  type: "image" | "creation-block" | "preview";
  x: number;
  y: number;
  data: {
    label?: string;
    imageUrl?: string;
    file?: File;
  };
}

interface CanvasConnection {
  id: string;
  fromId: string;
  toId: string;
}

/* ─── Helpers ─── */
let nodeCounter = 0;
const newId = () => `node-${++nodeCounter}-${Date.now()}`;

const ShortsReels = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canvasRef = useRef<HTMLDivElement>(null);

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
  const [nodes, setNodes] = useState<CanvasNode[]>([
    {
      id: "creation-block",
      type: "creation-block",
      x: 400,
      y: 200,
      data: { label: "Bloco de Criação" },
    },
    {
      id: "preview-block",
      type: "preview",
      x: 850,
      y: 200,
      data: { label: "Preview" },
    },
  ]);
  const [connections, setConnections] = useState<CanvasConnection[]>([]);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);

  /* Drag state */
  const [dragging, setDragging] = useState<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  /* Canvas pan & zoom */
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  /* Prompt state */
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("Rosto para vídeo (Alta qualidade)");
  const [aspect, setAspect] = useState("9:16 (Vertical)");

  /* ─── Add image node ─── */
  const addImageNode = useCallback(() => {
    const id = newId();
    setNodes((prev) => [
      ...prev,
      {
        id,
        type: "image",
        x: 80 + Math.random() * 120,
        y: 120 + Math.random() * 200,
        data: { label: "Imagem", imageUrl: "" },
      },
    ]);
  }, []);

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
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId));
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

  /* ─── Drag handlers ─── */
  const onNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
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
  }, []);

  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains("canvas-bg")) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  /* ─── Get node center for connection lines ─── */
  const getNodeCenter = (node: CanvasNode) => {
    const w = node.type === "creation-block" ? 320 : node.type === "preview" ? 280 : 160;
    const h = node.type === "creation-block" ? 400 : node.type === "preview" ? 320 : 180;
    return { x: node.x + w / 2, y: node.y + h / 2 };
  };

  if (!accessChecked) return null;

  return (
    <div className="h-screen w-screen flex flex-col bg-white overflow-hidden">
      {/* ─── Top Bar ─── */}
      <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-gray-900">Criador de Vídeos</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 text-gray-600" onClick={addImageNode}>
            <Plus className="h-4 w-4" />
            Adicionar Imagem
          </Button>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-gray-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="text-gray-500 gap-2" onClick={() => navigate("/")}>
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ─── Canvas ─── */}
      <div
        ref={canvasRef}
        className="flex-1 relative cursor-grab active:cursor-grabbing canvas-bg"
        style={{
          backgroundImage:
            "radial-gradient(circle, #e5e7eb 1px, transparent 1px)",
          backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
          backgroundPosition: `${pan.x * zoom}px ${pan.y * zoom}px`,
        }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* SVG connection lines */}
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
                <path
                  d={`M ${ax} ${ay} C ${cpx1} ${ay}, ${cpx2} ${by}, ${bx} ${by}`}
                  stroke="#3b82f6"
                  strokeWidth="2.5"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Arrow */}
                <circle cx={bx} cy={by} r="5" fill="#3b82f6" />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        <div
          className="absolute inset-0 z-10"
          style={{ transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "0 0" }}
        >
          {nodes.map((node) => {
            if (node.type === "image") {
              return (
                <ImageNode
                  key={node.id}
                  node={node}
                  onMouseDown={onNodeMouseDown}
                  onUpload={handleImageUpload}
                  onRemove={removeNode}
                  onConnect={startConnection}
                  isConnecting={connectingFrom !== null}
                  isConnectingFrom={connectingFrom === node.id}
                />
              );
            }
            if (node.type === "creation-block") {
              return (
                <CreationBlockNode
                  key={node.id}
                  node={node}
                  onMouseDown={onNodeMouseDown}
                  onConnect={startConnection}
                  isConnecting={connectingFrom !== null}
                  isConnectingFrom={connectingFrom === node.id}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  model={model}
                  setModel={setModel}
                  aspect={aspect}
                  setAspect={setAspect}
                  imageCount={connections.filter((c) => c.toId === node.id).length}
                />
              );
            }
            if (node.type === "preview") {
              return (
                <PreviewNode
                  key={node.id}
                  node={node}
                  onMouseDown={onNodeMouseDown}
                  onConnect={startConnection}
                  isConnecting={connectingFrom !== null}
                  isConnectingFrom={connectingFrom === node.id}
                />
              );
            }
            return null;
          })}
        </div>

        {/* Connecting hint */}
        {connectingFrom && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-30 animate-pulse">
            Clique em outro bloco para conectar • ESC para cancelar
          </div>
        )}
      </div>

      {/* ESC to cancel connecting */}
      {connectingFrom && (
        <div
          className="fixed inset-0 z-0"
          onKeyDown={(e) => e.key === "Escape" && setConnectingFrom(null)}
          tabIndex={0}
          style={{ pointerEvents: "none" }}
        />
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════ */
/* ─── Image Node ─── */
/* ═══════════════════════════════════════════════ */
interface ImageNodeProps {
  node: CanvasNode;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onUpload: (nodeId: string, file: File) => void;
  onRemove: (nodeId: string) => void;
  onConnect: (nodeId: string) => void;
  isConnecting: boolean;
  isConnectingFrom: boolean;
}

function ImageNode({ node, onMouseDown, onUpload, onRemove, onConnect, isConnecting, isConnectingFrom }: ImageNodeProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`absolute select-none group ${isConnectingFrom ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
      style={{ left: node.x, top: node.y, width: 160 }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
    >
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden hover:shadow-xl transition-shadow">
        {/* Drag handle */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 cursor-move">
          <div className="flex items-center gap-1.5">
            <GripVertical className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">Imagem</span>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={(e) => { e.stopPropagation(); onConnect(node.id); }} className="p-0.5 rounded hover:bg-blue-100" title="Conectar">
              <Link2 className="h-3 w-3 text-blue-500" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onRemove(node.id); }} className="p-0.5 rounded hover:bg-red-100" title="Remover">
              <Trash2 className="h-3 w-3 text-red-400" />
            </button>
          </div>
        </div>

        {/* Image area */}
        <div
          className="w-full aspect-square bg-gray-100 flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        >
          {node.data.imageUrl ? (
            <img src={node.data.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center p-3">
              <Upload className="h-6 w-6 text-gray-400 mx-auto mb-1" />
              <span className="text-[10px] text-gray-400">Clique para enviar</span>
            </div>
          )}
        </div>

        {/* Connection port */}
        {isConnecting && !isConnectingFrom && (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
            className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-pulse"
          >
            <Plus className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(node.id, f);
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════ */
/* ─── Creation Block Node ─── */
/* ═══════════════════════════════════════════════ */
interface CreationBlockProps {
  node: CanvasNode;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onConnect: (nodeId: string) => void;
  isConnecting: boolean;
  isConnectingFrom: boolean;
  prompt: string;
  setPrompt: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  aspect: string;
  setAspect: (v: string) => void;
  imageCount: number;
}

function CreationBlockNode({
  node, onMouseDown, onConnect, isConnecting, isConnectingFrom,
  prompt, setPrompt, model, setModel, aspect, setAspect, imageCount,
}: CreationBlockProps) {
  return (
    <div
      className={`absolute select-none ${isConnectingFrom ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl" : ""}`}
      style={{ left: node.x, top: node.y, width: 320 }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
    >
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 cursor-move">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-800">Bloco de criação</span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onConnect(node.id); }} className="p-1 rounded hover:bg-blue-100" title="Conectar">
            <Link2 className="h-4 w-4 text-blue-500" />
          </button>
        </div>

        <div className="p-4 space-y-4" onMouseDown={(e) => e.stopPropagation()}>
          {/* Model select */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Modelo</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
            >
              <option>Rosto para vídeo (Alta qualidade)</option>
              <option>Produto showcase</option>
              <option>UGC estilo natural</option>
            </select>
          </div>

          {/* Connected images count */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            Conecte até 5 imagens de referência
            <span className="float-right font-bold">{imageCount}/5</span>
          </div>

          {/* Aspect ratio */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Aspecto</label>
            <select
              value={aspect}
              onChange={(e) => setAspect(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700"
            >
              <option>9:16 (Vertical)</option>
              <option>16:9 (Horizontal)</option>
              <option>1:1 (Feed)</option>
            </select>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Prompt</label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Faça ela recomendar meu produto, falando em português, dê é muito bom para combater a insônia e mostrar o produto"
              className="min-h-[80px] text-sm bg-gray-50 border-gray-200 resize-none"
            />
          </div>

          {/* Generate button */}
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl h-11 gap-2">
            <Sparkles className="h-4 w-4" />
            Criar Criativo (65 créditos)
          </Button>
        </div>

        {/* Connection ports */}
        {isConnecting && !isConnectingFrom && (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-pulse"
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
  node: CanvasNode;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onConnect: (nodeId: string) => void;
  isConnecting: boolean;
  isConnectingFrom: boolean;
}

function PreviewNode({ node, onMouseDown, onConnect, isConnecting, isConnectingFrom }: PreviewNodeProps) {
  return (
    <div
      className={`absolute select-none ${isConnectingFrom ? "ring-2 ring-blue-500 ring-offset-2 rounded-2xl" : ""}`}
      style={{ left: node.x, top: node.y, width: 280 }}
      onMouseDown={(e) => onMouseDown(e, node.id)}
    >
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 cursor-move">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-800">Preview</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">completed</span>
            <span>45 créditos</span>
          </div>
        </div>

        {/* Preview area */}
        <div className="p-4">
          <div className="w-full aspect-[9/16] bg-gray-900 rounded-xl flex items-center justify-center relative overflow-hidden">
            <div className="text-center">
              <Video className="h-10 w-10 text-gray-600 mx-auto mb-2" />
              <span className="text-xs text-gray-500">Vídeo gerado aparece aqui</span>
            </div>
            {/* Play button overlay */}
            <button className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/20">
              <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                <Play className="h-6 w-6 text-gray-900 ml-1" />
              </div>
            </button>
          </div>

          <Button className="w-full mt-3 bg-gray-900 hover:bg-gray-800 text-white rounded-xl h-10 gap-2 text-sm font-medium">
            <Download className="h-4 w-4" />
            Baixar Criativo
          </Button>
        </div>

        {/* Connection port */}
        {isConnecting && !isConnectingFrom && (
          <button
            onClick={(e) => { e.stopPropagation(); onConnect(node.id); }}
            className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md animate-pulse"
          >
            <Plus className="h-3 w-3 text-white" />
          </button>
        )}
      </div>
    </div>
  );
}

export default ShortsReels;
