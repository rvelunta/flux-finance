import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The Anthropic SDK includes a server-only "agent toolset" (file I/O, bash, etc.)
// that ships unconditionally as part of the package. Two things to handle for the
// browser build:
//   1. A static `import { randomUUID } from 'node:crypto'` deep in agent-toolset/
//      fails Rollup's export-validity check on Vite's empty-module shim.
//      Fix: alias node:crypto to a tiny WebCrypto-backed shim (src/lib/shims/).
//   2. The agent toolset's node entry point (loaded via dynamic import in
//      server-only code) still reaches into node:fs/promises and similar.
//      Fix: a small plugin that resolves any agent-toolset/* path to an
//      empty stub module. The browser never reaches that code at runtime.
function stubAnthropicAgentToolset() {
  const STUB_ID = '\0anthropic-agent-toolset-stub';
  return {
    name: 'stub-anthropic-agent-toolset',
    enforce: 'pre',
    resolveId(source) {
      if (source.includes('agent-toolset')) return STUB_ID;
      return null;
    },
    load(id) {
      if (id === STUB_ID) return 'export default {};';
      return null;
    },
  };
}

export default defineConfig({
  root: 'src',
  envDir: '..',
  plugins: [svelte(), stubAnthropicAgentToolset()],
  resolve: {
    alias: {
      'node:crypto': fileURLToPath(new URL('./src/lib/shims/node-crypto.js', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    open: true,
  },
});
