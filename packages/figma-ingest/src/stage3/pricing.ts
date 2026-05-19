/**
 * 모델별 가격표 (USD per million tokens).
 * 2026-05 기준 Anthropic 공시 가격. 출처: https://docs.anthropic.com/pricing
 */

export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;       // 캐시 read
  cacheCreationPerMillion: number;     // 캐시 첫 write (25% premium)
  outputPerMillion: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': {
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    cacheCreationPerMillion: 3.75,
    outputPerMillion: 15.00,
  },
  'claude-opus-4-7': {
    inputPerMillion: 15.00,
    cachedInputPerMillion: 1.50,
    cacheCreationPerMillion: 18.75,
    outputPerMillion: 75.00,
  },
};

export function getPricing(model: string): ModelPricing {
  const p = PRICING[model];
  if (!p) {
    throw new Error(`Unknown model "${model}". Available: ${Object.keys(PRICING).join(', ')}`);
  }
  return p;
}
