import { useCallback, useRef, useState } from 'react';
import {
  ChaosSimulationEngine,
  InitialCondition,
  SYSTEM_DEFINITIONS,
  SystemId,
  SystemParams,
  SystemPreset,
} from './math/dynamicalSystems';
import {
  Attractor3DCanvas,
  Attractor3DHandle,
} from './components/Attractor3DCanvas';
import {
  TimeSeriesHandle,
  TimeSeriesOscilloscope,
} from './components/TimeSeriesOscilloscope';
import { ControlSidebar, LiveReadoutRefs } from './components/ControlSidebar';
import { Pause, Play, RotateCcw } from 'lucide-react';

export default function App() {
  // Single authoritative zero-GC simulation engine instance
  const engineRef = useRef<ChaosSimulationEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ChaosSimulationEngine('lorenz');
  }
  const safeEngineRef = engineRef as React.MutableRefObject<ChaosSimulationEngine>;

  const attractor3DRef = useRef<Attractor3DHandle | null>(null);
  const timeSeriesRef = useRef<TimeSeriesHandle | null>(null);

  const readoutRefs: LiveReadoutRefs = {
    x: useRef<HTMLSpanElement | null>(null),
    y: useRef<HTMLSpanElement | null>(null),
    z: useRef<HTMLSpanElement | null>(null),
    tau: useRef<HTMLSpanElement | null>(null),
    speed: useRef<HTMLSpanElement | null>(null),
  };

  const [systemId, setSystemId] = useState<SystemId>('lorenz');
  const [params, setParams] = useState<SystemParams>({
    sigma: 10.0,
    r: 28.0,
    b: 2.67,
    a: 0.3,
  });
  const [initial, setInitial] = useState<InitialCondition>({
    ...SYSTEM_DEFINITIONS.lorenz.defaultInitial,
  });
  const [dt, setDt] = useState<number>(SYSTEM_DEFINITIONS.lorenz.defaultDt);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [trailLength, setTrailLength] = useState<number>(6000);
  const [showTwin, setShowTwin] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [diverged, setDiverged] = useState<boolean>(false);

  const handleAfterPhysicsStep = useCallback(() => {
    const engine = safeEngineRef.current;
    timeSeriesRef.current?.draw();

    if (readoutRefs.x.current) {
      readoutRefs.x.current.textContent = engine.x.toFixed(3);
    }
    if (readoutRefs.y.current) {
      readoutRefs.y.current.textContent = engine.y.toFixed(3);
    }
    if (readoutRefs.z.current) {
      readoutRefs.z.current.textContent = engine.z.toFixed(3);
    }
    if (readoutRefs.tau.current) {
      readoutRefs.tau.current.textContent = engine.tau.toFixed(2);
    }
    if (readoutRefs.speed.current) {
      readoutRefs.speed.current.textContent = engine.speed.toFixed(2);
    }
    if (engine.diverged) {
      setDiverged((prev) => (prev ? prev : true));
    }
  }, [safeEngineRef, readoutRefs.x, readoutRefs.y, readoutRefs.z, readoutRefs.tau, readoutRefs.speed]);

  const handleSelectSystem = (nextId: SystemId) => {
    if (nextId === systemId) return;
    const engine = safeEngineRef.current;
    engine.setSystem(nextId, true);
    const def = SYSTEM_DEFINITIONS[nextId];

    setSystemId(nextId);
    setParams({ ...engine.params });
    setInitial({ ...def.defaultInitial });
    setDt(def.defaultDt);
    setDiverged(false);
    setIsRunning(true);
    attractor3DRef.current?.resetCamera();
  };

  const handleParamChange = (key: keyof SystemParams, value: number) => {
    const engine = safeEngineRef.current;
    engine.params[key] = value;
    setParams((prev) => ({ ...prev, [key]: value }));
    if (engine.diverged) {
      engine.reset(true);
      setDiverged(false);
    }
  };

  const handleApplyPreset = (preset: SystemPreset) => {
    const engine = safeEngineRef.current;
    const nextParams = { ...params, ...preset.params };
    Object.assign(engine.params, preset.params);
    setParams(nextParams);
    engine.reset(true);
    setDiverged(false);
    setIsRunning(true);
  };

  const handleInitialChange = (key: keyof InitialCondition, value: number) => {
    const engine = safeEngineRef.current;
    engine.initial[key] = value;
    setInitial((prev) => ({ ...prev, [key]: value }));
  };

  const handleDtChange = (nextDt: number) => {
    safeEngineRef.current.dt = nextDt;
    setDt(nextDt);
  };

  const handleTrailLengthChange = (nextLen: number) => {
    safeEngineRef.current.setTrailLength(nextLen);
    setTrailLength(nextLen);
  };

  const handleToggleTwin = () => {
    const next = !showTwin;
    const engine = safeEngineRef.current;
    engine.showTwin = next;
    setShowTwin(next);
    if (next) {
      engine.reset(true);
      setDiverged(false);
    }
  };

  const handleResetPrefill = () => {
    const engine = safeEngineRef.current;
    engine.reset(true);
    setDiverged(false);
    setIsRunning(true);
  };

  const handleTraceFromZero = () => {
    const engine = safeEngineRef.current;
    engine.reset(false);
    setDiverged(false);
    setIsRunning(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07090E] text-slate-100 overflow-hidden">
      {/* Top Bar Contract: Single row, 3 balanced zones */}
      <header className="h-12 shrink-0 flex items-center justify-between gap-8 px-4 lg:px-5 bg-[#0B101B] border-b border-slate-800/90">
        {/* Zone 1: Brand Title */}
        <div className="font-display text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          Chaos Dynamics Solver
        </div>

        {/* Zone 2: System Switcher */}
        <nav
          aria-label="Dynamical system selector"
          className="flex items-center gap-1 bg-[#07090E] border border-slate-800 rounded-md p-0.5 shrink-0"
        >
          <button
            type="button"
            onClick={() => handleSelectSystem('lorenz')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              systemId === 'lorenz'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Lorenz System (2.6.2)
          </button>
          <button
            type="button"
            onClick={() => handleSelectSystem('sprott')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              systemId === 'sprott'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 border border-transparent'
            }`}
          >
            Sprott System (2.6.1)
          </button>
        </nav>

        {/* Zone 3: Primary Transport Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsRunning((r) => !r)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleResetPrefill}
            title="Reset trajectory"
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#07090E] hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </header>

      {/* Main Split Scientific Console */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
        <ControlSidebar
          systemId={systemId}
          params={params}
          initial={initial}
          dt={dt}
          speedMultiplier={speedMultiplier}
          trailLength={trailLength}
          showTwin={showTwin}
          diverged={diverged}
          readoutRefs={readoutRefs}
          onParamChange={handleParamChange}
          onApplyPreset={handleApplyPreset}
          onInitialChange={handleInitialChange}
          onDtChange={handleDtChange}
          onSpeedChange={setSpeedMultiplier}
          onTrailLengthChange={handleTrailLengthChange}
          onToggleTwin={handleToggleTwin}
          onResetPrefill={handleResetPrefill}
          onTraceFromZero={handleTraceFromZero}
        />

        {/* Right Visualization Stage: 3D Viewport + Synchronized Oscilloscope & Phase Plot */}
        <section className="flex-1 flex flex-col min-w-0 min-h-[680px] lg:min-h-0">
          {/* Primary 3D WebGL Viewport */}
          <div className="flex-[3] min-h-[340px] relative">
            <Attractor3DCanvas
              ref={attractor3DRef}
              engineRef={safeEngineRef}
              systemId={systemId}
              isRunning={isRunning}
              speedMultiplier={speedMultiplier}
              autoRotate={autoRotate}
              onToggleAutoRotate={() => setAutoRotate((a) => !a)}
              onAfterPhysicsStep={handleAfterPhysicsStep}
            />
          </div>

          {/* Bottom Synchronized Time Series Oscilloscope */}
          <div className="flex-[2] min-h-[240px]">
            <TimeSeriesOscilloscope ref={timeSeriesRef} engineRef={safeEngineRef} systemId={systemId} />
          </div>
        </section>
      </main>
    </div>
  );
}
