# Pinned Three.js postprocessing

The postprocessing/Pass.js, postprocessing/SMAAPass.js,
postprocessing/OutputPass.js, shaders/SMAAShader.js and shaders/OutputShader.js
files are unmodified copies from mrdoob/three.js tag r170 (Three.js 0.170.0),
under the existing MIT LICENSE in this directory. Source:
https://github.com/mrdoob/three.js/tree/r170/examples/jsm

SMAA's original license is retained in SMAA-LICENSE.txt. Uses SMAA. Copyright
(C) 2011 by Jorge Jimenez, Jose I. Echevarria, Tiago Sousa, Belen Masia,
Fernando Navarro and Diego Gutierrez.
https://github.com/iryoku/smaa/tree/v2.8

SMAA's area/search lookup PNGs remain embedded in the pinned SMAAPass module.
No runtime CDN request is used. Momo awaits both lookup images before its
first playable frame and follows the r170 example's linear HDR scene → SMAA
→ ACES/sRGB output sequence. Momo fuses the final blend/output pass using the
standard Three.js tonemapping_fragment and colorspace_fragment chunks, with
material.toneMapped=true. The imported vendor modules themselves are unmodified.
