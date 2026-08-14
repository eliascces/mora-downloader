'use strict';

async function runWithRetry(fn, {
  attempts = 3,
  baseDelay = 5000,
  retryIf = (err) => err && err.code === 'NETWORK',
} = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn({ attempt: i });
    } catch (err) {
      lastErr = err;
      if (i === attempts || !retryIf(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, i - 1)));
    }
  }
  throw lastErr;
}

module.exports = { runWithRetry };