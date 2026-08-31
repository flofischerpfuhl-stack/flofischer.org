import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';
import {Botanical3D} from './Botanical3D';
import {project, type Variant} from './project';
import './global.css';

type Props = {variant: Variant};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};

const revealFor = (frame: number, from: number, to: number) => {
  const fadeIn = interpolate(frame, [from, from + 16], [0, 1], clamp);
  const fadeOut = interpolate(frame, [to - 15, to], [1, 0], clamp);
  return Math.min(fadeIn, fadeOut);
};

const Cue: React.FC<{
  from: number;
  to: number;
  eyebrow: string;
  text: string;
  align?: 'left' | 'center';
  color: string;
  accent: string;
  width?: number;
  headlineSize?: number;
}> = ({from, to, eyebrow, text, align = 'left', color, accent, width = 1000, headlineSize = 116}) => {
  const frame = useCurrentFrame();
  const opacity = revealFor(frame, from, to);
  const enter = spring({frame: Math.max(0, frame - from), fps: 30, config: {damping: 22, stiffness: 105, mass: 0.9}});
  const lines = text.split('\n');
  return (
    <div
      style={{
        position: 'absolute',
        width,
        opacity,
        textAlign: align,
        transform: `translateY(${(1 - enter) * 42}px)`,
        color
      }}
    >
      <div className="eyebrow" style={{color: accent, marginBottom: 22}}>{eyebrow}</div>
      <div className="display" style={{fontSize: headlineSize, lineHeight: 0.84, letterSpacing: '0.018em'}}>
        {lines.map((line, index) => (
          <div key={line} style={{transform: `translateX(${(1 - enter) * (index % 2 ? 28 : -20)}px)`}}>{line}</div>
        ))}
      </div>
    </div>
  );
};

const Brand: React.FC<{color: string; line: string; inverse?: boolean}> = ({color, line, inverse = false}) => (
  <>
    <div className="brand" style={{color}}>SEELE</div>
    <div className="headerLine" style={{background: line}} />
    <div className="language" style={{color}}>DE&nbsp;&nbsp;/&nbsp;&nbsp;EN</div>
    <div className="footer" style={{color}}>
      <span>FLO FISCHER</span>
      <span>{project.articleUrl.replace('https://', '').toUpperCase()}</span>
      <span style={{border: `1px solid ${line}`, padding: '8px 13px', background: inverse ? 'rgba(238,232,218,.08)' : 'transparent'}}>MMXXVI</span>
    </div>
  </>
);

const Editorial: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 600], [0, -28], clamp);
  return (
    <AbsoluteFill style={{background: '#eee8da', color: '#171410'}}>
      <div className="paperNoise" />
      <Brand color="#171410" line="rgba(23,20,16,.45)" />
      <div style={{position: 'absolute', left: 86, top: 190, bottom: 108, width: 1, background: 'rgba(23,20,16,.32)'}} />
      <div style={{position: 'absolute', left: 1210, top: 0, bottom: 0, width: 1, background: 'rgba(23,20,16,.25)'}} />
      <div style={{position: 'absolute', right: -40, top: 95 + drift, width: 760, height: 900}}>
        <Botanical3D palette={{stem: '#574b2e', leaf: '#6f7650', leafLight: '#9b9a6b', flower: '#9a5260', cross: '#171410'}} />
      </div>
      <div style={{position: 'absolute', left: 145, top: 315}}>
        {project.cues.map((cue, index) => <Cue key={index} {...cue} color="#171410" accent="#6e5b3b" width={1030} headlineSize={index === 1 ? 118 : 108} />)}
      </div>
      <div className="sideNote" style={{right: 42, top: 505, color: '#171410', transform: 'rotate(90deg)', transformOrigin: 'right top'}}>BOTANICAL THEOLOGY · PLATE 01</div>
    </AbsoluteFill>
  );
};

