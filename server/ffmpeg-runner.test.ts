import test from 'node:test';
import assert from 'node:assert/strict';

import { runCommandWithTimeout } from './ffmpeg-runner.js';

test('runCommandWithTimeout rejects when a process exceeds the timeout', async () => {
  await assert.rejects(
    () => runCommandWithTimeout('node', ['-e', 'setTimeout(() => {}, 5000)'], 100),
    /timed out/i,
  );
});
