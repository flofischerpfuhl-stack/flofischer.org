import React from 'react';
import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import './global.css';

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

export const VideoQuoteFrame: React.FC<{
  title: string;
  source: string;
  paused: boolean;
  pauseFrame?: number;
  progress?: number;
  children?: React.ReactNode;
}> = ({title, source, paused, pauseFrame = 0, progress = 0, children}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const press = spring({frame: Math.max(0, frame - pauseFrame), fps, config: {damping: 17, stiffness: 220}});
  const scan = ((frame * 9) % 1080) - 120;
  const jitter = paused ? Math.sin(frame * 2.7) * 2.2 : 0;

  return (
    <figure style={{margin: 0, width: '100%', color: '#fff5ea'}}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          overflow: 'hidden',
          border: '1px solid rgba(255,245,234,.52)',
          background: '#130b16',
          boxShadow: '0 30px 90px rgba(24,5,29,.32)',
          transform: `translateX(${jitter}px)`
        }}
      >
        {children ?? (
          <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 68% 34%, #d8a3bc 0, #68445e 24%, #1a1120 72%)'}} />
        )}
        <div className="videoGrid" />
        <div className="eyebrow" style={{position: 'absolute', left: 28, top: 24, padding: '10px 14px', background: 'rgba(18,10,19,.82)'}}>VIDEOAUSSCHNITT</div>
        <div style={{position: 'absolute', left: 28, right: 28, bottom: 25, height: 4, background: 'rgba(255,255,255,.23)'}}>
          <div style={{height: '100%', width: `${progress * 100}%`, background: '#ff92bb'}} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 112,
            height: 112,
            marginLeft: -56,
            marginTop: -56,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(255,247,236,.9)',
            color: '#261322',
            border: '1px solid rgba(38,19,34,.28)',
            transform: `scale(${1 - press * 0.11})`,
            boxShadow: '0 16px 40px rgba(24,5,29,.25)'
          }}
        >
          {paused ? (
            <div style={{width: 38, height: 42, display: 'flex', justifyContent: 'space-between'}}><span className="pauseBar" /><span className="pauseBar" /></div>
          ) : (
            <div style={{width: 0, height: 0, borderTop: '24px solid transparent', borderBottom: '24px solid transparent', borderLeft: '38px solid #261322', marginLeft: 9}} />
          )}
        </div>
        {paused && (
          <>
            <div className="vhsNoise" style={{transform: `translateY(${scan}px)`}} />
            <div className="vhsChromatic" />
            <div className="eyebrow" style={{position: 'absolute', right: 24, top: 24, color: '#fff', textShadow: '-2px 0 #ff4fa3, 2px 0 #5ee7ff'}}>PAUSE · FRAME HOLD</div>
          </>
        )}
      </div>
      <figcaption style={{display: 'flex', justifyContent: 'space-between', gap: 30, paddingTop: 16, borderBottom: '1px solid rgba(255,245,234,.42)'}}>
        <strong className="serif" style={{fontSize: 30}}>{title}</strong>
        <span className="eyebrow" style={{fontSize: 14, color: '#ffb1ce'}}>{source}</span>
      </figcaption>
    </figure>
  );
};

export const VideoQuoteDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const paused = frame >= 116;
  const drift = interpolate(frame, [0, 239], [1.06, 1.13], {...clamp, easing: Easing.inOut(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: 'linear-gradient(145deg,#29172d,#100a16)', padding: '116px 190px'}}>
      <VideoQuoteFrame title="Reaktionsausschnitt · Demo" source="QUELLE IN VIDEOBESCHREIBUNG" paused={paused} pauseFrame={116} progress={Math.min(frame / 210, 1)}>
        <div style={{position: 'absolute', inset: 0, transform: `scale(${drift})`, background: 'radial-gradient(circle at 62% 40%,#f2c4cd 0,#85556f 23%,#2e1831 64%,#130b16 100%)'}} />
        <div className="display" style={{position: 'absolute', left: 70, bottom: 72, fontSize: 112, lineHeight: .85}}>VIDEO<br />REAKTION</div>
      </VideoQuoteFrame>
    </AbsoluteFill>
  );
};
