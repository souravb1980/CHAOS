export type SystemId = 'lorenz' | 'sprott';

export type Plane2D = 'xz' | 'xy' | 'yz';

export type CameraPreset = 'orbit' | 'xz' | 'xy' | 'yz';

export interface SystemParams {
  // Lorenz parameters
  sigma: number;
  r: number;
  b: number;
  // Sprott parameter
  a: number;
}

export interface InitialCondition {
  x0: number;
  y0: number;
  z0: number;
}

export interface ParameterMeta {
  key: keyof SystemParams;
  symbol: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  decimals: number;
  circuitHint: (val: number) => string;
}

export interface SystemPreset {
  id: string;
  name: string;
  regime: string;
  params: Partial<SystemParams>;
}

export interface SystemDefinition {
  id: SystemId;
  sectionLabel: string;
  title: string;
  equations: string[];
  parameters: ParameterMeta[];
  presets: SystemPreset[];
  defaultInitial: InitialCondition;
  defaultDt: number;
  /** World transform from mathematical (x,y,z) to Three.js (X,Y,Z) where +Y is up */
  worldCenter: [number, number, number];
  worldScale: number;
  defaultRanges: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
}

export const SYSTEM_DEFINITIONS: Record<SystemId, SystemDefinition> = {
  lorenz: {
    id: 'lorenz',
    sectionLabel: 'Section 2.6.2',
    title: 'Lorenz System',
    equations: [
      'dx/dτ = σ(y − x)',
      'dy/dτ = rx − y − xz',
      'dz/dτ = xy − bz',
    ],
    parameters: [
      {
        key: 'sigma',
        symbol: 'σ',
        label: 'Prandtl Number',
        min: 1.0,
        max: 30.0,
        step: 0.1,
        defaultValue: 10.0,
        decimals: 1,
        circuitHint: (v) => `R₅/R₁ (R₁ = ${(1000 / Math.max(v, 0.01)).toFixed(1)} kΩ)`,
      },
      {
        key: 'r',
        symbol: 'r',
        label: 'Rayleigh Number',
        min: 0.5,
        max: 60.0,
        step: 0.1,
        defaultValue: 28.0,
        decimals: 1,
        circuitHint: (v) => `R₅/R₃ (R₃ = ${(1000 / Math.max(v, 0.01)).toFixed(1)} kΩ)`,
      },
      {
        key: 'b',
        symbol: 'b',
        label: 'Geometric Factor',
        min: 0.2,
        max: 10.0,
        step: 0.01,
        defaultValue: 2.67,
        decimals: 2,
        circuitHint: (v) => `R₅/R₇ (R₇ = ${(1000 / Math.max(v, 0.01)).toFixed(1)} kΩ)`,
      },
    ],
    presets: [
      {
        id: 'lorenz-chaos',
        name: 'Classic Butterfly',
        regime: 'Chaotic Attractor',
        params: { sigma: 10.0, r: 28.0, b: 2.67 },
      },
      {
        id: 'lorenz-threshold',
        name: 'Pre-Chaotic',
        regime: 'Metastable Transient',
        params: { sigma: 10.0, r: 24.4, b: 2.67 },
      },
      {
        id: 'lorenz-spiral',
        name: 'Damped Spiral',
        regime: 'Fixed Point',
        params: { sigma: 10.0, r: 14.0, b: 2.67 },
      },
      {
        id: 'lorenz-high',
        name: 'High-Rayleigh',
        regime: 'Dense Chaos',
        params: { sigma: 10.0, r: 45.0, b: 2.67 },
      },
    ],
    defaultInitial: { x0: 1.0, y0: 1.0, z0: 1.0 },
    defaultDt: 0.006,
    worldCenter: [0, 0, 25],
    worldScale: 0.145,
    defaultRanges: {
      x: [-24, 24],
      y: [-32, 32],
      z: [0, 52],
    },
  },
  sprott: {
    id: 'sprott',
    sectionLabel: 'Section 2.6.1',
    title: 'Sprott System',
    equations: [
      'dx/dτ = xy − z',
      'dy/dτ = x − y',
      'dz/dτ = x + az',
    ],
    parameters: [
      {
        key: 'a',
        symbol: 'a',
        label: 'Feedback Gain',
        min: 0.02,
        max: 0.36,
        step: 0.002,
        defaultValue: 0.3,
        decimals: 3,
        circuitHint: (v) => `R₁₂/R₉ (R₉ = ${(10 / Math.max(v, 0.005)).toFixed(1)} kΩ)`,
      },
    ],
    presets: [
      {
        id: 'sprott-chaos',
        name: 'Classic Sprott',
        regime: 'Chaotic Attractor',
        params: { a: 0.3 },
      },
      {
        id: 'sprott-p4',
        name: 'Period-4 Orbit',
        regime: 'Subharmonic Cascade',
        params: { a: 0.27 },
      },
      {
        id: 'sprott-p2',
        name: 'Period-2 Orbit',
        regime: 'Bifurcation',
        params: { a: 0.25 },
      },
      {
        id: 'sprott-p1',
        name: 'Limit Cycle',
        regime: 'Period-1',
        params: { a: 0.15 },
      },
      {
        id: 'sprott-wide',
        name: 'Wideband Scroll',
        regime: 'Expanded Chaos',
        params: { a: 0.34 },
      },
    ],
    defaultInitial: { x0: 0.5, y0: 0.5, z0: 0.5 },
    defaultDt: 0.015,
    worldCenter: [-0.6, -0.2, 1.3],
    worldScale: 1.55,
    defaultRanges: {
      x: [-3.5, 2.0],
      y: [-2.2, 1.6],
      z: [-1.2, 4.4],
    },
  },
};

