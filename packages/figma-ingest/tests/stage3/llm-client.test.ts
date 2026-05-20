import { describe, expect, it, vi } from 'vitest';
import { LLMClient } from '../../src/stage3/llm-client';
import { CostTracker } from '../../src/stage3/cost-tracker';

function makeMockAnthropic(toolUseInput: any, usage = {
  input_tokens: 1000,
  cache_read_input_tokens: 5000,
  cache_creation_input_tokens: 0,
  output_tokens: 200,
}) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'submit_data_collection', input: toolUseInput }],
        usage,
      }),
    },
  };
}

const sampleResponse = {
  dataMaps: [{ id: 'dma_search', name: '검색',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  dataLists: [],
  confidence: 0.9,
};

describe('LLMClient', () => {
  it('Anthropic API 호출 후 Zod 검증된 IR 반환', async () => {
    const anthropic = makeMockAnthropic(sampleResponse);
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    const result = await client.inferDataCollection('<root/>');
    expect(result.dataMaps[0].id).toBe('dma_search');
    expect(anthropic.messages.create).toHaveBeenCalledOnce();
  });

  it('cost-tracker에 usage 기록', async () => {
    const anthropic = makeMockAnthropic(sampleResponse);
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    await client.inferDataCollection('<root/>');
    const entries = tracker.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].inputTokens).toBe(1000);
    expect(entries[0].cachedInputTokens).toBe(5000);
    expect(entries[0].outputTokens).toBe(200);
  });

  it('tool_use 응답이 없으면 throw', async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'no tool used' }],
          usage: { input_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 10 },
        }),
      },
    };
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    await expect(client.inferDataCollection('<root/>')).rejects.toThrow(/tool_use/i);
  });

  it('Zod validation 실패 시 1회 재시도', async () => {
    const anthropic = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            content: [{ type: 'tool_use', name: 'submit_data_collection',
              input: { dataMaps: [{ id: 'search', name: 'X', keys: [] }], dataLists: [], confidence: 0.9 } }],
            usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100 },
          })
          .mockResolvedValueOnce({
            content: [{ type: 'tool_use', name: 'submit_data_collection', input: sampleResponse }],
            usage: { input_tokens: 1100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100 },
          }),
      },
    };
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    const result = await client.inferDataCollection('<root/>');
    expect(result.dataMaps[0].id).toBe('dma_search');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });

  it('Zod validation 2회 연속 실패 시 throw', async () => {
    const badInput = { dataMaps: [{ id: 'search', name: 'X', keys: [] }], dataLists: [], confidence: 0.9 };
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'tool_use', name: 'submit_data_collection', input: badInput }],
          usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100 },
        }),
      },
    };
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    await expect(client.inferDataCollection('<root/>')).rejects.toThrow();
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });
});
