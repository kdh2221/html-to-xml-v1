import { describe, expect, it } from 'vitest';
import { dataCollectionSchema, validateDataCollection } from '../../src/stage3/ir-schema';

describe('dataCollectionSchema (Zod)', () => {
  it('유효한 DataCollection 통과', () => {
    const valid = {
      dataMaps: [{
        id: 'dma_search',
        name: '검색조건',
        keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }],
      }],
      dataLists: [{
        id: 'dlt_list',
        name: '사원목록',
        columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }],
      }],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(valid)).not.toThrow();
  });

  it('dma_ prefix 누락 → 거부', () => {
    const invalid = {
      dataMaps: [{ id: 'search', name: 'X', keys: [{ id: 'X', name: 'X', dataType: 'text' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow(/dma_/);
  });

  it('dlt_ prefix 누락 → 거부', () => {
    const invalid = {
      dataMaps: [],
      dataLists: [{ id: 'list', name: 'X', columns: [{ id: 'X', name: 'X', dataType: 'text' }] }],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow(/dlt_/);
  });

  it('소문자 key id → 거부 (UPPER_SNAKE만 허용)', () => {
    const invalid = {
      dataMaps: [{ id: 'dma_search', name: 'X',
        keys: [{ id: 'empCd', name: 'X', dataType: 'text' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow();
  });

  it('chk는 column id로 허용', () => {
    const valid = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_list', name: 'X',
        columns: [{ id: 'chk', name: '선택', dataType: 'text' }] }],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(valid)).not.toThrow();
  });

  it('dataType 다른 값 → 거부', () => {
    const invalid = {
      dataMaps: [{ id: 'dma_search', name: 'X',
        keys: [{ id: 'EMP_CD', name: 'X', dataType: 'string' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow();
  });

  it('confidence 범위 벗어남 → 거부', () => {
    const invalid = {
      dataMaps: [],
      dataLists: [],
      confidence: 1.5,
    };
    expect(() => validateDataCollection(invalid)).toThrow();
  });
});
