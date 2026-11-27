// Builds an app for the web with the nsgo tool and puts its site in a
// folder of public/, its wasm compressed.
//
// The tool writes index.html, wasm_exec.js, the loader (nsgo.js),
// resources, a content-named wasm and nsgo.json, which names them. This
// keeps all but the wasm, which it writes as <wasm>.zst: Go's wasm is
// large, and GitHub Pages can take longer than deploy-pages' ten-minute
// limit to sync it uncompressed. A static server sends a .zst file as it
// is, so the pages get the compressed bytes and decode them.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const website = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repo = path.resolve(website, '..');

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function findSite(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const candidate = path.join(dir, entry.name);
    if (entry.isDirectory() && existsSync(path.join(candidate, 'index.html'))) return candidate;
  }
  throw new Error(`No web build found under ${dir}`);
}

// compressWasm returns the wasm compressed for a static host that cannot
// set Content-Encoding. At level 19, zstd writes fewer bytes than gzip -9
// and decodes faster in the page.
export function compressWasm(wasm) {
  return { codec: 'zstd', bytes: Bun.zstdCompressSync(wasm, { level: 19 }) };
}

// buildWeb builds app, a package path from the repository's root, into
// output and returns its nsgo.json with codec, stream, the compressed
// wasm's name, and streamSize in place of wasm. tags, when given, are added
// to the go command's build tags, so a build can carry one part of an app.
export function buildWeb({ app, name, output, tags = [] }) {
  const scratch = path.join(website, '.web-build', path.basename(output));
  rmSync(scratch, { recursive: true, force: true });
  rmSync(output, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  try {
    const env = { ...process.env };
    if (tags.length > 0) {
      env.GOFLAGS = `${env.GOFLAGS ?? ''} -tags=${tags.join(',')}`.trim();
    }
    execFileSync(
      'go',
      ['tool', 'nsgo', 'build', '-target', 'web', '-name', name, '-open=false', '-output', scratch, app],
      { cwd: repo, stdio: 'inherit', env },
    );
    cpSync(findSite(scratch), output, { recursive: true });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const { wasm, ...config } = JSON.parse(readFileSync(path.join(output, 'nsgo.json'), 'utf8'));
  const wasmPath = path.join(output, wasm);
  const size = statSync(wasmPath).size;
  const { codec, bytes } = compressWasm(readFileSync(wasmPath));
  config.codec = codec;
  config.stream = `${wasm}.zst`;
  config.streamSize = bytes.length;
  writeFileSync(path.join(output, config.stream), bytes);
  rmSync(wasmPath);
  for (const ext of ['.br', '.gz']) rmSync(`${wasmPath}${ext}`, { force: true });
  writeFileSync(path.join(output, 'nsgo.json'), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`${name} ready: ${wasm} ${mb(size)} (${mb(bytes.length)} zstd)`);
  return config;
}
