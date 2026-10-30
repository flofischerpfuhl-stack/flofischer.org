/** Authored overworlds, kept separate from any game until integration.
 * A region owns its static resources. Loading another does not retain a hidden
 * copy; the caller releases the old region after its replacement is ready.
 */
import * as T from 'three';
import { AssetLibrary, disposeScene } from './asset-library.js';
import { loadBytes, expectBytes, invalidateDownload } from './loading-cache.js';

const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);

export class WorldLibrary extends AssetLibrary {
  /** Bytes only (layout JSON plus the compressed GLB), low priority; no parsing and no GPU work.
   * The downloads land in the shared loading cache, so a later region() starts without network time. */
  async prefetchRegion(familyId, regionKey, { signal } = {}) {
    const catalog = await this.json('environments/catalog.json');
    const definition = catalog.families.find(f => f.id === familyId)?.regions.find(r => r.region === regionKey);
    if (!definition) return;
    await this.json(definition.layoutFile);
    const url = new URL(definition.file, this.base);
    expectBytes(url, definition.bytes);
    await loadBytes(url, { signal: this.loadSignal(signal), priority: 'low' });
  }

  /** The reduced twin (worldmap/<family>/<region>.far.glb, about 7 % of the triangles) as a stand-in scene; null if it is not there. */
  async _far(familyId, regionKey) {
    try {
      const url = new URL(`../worldmap/${familyId}/${regionKey}.far.glb`, this.base);
      return (await this._gltf(url.href)).scene;
    } catch (error) {
      if (error?.name === 'AbortError' || this.disposed) throw error;
      return null;
    }
  }

