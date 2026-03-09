import type { ProcessingSettings } from './video-processor';

export interface TokenCost {
  base: number;
  qualityMultiplier: number;
  preprocessBonus: number;
  total: number;
}

/**
 * Calcula o custo em tokens para um lote de combinações.
 * 
 * Fórmula: combinações × multiplicador_qualidade + (pré-processamento ? 0.5 × combinações : 0)
 * 
 * Multiplicadores de qualidade:
 * - original/720p/480p/360p: ×1.0
 * - 1080p: ×1.5
 * - 4K: ×3.0 (reservado para futuro)
 */
export function calculateTokenCost(
  totalCombinations: number,
  settings: ProcessingSettings
): TokenCost {
  const base = totalCombinations;

  let qualityMultiplier = 1.0;
  if (settings.resolution === '1080p') {
    qualityMultiplier = 1.5;
  }

  const preprocessBonus = settings.preProcess ? 0.5 * totalCombinations : 0;

  const total = Math.ceil(base * qualityMultiplier + preprocessBonus);

  return { base, qualityMultiplier, preprocessBonus, total };
}

/** Verifica se o usuário tem tokens suficientes */
export function hasEnoughTokens(
  plan: string,
  tokenBalance: number,
  cost: number
): boolean {
  if (plan === 'unlimited') return true;
  return tokenBalance >= cost;
}
