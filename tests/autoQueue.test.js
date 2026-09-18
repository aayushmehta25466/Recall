import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { createAutoCategorizeQueue } from '../core/ai-classifier/autoQueue.js';

function makeDeps(over = {}) {
  return {
    runBatch: jest.fn(async () => ({ processed: 1, categorized: 1 })),
    getSettings: jest.fn(async () => ({ autoAiCategorize: true, openrouterApiKey: 'sk-test' })),
    isSyncing: jest.fn(() => false),
    hasWork: jest.fn(async () => true),
    acquireLock: jest.fn(async () => true),
    releaseLock: jest.fn(async () => {}),
    delayMs: 4000,
    log: jest.fn(),
    ...over,
  };
}

describe('auto-categorize queue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('coalesces a burst of saves into a single run', async () => {
    const deps = makeDeps();
    const q = createAutoCategorizeQueue(deps);

    q.schedule();
    q.schedule();
    q.schedule();
    await jest.advanceTimersByTimeAsync(4000);

    expect(deps.runBatch).toHaveBeenCalledTimes(1);
  });

  test('setting off → no run', async () => {
    const deps = makeDeps({
      getSettings: jest.fn(async () => ({ autoAiCategorize: false, openrouterApiKey: 'sk-test' })),
    });
    await createAutoCategorizeQueue(deps).flush();

    expect(deps.runBatch).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('off');
  });

  test('no API key → no run', async () => {
    const deps = makeDeps({
      getSettings: jest.fn(async () => ({ autoAiCategorize: true, openrouterApiKey: '' })),
    });
    await createAutoCategorizeQueue(deps).flush();

    expect(deps.runBatch).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('no-key');
  });

  test('during a bulk sync → no run', async () => {
    const deps = makeDeps({ isSyncing: jest.fn(() => true) });
    await createAutoCategorizeQueue(deps).flush();

    expect(deps.runBatch).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('syncing');
  });

  test('nothing uncategorized → no run and the lock is never taken', async () => {
    const deps = makeDeps({ hasWork: jest.fn(async () => false) });
    await createAutoCategorizeQueue(deps).flush();

    expect(deps.runBatch).not.toHaveBeenCalled();
    expect(deps.acquireLock).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('nothing');
  });

  test('runs the batch once and releases the lock', async () => {
    const deps = makeDeps();
    const q = createAutoCategorizeQueue(deps);

    await q.flush();

    expect(deps.runBatch).toHaveBeenCalledTimes(1);
    expect(deps.acquireLock).toHaveBeenCalledTimes(1);
    expect(deps.releaseLock).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('done', 1, 1);
    expect(q.state().running).toBe(false);
  });

  test('a throwing batch releases the lock and logs the error', async () => {
    const deps = makeDeps({
      runBatch: jest.fn(async () => { throw new Error('boom'); }),
    });
    const q = createAutoCategorizeQueue(deps);

    await q.flush();

    expect(deps.releaseLock).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalledWith('error', expect.any(Error));
    expect(q.state().running).toBe(false);
  });

  test('a held lock defers the run instead of overlapping', async () => {
    const deps = makeDeps({ acquireLock: jest.fn(async () => false) });
    const q = createAutoCategorizeQueue(deps);

    await q.flush();

    expect(deps.runBatch).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledWith('locked');
    expect(q.state().pending).toBe(true);
  });

  test('a schedule during a run yields exactly one extra run', async () => {
    let releaseFirst;
    const runBatch = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseFirst = () => resolve({ processed: 1, categorized: 1 });
      }))
      .mockResolvedValue({ processed: 1, categorized: 1 });

    let held = false;
    const deps = makeDeps({
      runBatch,
      acquireLock: jest.fn(async () => (held ? false : (held = true, true))),
      releaseLock: jest.fn(async () => { held = false; }),
    });
    const q = createAutoCategorizeQueue(deps);

    q.schedule();
    await jest.advanceTimersByTimeAsync(4000);   // run #1 starts and hangs
    expect(runBatch).toHaveBeenCalledTimes(1);

    q.schedule();                                 // arrives mid-run
    await jest.advanceTimersByTimeAsync(4000);    // flush → lock held → pending
    expect(runBatch).toHaveBeenCalledTimes(1);

    releaseFirst();                               // finish run #1 → finally → schedule()
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(4000);    // run #2

    expect(runBatch).toHaveBeenCalledTimes(2);
  });
});
