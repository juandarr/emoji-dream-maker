type Job<T> = { controller: AbortController; promise: Promise<T>; users: number; done: boolean };

/** Share work, but cancel it only when every interested caller has left. */
export class MetadataCache<T> {
  private values = new Map<string, { at: number; value: T }>();
  private jobs = new Map<string, Job<T>>();
  constructor(private ttl = 3_600_000, private limit = 256, private shouldCache: (value: T) => boolean = () => true) {}

  clear() {
    this.values.clear();
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
  }

  get(key: string, signal: AbortSignal, load: (signal: AbortSignal) => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    const hit = this.values.get(key);
    if (hit && Date.now() - hit.at < this.ttl) return Promise.resolve(hit.value);
    this.values.delete(key);
    let job = this.jobs.get(key);
    if (!job) {
      const controller = new AbortController();
      job = { controller, users: 0, done: false, promise: undefined! };
      const current = job;
      job.promise = Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      }).then(value => {
        if (!controller.signal.aborted && this.shouldCache(value)) {
          if (this.values.size >= this.limit) this.values.delete(this.values.keys().next().value!);
          this.values.set(key, { at: Date.now(), value });
        }
        return value;
      }).finally(() => {
        current.done = true;
        if (this.jobs.get(key) === current) this.jobs.delete(key);
      });
      this.jobs.set(key, job);
    }
    const current = job;
    current.users++;
    return new Promise<T>((resolve, reject) => {
      let finished = false;
      const finish = (error: boolean, value: unknown) => {
        if (finished) return;
        finished = true;
        signal.removeEventListener("abort", abort);
        current.users--;
        if (!current.users && !current.done) {
          current.controller.abort();
          if (this.jobs.get(key) === current) this.jobs.delete(key);
        }
        if (error) reject(value); else resolve(value as T);
      };
      const abort = () => finish(true, signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      current.promise.then(value => finish(false, value), error => finish(true, error));
    });
  }
}
