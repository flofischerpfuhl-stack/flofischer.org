import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? 'renders');
mkdirSync(outputDirectory, {recursive: true});

const output = resolve(outputDirectory, 'vorsehung-freier-wille-pink-40s.mp4');
const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/@remotion/cli/remotion-cli.js'),
    'render',
    'src/index.ts',
    'PinkSky-Test-40s',
    output,
    '--codec=h264',
    '--crf=18',
    '--pixel-format=yuv420p',
    '--audio-codec=aac',
    '--concurrency=2'
  ],
  {stdio: 'inherit', shell: false}
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(output);
