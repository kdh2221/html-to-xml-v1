/**
 * Anthropic Claude SDK 래퍼.
 *
 * - forced tool use (submit_data_collection)
 * - 시스템 프롬프트 캐싱
 * - Zod 검증 실패 시 1회 재시도 (구체적 에러 피드백 동봉)
 * - cost-tracker 기록
 */
import Anthropic from '@anthropic-ai/sdk';
import { validateDataCollection } from './ir-schema';
import { buildPrompt } from './prompt-builder';
import { extractRegions } from './xml-region-parser';
import { CostTracker } from './cost-tracker';
import type { DataCollectionIR } from '../types';
import type { LLMClientLike, InferOptions } from './llm-mock';

export interface LLMClientOptions {
  client?: Anthropic;
  tracker: CostTracker;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  maxRetries?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MAX_RETRIES = 1;

export class LLMClient implements LLMClientLike {
  private readonly client: any;
  private readonly tracker: CostTracker;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxRetries: number;

  constructor(options: LLMClientOptions) {
    this.tracker = options.tracker;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (options.client) {
      this.client = options.client;
    } else {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY 환경변수가 없습니다. ' +
          '`--no-llm` 플래그로 LLM 단계 우회하거나 환경변수를 설정하세요.'
        );
      }
      this.client = new Anthropic({ apiKey });
    }
  }

  async inferDataCollection(xml: string, _options: InferOptions = {}): Promise<DataCollectionIR> {
    const regions = extractRegions(xml);
    const prompt = buildPrompt(regions);

    let lastError: unknown = null;
    let extraInstruction = '';

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const userMessage = extraInstruction
        ? `${prompt.user}\n\n## 이전 응답 검증 오류\n${extraInstruction}\n다시 시도하세요.`
        : prompt.user;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0,
        system: prompt.system as any,
        messages: [{ role: 'user', content: userMessage }],
        tools: prompt.tools as any,
        tool_choice: { type: 'tool', name: 'submit_data_collection' },
      });

      this.tracker.record({
        model: this.model,
        inputTokens: response.usage.input_tokens ?? 0,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      });
      this.tracker.checkSessionCap();

      const toolUse = response.content.find((c: any) => c.type === 'tool_use');
      if (!toolUse) {
        lastError = new Error('LLM 응답에 tool_use 블록이 없음');
        extraInstruction = '도구를 호출하지 않았습니다. 반드시 submit_data_collection 도구를 호출하세요.';
        continue;
      }

      try {
        return validateDataCollection(toolUse.input);
      } catch (zodErr) {
        lastError = zodErr;
        extraInstruction = `Zod 검증 실패: ${(zodErr as Error).message}`;
      }
    }

    throw new Error(
      `LLMClient: ${this.maxRetries + 1}회 시도 후에도 검증 실패. 마지막 오류: ${(lastError as Error).message}`
    );
  }
}
