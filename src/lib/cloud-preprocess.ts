import { preProcessBatch, type ProcessingSettings } from './video-processor';

export interface CloudPreprocessResult {
  originalFile: File;
  normalizedFile: File;
}

/**
 * Legacy compatibility wrapper.
 *
 * The previous cloud pre-process implementation used Transloadit. It is now
 * intentionally disabled and routed to the Integrator VPS FFmpeg pipeline.
 */
export async function cloudPreprocessFiles(
  files: File[],
  settings: ProcessingSettings,
  onProgress?: (fileIndex: number, status: 'uploading' | 'processing' | 'downloading' | 'done', pct: number) => void,
): Promise<CloudPreprocessResult[]> {
  await preProcessBatch(
    files,
    'VPS',
    { ...settings, useCloud: false },
    (fileIndex, status, pct) => {
      const mappedStatus = status === 'loading' ? 'uploading' : status;
      onProgress?.(fileIndex, mappedStatus, pct);
    },
  );

  return files.map((file) => ({ originalFile: file, normalizedFile: file }));
}