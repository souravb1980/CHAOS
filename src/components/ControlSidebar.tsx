import React from 'react';
import {
  InitialCondition,
  SYSTEM_DEFINITIONS,
  SystemId,
  SystemParams,
  SystemPreset,
} from '../math/dynamicalSystems';
import { Play, RotateCcw, Sparkles } from 'lucide-react';

export interface LiveReadoutRefs {
  x: React.RefObject<HTMLSpanElement | null>;
  y: React.RefObject<HTMLSpanElement | null>;
  z: React.RefObject<HTMLSpanElement | null>;
  tau: React.RefObject<HTMLSpanElement | null>;
  speed: React.RefObject<HTMLSpanElement | null>;
}

interface ControlSidebarProps {
  systemId: SystemId;
  params: SystemParams;
  initial: InitialCondition;
  dt: number;
  speedMultiplier: number;
  trailLength: number;
  showTwin: boolean;
  diverged: boolean;
  readoutRefs: LiveReadoutRefs;
  onParamChange: (key: keyof SystemParams, value: number) => void;
  onApplyPreset: (preset: SystemPreset) => void;
  onInitialChange: (key: keyof InitialCondition, value: number) => void;
  onDtChange: (dt: number) => void;
  onSpeedChange: (speed: number) => void;
  onTrailLengthChange: (len: number) => void;
  onToggleTwin: () => void;
  onResetPrefill: () => void;
  onTraceFromZero: () => void;
}

