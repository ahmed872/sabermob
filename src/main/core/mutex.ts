/** Minimal FIFO async mutex. */
export class Mutex {
  #queue: Array<() => void> = []
  #locked = false

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.#acquire()
    try {
      return await fn()
    } finally {
      this.#release()
    }
  }

  /** Takes the lock for good (used right before the process restarts). */
  async freeze(): Promise<void> {
    await this.#acquire()
  }

  get isLocked(): boolean {
    return this.#locked
  }

  #acquire(): Promise<void> {
    if (!this.#locked) {
      this.#locked = true
      return Promise.resolve()
    }
    return new Promise((resolve) => this.#queue.push(resolve))
  }

  #release(): void {
    const next = this.#queue.shift()
    if (next) next()
    else this.#locked = false
  }
}
