import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? 'renders');
mkdirSync(outputDirectory, {recursive: true});

const compositions = [
  ['V1-Editorial', '01-editorial.mp4'],
  ['V2-Sacred-Sculpture', '02-sacred-sculpture.mp4'],
  ['V3-Sunrise', '03-sunrise.mp4'],
  ['V4-Typographic-Minimal', '04-typographic-minimal.mp4'],
  ['V5-Animated-Manuscript', '05-animated-manuscript.mp4']
];

for (const [composition, filename] of compositions) {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/@remotion/cli/remotion-cli.js'), 'render', 'src/index.ts', composition, resolve(outputDirectory, filename), '--codec=h264', '--crf=18', '--pixel-format=yuv420p', '--audio-codec=aac', '--concurrency=2'],
    {stdio: 'inherit', shell: false}
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
