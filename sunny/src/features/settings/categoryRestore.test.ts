import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryDef } from '../../types';

const mocks = vi.hoisted(() => ({ doc: vi.fn(), runTransaction: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: mocks.doc, runTransaction: mocks.runTransaction }));
vi.mock('../../lib/firebase', () => ({ db: 'test-db' }));
import { restoreArchivedCategory } from './categoryRestore';

const category: CategoryDef = { id: 'fund', label: 'Fondo', kind: 'investment', icon: '📈', color: '#abc',
  archived: true, currentValue: 777, initialBalance: 500, lastValueUpdate: '2026-09-26' };
const snapshot = (categories: unknown, exists = true) => ({ exists: () => exists, data: () => ({ categories, theme: 'light' }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.doc.mockReturnValue('settings-ref');
  mocks.get.mockResolvedValue(snapshot([category]));
  mocks.runTransaction.mockImplementation(async (_db, callback) => callback({ get: mocks.get, update: mocks.update }));
});

describe('restoreArchivedCategory persistence', () => {
  it('reads current server settings and updates only categories, retaining market values', async () => {
    await restoreArchivedCategory('user-123', 'fund');
    expect(mocks.doc).toHaveBeenCalledWith('test-db', 'users', 'user-123', 'meta', 'settings');
    expect(mocks.get).toHaveBeenCalledWith('settings-ref');
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith('settings-ref', { categories: [{ ...category, archived: false }] });
  });

  it('re-reads fresh values on a transaction retry instead of overwriting another edit', async () => {
    mocks.get.mockResolvedValueOnce(snapshot([category])).mockResolvedValueOnce(snapshot([{ ...category, currentValue: 999 }]));
    mocks.runTransaction.mockImplementation(async (_db, callback) => {
      await callback({ get: mocks.get, update: mocks.update });
      await callback({ get: mocks.get, update: mocks.update });
    });
    await restoreArchivedCategory('user-123', 'fund');
    expect(mocks.update).toHaveBeenLastCalledWith('settings-ref', { categories: [{ ...category, currentValue: 999, archived: false }] });
  });

  it('does not write when another device has already restored the category', async () => {
    mocks.get.mockResolvedValue(snapshot([{ ...category, archived: false }]));
    await restoreArchivedCategory('user-123', 'fund');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([undefined, [], 'invalid'])('does not recreate a missing definition: %s', categories => {
    mocks.get.mockResolvedValue(snapshot(categories));
    return expect(restoreArchivedCategory('user-123', 'fund')).rejects.toThrow('Categoria non disponibile');
  });

  it('does not create a missing settings document', async () => {
    mocks.get.mockResolvedValue(snapshot(undefined, false));
    await expect(restoreArchivedCategory('user-123', 'fund')).rejects.toThrow();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects missing authentication before accessing the database', async () => {
    await expect(restoreArchivedCategory('', 'fund')).rejects.toThrow('Accesso richiesto');
    expect(mocks.runTransaction).not.toHaveBeenCalled();
  });

  it('propagates network/permission failure so the UI can offer retry', async () => {
    mocks.runTransaction.mockRejectedValue(new Error('unavailable'));
    await expect(restoreArchivedCategory('user-123', 'fund')).rejects.toThrow('unavailable');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
