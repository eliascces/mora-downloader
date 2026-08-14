'use strict';

class DownloadQueue {
  constructor() {
    this.pending = [];
    this.running = false;
    this.current = null;
  }

  add(job) {
    return new Promise((resolve, reject) => {
      this.pending.push({ ...job, resolve, reject });
      this._pump();
    });
  }

  _pump() {
    if (this.running || this.pending.length === 0) return;
    const job = this.pending.shift();
    this.current = job;
    this.running = true;
    if (this.onStart) this.onStart(job);
    const settle = (fn) => (arg) => {
      this.running = false;
      this.current = null;
      if (this.onEnd) this.onEnd(job);
      fn(arg);
      this._pump();
    };
    Promise.resolve()
      .then(() => job.run())
      .then(settle(job.resolve), settle(job.reject));
  }

  clear() {
    this.pending = [];
  }

  cancelCurrent() {
    if (this.current && this.current.cancel) {
      this.current.cancel();
    }
  }

  get size() {
    return this.pending.length;
  }

  get isRunning() {
    return this.running;
  }
}

module.exports = DownloadQueue;