export const ControlSidebar: React.FC<ControlSidebarProps> = ({
  systemId,
  params,
  initial,
  dt,
  speedMultiplier,
  trailLength,
  showTwin,
  diverged,
  readoutRefs,
  onParamChange,
  onApplyPreset,
  onInitialChange,
  onDtChange,
  onSpeedChange,
  onTrailLengthChange,
  onToggleTwin,
  onResetPrefill,
  onTraceFromZero,
}) => {
  const def = SYSTEM_DEFINITIONS[systemId];

  const isPresetActive = (preset: SystemPreset) => {
    return Object.entries(preset.params).every(([k, v]) => {
      const current = params[k as keyof SystemParams];
      return Math.abs(current - (v as number)) < 1e-4;
    });
  };

  return (
    <aside className="w-full lg:w-[336px] shrink-0 bg-[#0B101B] border-r border-slate-800/90 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto lab-scroll divide-y divide-slate-800/80">
        {/* Governing ODEs */}
        <section className="p-4">
          <div className="flex items-baseline justify-between gap-2 mb-2.5">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
              Governing Equations
            </h2>
            <span className="text-[11px] font-mono text-slate-400">
              {def.sectionLabel} · RK4
            </span>
          </div>
          <div className="bg-[#07090E] border border-slate-800/90 rounded-md px-3 py-2.5 space-y-1 font-mono text-xs text-slate-200">
            {def.equations.map((eq, idx) => (
              <div key={idx} className="leading-relaxed">
                {eq}
              </div>
            ))}
          </div>
        </section>

        {/* Parameter Sliders */}
        <section className="p-4 space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
              Parameter Tuning
            </h2>
            <span className="text-[11px] text-slate-400">Live solver update</span>
          </div>

          <div className="space-y-4">
            {def.parameters.map((p) => {
              const value = params[p.key];
              return (
                <div key={p.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`param-${p.key}`}
                      className="text-xs text-slate-300 flex items-center gap-1.5"
                    >
                      <span className="font-mono font-semibold text-cyan-400">
                        {p.symbol}
                      </span>
                      <span>{p.label}</span>
                    </label>
                    <input
                      type="number"
                      aria-label={`${p.label} numeric value`}
                      value={Number(value.toFixed(p.decimals))}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value);
                        if (!Number.isNaN(parsed)) {
                          onParamChange(
                            p.key,
                            Math.min(p.max, Math.max(p.min, parsed))
                          );
                        }
                      }}
                      className="w-20 px-2 py-0.5 text-right font-mono text-xs text-slate-100 bg-[#07090E] border border-slate-800 rounded focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <input
                    id={`param-${p.key}`}
                    type="range"
                    className="lab-slider"
                    min={p.min}
                    max={p.max}
                    step={p.step}
                    value={value}
                    onChange={(e) => onParamChange(p.key, parseFloat(e.target.value))}
                  />

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>{p.min}</span>
                    <span className="text-slate-400">{p.circuitHint(value)}</span>
                    <span>{p.max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Regime Presets */}
        <section className="p-4 space-y-2.5">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
            Dynamical Regimes
          </h2>
          <div className="grid grid-cols-2 gap-1.5">
            {def.presets.map((preset) => {
              const active = isPresetActive(preset);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset)}
                  className={`text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'bg-cyan-500/12 border-cyan-500/50 text-slate-100'
                      : 'bg-[#07090E] border-slate-800/90 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                  }`}
                >
                  <div className="text-xs font-medium truncate">{preset.name}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    {preset.regime}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Solver & Trajectory Controls */}
        <section className="p-4 space-y-3.5">
          <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
            Integrator &amp; Orbit Controls
          </h2>

          {/* Speed */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Playback Speed</span>
              <span className="font-mono text-slate-200">
                {speedMultiplier.toFixed(2)}×
              </span>
            </div>
            <input
              type="range"
              aria-label="Playback Speed"
              className="lab-slider"
              min={0.25}
              max={3.5}
              step={0.25}
              value={speedMultiplier}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            />
          </div>

          {/* Step size dt */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Step Size (Δτ)</span>
              <span className="font-mono text-slate-200">{dt.toFixed(3)}</span>
            </div>
            <input
              type="range"
              aria-label="Integration Step Size"
              className="lab-slider"
              min={0.002}
              max={0.024}
              step={0.001}
              value={dt}
              onChange={(e) => onDtChange(parseFloat(e.target.value))}
            />
          </div>

          {/* Trail length */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Trail Buffer</span>
              <span className="font-mono text-slate-200">
                {trailLength.toLocaleString()} pts
              </span>
            </div>
            <input
              type="range"
              aria-label="Trail Buffer Length"
              className="lab-slider"
              min={1000}
              max={12000}
              step={500}
              value={trailLength}
              onChange={(e) => onTrailLengthChange(parseInt(e.target.value, 10))}
            />
          </div>

          {/* Sensitive Dependence Twin Trajectory */}
          <button
            type="button"
            onClick={onToggleTwin}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-xs transition-colors cursor-pointer ${
              showTwin
                ? 'bg-rose-500/12 border-rose-500/45 text-rose-200'
                : 'bg-[#07090E] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>Sensitivity Twin (δx₀ = 10⁻⁴)</span>
            </span>
            <span className="font-mono text-[11px]">
              {showTwin ? 'Active' : 'Off'}
            </span>
          </button>

          {/* Initial conditions */}
          <div className="pt-1 space-y-2">
            <div className="text-[11px] text-slate-400">
              Initial State (x₀, y₀, z₀)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { key: 'x0', label: 'x₀' },
                  { key: 'y0', label: 'y₀' },
                  { key: 'z0', label: 'z₀' },
                ] as const
              ).map((item) => (
                <div key={item.key} className="flex flex-col gap-1">
                  <label
                    htmlFor={`init-${item.key}`}
                    className="text-[10px] font-mono text-slate-400"
                  >
                    {item.label}
                  </label>
                  <input
                    id={`init-${item.key}`}
                    type="number"
                    step={0.1}
                    value={initial[item.key]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) onInitialChange(item.key, val);
                    }}
                    className="w-full px-2 py-1 text-xs font-mono text-slate-100 bg-[#07090E] border border-slate-800 rounded focus:outline-none focus:border-cyan-500"
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onTraceFromZero}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#07090E] hover:bg-slate-800/80 text-slate-200 border border-slate-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3 h-3 text-cyan-400" />
                <span>Trace from t₀</span>
              </button>
              <button
                type="button"
                onClick={onResetPrefill}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#07090E] hover:bg-slate-800/80 text-slate-200 border border-slate-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Pre-fill Orbit</span>
              </button>
            </div>
          </div>
        </section>

        {/* Live State Vector Readout */}
        <section className="p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-slate-200 tracking-wide">
              Instantaneous State
            </h2>
            {diverged ? (
              <span className="text-[11px] font-mono text-rose-400">
                Diverged — Reset
              </span>
            ) : (
              <span className="text-[11px] font-mono text-slate-400">
                τ = <span ref={readoutRefs.tau}>0.00</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#07090E] border border-slate-800/90 rounded px-2.5 py-2">
              <div className="text-[10px] font-mono text-cyan-400">x(τ)</div>
              <span
                ref={readoutRefs.x}
                className="block font-mono text-sm font-semibold text-slate-100 mt-0.5"
              >
                0.000
              </span>
            </div>
            <div className="bg-[#07090E] border border-slate-800/90 rounded px-2.5 py-2">
              <div className="text-[10px] font-mono text-amber-400">y(τ)</div>
              <span
                ref={readoutRefs.y}
                className="block font-mono text-sm font-semibold text-slate-100 mt-0.5"
              >
                0.000
              </span>
            </div>
            <div className="bg-[#07090E] border border-slate-800/90 rounded px-2.5 py-2">
              <div className="text-[10px] font-mono text-emerald-400">z(τ)</div>
              <span
                ref={readoutRefs.z}
                className="block font-mono text-sm font-semibold text-slate-100 mt-0.5"
              >
                0.000
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
            <span>Phase Speed ||dr/dτ||</span>
            <span ref={readoutRefs.speed} className="text-slate-200">
              0.00
            </span>
          </div>
        </section>
      </div>
    </aside>
  );
};
