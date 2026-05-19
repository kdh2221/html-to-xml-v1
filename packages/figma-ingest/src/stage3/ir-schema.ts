/**
 * Zod 스키마: LLM이 tool use로 제출한 DataCollection 응답을 런타임 검증한다.
 * Anthropic의 schema enforcement + 이 Zod 검증 = 이중 안전망.
 */
import { z } from 'zod';
import type { DataCollectionIR } from '../types';

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
const COLUMN_ID = /^([A-Z][A-Z0-9_]*|chk)$/;

const dataTypeSchema = z.enum(['text', 'number', 'date']);

const dataMapKeySchema = z.object({
  id: z.string().regex(UPPER_SNAKE, 'key.id는 UPPER_SNAKE_CASE여야 함'),
  name: z.string().min(1),
  dataType: dataTypeSchema,
});

const dataMapSchema = z.object({
  id: z.string().regex(/^dma_[a-zA-Z0-9_]+$/, 'DataMap.id는 dma_ prefix가 있어야 함'),
  name: z.string().min(1),
  keys: z.array(dataMapKeySchema),
});

const dataListColumnSchema = z.object({
  id: z.string().regex(COLUMN_ID, 'column.id는 UPPER_SNAKE 또는 "chk"여야 함'),
  name: z.string().min(1),
  dataType: dataTypeSchema,
});

const dataListSchema = z.object({
  id: z.string().regex(/^dlt_[a-zA-Z0-9_]+$/, 'DataList.id는 dlt_ prefix가 있어야 함'),
  name: z.string().min(1),
  saveRemovedData: z.boolean().optional(),
  columns: z.array(dataListColumnSchema),
});

export const dataCollectionSchema = z.object({
  dataMaps: z.array(dataMapSchema),
  dataLists: z.array(dataListSchema),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export function validateDataCollection(raw: unknown): DataCollectionIR {
  return dataCollectionSchema.parse(raw);
}