  /** `progressive`: resolve as soon as the layout and the reduced twin are there. `world.detail` is then 'far' until
   * `world.fetchFull()` has delivered the full scene and `world.swapFull(scene)` has put it in the twin's place. */
  async region(familyId, regionKey, { progressive = false } = {}) {
    const catalog = await this.json('environments/catalog.json');
    const family = catalog.families.find(f => f.id === familyId);
    const definition = family?.regions.find(r => r.region === regionKey);
    if (!definition) throw new Error(`Unknown Fernworld region: ${familyId}/${regionKey}`);
    const layout = await this.json(definition.layoutFile);
    if (layout.nodePositions?.length !== 11 || layout.nodeTangents?.length !== 11 || layout.routeSamples?.length < 11
      || ![...layout.nodePositions, ...layout.nodeTangents, ...layout.routeSamples, layout.cameraPosition, layout.cameraTarget].every(finite3)) {
      throw new Error(`Invalid authored layout: ${familyId}/${regionKey}`);
    }
    const unitScale = layout.relativeScale?.recommendedWholeRegionMeterScale ?? 1;
    if (!(unitScale > 0) || !Number.isFinite(unitScale)) throw new Error('Invalid authored world scale');
    expectBytes(new URL(definition.file, this.base), definition.bytes);
    // Water is a single quiet transparent surface, never a second shadow layer.
    const prepareScene = scene => scene.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const transparent = materials.some(material => material.transparent);
      for (const material of materials) if (material.transparent) material.depthWrite = false;
      node.castShadow = !transparent; node.receiveShadow = !transparent;
    });
    const stub = progressive ? await this._far(familyId, regionKey) : null;
    // the parsed scene is all that is kept: the 1-3 MB download buffer is not retained once decoded
    const loadFull = async () => { const data = await this._gltf(definition.file); invalidateDownload(new URL(definition.file, this.base)); return data.scene; };
    let scene = stub ?? await loadFull();
    prepareScene(scene);
    const root = new T.Group();
    root.name = `World_${familyId}_${regionKey}`;
    root.scale.setScalar(unitScale);
    root.add(scene);
    root.updateMatrixWorld(true);
    let released = false, world, fullLoad = null;
    const dropScene = old => { if (this.resources.delete(old)) disposeScene(old); };
    const release = () => {
      if (released) return;
      released = true;
      root.removeFromParent();
      this.actors.delete(world);
      dropScene(scene);
      fullLoad?.then(full => full !== scene && dropScene(full), () => {});
    };
    try {
      const vector = p => new T.Vector3().fromArray(p).multiplyScalar(unitScale);
      const nodePositions = layout.nodePositions.map(vector);
      const nodeTangents = layout.nodeTangents.map(p => new T.Vector3().fromArray(p).normalize());
      if (nodeTangents.some(t => t.lengthSq() < .99)) throw new Error('Zero authored node tangent');
      const route = layout.routeSamples.map(vector), distances = [0];
      for (let i = 1; i < route.length; i++) distances.push(distances[i - 1] + route[i].distanceTo(route[i - 1]));
      if (!(distances.at(-1) > 0)) throw new Error('Empty authored route');
      const nearestDistance = point => {
        let best = Infinity, distance = 0;
        for (let i = 1; i < route.length; i++) {
          const edge = route[i].clone().sub(route[i - 1]), lengthSq = edge.lengthSq();
          const t = lengthSq ? T.MathUtils.clamp(point.clone().sub(route[i - 1]).dot(edge) / lengthSq, 0, 1) : 0;
          const error = route[i - 1].clone().addScaledVector(edge, t).distanceToSquared(point);
          if (error < best) { best = error; distance = T.MathUtils.lerp(distances[i - 1], distances[i], t); }
        }
        return distance;
      };
      const nodeDistances = nodePositions.map(nearestDistance);
      if (nodeDistances.some((d, i) => i && d <= nodeDistances[i - 1])) throw new Error('Authored nodes are not in route order');
      // A stand-in twin may lack a moving part; the full scene must have every one.
      const bindMotion = (target, strict) => (layout.motionRecipes ?? []).flatMap(recipe => {
        const nodes = []; target.traverse(n => { if (n.name === recipe.node) nodes.push(n); });
        if (!strict && !nodes.length) return [];
        if (nodes.length !== 1 || recipe.type !== 'sinusoidalRotation' || !finite3(recipe.axis)
          || !(recipe.periodSeconds > 0) || !Number.isFinite(recipe.amplitudeRadians)) throw new Error('Unsupported world motion recipe');
        const axis = new T.Vector3().fromArray(recipe.axis).normalize();
        if (axis.lengthSq() < .99) throw new Error('Zero world motion axis');
        return [{ node: nodes[0], base: nodes[0].quaternion.clone(), axis, recipe, rotation: new T.Quaternion() }];
      });
      let motion = bindMotion(scene, !stub);
      const bounds = new T.Box3().setFromObject(root);
      const sourceSpan = layout.cameraOrthographicSpan ?? layout.cameraOrthoScale ?? layout.cameraOrthographicScale ?? layout.cameraProjection?.verticalSize ?? 0;
      world = {
        family, definition, layout, root, nodePositions, nodeTangents, route, nodeDistances,
        unitScale, bounds, routeLength: distances.at(-1), release,
        cameraPosition: vector(layout.cameraPosition), cameraTarget: vector(layout.cameraTarget),
        minimumCameraSpan: sourceSpan * unitScale,
        get scene() { return scene; },
        get detail() { return scene === stub ? 'far' : 'full'; },
        /** Downloads and parses the full scene without touching the graph; resolves null when it is already showing. */
        fetchFull() {
          if (scene !== stub) return Promise.resolve(null);
          fullLoad ??= loadFull().then(full => { prepareScene(full); return full; }, error => { fullLoad = null; throw error; });
          return fullLoad;
        },
        /** Replaces the twin by the (prepared) full scene in one step; same bounds, same pose, nothing else moves. */
        swapFull(full) {
          if (released || scene !== stub || !full) return false;
          const next = bindMotion(full, true), old = scene;
          root.add(full); root.remove(old); scene = full; motion = next; root.updateMatrixWorld(true);
          dropScene(old);
          return true;
        },
        pointAtDistance(distance, target = new T.Vector3()) {
          const d = T.MathUtils.clamp(distance, 0, distances.at(-1));
          let low = 0, high = distances.length - 1;
          while (low + 1 < high) { const mid = (low + high) >> 1; if (distances[mid] <= d) low = mid; else high = mid; }
          const span = distances[high] - distances[low];
          return target.copy(route[low]).lerp(route[high], span ? (d - distances[low]) / span : 0);
        },
        update(time, reducedMotion = false) {
          if (released) return;
          for (const m of motion) {
            const angle = reducedMotion ? 0 : Math.sin(time * Math.PI * 2 / m.recipe.periodSeconds) * m.recipe.amplitudeRadians;
            m.node.quaternion.copy(m.base).multiply(m.rotation.setFromAxisAngle(m.axis, angle));
          }
        },
      };
      this.actors.add(world);
      return world;
    } catch (error) { release(); throw error; }
  }
}

/** Keep the authored viewing direction and fit every corner on a phone or desktop. */
export function fitWorldCamera(camera, world, aspect, padding = 1.08) {
  if (!camera.isOrthographicCamera || !(aspect > 0)) throw new Error('Orthographic camera and positive aspect required');
  camera.position.copy(world.cameraPosition); camera.lookAt(world.cameraTarget); camera.updateMatrixWorld(true);
  let halfX = 0, halfY = 0;
  const p = new T.Vector3();
  for (const x of [world.bounds.min.x, world.bounds.max.x]) for (const y of [world.bounds.min.y, world.bounds.max.y]) for (const z of [world.bounds.min.z, world.bounds.max.z]) {
    p.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    halfX = Math.max(halfX, Math.abs(p.x)); halfY = Math.max(halfY, Math.abs(p.y));
  }
  const halfHeight = Math.max(halfY * padding, halfX * padding / aspect, world.minimumCameraSpan / 2);
  camera.left = -halfHeight * aspect; camera.right = halfHeight * aspect;
  camera.bottom = -halfHeight; camera.top = halfHeight;
  camera.near = Math.max(.001, world.unitScale * .05);
  camera.far = camera.position.distanceTo(world.cameraTarget) + world.bounds.getSize(p).length() * 3;
  camera.updateProjectionMatrix();
  return halfHeight * 2;
}
