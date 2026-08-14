'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { runWithRetry } = require('../shared/retry');

test('reintenta y resuelve al cambiar el error a éxito', async () => {
  let calls = 0;
  const r = await runWithRetry(async () => {
    calls++;
    if (calls < 3) throw { code: 'NETWORK' };
    return 'ok';
  }, { baseDelay: 1 });
  assert.equal(r, 'ok');
  assert.equal(calls, 3);
});

test('no reintenta errores que no son NETWORK', async () => {
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => {
      calls++;
      throw { code: 'FORMAT' };
    }, { baseDelay: 1 }),
    (e) => e.code === 'FORMAT',
  );
  assert.equal(calls, 1);
});

test('agota intentos y lanza el último error', async () => {
  let calls = 0;
  await assert.rejects(
    runWithRetry(async () => {
      calls++;
      throw { code: 'NETWORK' };
    }, { attempts: 3, baseDelay: 1 }),
    (e) => e.code === 'NETWORK',
  );
  assert.equal(calls, 3);
});