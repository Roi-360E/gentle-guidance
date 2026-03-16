import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import {
  generateCombinations,
  processQueue,
  revokeBlobUrls,
  type Combination,
  type ProcessingSettings,
} from '@/lib/video-processor';
import { processQueueCloud } from '@/lib/cloud-processor';
import { calculateTokenCost, hasEnoughTokens } from '@/lib/token-calculator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { VideoFileWithProgress } from '@/components/VideoUploadZone';
import {
  saveVideoToDB,
  getAllVideosFromDB,
  deleteVideoFromDB,
  clearAllVideosFromDB,
  type PersistedVideo,
} from '@/lib/downloads-db';

export interface DownloadedVideo {
  id: string;
  name: string;
  url: string;
  createdAt: Date;
  batchId: string;
}

interface ProcessingContextType {
  isProcessing: boolean;
  currentProgress: number;
  processingPhase: string;
  combinations: Combination[];
  downloadedVideos: DownloadedVideo[];
  startProcessing: (params: {
    hooks: VideoFileWithProgress[];
    bodies: VideoFileWithProgress[];
    ctas: VideoFileWithProgress[];
    settings: ProcessingSettings;
    currentPlan: string;
    tokenBalance: number;
    videoCount: number;
    userId: string;
    onTokenUpdate: (newBalance: number, newCount: number) => void;
  }) => void;
  cancelProcessing: () => void;
  clearDownload: (id: string) => void;
  clearAllDownloads: () => void;
  setCombinations: React.Dispatch<React.SetStateAction<Combination[]>>;
}

const ProcessingContext = createContext<ProcessingContextType | null>(null);

