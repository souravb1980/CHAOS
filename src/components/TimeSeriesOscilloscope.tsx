import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Download } from 'lucide-react';
import { ChaosSimulationEngine, SYSTEM_DEFINITIONS, SystemId } from '../math/dynamicalSystems';

export interface TimeSeriesHandle {
  draw: () => void;
}

interface TimeSeriesOscilloscopeProps {
  engineRef: React.MutableRefObject<ChaosSimulationEngine>;
  systemId: SystemId;
}

type DisplayMode = 'stacked' | 'overlay';

export const TimeSeriesOscilloscope = forwardRef<
  TimeSeriesHandle,
  TimeSeriesOscilloscopeProps
>(function TimeSeriesOscilloscope({ engineRef, systemId }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverReadoutRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<DisplayMode>('stacked');
  const [channels, setChannels] = useState({ x: true, y: true, z: true });

  const modeRef = useRef(mode);
  modeRef.current = mode;

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const hoverPosRef = useRef<{ x: number; y: number } | null>(null);
  const sizeRef = useRef<{ w: number; h: number; dpr: number }>({
    w: 500,
    h: 220,
    dpr: 1,
  });

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { w, h, dpr } = sizeRef.current;
    if (w <= 1 || h <= 1) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, w, h);

    const padLeft = 46;
    const padRight = 14;
    const padTop = 10;
    const padBottom = 22;
    const plotW = Math.max(10, w - padLeft - padRight);
    const plotH = Math.max(10, h - padTop - padBottom);

    // Oscilloscope hairline graticule
    ctx.strokeStyle = '#151E2E';
    ctx.lineWidth = 1;
    const cols = 10;
    const rows = 6;
    ctx.beginPath();
    for (let i = 0; i <= cols; i++) {
      const gx = Math.round(padLeft + (plotW * i) / cols) + 0.5;
      ctx.moveTo(gx, padTop);
      ctx.lineTo(gx, padTop + plotH);
    }
    for (let j = 0; j <= rows; j++) {
      const gy = Math.round(padTop + (plotH * j) / rows) + 0.5;
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(padLeft + plotW, gy);
    }
    ctx.stroke();

    // Border frame
    ctx.strokeStyle = '#1E293B';
    ctx.strokeRect(padLeft + 0.5, padTop + 0.5, plotW - 1, plotH - 1);

    const engine = engineRef.current;
    const n = engine.count;
    if (n < 2) return;

    // Show the most recent window (up to 1600 samples for clear waveform legibility)
    const windowSamples = Math.min(n, 1600);
    const startIdx = n - windowSamples;
    const bx = engine.bufX;
    const by = engine.bufY;
    const bz = engine.bufZ;
    const bt = engine.bufT;

    const tStart = bt[startIdx];
    const tEnd = bt[n - 1];
    const tSpan = Math.max(1e-6, tEnd - tStart);

    // Compute per-channel dynamic min/max over window (with fallback to system defaults)
    const def = SYSTEM_DEFINITIONS[engine.systemId];
    let minX = def.defaultRanges.x[0];
    let maxX = def.defaultRanges.x[1];
    let minY = def.defaultRanges.y[0];
    let maxY = def.defaultRanges.y[1];
    let minZ = def.defaultRanges.z[0];
    let maxZ = def.defaultRanges.z[1];

    // Expand bounds cleanly if trajectory exceeds default ranges
    let dMinX = Infinity, dMaxX = -Infinity;
    let dMinY = Infinity, dMaxY = -Infinity;
    let dMinZ = Infinity, dMaxZ = -Infinity;
    for (let i = startIdx; i < n; i++) {
      const vx = bx[i], vy = by[i], vz = bz[i];
      if (vx < dMinX) dMinX = vx; if (vx > dMaxX) dMaxX = vx;
      if (vy < dMinY) dMinY = vy; if (vy > dMaxY) dMaxY = vy;
      if (vz < dMinZ) dMinZ = vz; if (vz > dMaxZ) dMaxZ = vz;
    }
    minX = Math.min(minX, dMinX);
    maxX = Math.max(maxX, dMaxX);
    minY = Math.min(minY, dMinY);
    maxY = Math.max(maxY, dMaxY);
    minZ = Math.min(minZ, dMinZ);
    maxZ = Math.max(maxZ, dMaxZ);

    const activeCh = channelsRef.current;
    const activeList: Array<{
      key: 'x' | 'y' | 'z';
      label: string;
      color: string;
      buf: Float32Array;
      min: number;
      max: number;
    }> = [];

    if (activeCh.x) {
      activeList.push({
        key: 'x',
        label: 'x(τ)',
        color: '#06B6D4',
        buf: bx,
        min: minX,
        max: maxX,
      });
    }
    if (activeCh.y) {
      activeList.push({
        key: 'y',
        label: 'y(τ)',
        color: '#F59E0B',
        buf: by,
        min: minY,
        max: maxY,
      });
    }
    if (activeCh.z) {
      activeList.push({
        key: 'z',
        label: 'z(τ)',
        color: '#10B981',
        buf: bz,
        min: minZ,
        max: maxZ,
      });
    }

    const currentMode = modeRef.current;

    if (activeList.length > 0) {
      if (currentMode === 'stacked') {
        const laneCount = activeList.length;
        const laneGap = 6;
        const laneH = (plotH - laneGap * (laneCount - 1)) / laneCount;

        for (let c = 0; c < laneCount; c++) {
          const ch = activeList[c];
          const laneTop = padTop + c * (laneH + laneGap);
          const lanePad = 4;
          const innerH = Math.max(8, laneH - lanePad * 2);
          const span = Math.max(1e-4, ch.max - ch.min);

          // Lane divider
          if (c > 0) {
            ctx.strokeStyle = '#1E293B';
            ctx.beginPath();
            const divY = Math.round(laneTop - laneGap / 2) + 0.5;
            ctx.moveTo(padLeft, divY);
            ctx.lineTo(padLeft + plotW, divY);
            ctx.stroke();
          }

          // Zero baseline if within range
          if (ch.min < 0 && ch.max > 0) {
            const zeroNorm = (0 - ch.min) / span;
            const zy = Math.round(laneTop + lanePad + innerH * (1 - zeroNorm)) + 0.5;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(padLeft, zy);
            ctx.lineTo(padLeft + plotW, zy);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Channel label & range on left margin
          ctx.fillStyle = ch.color;
          ctx.font = '600 10px "IBM Plex Mono", monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(ch.key.toUpperCase(), padLeft - 6, laneTop + laneH / 2);

          ctx.fillStyle = '#64748B';
          ctx.font = '400 9px "IBM Plex Mono", monospace';
          ctx.textBaseline = 'top';
          ctx.fillText(ch.max.toFixed(1), padLeft - 6, laneTop + 2);
          ctx.textBaseline = 'bottom';
          ctx.fillText(ch.min.toFixed(1), padLeft - 6, laneTop + laneH - 2);

          // Trace waveform
          ctx.strokeStyle = ch.color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const stride = windowSamples > plotW * 2 ? Math.floor(windowSamples / (plotW * 2)) : 1;
          let first = true;
          for (let i = startIdx; i < n; i += stride) {
            const px = padLeft + ((bt[i] - tStart) / tSpan) * plotW;
            const norm = (ch.buf[i] - ch.min) / span;
            const py = laneTop + lanePad + innerH * (1 - norm);
            if (first) {
              ctx.moveTo(px, py);
              first = false;
            } else {
              ctx.lineTo(px, py);
            }
          }
          // Ensure final point connects cleanly
          const lastPx = padLeft + plotW;
          const lastPy = laneTop + lanePad + innerH * (1 - (ch.buf[n - 1] - ch.min) / span);
          ctx.lineTo(lastPx, lastPy);
          ctx.stroke();
        }
      } else {
        // Overlay mode: shared common min/max across enabled channels
        let gMin = Infinity;
        let gMax = -Infinity;
        for (const ch of activeList) {
          if (ch.min < gMin) gMin = ch.min;
          if (ch.max > gMax) gMax = ch.max;
        }
        const gSpan = Math.max(1e-4, gMax - gMin);

        // Y-axis ticks
        ctx.fillStyle = '#64748B';
        ctx.font = '400 9px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(gMax.toFixed(1), padLeft - 6, padTop + 2);
        ctx.textBaseline = 'middle';
        ctx.fillText(((gMax + gMin) / 2).toFixed(1), padLeft - 6, padTop + plotH / 2);
        ctx.textBaseline = 'bottom';
        ctx.fillText(gMin.toFixed(1), padLeft - 6, padTop + plotH - 2);

        const stride = windowSamples > plotW * 2 ? Math.floor(windowSamples / (plotW * 2)) : 1;
        for (const ch of activeList) {
          ctx.strokeStyle = ch.color;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          let first = true;
          for (let i = startIdx; i < n; i += stride) {
            const px = padLeft + ((bt[i] - tStart) / tSpan) * plotW;
            const norm = (ch.buf[i] - gMin) / gSpan;
            const py = padTop + 4 + (plotH - 8) * (1 - norm);
            if (first) {
              ctx.moveTo(px, py);
              first = false;
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.lineTo(
            padLeft + plotW,
            padTop + 4 + (plotH - 8) * (1 - (ch.buf[n - 1] - gMin) / gSpan)
          );
          ctx.stroke();
        }
      }
    }

    // Bottom time axis labels
    ctx.fillStyle = '#64748B';
    ctx.font = '400 10px "IBM Plex Mono", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`τ = ${tStart.toFixed(1)}`, padLeft, padTop + plotH + 5);
    ctx.textAlign = 'center';
    ctx.fillText(`Δτ = ${tSpan.toFixed(1)}`, padLeft + plotW / 2, padTop + plotH + 5);
    ctx.textAlign = 'right';
    ctx.fillText(`τ = ${tEnd.toFixed(1)}`, padLeft + plotW, padTop + plotH + 5);

    // Interactive crosshair probe
    const hover = hoverPosRef.current;
    if (
      hover &&
      hover.x >= padLeft &&
      hover.x <= padLeft + plotW &&
      hover.y >= padTop &&
      hover.y <= padTop + plotH
    ) {
      const frac = (hover.x - padLeft) / plotW;
      const sampleIdx = Math.min(
        n - 1,
        Math.max(startIdx, Math.round(startIdx + frac * (windowSamples - 1)))
      );

      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hover.x, padTop);
      ctx.lineTo(hover.x, padTop + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      if (hoverReadoutRef.current) {
        hoverReadoutRef.current.style.opacity = '1';
        hoverReadoutRef.current.textContent = `τ=${bt[sampleIdx].toFixed(2)}  x=${bx[sampleIdx].toFixed(2)}  y=${by[sampleIdx].toFixed(2)}  z=${bz[sampleIdx].toFixed(2)}`;
      }
    } else if (hoverReadoutRef.current) {
      hoverReadoutRef.current.style.opacity = '0';
    }
  };

  useImperativeHandle(ref, () => ({
    draw: drawCanvas,
  }));

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(10, Math.floor(rect.width));
      const h = Math.max(10, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      sizeRef.current = { w, h, dpr };
      drawCanvas();
    };

    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    updateSize();

    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, channels, systemId]);

  const toggleChannel = (key: 'x' | 'y' | 'z') => {
    setChannels((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (!next.x && !next.y && !next.z) return prev; // Keep at least one channel visible
      return next;
    });
  };

  const handleExportCsv = () => {
    const engine = engineRef.current;
    const n = engine.count;
    if (n === 0) return;

    const lines: string[] = [];
    if (engine.showTwin) {
      lines.push('tau,x,y,z,x_twin,y_twin,z_twin');
      for (let i = 0; i < n; i++) {
        lines.push(
          `${engine.bufT[i].toFixed(6)},${engine.bufX[i].toFixed(6)},${engine.bufY[i].toFixed(6)},${engine.bufZ[i].toFixed(6)},${engine.twinX[i].toFixed(6)},${engine.twinY[i].toFixed(6)},${engine.twinZ[i].toFixed(6)}`
        );
      }
    } else {
      lines.push('tau,x,y,z');
      for (let i = 0; i < n; i++) {
        lines.push(
          `${engine.bufT[i].toFixed(6)},${engine.bufX[i].toFixed(6)},${engine.bufY[i].toFixed(6)},${engine.bufZ[i].toFixed(6)}`
        );
      }
    }

    const csvContent = lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const paramTag =
      engine.systemId === 'lorenz'
        ? `sigma${engine.params.sigma.toFixed(1)}_r${engine.params.r.toFixed(1)}_b${engine.params.b.toFixed(2)}`
        : `a${engine.params.a.toFixed(3)}`;
    link.href = url;
    link.download = `${engine.systemId}_timeseries_${paramTag}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-[#090D16] border-t border-slate-800/90">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-slate-800/80 bg-[#0B101B]">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-medium text-slate-200 whitespace-nowrap">
            Time Series Oscilloscope
          </h2>
          <div
            ref={hoverReadoutRef}
            className="hidden xl:block text-[11px] font-mono text-slate-300 opacity-0 transition-opacity truncate"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Channel switches */}
          <div className="flex items-center gap-1">
            {(
              [
                { key: 'x', label: 'X', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
                { key: 'y', label: 'Y', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
                { key: 'z', label: 'Z', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
              ] as const
            ).map((ch) => (
              <button
                key={ch.key}
                type="button"
                onClick={() => toggleChannel(ch.key)}
                className={`px-1.5 py-0.5 text-[10px] font-mono font-medium rounded border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  channels[ch.key]
                    ? ch.color
                    : 'text-slate-500 border-slate-800 bg-transparent hover:text-slate-300'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          {/* Stacked vs Overlay */}
          <div className="flex items-center bg-[#07090E] border border-slate-800 rounded p-0.5">
            <button
              type="button"
              onClick={() => setMode('stacked')}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'stacked'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Stacked
            </button>
            <button
              type="button"
              onClick={() => setMode('overlay')}
              className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'overlay'
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overlay
            </button>
          </div>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            title="Export buffered time-series data as CSV"
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-slate-300 hover:text-cyan-300 bg-[#07090E] hover:bg-slate-800/80 border border-slate-800 hover:border-cyan-500/40 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3 h-3" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Canvas stage */}
      <div
        ref={containerRef}
        className="relative flex-1 min-h-0 cursor-crosshair"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          hoverPosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          drawCanvas();
        }}
        onMouseLeave={() => {
          hoverPosRef.current = null;
          drawCanvas();
        }}
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>
    </div>
  );
});
