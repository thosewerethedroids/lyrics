import { describe, expect, it } from 'vitest';
import { classify } from './reconcile';

describe('classify', () => {
  it('pushes a record that is new locally and absent remotely', () => {
    expect(classify({ localUpdatedAt: '2025-06-01' })).toBe('push');
  });

  it('pulls a record that is new remotely and absent locally', () => {
    expect(classify({ remoteSha: 'abc' })).toBe('pull');
  });

  it('does nothing when neither side has the record', () => {
    expect(classify({})).toBe('none');
  });

  it('pulls when only the remote changed', () => {
    expect(
      classify({
        localUpdatedAt: '2025-06-01',
        syncedUpdatedAt: '2025-06-01',
        remoteSha: 'new',
        syncedSha: 'old',
      }),
    ).toBe('pull');
  });

  it('pushes when only the local changed', () => {
    expect(
      classify({
        localUpdatedAt: '2025-07-01',
        syncedUpdatedAt: '2025-06-01',
        remoteSha: 'same',
        syncedSha: 'same',
      }),
    ).toBe('push');
  });

  it('flags a conflict when both sides changed', () => {
    expect(
      classify({
        localUpdatedAt: '2025-07-01',
        syncedUpdatedAt: '2025-06-01',
        remoteSha: 'new',
        syncedSha: 'old',
      }),
    ).toBe('conflict');
  });

  it('does nothing when nothing has moved since the last sync', () => {
    expect(
      classify({
        localUpdatedAt: '2025-06-01',
        syncedUpdatedAt: '2025-06-01',
        remoteSha: 'same',
        syncedSha: 'same',
      }),
    ).toBe('none');
  });
});