export function ProcessingProvider({ children }: { children: React.ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [processingPhase, setProcessingPhase] = useState('');
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [downloadedVideos, setDownloadedVideos] = useState<DownloadedVideo[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const processingRef = useRef(false); // Track processing state for beforeunload

  // ─── Load persisted downloads from IndexedDB on mount ───
  useEffect(() => {
    (async () => {
      try {
        const persisted = await getAllVideosFromDB();
        if (persisted.length > 0) {
          const restored: DownloadedVideo[] = persisted.map(p => ({
            id: p.id,
            name: p.name,
            url: URL.createObjectURL(p.blob),
            createdAt: new Date(p.createdAt),
            batchId: p.batchId,
          }));
          // Sort newest first
          restored.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          setDownloadedVideos(restored);
          console.log(`[Downloads] ✅ Restored ${restored.length} videos from IndexedDB`);
        }
      } catch (err) {
        console.warn('[Downloads] Failed to restore from IndexedDB:', err);
      }
    })();
  }, []);

  // ─── Warn user before closing tab during processing ───
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (processingRef.current) {
        e.preventDefault();
        e.returnValue = 'Vídeos estão sendo processados. Tem certeza que deseja sair?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const startProcessing = useCallback(({
    hooks, bodies, ctas, settings, currentPlan, tokenBalance, videoCount, userId, onTokenUpdate
  }: Parameters<ProcessingContextType['startProcessing']>[0]) => {
    const totalCombinations = hooks.length * bodies.length * ctas.length;
    const cost = calculateTokenCost(totalCombinations, settings);
    if (!hasEnoughTokens(currentPlan, tokenBalance, cost.total)) {
      toast.error(`Tokens insuficientes! Custo: ${cost.total} tokens, saldo: ${tokenBalance}.`);
      return;
    }

    // Revoke old blob URLs
    revokeBlobUrls(combinations);

    const combos = generateCombinations(hooks, bodies, ctas);
    const expectedTotal = hooks.length * bodies.length * ctas.length;
    if (combos.length !== expectedTotal) {
      toast.error(`Erro: esperado ${expectedTotal} combinações mas gerou ${combos.length}.`);
      return;
    }

    setCombinations(combos);
    setIsProcessing(true);
    processingRef.current = true;
    setProcessingPhase('Iniciando geração de combinações...');
    setCurrentProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;
    const batchId = Date.now().toString();

    const processFn = settings.useCloud ? processQueueCloud : processQueue;

    (async () => {
      try {
        await processFn(
          combos,
          settings,
          (updated) => setCombinations([...updated]),
          (p) => setCurrentProgress(p),
          controller.signal
        );
      } catch (err) {
        console.error('[Processing] Error:', err);
      }

      if (abortRef.current === controller) {
        setIsProcessing(false);
        processingRef.current = false;
        setProcessingPhase('');
        abortRef.current = null;

        if (!controller.signal.aborted) {
          const doneCount = combos.filter(c => c.status === 'done').length;
          const errorCount = combos.filter(c => c.status === 'error').length;

          // Save completed videos to downloads + IndexedDB
          const newDownloads: DownloadedVideo[] = [];

          for (const c of combos) {
            if (c.status === 'done' && c.outputUrl) {
              const vid: DownloadedVideo = {
                id: `${batchId}_${c.outputName}`,
                name: c.outputName,
                url: c.outputUrl,
                createdAt: new Date(),
                batchId,
              };
              newDownloads.push(vid);

              // Persist blob to IndexedDB
              try {
                const response = await fetch(c.outputUrl);
                const blob = await response.blob();
                await saveVideoToDB({
                  id: vid.id,
                  name: vid.name,
                  blob,
                  createdAt: vid.createdAt.toISOString(),
                  batchId: vid.batchId,
                });
              } catch (err) {
                console.warn(`[Downloads] Failed to persist ${c.outputName} to IndexedDB:`, err);
              }
            }
          }
          
          if (newDownloads.length > 0) {
            setDownloadedVideos(prev => [...newDownloads, ...prev]);
          }

          // Debit tokens
          if (doneCount > 0 && currentPlan !== 'enterprise') {
            const actualCost = calculateTokenCost(doneCount, settings);
            const newBalance = Math.max(0, tokenBalance - actualCost.total);
            const newCount = videoCount + doneCount;
            const monthYear = new Date().toISOString().substring(0, 7);
            await supabase
              .from('video_usage')
              .update({ token_balance: newBalance, video_count: newCount })
              .eq('user_id', userId)
              .eq('month_year', monthYear);
            onTokenUpdate(newBalance, newCount);
          }

          if (errorCount > 0) {
            toast.error(`Concluído com ${errorCount} erro(s). ${doneCount} vídeo(s) salvo(s) em Meus Downloads.`);
          } else {
            toast.success(`${doneCount} vídeo(s) gerado(s) e salvos em Meus Downloads! ✅`);
          }
        } else {
          toast.info('Processamento cancelado.');
        }
      }
    })();
  }, [combinations]);

  const cancelProcessing = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    setIsProcessing(false);
    processingRef.current = false;
    setProcessingPhase('');
    setCurrentProgress(0);
    toast.info('Cancelamento solicitado...');
  }, []);

  const clearDownload = useCallback((id: string) => {
    setDownloadedVideos(prev => {
      const video = prev.find(d => d.id === id);
      if (video?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(video.url);
      }
      return prev.filter(d => d.id !== id);
    });
    deleteVideoFromDB(id).catch(err => console.warn('[Downloads] Failed to delete from IndexedDB:', err));
  }, []);

  const clearAllDownloads = useCallback(() => {
    setDownloadedVideos(prev => {
      prev.forEach(v => { if (v.url?.startsWith('blob:')) URL.revokeObjectURL(v.url); });
      return [];
    });
    clearAllVideosFromDB().catch(err => console.warn('[Downloads] Failed to clear IndexedDB:', err));
  }, []);

  return (
    <ProcessingContext.Provider value={{
      isProcessing,
      currentProgress,
      processingPhase,
      combinations,
      downloadedVideos,
      startProcessing,
      cancelProcessing,
      clearDownload,
      clearAllDownloads,
      setCombinations,
    }}>
      {children}
    </ProcessingContext.Provider>
  );
}

export function useProcessing() {
  const ctx = useContext(ProcessingContext);
  if (!ctx) throw new Error('useProcessing must be used within ProcessingProvider');
  return ctx;
}
