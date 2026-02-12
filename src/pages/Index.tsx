import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { VideoUploadZone } from '@/components/VideoUploadZone';
import { CombinationList } from '@/components/CombinationList';
import {
  generateCombinations,
  concatenateVideos,
  type VideoFile,
  type Combination,
} from '@/lib/video-processor';
import { Clapperboard, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';

const Index = () => {
  const [hooks, setHooks] = useState<VideoFile[]>([]);
  const [bodies, setBodies] = useState<VideoFile[]>([]);
  const [ctas, setCtas] = useState<VideoFile[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);

  const totalCombinations = hooks.length * bodies.length * ctas.length;
  const canProcess = hooks.length > 0 && bodies.length > 0 && ctas.length > 0;

  const handleProcess = useCallback(async () => {
    if (!canProcess) return;

    const combos = generateCombinations(hooks, bodies, ctas);
    setCombinations(combos);
    setIsProcessing(true);

    for (let i = 0; i < combos.length; i++) {
      combos[i].status = 'processing';
      setCombinations([...combos]);

      try {
        const url = await concatenateVideos(combos[i], (p) =>
          setCurrentProgress(p)
        );
        combos[i].status = 'done';
        combos[i].outputUrl = url;
      } catch (err) {
        combos[i].status = 'error';
        console.error(`Error processing combo ${combos[i].id}:`, err);
      }

      setCombinations([...combos]);
      setCurrentProgress(0);
    }

    setIsProcessing(false);
    toast.success('Processamento concluído!');
  }, [canProcess, hooks, bodies, ctas]);

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

        {/* Process button */}
        <div className="flex justify-center">
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

        {/* Info about subtitles */}
        <div className="rounded-xl border border-border bg-muted/30 p-5 text-center">
          <p className="text-sm text-muted-foreground">
            <strong>Legendas automáticas:</strong> Para gerar legendas sincronizadas, ative o Lovable Cloud
            para utilizar transcrição por IA. Entre em contato para configurar.
          </p>
        </div>
      </main>
    </div>
  );
};

export default Index;
