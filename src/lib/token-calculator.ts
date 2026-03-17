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
 * Fórmula simplificada: 1 token = 1 vídeo gerado.
 * Qualidade e pré-processamento não afetam o custo.
 */
export function calculateTokenCost(
  totalCombinations: number,
  _settings: ProcessingSettings
): TokenCost {
  const base = totalCombinations;
  const qualityMultiplier = 1.0;
  const preprocessBonus = 0;
  const total = base;

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