export const MAX_TRAIL_POINTS = 12000;

/**
 * High-throughput, zero-GC RK4 ODE solver and contiguous sliding ring buffer.
 * Keeps points ordered chronologically [0 .. count - 1] using native Float32Array.copyWithin
 * so Three.js BufferGeometry and 2D HTML5 Canvas renderers read directly without allocations.
 */
export class ChaosSimulationEngine {
  public systemId: SystemId = 'lorenz';
  public params: SystemParams = {
    sigma: 10.0,
    r: 28.0,
    b: 2.67,
    a: 0.3,
  };
  public initial: InitialCondition = { x0: 1.0, y0: 1.0, z0: 1.0 };
  public dt = 0.006;
  public trailLength = 6000;
  public showTwin = false;

  // Current mathematical state
  public x = 1.0;
  public y = 1.0;
  public z = 1.0;
  public tau = 0.0;
  public speed = 0.0;

  // Twin perturbed trajectory state (delta = 1e-4 on x0)
  public tx = 1.0001;
  public ty = 1.0;
  public tz = 1.0;

  public diverged = false;
  public count = 0;

  // Pre-allocated typed buffers
  public readonly bufX = new Float32Array(MAX_TRAIL_POINTS);
  public readonly bufY = new Float32Array(MAX_TRAIL_POINTS);
  public readonly bufZ = new Float32Array(MAX_TRAIL_POINTS);
  public readonly bufT = new Float32Array(MAX_TRAIL_POINTS);
  public readonly bufSpeed = new Float32Array(MAX_TRAIL_POINTS);

  public readonly twinX = new Float32Array(MAX_TRAIL_POINTS);
  public readonly twinY = new Float32Array(MAX_TRAIL_POINTS);
  public readonly twinZ = new Float32Array(MAX_TRAIL_POINTS);

  // Scratch scalars for RK4 derivative evaluations (zero heap allocations)
  private dx = 0;
  private dy = 0;
  private dz = 0;

  constructor(initialSystem: SystemId = 'lorenz') {
    this.setSystem(initialSystem, true);
  }

  public setSystem(id: SystemId, prefill = true): void {
    const def = SYSTEM_DEFINITIONS[id];
    this.systemId = id;
    this.initial = { ...def.defaultInitial };
    this.dt = def.defaultDt;
    if (id === 'lorenz') {
      this.params.sigma = 10.0;
      this.params.r = 28.0;
      this.params.b = 2.67;
    } else {
      this.params.a = 0.3;
    }
    this.reset(prefill);
  }

  public reset(prefill = true): void {
    this.x = this.initial.x0;
    this.y = this.initial.y0;
    this.z = this.initial.z0;
    this.tx = this.initial.x0 + 1e-4;
    this.ty = this.initial.y0;
    this.tz = this.initial.z0;
    this.tau = 0;
    this.diverged = false;
    this.count = 0;

    this.evalDerivatives(this.x, this.y, this.z);
    this.speed = Math.hypot(this.dx, this.dy, this.dz);
    this.pushSample();

    if (prefill) {
      // Pre-warm transient slightly and populate initial orbit so attractor is immediately visible
      const prefillCount = Math.min(2400, this.trailLength);
      this.advance(prefillCount);
    }
  }

  public setTrailLength(nextLength: number): void {
    const clamped = Math.max(500, Math.min(MAX_TRAIL_POINTS, Math.round(nextLength)));
    if (clamped < this.count) {
      const drop = this.count - clamped;
      this.shiftBuffers(drop);
      this.count = clamped;
    }
    this.trailLength = clamped;
  }

