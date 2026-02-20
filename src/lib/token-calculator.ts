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
  // 4K reservado para futuro
  // if (settings.resolution === '4k') qualityMultiplier = 3.0;

  const preprocessBonus = settings.preProcess ? 0.5 * totalCombinations : 0;

  const total = Math.ceil(base * qualityMultiplier + preprocessBonus);

  return { base, qualityMultiplier, preprocessBonus, total };
}

/** Planos e seus limites de tokens */
export const TOKEN_PLANS = {
  free: { name: 'Gratuito', tokens: 10, price: 0 },
  professional: { name: 'Profissional', tokens: 200, price: 37.90 },
  advanced: { name: 'Avançado', tokens: 400, price: 67.90 },
  premium: { name: 'Premium', tokens: 850, price: 87.90 },
  enterprise: { name: 'Empresarial', tokens: 1200, price: 197 },
  unlimited: { name: 'Ilimitado', tokens: Infinity, price: 297 },
} as const;

export type PlanId = keyof typeof TOKEN_PLANS;

/** Verifica se o usuário tem tokens suficientes */
export function hasEnoughTokens(
  plan: string,
  tokenBalance: number,
  cost: number
): boolean {
  if (plan === 'unlimited') return true;
  return tokenBalance >= cost;
}
