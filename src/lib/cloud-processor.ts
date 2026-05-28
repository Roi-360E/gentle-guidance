import { processQueue, type Combination, type ProcessingSettings } from './video-processor';

/**
 * Legacy compatibility wrapper.
 *
 * The old "cloud" path used Transloadit. Per project policy, all creative video
 * processing now runs on the Integrator VPS with native FFmpeg through
 * video-processor.ts. Keeping this exported function prevents stale imports from
 * accidentally calling Transloadit while still routing work to the VPS.
 */
export async function processQueueCloud(
  combinations: Combination[],
  settings: ProcessingSettings,
  onUpdate: (combos: Combination[]) => void,
  onProgressItem: (progress: number) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  console.warn('[CloudProcessor] Transloadit disabled; routing to Integrator VPS FFmpeg.');
  return processQueue(combinations, { ...settings, useCloud: false }, onUpdate, onProgressItem, abortSignal);
}