const Sculpture: React.FC = () => {
  const frame = useCurrentFrame();
  const glow = 0.72 + Math.sin(frame / 32) * 0.08;
  return (
    <AbsoluteFill style={{background: '#120d0a', color: '#f1e5ce', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 72% 50%, rgba(188,115,58,${glow}) 0, rgba(79,35,21,.35) 30%, transparent 62%), linear-gradient(125deg,#100c09,#24120d 62%,#0b0908)`}} />
      <div className="grainDark" />
      <Brand color="#efe1c7" line="rgba(239,225,199,.3)" inverse />
      <div style={{position: 'absolute', right: 80, top: 85, width: 870, height: 930, transform: `scale(${1 + frame / 18000}) rotate(${Math.sin(frame / 80) * 0.5}deg)`}}>
        <Botanical3D palette={{stem: '#7d452b', leaf: '#6e7650', leafLight: '#a6a56b', flower: '#b17477', cross: '#cf9c5b'}} />
      </div>
      <div style={{position: 'absolute', left: 145, top: 315}}>
        {project.cues.map((cue, index) => <Cue key={index} {...cue} color="#f3e7d1" accent="#c8965d" width={1010} headlineSize={index === 1 ? 112 : 104} />)}
      </div>
      <div style={{position: 'absolute', left: 145, top: 800, width: 820, height: 1, background: 'rgba(239,225,199,.25)'}} />
      <div className="serif" style={{position: 'absolute', left: 145, top: 830, width: 760, fontSize: 29, fontStyle: 'italic', color: '#baa98d'}}>
        Wissen ist nicht dasselbe wie Verursachen.
      </div>
    </AbsoluteFill>
  );
};

const Sunrise: React.FC = () => {
  const frame = useCurrentFrame();
  const sunY = interpolate(frame, [0, 600], [670, 500], clamp);
  const opacity = interpolate(frame, [0, 50], [0, 1], clamp);
  return (
    <AbsoluteFill style={{background: '#f1d2a4', color: '#24170f', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(180deg,#eaa87f 0%,#f8d9aa 42%,#f7eed9 100%)'}} />
      <div style={{position: 'absolute', width: 730, height: 730, borderRadius: '50%', right: 100, top: sunY, background: 'radial-gradient(circle,#fff9db 0%,#ffd48d 42%,rgba(255,190,114,.15) 70%)', boxShadow: '0 0 170px rgba(255,239,178,.75)', opacity}} />
      <div style={{position: 'absolute', right: -80, top: 90, width: 830, height: 930, filter: 'drop-shadow(0 35px 25px rgba(73,57,31,.16))'}}>
        <Botanical3D palette={{stem: '#725536', leaf: '#657151', leafLight: '#a7a56c', flower: '#a95f72', cross: '#8b4a2f'}} opacity={0.96} mirrored />
      </div>
      <div className="sunMist" style={{transform: `translateX(${Math.sin(frame / 55) * 30}px)`}} />
      <Brand color="#24170f" line="rgba(36,23,15,.34)" />
      <div style={{position: 'absolute', left: 145, top: 315}}>
        {project.cues.map((cue, index) => <Cue key={index} {...cue} color="#24170f" accent="#9b4e37" width={1050} headlineSize={index === 1 ? 114 : 106} />)}
      </div>
      <div className="serif" style={{position: 'absolute', left: 146, bottom: 142, width: 910, fontSize: 30, fontStyle: 'italic', color: '#5d3928'}}>Eine Frage zwischen Ewigkeit und Entscheidung.</div>
    </AbsoluteFill>
  );
};

const Minimal: React.FC = () => {
  const frame = useCurrentFrame();
  const pivot = interpolate(frame, [0, 600], [-120, 80], clamp);
  return (
    <AbsoluteFill style={{background: '#f3efe5', color: '#171410', overflow: 'hidden'}}>
      <div className="paperNoise" />
      <Brand color="#171410" line="rgba(23,20,16,.5)" />
      <div style={{position: 'absolute', right: -90, top: 90, width: 690, height: 860, opacity: .28, transform: `translateY(${pivot}px)`}}>
        <Botanical3D palette={{stem: '#171410', leaf: '#171410', leafLight: '#171410', flower: '#8c3f2d', cross: '#171410'}} lineOnly mirrored />
      </div>
      <div style={{position: 'absolute', left: 145, top: 250}}>
        {project.cues.map((cue, index) => (
          <Cue key={index} {...cue} color="#171410" accent="#a13e28" width={1420} headlineSize={index === 1 ? 148 : index === 5 ? 118 : 138} />
        ))}
      </div>
      <div className="display" style={{position: 'absolute', left: 1320, top: 405, fontSize: 330, color: '#a13e28', lineHeight: 1, opacity: revealFor(frame, 60, 235), transform: `rotate(-8deg) scale(${0.9 + spring({frame: Math.max(0, frame - 60), fps: 30, config: {damping: 20}}) * .1})`}}>?</div>
      <div style={{position: 'absolute', left: 86, top: 152, width: 8, height: interpolate(frame, [0, 600], [0, 760], clamp), background: '#a13e28'}} />
    </AbsoluteFill>
  );
};

const Manuscript: React.FC = () => {
  const frame = useCurrentFrame();
  const lineWidth = interpolate(frame, [0, 65], [0, 100], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: '#e9dfc9', color: '#221b12', overflow: 'hidden'}}>
      <div className="manuscriptPaper" />
      <Brand color="#221b12" line="rgba(34,27,18,.4)" />
      <div style={{position: 'absolute', inset: '132px 86px 104px', border: '1px solid rgba(72,50,28,.42)'}} />
      <div style={{position: 'absolute', right: 28, top: 80, width: 760, height: 980, opacity: .73}}>
        <Botanical3D palette={{stem: '#5d4e35', leaf: '#596148', leafLight: '#85855c', flower: '#925569', cross: '#7e4a2f'}} lineOnly />
      </div>
      <div style={{position: 'absolute', left: 145, top: 288}}>
        {project.cues.map((cue, index) => <Cue key={index} {...cue} color="#221b12" accent="#7e4a2f" width={1080} headlineSize={index === 1 ? 112 : 104} />)}
      </div>
      <div style={{position: 'absolute', left: 145, top: 760, width: `${lineWidth * 7.2}px`, height: 3, background: '#7e4a2f'}} />
      <div className="serif" style={{position: 'absolute', left: 145, top: 790, width: 760, fontSize: 28, lineHeight: 1.35, fontStyle: 'italic', color: '#5f4a32'}}>
        „Macht Wissen eine Entscheidung notwendig?“
        <div className="eyebrow" style={{marginTop: 14, color: '#7e4a2f'}}>RANDNOTIZ · ZUR DISKUSSION</div>
      </div>
      <div style={{position: 'absolute', right: 126, top: 178, width: 210, height: 76, border: '2px solid #7e4a2f', display: 'grid', placeItems: 'center', transform: 'rotate(3deg)', color: '#7e4a2f'}} className="eyebrow">QUAESTIO I</div>
    </AbsoluteFill>
  );
};

export const SeeleVideo: React.FC<Props> = ({variant}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const progress = frame / (durationInFrames - 1);
  const variants: Record<Variant, React.ReactNode> = {
    editorial: <Editorial />,
    sculpture: <Sculpture />,
    sunrise: <Sunrise />,
    minimal: <Minimal />,
    manuscript: <Manuscript />
  };

  return (
    <AbsoluteFill>
      {variants[variant]}
      <Audio src={staticFile('audio/voice-de.wav')} volume={0.96} />
      <div style={{position: 'absolute', zIndex: 99, left: 0, bottom: 0, width: `${progress * 100}%`, height: 6, background: variant === 'sculpture' ? '#c8965d' : '#a13e28'}} />
    </AbsoluteFill>
  );
};
