// The built wasm must come back from the decoder the pages ship.
import { expect, test } from 'bun:test';
import { ZSTDDecoder } from 'zstddec';
import { compressWasm } from './web-build.mjs';

// An empty module: its magic number and version.
const wasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

test('the decoder restores the wasm', async () => {
  const { bytes } = compressWasm(wasm);
  const decoder = new ZSTDDecoder();
  await decoder.init();
  expect(decoder.decode(bytes, wasm.length)).toEqual(wasm);
});

test('the stream is a zstd frame', () => {
  const { codec, bytes } = compressWasm(wasm);
  expect(codec).toBe('zstd');
  expect(Array.from(bytes.subarray(0, 4))).toEqual([0x28, 0xb5, 0x2f, 0xfd]);
});
