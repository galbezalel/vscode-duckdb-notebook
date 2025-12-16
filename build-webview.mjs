import * as esbuild from 'esbuild';
import { copyFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

async function build() {
  const outDir = join(__dirname, 'out');
  await mkdir(outDir, { recursive: true });

  // Copy WASM files and workers to out directory
  const duckdbDist = join(__dirname, 'node_modules', '@duckdb', 'duckdb-wasm', 'dist');
  const filesToCopy = [
    'duckdb-eh.wasm',
    'duckdb-browser-eh.worker.js',
  ];

  for (const file of filesToCopy) {
    await copyFile(
      join(duckdbDist, file),
      join(outDir, file)
    );
  }

  // Bundle the webview JavaScript
  const ctx = await esbuild.context({
    entryPoints: [join(__dirname, 'media', 'index.tsx')],
    bundle: true,
    outfile: join(__dirname, 'out', 'webview.js'),
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    external: ['vscode'],
    sourcemap: true,
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'rebuild-notify',
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length > 0) {
            console.error('Webview build failed:', result.errors);
          } else {
            console.log('Webview build complete');
          }
        });
      },
    }],
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching for webview changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

build().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