  private evalDerivatives(x: number, y: number, z: number): void {
    if (this.systemId === 'lorenz') {
      this.dx = this.params.sigma * (y - x);
      this.dy = this.params.r * x - y - x * z;
      this.dz = x * y - this.params.b * z;
    } else {
      this.dx = x * y - z;
      this.dy = x - y;
      this.dz = x + this.params.a * z;
    }
  }

  private rk4StepSingle(
    x: number,
    y: number,
    z: number,
    h: number
  ): [number, number, number, number] {
    this.evalDerivatives(x, y, z);
    const k1x = this.dx;
    const k1y = this.dy;
    const k1z = this.dz;

    this.evalDerivatives(x + 0.5 * h * k1x, y + 0.5 * h * k1y, z + 0.5 * h * k1z);
    const k2x = this.dx;
    const k2y = this.dy;
    const k2z = this.dz;

    this.evalDerivatives(x + 0.5 * h * k2x, y + 0.5 * h * k2y, z + 0.5 * h * k2z);
    const k3x = this.dx;
    const k3y = this.dy;
    const k3z = this.dz;

    this.evalDerivatives(x + h * k3x, y + h * k3y, z + h * k3z);
    const k4x = this.dx;
    const k4y = this.dy;
    const k4z = this.dz;

    const h6 = h / 6;
    const nx = x + h6 * (k1x + 2 * k2x + 2 * k3x + k4x);
    const ny = y + h6 * (k1y + 2 * k2y + 2 * k3y + k4y);
    const nz = z + h6 * (k1z + 2 * k2z + 2 * k3z + k4z);
    const spd = Math.hypot(k1x, k1y, k1z);
    return [nx, ny, nz, spd];
  }

  private shiftBuffers(shift: number): void {
    if (shift <= 0) return;
    if (shift >= this.count) {
      this.count = 0;
      return;
    }
    const end = this.count;
    this.bufX.copyWithin(0, shift, end);
    this.bufY.copyWithin(0, shift, end);
    this.bufZ.copyWithin(0, shift, end);
    this.bufT.copyWithin(0, shift, end);
    this.bufSpeed.copyWithin(0, shift, end);
    this.twinX.copyWithin(0, shift, end);
    this.twinY.copyWithin(0, shift, end);
    this.twinZ.copyWithin(0, shift, end);
    this.count -= shift;
  }

  private pushSample(): void {
    if (this.count >= this.trailLength) {
      this.shiftBuffers(this.count - this.trailLength + 1);
    }
    const idx = this.count;
    this.bufX[idx] = this.x;
    this.bufY[idx] = this.y;
    this.bufZ[idx] = this.z;
    this.bufT[idx] = this.tau;
    this.bufSpeed[idx] = this.speed;
    this.twinX[idx] = this.tx;
    this.twinY[idx] = this.ty;
    this.twinZ[idx] = this.tz;
    this.count = idx + 1;
  }

  public advance(steps: number): void {
    if (this.diverged || steps <= 0) return;
    const h = this.dt;
    // Sub-step if user sets large dt so RK4 stays unconditionally accurate
    const subSteps = h > 0.012 ? 2 : 1;
    const subH = h / subSteps;

    for (let s = 0; s < steps; s++) {
      for (let sub = 0; sub < subSteps; sub++) {
        const [nx, ny, nz, spd] = this.rk4StepSingle(this.x, this.y, this.z, subH);
        if (
          !Number.isFinite(nx) ||
          !Number.isFinite(ny) ||
          !Number.isFinite(nz) ||
          Math.abs(nx) > 5000 ||
          Math.abs(ny) > 5000 ||
          Math.abs(nz) > 5000
        ) {
          this.diverged = true;
          return;
        }
        this.x = nx;
        this.y = ny;
        this.z = nz;
        this.speed = spd;

        if (this.showTwin) {
          const [tnx, tny, tnz] = this.rk4StepSingle(this.tx, this.ty, this.tz, subH);
          if (
            Number.isFinite(tnx) &&
            Number.isFinite(tny) &&
            Number.isFinite(tnz) &&
            Math.abs(tnx) <= 5000 &&
            Math.abs(tny) <= 5000 &&
            Math.abs(tnz) <= 5000
          ) {
            this.tx = tnx;
            this.ty = tny;
            this.tz = tnz;
          }
        }
      }
      this.tau += h;
      this.pushSample();
    }
  }
}
