/**
 * Runs an async task one at a time. A call during a run queues one follow-up run that all further calls
 * share, so every caller gets a result that started after its call, and bursts of calls cost two runs.
 */
export class SerialRunner<T> {
  private current: Promise<T> | undefined;
  private queued: Promise<T> | undefined;

  constructor(private readonly task: () => Promise<T>) {}

  run(): Promise<T> {
    if (this.queued) {
      return this.queued;
    }
    if (!this.current) {
      return this.start();
    }
    const afterCurrent = () => {
      this.queued = undefined;
      return this.start();
    };
    // The follow-up starts whether the current run succeeds or fails; its callers get their own result.
    this.queued = this.current.then(afterCurrent, afterCurrent);
    return this.queued;
  }

  /** The run in progress, if any; unlike {@link run}, it starts none. */
  active(): Promise<T> | undefined {
    return this.current;
  }

  private start(): Promise<T> {
    const run = this.task();
    this.current = run;
    const finished = () => {
      if (this.current === run) {
        this.current = undefined;
      }
    };
    run.then(finished, finished);
    return run;
  }
}
