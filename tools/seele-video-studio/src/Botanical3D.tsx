import React, {useMemo} from 'react';
import {Euler, MathUtils, Vector3} from 'three';
import {interpolate, useCurrentFrame} from 'remotion';

type Palette = {
  stem: string;
  leaf: string;
  leafLight: string;
  flower: string;
  cross: string;
};

type Botanical3DProps = {
  palette: Palette;
  mirrored?: boolean;
  opacity?: number;
  lineOnly?: boolean;
};

const projectPoint = (point: Vector3, rotation: Euler) => {
  const p = point.clone().applyEuler(rotation);
  const perspective = 720 / (720 + p.z);
  return {x: 500 + p.x * perspective, y: 560 - p.y * perspective, scale: perspective};
};

export const Botanical3D: React.FC<Botanical3DProps> = ({
  palette,
  mirrored = false,
  opacity = 1,
  lineOnly = false
}) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [8, 70], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const rotation = useMemo(
    () => new Euler(MathUtils.degToRad(-7), MathUtils.degToRad((mirrored ? -1 : 1) * (12 + frame * 0.018)), MathUtils.degToRad(mirrored ? 4 : -4)),
    [frame, mirrored]
  );

  const branches = useMemo(() => {
    return Array.from({length: 8}, (_, branchIndex) => {
      const side = branchIndex % 2 === 0 ? 1 : -1;
      const y0 = 72 + branchIndex * 55;
      const angle = 0.48 + (branchIndex % 3) * 0.11;
      const points = Array.from({length: 9}, (_, i) => {
        const t = i / 8;
        return new Vector3(
          side * (25 + t * (150 + branchIndex * 4)) * Math.cos(angle),
          y0 + t * (120 + branchIndex * 5),
          Math.sin(branchIndex * 1.73 + t * 2.2) * 38
        );
      });
      return {branchIndex, side, points};
    });
  }, []);

  const mainStem = Array.from({length: 13}, (_, i) => {
    const t = i / 12;
    return new Vector3(Math.sin(t * 3.4) * 11, t * 590, Math.cos(t * 2.6) * 20);
  });

  const pathFor = (points: Vector3[]) =>
    points
      .map((point, index) => {
        const p = projectPoint(point, rotation);
        return `${index === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg viewBox="0 0 1000 1000" width="100%" height="100%" style={{overflow: 'visible', opacity}}>
      <defs>
        <filter id="botanical-shadow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="22" stdDeviation="22" floodOpacity="0.26" />
        </filter>
        <linearGradient id="cross-face" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor={palette.cross} />
          <stop offset="1" stopColor={palette.stem} />
        </linearGradient>
      </defs>

      {!lineOnly && (
        <g filter="url(#botanical-shadow)" transform={`translate(0 ${28 - reveal * 28}) scale(${0.94 + reveal * 0.06})`}>
          <rect x="466" y="250" width="80" height="430" rx="7" fill="url(#cross-face)" />
          <rect x="350" y="345" width="310" height="78" rx="7" fill="url(#cross-face)" />
          <path d="M546 250 L572 271 L572 675 L546 680 Z" fill={palette.stem} opacity="0.78" />
          <path d="M660 345 L684 366 L684 442 L660 423 Z" fill={palette.stem} opacity="0.72" />
        </g>
      )}

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path
          d={pathFor(mainStem)}
          stroke={palette.stem}
          strokeWidth={lineOnly ? 4 : 15}
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - reveal}
        />
        {branches.map(({branchIndex, side, points}) => {
          const branchReveal = interpolate(reveal, [branchIndex * 0.055, 0.55 + branchIndex * 0.035], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          });
          return (
            <g key={branchIndex}>
              <path
                d={pathFor(points)}
                stroke={palette.stem}
                strokeWidth={lineOnly ? 3 : 10}
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset={1 - branchReveal}
              />
              {points.slice(2).map((point, leafIndex) => {
                const p = projectPoint(point, rotation);
                const localReveal = interpolate(branchReveal, [leafIndex * 0.07, 0.65 + leafIndex * 0.04], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp'
                });
                const leafSide = leafIndex % 2 === 0 ? 1 : -1;
                const rot = side * leafSide * (30 + leafIndex * 7);
                return (
                  <g key={leafIndex} transform={`translate(${p.x} ${p.y}) rotate(${rot}) scale(${p.scale * localReveal})`}>
                    <ellipse
                      cx={side * leafSide * 28}
                      cy="0"
                      rx={lineOnly ? 24 : 33}
                      ry={lineOnly ? 9 : 13}
                      fill={lineOnly ? 'none' : leafIndex % 3 === 0 ? palette.leafLight : palette.leaf}
                      stroke={palette.leaf}
                      strokeWidth={lineOnly ? 3 : 1.5}
                    />
                    <path d={`M 0 0 L ${side * leafSide * 54} 0`} stroke={palette.leaf} strokeWidth={lineOnly ? 2 : 2.5} />
                  </g>
                );
              })}
              {branchIndex % 2 === 1 && (() => {
                const p = projectPoint(points[points.length - 1], rotation);
                return (
                  <g transform={`translate(${p.x} ${p.y}) scale(${branchReveal * p.scale})`}>
                    {Array.from({length: 7}, (_, i) => (
                      <ellipse
                        key={i}
                        cx={Math.cos((i / 7) * Math.PI * 2) * 22}
                        cy={Math.sin((i / 7) * Math.PI * 2) * 22}
                        rx="18"
                        ry="9"
                        transform={`rotate(${(i / 7) * 360})`}
                        fill={lineOnly ? 'none' : palette.flower}
                        stroke={palette.flower}
                        strokeWidth={lineOnly ? 2 : 1}
                      />
                    ))}
                    <circle r="9" fill={palette.cross} />
                  </g>
                );
              })()}
            </g>
          );
        })}
      </g>
    </svg>
  );
};
