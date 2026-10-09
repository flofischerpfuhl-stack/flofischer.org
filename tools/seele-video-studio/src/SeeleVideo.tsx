import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';
import {RealGltfAsset} from './SceneAsset';
import {project, skyAssets, type SkyVariant} from './project';
import './global.css';

type Props = {
  sky: SkyVariant;
  showAsset?: boolean;
  muted?: boolean;
};

const clamp = {extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const};
const smooth = (value: number) => Easing.inOut(Easing.cubic)(value);

const SkyLayers: React.FC<{sky: SkyVariant}> = ({sky}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const src = staticFile(skyAssets[sky]);
  const farX = interpolate(frame, [0, durationInFrames], [-7, 8], clamp);
  const farY = Math.sin(frame / 210) * 2.5;
  const midX = interpolate(frame, [0, durationInFrames], [5, -7], clamp);
  const nearX = interpolate(frame, [0, durationInFrames], [-6, 7], clamp);
  const shade = sky === 'dark' ? 0.44 : sky === 'blue' ? 0.28 : 0.3;

  return (
    <AbsoluteFill style={{overflow: 'hidden', background: sky === 'dark' ? '#0b1227' : '#d9a1bd'}}>
      <Img
        src={src}
        style={{
          position: 'absolute',
          inset: -28,
          width: 1976,
          height: 1136,
          objectFit: 'cover',
          transform: `translate3d(${farX}px, ${farY}px, 0) scale(1.028)`
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: -34,
          opacity: 0.2,
          maskImage: 'radial-gradient(ellipse 62% 54% at 76% 24%, black 12%, transparent 72%)'
        }}
      >
        <Img
          src={src}
          style={{
            width: 1988,
            height: 1148,
            objectFit: 'cover',
            transform: `translate3d(${midX}px, ${Math.sin(frame / 175) * 3}px, 0) scale(1.04)`,
            filter: 'saturate(1.04) contrast(1.015)'
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: -42,
          opacity: 0.16,
          maskImage: 'linear-gradient(180deg, transparent 48%, black 83%, black 100%)'
        }}
      >
        <Img
          src={src}
          style={{
            width: 2004,
            height: 1164,
            objectFit: 'cover',
            transform: `translate3d(${nearX}px, ${Math.sin(frame / 160) * 3.5}px, 0) scale(1.055)`,
            filter: 'saturate(1.06)'
          }}
        />
      </div>
      <AbsoluteFill style={{background: `linear-gradient(90deg,rgba(28,12,29,${0.66 + shade}) 0%,rgba(31,15,31,.38) 48%,rgba(23,11,27,.06) 80%,rgba(16,8,20,.14) 100%)`}} />
      <AbsoluteFill style={{background: 'linear-gradient(180deg,rgba(13,7,16,.12),transparent 28%,transparent 76%,rgba(14,7,17,.27))'}} />
      <div className="fineGrain" />
    </AbsoluteFill>
  );
};

const MotionScene: React.FC<{
  from: number;
  to: number;
  layer?: 'behind' | 'front';
  motion?: 'lift' | 'left' | 'scale' | 'still';
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({from, to, layer = 'front', motion = 'lift', children, style}) => {
  const frame = useCurrentFrame();
  const enter = smooth(interpolate(frame, [from, from + 28], [0, 1], clamp));
  const leave = smooth(interpolate(frame, [to - 28, to], [0, 1], clamp));
  const opacity = Math.min(enter, 1 - leave);
  const transforms = {
    lift: `translate3d(0, ${(1 - enter) * 70 - leave * 54}px, 0)`,
    left: `translate3d(${(1 - enter) * 110 - leave * 95}px, 0, 0)`,
    scale: `scale(${0.94 + enter * 0.06 + leave * 0.035})`,
    still: 'none'
  };

  if (frame < from || frame > to) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: layer === 'behind' ? 2 : 4,
        opacity,
        transform: transforms[motion],
        ...style
      }}
    >
      {children}
    </div>
  );
};

