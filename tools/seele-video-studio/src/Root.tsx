import React from 'react';
import {Composition} from 'remotion';
import {SeeleVideo} from './SeeleVideo';
import type {Variant} from './project';

const variants: Array<{id: string; variant: Variant}> = [
  {id: 'V1-Editorial', variant: 'editorial'},
  {id: 'V2-Sacred-Sculpture', variant: 'sculpture'},
  {id: 'V3-Sunrise', variant: 'sunrise'},
  {id: 'V4-Typographic-Minimal', variant: 'minimal'},
  {id: 'V5-Animated-Manuscript', variant: 'manuscript'}
];

export const VideoRoot: React.FC = () => (
  <>
    {variants.map(({id, variant}) => (
      <Composition
        key={id}
        id={id}
        component={SeeleVideo}
        defaultProps={{variant}}
        durationInFrames={600}
        fps={30}
        width={1920}
        height={1080}
      />
    ))}
  </>
);
