import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraPreset,
  ChaosSimulationEngine,
  MAX_TRAIL_POINTS,
  SYSTEM_DEFINITIONS,
  SystemId,
} from '../math/dynamicalSystems';
import { RotateCcw, RefreshCw } from 'lucide-react';

export interface Attractor3DHandle {
  setCameraPreset: (preset: CameraPreset) => void;
  resetCamera: () => void;
}

interface Attractor3DCanvasProps {
  engineRef: React.MutableRefObject<ChaosSimulationEngine>;
  systemId: SystemId;
  isRunning: boolean;
  speedMultiplier: number;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onAfterPhysicsStep: () => void;
}

// Reusable math objects outside render loop (Zero GC)
const _targetCamPos = new THREE.Vector3();
const _targetCamUp = new THREE.Vector3(0, 1, 0);
const _targetLookAt = new THREE.Vector3(0, 0, 0);

function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.25, 'rgba(103, 232, 249, 0.85)');
  grad.addColorStop(0.6, 'rgba(6, 182, 212, 0.25)');
  grad.addColorStop(1.0, 'rgba(6, 182, 212, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTwinGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.3, 'rgba(251, 113, 133, 0.85)');
  grad.addColorStop(0.65, 'rgba(244, 63, 94, 0.25)');
  grad.addColorStop(1.0, 'rgba(244, 63, 94, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createAxisLabelSprite(text: string, colorHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 32px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = colorHex;
  ctx.fillText(text, 64, 32);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.95, 0.475, 1);
  return sprite;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function getPresetCameraVectors(preset: CameraPreset): {
  pos: [number, number, number];
  up: [number, number, number];
} {
  switch (preset) {
    case 'xz':
      // Mathematical X horizontal, Mathematical Z vertical (Three.js +Y), looking along +Y math (Three.js +Z)
      return { pos: [0, 0, 12.5], up: [0, 1, 0] };
    case 'xy':
      // Mathematical X horizontal, Mathematical Y vertical (Three.js -Z), looking down from Three.js +Y
      return { pos: [0, 12.5, 0.01], up: [0, 0, -1] };
    case 'yz':
      // Mathematical Y depth (Three.js -Z), Mathematical Z vertical (Three.js +Y), looking from Three.js +X
      return { pos: [12.5, 0, 0], up: [0, 1, 0] };
    case 'orbit':
    default:
      return { pos: [8.4, 4.4, 9.2], up: [0, 1, 0] };
  }
}

export const Attractor3DCanvas = forwardRef<Attractor3DHandle, Attractor3DCanvasProps>(
  function Attractor3DCanvas(
    {
      engineRef,
      systemId,
      isRunning,
      speedMultiplier,
      autoRotate,
      onToggleAutoRotate,
      onAfterPhysicsStep,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const fpsTextRef = useRef<HTMLSpanElement | null>(null);
    const sampleTextRef = useRef<HTMLSpanElement | null>(null);

    const [activePreset, setActivePreset] = useState<CameraPreset>('orbit');
    const [contextLost, setContextLost] = useState(false);
    const [webglUnavailable, setWebglUnavailable] = useState(false);

    // Sync props into refs so WebGL mount effect never tears down on UI changes
    const isRunningRef = useRef(isRunning);
    isRunningRef.current = isRunning;

    const speedRef = useRef(speedMultiplier);
    speedRef.current = speedMultiplier;

    const autoRotateRef = useRef(autoRotate);
    autoRotateRef.current = autoRotate;

    const onAfterPhysicsStepRef = useRef(onAfterPhysicsStep);
    onAfterPhysicsStepRef.current = onAfterPhysicsStep;

    const cameraTransitionRef = useRef<{
      active: boolean;
      pos: THREE.Vector3;
      up: THREE.Vector3;
    }>({
      active: false,
      pos: new THREE.Vector3(8.4, 4.4, 9.2),
      up: new THREE.Vector3(0, 1, 0),
    });

    useImperativeHandle(ref, () => ({
      setCameraPreset: (preset: CameraPreset) => {
        setActivePreset(preset);
        const { pos, up } = getPresetCameraVectors(preset);
        cameraTransitionRef.current.pos.set(pos[0], pos[1], pos[2]);
        cameraTransitionRef.current.up.set(up[0], up[1], up[2]);
        cameraTransitionRef.current.active = true;
      },
      resetCamera: () => {
        setActivePreset('orbit');
        const { pos, up } = getPresetCameraVectors('orbit');
        cameraTransitionRef.current.pos.set(pos[0], pos[1], pos[2]);
        cameraTransitionRef.current.up.set(up[0], up[1], up[2]);
        cameraTransitionRef.current.active = true;
      },
    }));

    const triggerPreset = (preset: CameraPreset) => {
      setActivePreset(preset);
      const { pos, up } = getPresetCameraVectors(preset);
      cameraTransitionRef.current.pos.set(pos[0], pos[1], pos[2]);
      cameraTransitionRef.current.up.set(up[0], up[1], up[2]);
      cameraTransitionRef.current.active = true;
    };

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareWebGL();
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
        });
      } catch {
        setWebglUnavailable(true);
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x07090e, 1);

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 500;
      renderer.setSize(width, height);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x07090e);
      scene.fog = new THREE.FogExp2(0x07090e, 0.018);

      // Studio environment reflections for metallic/glass head orb
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      pmremGenerator.dispose();

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
      camera.position.set(8.4, 4.4, 9.2);
      camera.lookAt(0, 0, 0);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.065;
      controls.rotateSpeed = 0.85;
      controls.zoomSpeed = 0.95;
      controls.panSpeed = 0.75;
      controls.minDistance = 2.5;
      controls.maxDistance = 32;
      controls.target.set(0, 0, 0);

      // Cancel camera preset transitions immediately when user drags/zooms
      const handleControlStart = () => {
        cameraTransitionRef.current.active = false;
      };
      controls.addEventListener('start', handleControlStart);

      // Lighting rig
      const hemiLight = new THREE.HemisphereLight(0x94a3b8, 0x0f172a, 0.85);
      scene.add(hemiLight);
      const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.8);
      keyLight.position.set(8, 12, 10);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
      rimLight.position.set(-10, -4, -8);
      scene.add(rimLight);

      // Calibrated 3D Coordinate Frame (Grid + Bounding Box + Axes)
      const frameGroup = new THREE.Group();
      const gridHelper = new THREE.GridHelper(10, 10, 0x1e293b, 0x111827);
      gridHelper.position.y = -4.2;
      frameGroup.add(gridHelper);

      const boxGeo = new THREE.BoxGeometry(8.4, 8.4, 8.4);
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const boxLines = new THREE.LineSegments(
        edgesGeo,
        new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.45 })
      );
      frameGroup.add(boxLines);

      // Mathematical X (Three.js +X), Z (Three.js +Y), Y (Three.js -Z) axis indicators
      const axisLen = 4.6;
      const createAxisLine = (end: THREE.Vector3, color: number) => {
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          end,
        ]);
        const m = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.5,
        });
        return new THREE.Line(g, m);
      };

      const xAxis = createAxisLine(new THREE.Vector3(axisLen, 0, 0), 0x06b6d4);
      const zAxis = createAxisLine(new THREE.Vector3(0, axisLen, 0), 0x10b981);
      const yAxis = createAxisLine(new THREE.Vector3(0, 0, -axisLen), 0xf59e0b);
      frameGroup.add(xAxis, zAxis, yAxis);

      const xLabel = createAxisLabelSprite('X', '#22d3ee');
      xLabel.position.set(axisLen + 0.45, 0, 0);
      const zLabel = createAxisLabelSprite('Z', '#34d399');
      zLabel.position.set(0, axisLen + 0.4, 0);
      const yLabel = createAxisLabelSprite('Y', '#fbbf24');
      yLabel.position.set(0, 0, -(axisLen + 0.45));
      frameGroup.add(xLabel, zLabel, yLabel);

      scene.add(frameGroup);

      // Pre-allocated primary trajectory geometry (Zero GC per frame)
      const positions = new Float32Array(MAX_TRAIL_POINTS * 3);
      const colors = new Float32Array(MAX_TRAIL_POINTS * 3);
      const trailGeo = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      trailGeo.setAttribute('position', posAttr);
      trailGeo.setAttribute('color', colAttr);
      trailGeo.setDrawRange(0, 0);

      const trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.96,
      });
      const trailLine = new THREE.Line(trailGeo, trailMat);
      trailLine.frustumCulled = false;
      scene.add(trailLine);

      // Pre-allocated twin perturbed trajectory geometry (Sensitivity Mode)
      const twinPositions = new Float32Array(MAX_TRAIL_POINTS * 3);
      const twinColors = new Float32Array(MAX_TRAIL_POINTS * 3);
      const twinGeo = new THREE.BufferGeometry();
      const twinPosAttr = new THREE.BufferAttribute(twinPositions, 3);
      twinPosAttr.setUsage(THREE.DynamicDrawUsage);
      const twinColAttr = new THREE.BufferAttribute(twinColors, 3);
      twinColAttr.setUsage(THREE.DynamicDrawUsage);
      twinGeo.setAttribute('position', twinPosAttr);
      twinGeo.setAttribute('color', twinColAttr);
      twinGeo.setDrawRange(0, 0);

      const twinMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
      });
      const twinLine = new THREE.Line(twinGeo, twinMat);
      twinLine.frustumCulled = false;
      twinLine.visible = false;
      scene.add(twinLine);

      // Active tracer head (composite metallic sphere + radial glow halo)
      const headGroup = new THREE.Group();
      const headCoreGeo = new THREE.SphereGeometry(0.11, 20, 20);
      const headCoreMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x22d3ee,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0.7,
      });
      const headMesh = new THREE.Mesh(headCoreGeo, headCoreMat);
      const glowTex = createGlowTexture();
      const haloMat = new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const headHalo = new THREE.Sprite(haloMat);
      headHalo.scale.set(0.75, 0.75, 1);
      headGroup.add(headMesh, headHalo);
      scene.add(headGroup);

      // Twin tracer head
      const twinHeadGroup = new THREE.Group();
      const twinCoreMat = new THREE.MeshStandardMaterial({
        color: 0xffe4e6,
        emissive: 0xf43f5e,
        emissiveIntensity: 1.4,
        roughness: 0.2,
        metalness: 0.6,
      });
      const twinMesh = new THREE.Mesh(headCoreGeo, twinCoreMat);
      const twinGlowTex = createTwinGlowTexture();
      const twinHaloMat = new THREE.SpriteMaterial({
        map: twinGlowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const twinHalo = new THREE.Sprite(twinHaloMat);
      twinHalo.scale.set(0.65, 0.65, 1);
      twinHeadGroup.add(twinMesh, twinHalo);
      twinHeadGroup.visible = false;
      scene.add(twinHeadGroup);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      // Resize observer for crisp container resizing
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.max(1, Math.floor(entry.contentRect.width));
          const h = Math.max(1, Math.floor(entry.contentRect.height));
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      });
      resizeObserver.observe(container);

      // Helper to upload engine buffer into GPU Float32Arrays without allocations
      const syncTrailGeometry = (engine: ChaosSimulationEngine) => {
        const def = SYSTEM_DEFINITIONS[engine.systemId];
        const cx = def.worldCenter[0];
        const cy = def.worldCenter[1];
        const cz = def.worldCenter[2];
        const s = def.worldScale;
        const n = engine.count;

        const bx = engine.bufX;
        const by = engine.bufY;
        const bz = engine.bufZ;

        if (n === 0) {
          trailGeo.setDrawRange(0, 0);
          twinGeo.setDrawRange(0, 0);
          return;
        }

        const invN = n > 1 ? 1 / (n - 1) : 1;

        for (let i = 0; i < n; i++) {
          const j = i * 3;
          // Map mathematical (x, y, z) -> Three.js (X=x, Y=z, Z=-y)
          positions[j] = (bx[i] - cx) * s;
          positions[j + 1] = (bz[i] - cz) * s;
          positions[j + 2] = -(by[i] - cy) * s;

          // Smooth perceptual gradient: deep cobalt -> cyan -> luminous gold/white tip
          const t = i * invN;
          const t2 = t * t;
          if (t < 0.7) {
            const u = t / 0.7;
            colors[j] = 0.08 + u * 0.04;       // R: 0.08 -> 0.12
            colors[j + 1] = 0.18 + u * 0.56;   // G: 0.18 -> 0.74
            colors[j + 2] = 0.45 + u * 0.48;   // B: 0.45 -> 0.93
          } else {
            const u = (t - 0.7) / 0.3;
            colors[j] = 0.12 + u * 0.88;       // R: 0.12 -> 1.00
            colors[j + 1] = 0.74 + u * 0.22;   // G: 0.74 -> 0.96
            colors[j + 2] = 0.93 - u * 0.25 + t2 * 0.12;
          }
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        trailGeo.setDrawRange(0, n);

        const lastIdx = n - 1;
        headGroup.position.set(
          positions[lastIdx * 3],
          positions[lastIdx * 3 + 1],
          positions[lastIdx * 3 + 2]
        );

        if (engine.showTwin) {
          twinLine.visible = true;
          twinHeadGroup.visible = true;
          const tx = engine.twinX;
          const ty = engine.twinY;
          const tz = engine.twinZ;
          for (let i = 0; i < n; i++) {
            const j = i * 3;
            twinPositions[j] = (tx[i] - cx) * s;
            twinPositions[j + 1] = (tz[i] - cz) * s;
            twinPositions[j + 2] = -(ty[i] - cy) * s;

            const t = i * invN;
            twinColors[j] = 0.45 + t * 0.55;
            twinColors[j + 1] = 0.08 + t * 0.24;
            twinColors[j + 2] = 0.28 + t * 0.22;
          }
          twinPosAttr.needsUpdate = true;
          twinColAttr.needsUpdate = true;
          twinGeo.setDrawRange(0, n);

          twinHeadGroup.position.set(
            twinPositions[lastIdx * 3],
            twinPositions[lastIdx * 3 + 1],
            twinPositions[lastIdx * 3 + 2]
          );
        } else {
          twinLine.visible = false;
          twinHeadGroup.visible = false;
        }
      };

      // Animation loop + Software-WebGL pacing
      let frameId = 0;
      let disposed = false;
      let lastTime = performance.now();
      let fpsAccumTime = 0;
      let fpsFrames = 0;
      let stepRemainder = 0;

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (!gl || typeof gl.fenceSync !== 'function') {
          frameId = window.setTimeout(cb, 80);
          return;
        }
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) {
            if (sync) gl.deleteSync(sync);
            return;
          }
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      }

      const tick = () => {
        if (disposed) return;

        const now = performance.now();
        const dtSec = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // Measure real FPS for telemetry
        fpsFrames++;
        fpsAccumTime += dtSec;
        if (fpsAccumTime >= 0.4) {
          const fps = Math.round(fpsFrames / fpsAccumTime);
          if (fpsTextRef.current) {
            fpsTextRef.current.textContent = `${fps} FPS`;
          }
          fpsFrames = 0;
          fpsAccumTime = 0;
        }

        const engine = engineRef.current;

        // Advance ODE solver smoothly proportional to real elapsed time
        if (isRunningRef.current && !engine.diverged) {
          const baseStepsPerSec = engine.systemId === 'lorenz' ? 300 : 220;
          const exactSteps = dtSec * baseStepsPerSec * speedRef.current + stepRemainder;
          const wholeSteps = Math.min(24, Math.floor(exactSteps));
          stepRemainder = exactSteps - wholeSteps;
          if (wholeSteps > 0) {
            engine.advance(wholeSteps);
          }
        }

        if (sampleTextRef.current) {
          sampleTextRef.current.textContent = `${engine.count.toLocaleString()} pts`;
        }

        syncTrailGeometry(engine);
        onAfterPhysicsStepRef.current();

        // Smooth camera preset damping
        if (cameraTransitionRef.current.active) {
          _targetCamPos.copy(cameraTransitionRef.current.pos);
          _targetCamUp.copy(cameraTransitionRef.current.up);
          const alpha = 1 - Math.exp(-8.5 * Math.max(dtSec, 0.008));
          camera.position.lerp(_targetCamPos, alpha);
          camera.up.lerp(_targetCamUp, alpha).normalize();
          controls.target.lerp(_targetLookAt, alpha);

          if (camera.position.distanceTo(_targetCamPos) < 0.025) {
            camera.position.copy(_targetCamPos);
            camera.up.copy(_targetCamUp);
            controls.target.copy(_targetLookAt);
            cameraTransitionRef.current.active = false;
          }
        }

        controls.autoRotate = !isSoftwareGl && autoRotateRef.current && !cameraTransitionRef.current.active;
        controls.autoRotateSpeed = 1.4;
        controls.update();

        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      // Initial render kick
      syncTrailGeometry(engineRef.current);
      if (isSoftwareGl) {
        renderer.render(scene, camera);
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        controls.removeEventListener('start', handleControlStart);
        controls.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

        // Dispose Three.js resources
        trailGeo.dispose();
        trailMat.dispose();
        twinGeo.dispose();
        twinMat.dispose();
        headCoreGeo.dispose();
        headCoreMat.dispose();
        twinCoreMat.dispose();
        glowTex.dispose();
        twinGlowTex.dispose();
        haloMat.dispose();
        twinHaloMat.dispose();
        edgesGeo.dispose();
        (boxLines.material as THREE.Material).dispose();
        [xAxis, yAxis, zAxis].forEach((l) => {
          l.geometry.dispose();
          (l.material as THREE.Material).dispose();
        });
        [xLabel, yLabel, zLabel].forEach((s) => {
          s.material.map?.dispose();
          s.material.dispose();
        });
        envTexture.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, [engineRef]);

    const def = SYSTEM_DEFINITIONS[systemId];

    return (
      <div className="relative w-full h-full bg-[#07090E] overflow-hidden select-none">
        {/* Isolated WebGL mount div */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Fallback overlay if WebGL fails or context is lost */}
        {(webglUnavailable || contextLost) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#07090E]/95 text-slate-300 z-20 p-6 text-center">
            <p className="text-sm font-medium text-slate-200">
              {webglUnavailable
                ? '3D WebGL viewport unavailable in this browser context.'
                : 'WebGL context interrupted — restoring graphics pipeline.'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Time series and 2D phase plots remain fully active below.
            </p>
          </div>
        )}

        {/* Top-left subtle viewport title & drag instruction */}
        <div className="pointer-events-none absolute top-3 left-3.5 z-10 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
            <span>3D Phase Attractor</span>
            <span className="text-slate-600">·</span>
            <span className="font-mono text-cyan-400">{def.title}</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Drag to orbit · Scroll to zoom · Right-drag to pan
          </p>
        </div>

        {/* Top-right camera preset bar */}
        <div className="absolute top-3 right-3.5 z-10 flex items-center gap-1.5">
          <div className="flex items-center bg-[#0E131D]/90 border border-slate-800 rounded-md p-0.5">
            {(
              [
                { id: 'orbit', label: '3D' },
                { id: 'xz', label: 'X–Z' },
                { id: 'xy', label: 'X–Y' },
                { id: 'yz', label: 'Y–Z' },
              ] as const
            ).map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => triggerPreset(view.id)}
                className={`px-2 py-1 text-[11px] font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activePreset === view.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleAutoRotate}
            title="Toggle automatic camera rotation"
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              autoRotate
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                : 'bg-[#0E131D]/90 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            <span>Auto-Orbit</span>
          </button>

          <button
            type="button"
            onClick={() => triggerPreset('orbit')}
            title="Reset camera angle"
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-[#0E131D]/90 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        {/* Bottom-left minimal color scale + FPS readout */}
        <div className="pointer-events-none absolute bottom-3 left-3.5 z-10 flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Tail</span>
            <span
              className="inline-block w-16 h-1.5 rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #1d4ed8 0%, #06b6d4 65%, #fde68a 100%)',
              }}
            />
            <span className="text-amber-200">Head</span>
          </div>
          <span className="text-slate-700">|</span>
          <span ref={sampleTextRef} className="tabular-nums text-slate-300">
            0 pts
          </span>
          <span className="text-slate-700">|</span>
          <span ref={fpsTextRef} className="tabular-nums text-cyan-400">
            60 FPS
          </span>
        </div>
      </div>
    );
  }
);
