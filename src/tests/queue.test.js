'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const DownloadQueue = require('../main/queue');

test('procesa en orden secuencial', async () => {
  const q = new DownloadQueue();
  const order = [];
  const mk = (n, ms) => ({
    run: () => new Promise((res) => setTimeout(() => { order.push(n); res(n); }, ms)),
  });
  const p1 = q.add(mk(1, 30));
  const p2 = q.add(mk(2, 10));
  const p3 = q.add(mk(3, 5));
  const r = await Promise.all([p1, p2, p3]);
  assert.deepEqual(r, [1, 2, 3]);
  assert.deepEqual(order, [1, 2, 3]);
});

test('solo uno corriendo a la vez', async () => {
  const q = new DownloadQueue();
  let running = 0;
  let maxRunning = 0;
  const mk = (ms) => ({
    run: () => new Promise((res) => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      setTimeout(() => { running--; res(); }, ms);
    }),
  });
  await Promise.all([q.add(mk(20)), q.add(mk(20)), q.add(mk(20))]);
  assert.equal(maxRunning, 1);
});

test('propaga errores y continúa con la cola', async () => {
  const q = new DownloadQueue();
  const order = [];
  const r1 = q.add({ run: () => Promise.reject(new Error('falla')) });
  const r2 = q.add({ run: () => { order.push('ok'); return Promise.resolve('ok'); } });
  await assert.rejects(r1, /falla/);
  assert.equal(await r2, 'ok');
  assert.deepEqual(order, ['ok']);
});

test('onStart y onEnd se llaman', async () => {
  const q = new DownloadQueue();
  const events = [];
  q.onStart = () => events.push('start');
  q.onEnd = () => events.push('end');
  await q.add({ run: () => Promise.resolve() });
  assert.deepEqual(events, ['start', 'end']);
});

test('cancelCurrent llama al cancel del trabajo activo', async () => {
  const q = new DownloadQueue();
  let cancelled = false;
  q.add({
    cancel: () => { cancelled = true; },
    run: () => new Promise(() => {}),
  });
  await new Promise((r) => setTimeout(r, 10));
  q.cancelCurrent();
  assert.equal(cancelled, true);
});
