import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { Ruler, Trash2, X, Info } from 'lucide-react';

interface RulerHUDProps {
  rulerPoints: [number, number, number][];
  rulerHoverPoint: [number, number, number] | null;
  rulerActive: boolean;
  projectPoint: (vec: THREE.Vector3) => { x: number; y: number };
  setRulerActive: (active: boolean) => void;
  clearRuler: () => void;
  activeSnapInfo?: {
    snapped: boolean;
    type: 'vertex' | 'midpoint' | 'center' | 'grid' | null;
    point: [number, number, number] | null;
  };
}

export const RulerHUD: React.FC<RulerHUDProps> = ({
  rulerPoints,
  rulerHoverPoint,
  rulerActive,
  projectPoint,
  setRulerActive,
  clearRuler,
  activeSnapInfo,
}) => {
  const [projections, setProjections] = useState<{
    ptA: { x: number; y: number } | null;
    ptB: { x: number; y: number } | null;
  }>({ ptA: null, ptB: null });

  useEffect(() => {
    const updateProjections = () => {
      if (rulerPoints.length === 0) {
        setProjections({ ptA: null, ptB: null });
        return;
      }

      const pA = rulerPoints[0];
      const projA = projectPoint(new THREE.Vector3(pA[0], pA[1], pA[2]));

      let projB: { x: number; y: number } | null = null;
      if (rulerPoints.length >= 2) {
        const pB = rulerPoints[1];
        projB = projectPoint(new THREE.Vector3(pB[0], pB[1], pB[2]));
      } else if (rulerHoverPoint) {
        projB = projectPoint(new THREE.Vector3(rulerHoverPoint[0], rulerHoverPoint[1], rulerHoverPoint[2]));
      }

      setProjections({ ptA: projA, ptB: projB });
    };

    updateProjections();

    const interval = setInterval(updateProjections, 30); // keep in lockstep fluidly

    window.addEventListener('resize', updateProjections);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateProjections);
    };
  }, [rulerPoints, rulerHoverPoint, projectPoint]);

  if (!rulerActive) return null;

  // Compute values
  const ptA = rulerPoints[0];
  const ptB = rulerPoints.length >= 2 ? rulerPoints[1] : rulerHoverPoint;

  let distance = 0;
  let dx = 0;
  let dy = 0;
  let dz = 0;

  if (ptA && ptB) {
    dx = ptB[0] - ptA[0];
    dy = ptB[1] - ptA[1];
    dz = ptB[2] - ptA[2];
    distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  const isComplete = rulerPoints.length === 2;
  const isHovering = rulerPoints.length === 1 && !!rulerHoverPoint;

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10">
      {/* 2D SVGs for Dimension lines and Midpoint badge */}
      <svg className="absolute inset-0 w-full h-full">
        {projections.ptA && projections.ptB && (
          <>
            {/* Draw Connecting Line */}
            <line
              x1={projections.ptA.x}
              y1={projections.ptA.y}
              x2={projections.ptB.x}
              y2={projections.ptB.y}
              stroke={isComplete ? '#10b981' : '#f43f5e'}
              strokeWidth="2.5"
              strokeDasharray={isComplete ? 'none' : '4 4'}
              className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
            />

            {/* Accent Circle for A */}
            <circle
              cx={projections.ptA.x}
              cy={projections.ptA.y}
              r="6"
              fill="#f43f5e"
              stroke="#ffffff"
              strokeWidth="2"
              className="drop-shadow-lg"
            />

            {/* Accent Circle for B / Hover */}
            <circle
              cx={projections.ptB.x}
              cy={projections.ptB.y}
              r="6"
              fill={isComplete ? '#10b981' : '#f43f5e'}
              stroke="#ffffff"
              strokeWidth="2"
              className="drop-shadow-lg"
            />
          </>
        )}
      </svg>

      {/* MIDPOINT INTERACTIVE DIMENSION BADGE */}
      {projections.ptA && projections.ptB && ptA && ptB && (
        <div
          style={{
            position: 'absolute',
            left: `${(projections.ptA.x + projections.ptB.x) / 2}px`,
            top: `${(projections.ptA.y + projections.ptB.y) / 2}px`,
            transform: 'translate(-50%, -50%)',
          }}
          className="pointer-events-auto bg-slate-900/95 border border-amber-500/80 text-amber-400 font-mono text-xs px-2.5 py-1 rounded-md shadow-xl flex items-center gap-1.5 whitespace-nowrap backdrop-blur"
        >
          <span className="font-bold relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isComplete ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isComplete ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          </span>
          <span className="font-extrabold text-[13px]">{distance.toFixed(2)} mm</span>
        </div>
      )}

      {/* Floating HUD Dashboard Panel on Top Right of standard screen view */}
      <div className="absolute top-4 right-4 pointer-events-auto w-80 bg-slate-900/95 border border-slate-800 backdrop-blur-md rounded-xl p-4 shadow-xl shadow-slate-950/70 select-none text-slate-150">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-emerald-400" />
            <h3 className="font-extrabold text-xs text-white uppercase tracking-wider">
              Precision 3D Ruler
            </h3>
          </div>
          <button
            onClick={() => setRulerActive(false)}
            className="text-slate-400 hover:text-white hover:bg-slate-800 p-1 rounded-md transition cursor-pointer"
            title="Exit Ruler Mode"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Dynamic Instructional Guides */}
        {rulerPoints.length === 0 && (
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800/50 mb-3 text-[10.5px] leading-relaxed text-slate-300 flex items-start gap-2">
            <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Click any mesh surface, feature vertex, or base grid plane to place <strong className="text-rose-400">Point A (Start)</strong>.
            </span>
          </div>
        )}

        {rulerPoints.length === 1 && (
          <div className="bg-slate-950/80 p-3 rounded-lg border border-rose-950/30 mb-3 text-[10.5px] leading-relaxed text-slate-300 flex items-start gap-2 animate-pulse">
            <Info className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <span>
              Point A positioned! Hover your cursor and click to set <strong className="text-emerald-400">Point B (End)</strong> to measure distance.
            </span>
          </div>
        )}

        {/* Measurements Info Panel */}
        <div className="space-y-2 text-xs font-mono">
          {activeSnapInfo?.snapped && (
            <div className="bg-emerald-950/40 border border-emerald-500/35 px-2.5 py-1.5 rounded text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 animate-pulse mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>SNAPPED TO: {activeSnapInfo.type?.toUpperCase()} {activeSnapInfo.type !== 'grid' && 'CORNER/MIDPOINT'}</span>
            </div>
          )}

          {/* Section: A Coordinates */}
          <div className="flex justify-between items-center text-[11px] bg-slate-950 p-2 rounded border border-slate-900">
            <span className="text-slate-500 font-bold uppercase text-[9px]">Point A (Start)</span>
            {ptA ? (
              <span className="text-slate-300 font-bold">
                X:{(ptA[0] ?? 0).toFixed(1)} Y:{(ptA[1] ?? 0).toFixed(1)} Z:{(ptA[2] ?? 0).toFixed(1)}
              </span>
            ) : (
              <span className="text-slate-650 italic text-[10px]">Tap to place...</span>
            )}
          </div>

          {/* Section: B Coordinates */}
          <div className="flex justify-between items-center text-[11px] bg-slate-950 p-2 rounded border border-slate-900">
            <span className="text-slate-500 font-bold uppercase text-[9px]">
              {isHovering ? 'Hover Point' : 'Point B (End)'}
            </span>
            {ptB ? (
              <span className="text-slate-300 font-bold">
                X:{(ptB[0] ?? 0).toFixed(1)} Y:{(ptB[1] ?? 0).toFixed(1)} Z:{(ptB[2] ?? 0).toFixed(1)}
              </span>
            ) : (
              <span className="text-slate-650 italic text-[10px]">Waiting for click...</span>
            )}
          </div>

          {/* 3D Component Delta Spans */}
          {(ptA && ptB) && (
            <div className="grid grid-cols-3 gap-1.5 pt-2">
              <div className="bg-slate-950 border border-slate-850 p-1.5 rounded text-center">
                <div className="text-[8px] text-slate-500 font-bold uppercase">ΔX (Width)</div>
                <div className="text-xs font-extrabold text-slate-200">{Math.abs(dx ?? 0).toFixed(1)} mm</div>
              </div>
              <div className="bg-slate-950 border border-slate-850 p-1.5 rounded text-center">
                <div className="text-[8px] text-slate-500 font-bold uppercase">ΔY (Height)</div>
                <div className="text-xs font-extrabold text-slate-200">{Math.abs(dy ?? 0).toFixed(1)} mm</div>
              </div>
              <div className="bg-slate-950 border border-slate-850 p-1.5 rounded text-center">
                <div className="text-[8px] text-slate-500 font-bold uppercase">ΔZ (Depth)</div>
                <div className="text-xs font-extrabold text-slate-200">{Math.abs(dz ?? 0).toFixed(1)} mm</div>
              </div>
            </div>
          )}

          {/* Large Total Distance Banner */}
          {(ptA && ptB) && (
            <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-lg text-center mt-3 shadow-inner">
              <div className="text-[9px] text-emerald-400 font-extrabold uppercase tracking-wider">
                Total Measured Space
              </div>
              <div className="text-2xl font-black text-emerald-400 font-sans tracking-tight mt-1">
                {(distance ?? 0).toFixed(2)} <span className="text-xs font-bold text-emerald-500">mm</span>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-4.5 border-t border-slate-800 pt-3">
          <button
            onClick={clearRuler}
            disabled={rulerPoints.length === 0}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md font-bold text-xs transition cursor-pointer ${
              rulerPoints.length > 0
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                : 'bg-slate-850 text-slate-600 cursor-not-allowed'
            }`}
            title="Reset active ruler points and start over"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
          
          <button
            onClick={() => setRulerActive(false)}
            className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition cursor-pointer text-center rounded-md text-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
