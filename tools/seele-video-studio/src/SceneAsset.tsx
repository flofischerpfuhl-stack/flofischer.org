import React, {Suspense, useMemo} from 'react';
import {useGLTF} from '@react-three/drei';
import {ThreeCanvas} from '@remotion/three';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import * as THREE from 'three';

export const ConceptSculptureAsset: React.FC<{
  src: string;
  width?: number;
  opacity?: number;
}> = ({src, width = 560, opacity = 1}) => {
  const frame = useCurrentFrame();
  const floatY = Math.sin(frame / 30) * 8;
  const floatX = Math.sin(frame / 51) * 5;
  const rotateY = Math.sin(frame / 54) * 9.5;
  const rotateZ = Math.sin(frame / 83) * 0.25;

  return (
    <div
      style={{
        width,
        opacity,
        perspective: 1500,
        transform: `translate3d(${floatX}px, ${floatY}px, 0)`
      }}
    >
      <Img
        src={staticFile(src)}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          transformOrigin: '52% 55%',
          transform: `rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
          filter: 'drop-shadow(0 40px 34px rgba(39, 14, 40, .32)) drop-shadow(0 0 22px rgba(255, 224, 219, .2))'
        }}
      />
    </div>
  );
};

export const RealGltfAsset: React.FC<{
  src: string;
  width?: number;
  height?: number;
  scale?: number;
  position?: [number, number, number];
}> = ({src, width = 900, height = 1000, scale = 1, position = [0, 0, 0]}) => {
  const frame = useCurrentFrame();
  const rotationY = Math.sin(frame / 55) * 0.29;
  const rotationX = -0.035 + Math.sin(frame / 79) * 0.012;
  const resolvedSrc = staticFile(src);

  const NormalizedModel: React.FC = () => {
    const gltf = useGLTF(resolvedSrc);
    const normalized = useMemo(() => {
      const scene = gltf.scene.clone(true);
      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      return {
        factor: 3.55 / Math.max(size.x, size.y, size.z),
        center,
        scene
      };
    }, [gltf.scene]);

    return (
      <group position={position} rotation={[rotationX, rotationY, 0]} scale={scale}>
        <group scale={normalized.factor}>
          <primitive object={normalized.scene} position={[-normalized.center.x, -normalized.center.y, -normalized.center.z]} />
        </group>
      </group>
    );
  };

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{fov: 32, position: [0, 0, 7]}}
      style={{width, height}}
      gl={{alpha: true, antialias: true}}
    >
      <ambientLight intensity={1.35} />
      <directionalLight color="#ffe9df" intensity={3.2} position={[-3, 5, 5]} />
      <directionalLight color="#d9c7ff" intensity={1.2} position={[4, 1, 2]} />
      <Suspense fallback={null}>
        <NormalizedModel />
      </Suspense>
    </ThreeCanvas>
  );
};
