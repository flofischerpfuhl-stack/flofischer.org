import {spawnSync} from 'node:child_process';
import {mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';

const outputDirectory = resolve(process.argv[2] ?? 'renders');
const qaDirectory = join(outputDirectory, 'qa');
mkdirSync(qaDirectory, {recursive: true});

const videos = readdirSync(outputDirectory)
  .filter((name) => name.toLowerCase().endsWith('.mp4'))
  .sort();

if (videos.length === 0) throw new Error(`No MP4 files found in ${outputDirectory}`);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  requirements: {width: 1920, height: 1080, fps: '30/1', durationSeconds: 20, audio: true},
  files: []
};

for (const name of videos) {
  const input = join(outputDirectory, name);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels', '-of', 'json', input
  ], {encoding: 'utf8'});
  if (probe.status !== 0) throw new Error(probe.stderr || `ffprobe failed for ${name}`);
  const metadata = JSON.parse(probe.stdout);
  const video = metadata.streams.find((stream) => stream.codec_type === 'video');
  const audio = metadata.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(metadata.format.duration);
  const checks = {
    dimensions: video?.width === 1920 && video?.height === 1080,
    frameRate: video?.r_frame_rate === '30/1',
    videoCodec: video?.codec_name === 'h264',
    audioStream: audio?.codec_name === 'aac' && Number(audio?.channels) >= 1,
    duration: duration >= 19.95 && duration <= 20.10
  };

  const timeline = join(qaDirectory, `${basename(name, '.mp4')}-timeline.jpg`);
  const frames = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
    '-vf', "select='eq(n,0)+eq(n,120)+eq(n,240)+eq(n,360)+eq(n,480)+eq(n,575)',scale=480:-1,tile=6x1",
    '-frames:v', '1', '-q:v', '2', timeline
  ], {encoding: 'utf8'});
  if (frames.status !== 0) throw new Error(frames.stderr || `Timeline extraction failed for ${name}`);

  report.files.push({name, duration, streams: metadata.streams, checks, timeline, pass: Object.values(checks).every(Boolean)});
}

report.pass = report.files.every((file) => file.pass);
writeFileSync(join(outputDirectory, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;
console.log(JSON.stringify({pass: report.pass, files: report.files.map(({name, pass}) => ({name, pass}))}, null, 2));
