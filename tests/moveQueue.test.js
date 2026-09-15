import {
  getPendingMoves,
  enqueueFailedMove,
  retryPendingMoves,
  clearPendingMove,
  MAX_MOVE_ATTEMPTS,
} from '../core/folder-manager/moveQueue.js';

function installStorageMock() {
  const data = {};
  globalThis.chrome = {
    storage: {
      local: {
        get(key, cb) {
          cb({ [key]: data[key] });
        },
        set(obj, cb) {
          Object.assign(data, obj);
          if (cb) cb();
        },
      },
    },
  };
  return data;
}

describe('Failed move retry queue', () => {
  beforeEach(() => {
    installStorageMock();
  });

  test('records a failed move with an attempt count', async () => {
    await enqueueFailedMove({
      url: 'https://a.example',
      category: 'Development',
      subcategory: 'Web / Frontend',
      reason: 'test',
    });

    const moves = await getPendingMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      url: 'https://a.example',
      category: 'Development',
      subcategory: 'Web / Frontend',
      attempts: 1,
    });
  });

  test('repeat failures bump attempts instead of adding duplicates', async () => {
    await enqueueFailedMove({ url: 'https://a.example', category: 'Development' });
    await enqueueFailedMove({ url: 'https://a.example', category: 'Learning' });

    const moves = await getPendingMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0].attempts).toBe(2);
    expect(moves[0].category).toBe('Learning');
  });

  test('successful retries are removed from the queue', async () => {
    await enqueueFailedMove({ url: 'https://a.example', category: 'Development' });
    await enqueueFailedMove({ url: 'https://b.example', category: 'Learning' });

    const result = await retryPendingMoves(async (url) => {
      return url === 'https://a.example' ? 'folder-1' : null;
    });

    expect(result).toEqual({ retried: 2, succeeded: 1, dropped: 0 });
    const moves = await getPendingMoves();
    expect(moves).toHaveLength(1);
    expect(moves[0].url).toBe('https://b.example');
    expect(moves[0].attempts).toBe(2);
  });

  test('a throwing move is treated as a failure', async () => {
    await enqueueFailedMove({ url: 'https://a.example', category: 'Development' });

    const result = await retryPendingMoves(async () => {
      throw new Error('move exploded');
    });

    expect(result.succeeded).toBe(0);
    expect(await getPendingMoves()).toHaveLength(1);
  });

  test('gives up after MAX_MOVE_ATTEMPTS', async () => {
    await enqueueFailedMove({ url: 'https://a.example', category: 'Development' });

    let dropped = 0;
    for (let i = 0; i < MAX_MOVE_ATTEMPTS; i++) {
      const result = await retryPendingMoves(async () => null);
      dropped += result.dropped;
    }

    expect(dropped).toBe(1);
    expect(await getPendingMoves()).toHaveLength(0);
  });

  test('clearPendingMove removes a single URL', async () => {
    await enqueueFailedMove({ url: 'https://a.example', category: 'Development' });
    await enqueueFailedMove({ url: 'https://b.example', category: 'Learning' });

    await clearPendingMove('https://a.example');

    const moves = await getPendingMoves();
    expect(moves.map((m) => m.url)).toEqual(['https://b.example']);
  });
});
