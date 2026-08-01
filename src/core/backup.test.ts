import { describe, expect, it } from 'vitest';
import { pickWinners, isBackup, planMerge } from './backup';
import type { Backup } from './backup';

type Row = { id: string; updatedAt: string; v: number };

describe('pickWinners', () => {
  it('takes incoming records that are new locally', () => {
    const local: Row[] = [{ id: 'a', updatedAt: '2025-01-01', v: 1 }];
    const incoming: Row[] = [{ id: 'b', updatedAt: '2025-01-01', v: 1 }];
    expect(pickWinners(local, incoming).map((r) => r.id)).toEqual(['b']);
  });

  it('takes incoming records that are strictly newer', () => {
    const local: Row[] = [{ id: 'a', updatedAt: '2025-01-01T00:00:00.000Z', v: 1 }];
    const incoming: Row[] = [{ id: 'a', updatedAt: '2025-06-01T00:00:00.000Z', v: 2 }];
    expect(pickWinners(local, incoming)[0]?.v).toBe(2);
  });

  it('keeps the local record when it is newer or equal', () => {
    const local: Row[] = [{ id: 'a', updatedAt: '2025-06-01', v: 2 }];
    const incoming: Row[] = [{ id: 'a', updatedAt: '2025-01-01', v: 1 }];
    expect(pickWinners(local, incoming)).toEqual([]);
  });
});

describe('isBackup', () => {
  it('accepts a well-formed backup', () => {
    const b: Backup = {
      format: 'lyrics-binder',
      version: 1,
      exportedAt: '2025-01-01',
      pages: [],
      documents: [],
    };
    expect(isBackup(b)).toBe(true);
  });

  it('rejects arbitrary json', () => {
    expect(isBackup({ hello: 'world' })).toBe(false);
    expect(isBackup(null)).toBe(false);
    expect(isBackup([])).toBe(false);
  });
});

describe('planMerge', () => {
  it('propagates a soft delete as a newer write', () => {
    const local = {
      pages: [{ id: 'p1', updatedAt: '2025-01-01', song: 'x' } as never],
      documents: [],
    };
    const incoming: Backup = {
      format: 'lyrics-binder',
      version: 1,
      exportedAt: '2025-07-01',
      pages: [{ id: 'p1', updatedAt: '2025-07-01', song: 'x', deletedAt: '2025-07-01' } as never],
      documents: [],
    };
    const plan = planMerge(local, incoming);
    expect(plan.pages).toHaveLength(1);
    expect((plan.pages[0] as { deletedAt?: string }).deletedAt).toBe('2025-07-01');
  });
});