const DecisionTree: React.FC = () => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [690, 790], [0, 1], clamp);
  return (
    <svg viewBox="0 0 900 580" style={{position: 'absolute', left: 80, top: 340, width: 820, height: 520, opacity: 0.72}}>
      <g fill="none" stroke="#ffd2df" strokeWidth="3" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - draw}>
        <path d="M90 286 C240 286 250 130 420 130" />
        <path d="M90 286 C250 286 260 286 470 286" />
        <path d="M90 286 C240 286 250 450 420 450" />
        <path d="M420 130 C550 130 570 70 720 70" />
        <path d="M470 286 C610 286 620 230 800 230" />
        <path d="M420 450 C560 450 590 510 760 510" />
      </g>
      {[[90,286],[420,130],[470,286],[420,450],[720,70],[800,230],[760,510]].map(([x,y], index) => (
        <circle key={index} cx={x} cy={y} r={index === 0 ? 14 : 10} fill={index === 0 ? '#fff5ea' : '#ff98bd'} opacity={draw} />
      ))}
    </svg>
  );
};

const CloudTransition: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  if (frame < at - 48 || frame > at + 54) return null;
  const cloudLayers = [
    {delay: -9, width: 2380, x: -270, drift: 170, lane: -250, mirror: false, blur: 0.4, opacity: 0.98},
    {delay: 4, width: 2920, x: -410, drift: -110, lane: -520, mirror: true, blur: 0.7, opacity: 0.98},
    {delay: 0, width: 2640, x: -160, drift: -150, lane: 30, mirror: true, blur: 0, opacity: 1},
    {delay: 10, width: 2860, x: -430, drift: 230, lane: 310, mirror: false, blur: 1.2, opacity: 0.96}
  ];
  const cover = interpolate(frame, [at - 12, at + 8, at + 22, at + 34], [0, 1, 1, 0], clamp);

  return (
    <AbsoluteFill style={{zIndex: 12, pointerEvents: 'none'}}>
      <AbsoluteFill style={{background: `rgba(218,165,190,${cover})`}} />
      {cloudLayers.map((layer, index) => {
        const raw = interpolate(frame, [at - 48 + layer.delay, at + 48 + layer.delay], [0, 1], clamp);
        const phase = smooth(raw);
        const y = interpolate(phase, [0, 1], [1140 + layer.lane, -990 + layer.lane], clamp);
        const opacity = layer.opacity * Math.min(
          interpolate(raw, [0, 0.08], [0, 1], clamp),
          interpolate(raw, [0.9, 1], [1, 0], clamp)
        );
        return (
          <Img
            key={index}
            src={staticFile(project.cloudTransitionAsset)}
            style={{
              position: 'absolute',
              left: layer.x + phase * layer.drift,
              top: y,
              width: layer.width,
              height: 'auto',
              opacity,
              transform: `scaleX(${layer.mirror ? -1 : 1}) rotate(${index === 1 ? -1.2 : index === 2 ? 1.1 : 0}deg)`,
              filter: `blur(${layer.blur}px) drop-shadow(0 38px 42px rgba(57,22,59,.2))`
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const EtchedFlashTransition: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  if (frame < at - 18 || frame > at + 26) return null;
  const inFlash = interpolate(frame, [at - 18, at], [0, 1], clamp);
  const outFlash = interpolate(frame, [at, at + 26], [1, 0], clamp);
  const opacity = Math.min(inFlash, outFlash);
  const sweep = interpolate(frame, [at - 18, at + 26], [-28, 128], clamp);
  return (
    <AbsoluteFill style={{zIndex: 11, opacity, pointerEvents: 'none', mixBlendMode: 'screen'}}>
      <AbsoluteFill style={{background: 'rgba(255,246,230,.54)'}} />
      <AbsoluteFill
        style={{
          opacity: 0.88,
          background: `repeating-radial-gradient(ellipse at ${sweep}% 54%, transparent 0 16px, rgba(255,255,255,.86) 17px 19px, transparent 20px 35px)`,
          filter: 'contrast(2.8)'
        }}
      />
      <div className="fineGrain" style={{opacity: 0.92, filter: 'contrast(3) brightness(1.8)'}} />
      <div style={{position: 'absolute', inset: -100, border: '82px double rgba(255,255,255,.74)', transform: `scale(${0.83 + inFlash * 0.24}) rotate(${(1 - inFlash) * -5}deg)`}} />
    </AbsoluteFill>
  );
};

const TornPaperTransition: React.FC<{at: number}> = ({at}) => {
  const frame = useCurrentFrame();
  if (frame < at - 34 || frame > at + 40) return null;
  const phase = smooth(interpolate(frame, [at - 34, at + 40], [0, 1], clamp));
  const y = interpolate(phase, [0, 1], [1160, -1260], clamp);
  return (
    <div
      style={{
        position: 'absolute',
        zIndex: 11,
        left: -80,
        top: y,
        width: 2080,
        height: 1300,
        background: '#f3e8d6',
        clipPath: 'polygon(0 3.8%,4% 2.6%,9% 4.2%,15% 3.1%,20% 4.5%,27% 2.8%,34% 4%,41% 2.4%,48% 4.3%,56% 3%,62% 4.6%,69% 2.7%,76% 4.1%,84% 2.5%,91% 4.2%,96% 3%,100% 3.8%,100% 96.2%,95% 97.8%,87% 96%,80% 97.5%,73% 95.9%,65% 97.6%,57% 96%,49% 97.7%,41% 95.8%,34% 97.8%,26% 96%,18% 97.5%,10% 95.9%,4% 97.8%,0 96.2%)',
        boxShadow: '0 -24px 36px rgba(255,249,235,.42),0 28px 38px rgba(56,27,54,.22)',
        transform: `translateX(${Math.sin(phase * Math.PI * 2) * 18}px) rotate(${Math.sin(phase * Math.PI) * -0.6}deg)`
      }}
    >
      <div className="paperNoise" style={{opacity: 0.28}} />
      <div className="display" style={{position: 'absolute', left: 110, top: 430, fontSize: 245, color: '#2a182a', letterSpacing: '-.02em'}}>DREI MODELLE</div>
      <div className="serif" style={{position: 'absolute', right: 130, top: 700, fontSize: 62, color: '#5b2e49', fontStyle: 'italic'}}>ein Konflikt</div>
    </div>
  );
};

export const SeeleVideo: React.FC<Props> = ({sky, showAsset = true, muted = false}) => {
  const frame = useCurrentFrame();
  const cloudRaw = interpolate(frame, [171, 239], [0, 1], clamp);
  const cloudPhase = smooth(cloudRaw);
  const seamY = interpolate(cloudPhase, [0, 1], [1260, -180], clamp);
  const titleBottomInset = Math.max(0, 1080 - seamY);
  const questionTopInset = Math.max(0, seamY);
  const questionExit = interpolate(frame, [399, 429], [1, 0], clamp);
  const assetOpacity = showAsset
    ? Math.min(
      interpolate(frame, [220, 248], [0, 1], clamp),
      interpolate(frame, [1018, 1060], [1, 0], clamp)
    )
    : 0;

  return (
    <AbsoluteFill style={{background: '#2b142e', color: '#fff4e9', overflow: 'hidden'}}>
      <SkyLayers sky={sky} />

      {frame <= 239 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            clipPath: `inset(0 0 ${titleBottomInset}px 0)`,
            transform: `translateY(${-cloudPhase * 92}px)`
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: `scale(${interpolate(frame, [0, 205], [0.985, 1.018], clamp)})`,
              transformOrigin: '50% 50%'
            }}
          >
            <div className="display" style={{position: 'absolute', left: 26, top: 24, width: 1870, fontSize: 332, lineHeight: .74, letterSpacing: '-.022em', transform: 'scaleX(1.52)', transformOrigin: 'left center'}}>VORSEHUNG</div>
            <div className="display" style={{position: 'absolute', left: 26, top: 348, width: 1870, fontSize: 322, lineHeight: .74, letterSpacing: '-.018em', color: '#ffd0df', transform: 'scaleX(1.48)', transformOrigin: 'left center'}}>&amp; FREIER</div>
            <div className="display" style={{position: 'absolute', left: 26, top: 650, width: 1870, fontSize: 410, lineHeight: .7, letterSpacing: '-.025em', transform: 'scaleX(2.25)', transformOrigin: 'left center'}}>WILLE</div>
          </div>
        </div>
      ) : null}

      {frame >= 171 && frame <= 429 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            clipPath: `inset(${questionTopInset}px 0 0 0)`,
            opacity: questionExit,
            transform: `translateY(${(1 - cloudPhase) * 74}px)`
          }}
        >
          <div className="display" style={{position: 'absolute', left: 108, top: 175, width: 1180, fontSize: 144, lineHeight: .79}}>WENN GOTT ES<br />SCHON WEISS —</div>
          <div className="serif" style={{position: 'absolute', left: 116, top: 600, width: 880, fontSize: 72, lineHeight: .98, fontStyle: 'italic', color: '#ffd0df'}}>kannst du wirklich<br />anders handeln?</div>
        </div>
      ) : null}

      <MotionScene from={410} to={690} motion="left" layer="behind">
        <div className="serif" style={{position: 'absolute', left: 116, top: 112, fontSize: 34, fontStyle: 'italic', color: '#ffc4d8'}}>Drei Denkmodelle</div>
        <div className="display" style={{position: 'absolute', left: 104, top: 175, width: 1050, fontSize: 128, lineHeight: .79}}>WER BESTIMMT<br />DIE ZUKUNFT?</div>
      </MotionScene>
      <MotionScene from={420} to={690} motion="lift">
        <div className="answerList answerListFree">
          <div><b>01</b><span>MOLINISMUS</span><small>Jede mögliche Entscheidung ist bekannt.</small></div>
          <div><b>02</b><span>BAÑEZ</span><small>Gott wirkt als bestimmende Ursache.</small></div>
          <div><b>03</b><span>OPEN THEISM</span><small>Die Zukunft bleibt ein echter Entscheidungsraum.</small></div>
        </div>
      </MotionScene>

      <MotionScene from={660} to={930} motion="scale" layer="behind">
        <DecisionTree />
        <div className="display" style={{position: 'absolute', left: 94, top: 120, width: 1540, fontSize: 145, lineHeight: .78}}>JEDER MÖGLICHE<br />WEG IST BEKANNT.</div>
      </MotionScene>
      <MotionScene from={680} to={930} motion="lift">
        <div className="serif" style={{position: 'absolute', left: 110, top: 800, width: 1190, fontSize: 58, lineHeight: .96, fontStyle: 'italic', color: '#ffd0df'}}>Aber die freie Wahl wird<br />nicht vorweggenommen.</div>
      </MotionScene>

      <MotionScene from={900} to={1060} motion="left" layer="behind">
        <div className="display" style={{position: 'absolute', left: 82, top: 178, width: 1570, fontSize: 178, lineHeight: .77}}>IST DAS NOCH<br />ALLWISSENHEIT?</div>
      </MotionScene>
      <MotionScene from={910} to={1060} motion="lift">
        <div className="questionStrip questionStripFree">
          <span>PROPHETIE</span><i />
          <span>JUDAS</span><i />
          <span>MARIAS FREIES JA</span>
        </div>
        <div className="serif" style={{position: 'absolute', left: 110, top: 790, fontSize: 47, fontStyle: 'italic', color: '#ffd0df'}}>Die Antwort liegt nicht in einer einzigen Folie.</div>
      </MotionScene>

      <MotionScene from={1032} to={1200} motion="scale">
        <div className="serif" style={{position: 'absolute', left: 105, top: 86, fontSize: 32, fontStyle: 'italic', color: '#ffc4d8'}}>Den vollständigen Gedankengang lesen</div>
        <div className="display" style={{position: 'absolute', left: 88, top: 165, width: 1710, fontSize: 220, lineHeight: .76}}>VORSEHUNG &amp;<br />FREIER WILLE</div>
        <div className="serif" style={{position: 'absolute', left: 106, bottom: 116, fontSize: 58}}>seele.flofischer.org</div>
        <div className="display" style={{position: 'absolute', right: 100, bottom: 74, fontSize: 66, color: '#ffd0df'}}>SEELE</div>
      </MotionScene>

      <div
        style={{
          position: 'absolute',
          zIndex: 3,
          right: 84,
          top: 112,
          width: 600,
          height: 860,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: assetOpacity
        }}
      >
        <RealGltfAsset src={project.realAsset} width={540} height={780} scale={0.94} position={[0, -0.08, 0]} />
      </div>

      <CloudTransition at={205} />
      <EtchedFlashTransition at={680} />
      <TornPaperTransition at={932} />
      {!muted ? <Audio src={staticFile(project.voiceAsset)} volume={0.96} startFrom={0} /> : null}
    </AbsoluteFill>
  );
};
