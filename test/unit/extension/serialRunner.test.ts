import { describe, expect, it } from 'vitest';
import { SerialRunner } from '../../../src/extension/services/serialRunner';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets all pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function controlledRunner() {
  const runs: Deferred<number>[] = [];
  const runner = new SerialRunner(() => {
    const run = deferred<number>();
    runs.push(run);
    return run.promise;
  });
  return { runner, runs };
}

describe('SerialRunner', () => {
  it('runs the task and returns its result', async () => {
    const { runner, runs } = controlledRunner();
    const result = runner.run();
    runs[0]!.resolve(1);
    await expect(result).resolves.toBe(1);
  });

  it('starts calls made during a run afterwards, as one shared run', async () => {
    const { runner, runs } = controlledRunner();
    const first = runner.run();
    const second = runner.run();
    const third = runner.run();
    expect(third).toBe(second);
    await settle();
    expect(runs).toHaveLength(1);

    runs[0]!.resolve(1);
    await expect(first).resolves.toBe(1);
    await settle();
    expect(runs).toHaveLength(2);
    runs[1]!.resolve(2);
    await expect(second).resolves.toBe(2);
  });

  it('gives the run in progress, if any, without starting one', async () => {
    const { runner, runs } = controlledRunner();
    expect(runner.active()).toBeUndefined();
    const first = runner.run();
    runner.run();
    expect(runner.active()).toBe(first);
    runs[0]!.resolve(1);
    await first;
    await settle();
    expect(runs).toHaveLength(2);
    runs[1]!.resolve(2);
    await settle();
    expect(runner.active()).toBeUndefined();
  });

  it('starts a new run for a call after the previous run has finished', async () => {
    const { runner, runs } = controlledRunner();
    const first = runner.run();
    runs[0]!.resolve(1);
    await first;
    const next = runner.run();
    expect(runs).toHaveLength(2);
    runs[1]!.resolve(2);
    await expect(next).resolves.toBe(2);
  });

  it('passes a failure to the callers of that run and keeps running', async () => {
    const { runner, runs } = controlledRunner();
    const failed = runner.run();
    const queued = runner.run();
    runs[0]!.reject(new Error('disk gone'));
    await expect(failed).rejects.toThrow('disk gone');
    await settle();
    runs[1]!.resolve(2);
    await expect(queued).resolves.toBe(2);
  });
});
