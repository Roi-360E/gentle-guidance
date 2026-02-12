import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { VideoUploadZone } from '@/components/VideoUploadZone';
import { CombinationList } from '@/components/CombinationList';
import { ProcessingSettingsPanel } from '@/components/ProcessingSettings';
import {
  generateCombinations,
  processQueue,
  defaultSettings,
  type VideoFile,
  type Combination,
  type ProcessingSettings,
} from '@/lib/video-processor';
import { Clapperboard, Sparkles, Zap, Square } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  const [hooks, setHooks] = useState<VideoFile[]>([]);
  const [bodies, setBodies] = useState<VideoFile[]>([]);
  const [ctas, setCtas] = useState<VideoFile[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [settings, setSettings] = useState<ProcessingSettings>(defaultSettings);
  const abortRef = useRef<AbortController | null>(null);

  const totalCombinations = hooks.length * bodies.length * ctas.length;
  const canProcess = hooks.length > 0 && bodies.length > 0 && ctas.length > 0;

  const handleProcess = useCallback(async () => {
    if (!canProcess) return;

    const combos = generateCombinations(hooks, bodies, ctas);
    setCombinations(combos);
    setIsProcessing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await processQueue(
      combos,
      settings,
      (updated) => setCombinations([...updated]),
      (p) => setCurrentProgress(p),
      controller.signal
    );

    setIsProcessing(false);
    abortRef.current = null;

    if (!controller.signal.aborted) {
      toast.success('Processamento concluído!');
    } else {
      toast.info('Processamento cancelado.');
    }
  }, [canProcess, hooks, bodies, ctas, settings]);

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleDownload = (combo: Combination) => {
    if (!combo.outputUrl) return;
    const a = document.createElement('a');
    a.href = combo.outputUrl;
    a.download = combo.outputName;
    a.click();
  };

  const handleDownloadAll = () => {
    combinations
      .filter((c) => c.status === 'done' && c.outputUrl)
      .forEach((c) => handleDownload(c));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="bg-primary rounded-xl p-2.5">
            <Clapperboard className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">VideoMix</h1>
            <p className="text-sm text-muted-foreground">
              Concatenador de vídeos para Facebook Ads
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCombinations}</p>
              <p className="text-sm text-muted-foreground">Vídeos a gerar</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="bg-accent/10 rounded-lg p-2.5">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {hooks.length + bodies.length + ctas.length}
              </p>
              <p className="text-sm text-muted-foreground">Vídeos enviados</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
            <div className="bg-primary/10 rounded-lg p-2.5">
              <Clapperboard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {combinations.filter((c) => c.status === 'done').length}
              </p>
              <p className="text-sm text-muted-foreground">Processados</p>
            </div>
          </div>
        </div>

        {/* Upload zones */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <VideoUploadZone
            label="Ganchos"
            description="Até 10 vídeos de abertura"
            maxFiles={10}
            files={hooks}
            onFilesChange={setHooks}
            accentColor="bg-primary"
          />
          <VideoUploadZone
            label="Corpo"
            description="Até 5 vídeos de conteúdo"
            maxFiles={5}
            files={bodies}
            onFilesChange={setBodies}
            accentColor="bg-accent"
          />
          <VideoUploadZone
            label="CTA"
            description="Até 2 vídeos de chamada"
            maxFiles={2}
            files={ctas}
            onFilesChange={setCtas}
            accentColor="bg-destructive"
          />
        </div>

        {/* Processing Settings */}
        <ProcessingSettingsPanel
          settings={settings}
          onChange={setSettings}
          disabled={isProcessing}
        />

        {/* Process / Cancel buttons */}
        <div className="flex justify-center gap-3">
          <Button
            size="lg"
            className="px-12 text-base font-semibold"
            disabled={!canProcess || isProcessing}
            onClick={handleProcess}
          >
            {isProcessing ? (
              <>Processando...</>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                Gerar {totalCombinations} Vídeos
              </>
            )}
          </Button>
          {isProcessing && (
            <Button
              size="lg"
              variant="destructive"
              onClick={handleCancel}
            >
              <Square className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          )}
        </div>

        {/* Results */}
        {combinations.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6">
            <CombinationList
              combinations={combinations}
              currentProgress={currentProgress}
              onDownload={handleDownload}
              onDownloadAll={handleDownloadAll}
              isProcessing={isProcessing}
            />
          </div>
        )}

        {/* Info about subtitles & server */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-2 text-center">
          <p className="text-sm text-muted-foreground">
            <strong>Legendas automáticas:</strong> Para gerar legendas sincronizadas, ative o Lovable Cloud
            para utilizar transcrição por IA.
          </p>
          <p className="text-sm text-muted-foreground">
            <strong>Processamento no servidor:</strong> Para produções com muitos vídeos, considere migrar
            para processamento em nuvem com FFmpeg nativo para maior velocidade.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
