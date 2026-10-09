import React from 'react';
import {Composition} from 'remotion';
import {SeeleVideo} from './SeeleVideo';
import {VideoQuoteDemo} from './VideoQuoteFrame';

export const VideoRoot: React.FC = () => (
  <>
    <Composition
      id="PinkSky-Test-40s"
      component={SeeleVideo}
      defaultProps={{sky: 'pink', showAsset: true, muted: false}}
      durationInFrames={1200}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="PinkSky-Transition-Study"
      component={SeeleVideo}
      defaultProps={{sky: 'pink', showAsset: false, muted: true}}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="BlueSky-Future-Preview"
      component={SeeleVideo}
      defaultProps={{sky: 'blue'}}
      durationInFrames={1200}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="DarkSky-Future-Preview"
      component={SeeleVideo}
      defaultProps={{sky: 'dark'}}
      durationInFrames={1200}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="VideoQuote-Reaction-Demo"
      component={VideoQuoteDemo}
      durationInFrames={240}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
