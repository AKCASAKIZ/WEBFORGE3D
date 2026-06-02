import React, { useState, useEffect } from 'react';
import * as THREE from 'three';
import { ActiveFace, SketchProfile } from '../types';

interface DrawingBoardOverlayProps {
  sketchProfile: SketchProfile;
  setSketchProfile: (updater: (prev: SketchProfile) => SketchProfile) => void;
  activeFace: ActiveFace | null;
  camera: THREE.Camera | null;
  canvasElement: HTMLCanvasElement | null;
  showGridSetting: boolean;
  onUpdateValue: (field: 'width' | 'height' | 'radius' | 'u' | 'v', value: number) => void;
}

export const DrawingBoardOverlay: React.FC<DrawingBoardOverlayProps> = ({
  sketchProfile,
  setSketchProfile,
  activeFace,
  camera,
  canvasElement,
  showGridSetting,
  onUpdateValue,
}) => {
  const [dimensions, setDimensions] = useState({
    width: 0,
    height: 0,
    uProj: { x: 0, y: 0 },
    vProj: { x: 0, y: 0 },
    shapeCenter: { x: 0, y: 0 },
    faceCenter: { x: 0, y: 0 },
    widthArrowLeft: { x: 0, y: 0 },
    widthArrowRight: { x: 0, y: 0 },
    heightArrowTop: { x: 0, y: 0 },
    heightArrowBottom: { x: 0, y: 0 },
    radiusArrowEnd: { x: 0, y: 0 },
    uLineStart: { x: 0, y: 0 },
    uLineEnd: { x: 0, y: 0 },
    vLineStart: { x: 0, y: 0 },
    vLineEnd: { x: 0, y: 0 },
  });

  const [editField, setEditField] = useState<'width' | 'height' | 'radius' | 'u' | 'v' | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editPosition, setEditPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Project 3D vector to screen pixel coordinates
  const project3DTo2D = (
    vec: THREE.Vector3,
    cam: THREE.Camera,
    rect: DOMRect | null
  ): { x: number; y: number } => {
    if (!rect) return { x: 0, y: 0 };
    const temp = vec.clone().project(cam);
    const x = ((temp.x + 1) * rect.width) / 2;
    const y = ((-temp.y + 1) * rect.height) / 2;
    return { x, y };
  };

  useEffect(() => {
    if (!activeFace || !camera || !canvasElement) return;

    const updateProjections = () => {
      const rect = canvasElement.getBoundingClientRect();
      const faceCenterVec = new THREE.Vector3(
        activeFace.center[0],
        activeFace.center[1],
        activeFace.center[2]
      );
      const uVec = new THREE.Vector3(
        activeFace.uVector[0],
        activeFace.uVector[1],
        activeFace.uVector[2]
      );
      const vVec = new THREE.Vector3(
        activeFace.vVector[0],
        activeFace.vVector[1],
        activeFace.vVector[2]
      );

      // Sketched shape center coordinate in 3D: Center + uOffset*uVec + vOffset*vVec
      const shapeCenterVec = faceCenterVec.clone()
        .addScaledVector(uVec, sketchProfile.u)
        .addScaledVector(vVec, sketchProfile.v);

      const fC = project3DTo2D(faceCenterVec, camera, rect);
      const sC = project3DTo2D(shapeCenterVec, camera, rect);

      // Width and height endpoints helper vectors
      // We will project endpoints to draw dimension lines
      const halfW = sketchProfile.width / 2;
      const halfH = sketchProfile.height / 2;

      // Bottom dimension line for rectangle width
      const widthLeftVec = shapeCenterVec.clone().addScaledVector(uVec, -halfW).addScaledVector(vVec, -halfH - 12);
      const widthRightVec = shapeCenterVec.clone().addScaledVector(uVec, halfW).addScaledVector(vVec, -halfH - 12);

      // Right dimension line for rectangle height
      const heightBottomVec = shapeCenterVec.clone().addScaledVector(uVec, halfW + 12).addScaledVector(vVec, -halfH);
      const heightTopVec = shapeCenterVec.clone().addScaledVector(uVec, halfW + 12).addScaledVector(vVec, halfH);

      // Radial dimension helper end point (approx 45 degrees angle)
      const radAng = Math.PI / 4;
      const radCos = Math.cos(radAng);
      const radSin = Math.sin(radAng);
      const radiusEndVec = shapeCenterVec.clone()
        .addScaledVector(uVec, sketchProfile.radius * radCos)
        .addScaledVector(vVec, sketchProfile.radius * radSin);

      const wArrowL = project3DTo2D(widthLeftVec, camera, rect);
      const wArrowR = project3DTo2D(widthRightVec, camera, rect);
      const hArrowB = project3DTo2D(heightBottomVec, camera, rect);
      const hArrowT = project3DTo2D(heightTopVec, camera, rect);
      const rArrowE = project3DTo2D(radiusEndVec, camera, rect);

      // Position dimension line endpoints
      // Horizon (U offset dimension): from (faceCenter) to (faceCenter + uOffset)
      const uOffsetEndVec = faceCenterVec.clone().addScaledVector(uVec, sketchProfile.u);
      const uLStart = fC;
      const uLEnd = project3DTo2D(uOffsetEndVec, camera, rect);

      // Vertical (V offset dimension): from (faceCenter + uOffset) to (shapeCenter)
      const vLStart = uLEnd;
      const vLEnd = sC;

      setDimensions({
        width: rect.width,
        height: rect.height,
        uProj: project3DTo2D(faceCenterVec.clone().add(uVec), camera, rect),
        vProj: project3DTo2D(faceCenterVec.clone().add(vVec), camera, rect),
        shapeCenter: sC,
        faceCenter: fC,
        widthArrowLeft: wArrowL,
        widthArrowRight: wArrowR,
        heightArrowTop: hArrowT,
        heightArrowBottom: hArrowB,
        radiusArrowEnd: rArrowE,
        uLineStart: uLStart,
        uLineEnd: uLEnd,
        vLineStart: vLStart,
        vLineEnd: vLEnd,
      });
    };

    updateProjections();

    // Trigger on resize or animation frames
    window.addEventListener('resize', updateProjections);
    const interval = setInterval(updateProjections, 45); // polling to stay in perfect sync as orbit pan/zoom occurs

    return () => {
      window.removeEventListener('resize', updateProjections);
      clearInterval(interval);
    };
  }, [activeFace, camera, canvasElement, sketchProfile]);

  if (!activeFace || !camera || !canvasElement) return null;

  // Handle open numeric click edit
  const handleLabelClick = (
    field: 'width' | 'height' | 'radius' | 'u' | 'v',
    posX: number,
    posY: number,
    currentValue: number
  ) => {
    setEditField(field);
    setEditValue(currentValue.toString());
    setEditPosition({ x: posX, y: posY });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      submitValue();
    }
  };

  const submitValue = () => {
    if (editField) {
      const val = parseFloat(editValue);
      if (!isNaN(val)) {
        onUpdateValue(editField, val);
      }
    }
    setEditField(null);
  };

  const midPoint = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  };

  const widthMidLabel = midPoint(dimensions.widthArrowLeft, dimensions.widthArrowRight);
  const heightMidLabel = midPoint(dimensions.heightArrowTop, dimensions.heightArrowBottom);
  const uLocationMidLabel = midPoint(dimensions.uLineStart, dimensions.uLineEnd);
  const vLocationMidLabel = midPoint(dimensions.vLineStart, dimensions.vLineEnd);
  // Radius falls from center to outer point
  const radiusMidLabel = midPoint(dimensions.shapeCenter, dimensions.radiusArrowEnd);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 w-full h-full">
      <svg className="w-full h-full block">
        {/* SVG Marker Declarations for Pretty Arrowheads */}
        <defs>
          {/* Default dimensions arrow */}
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#c084fc" />
          </marker>
          {/* Blue Positioning Arrow */}
          <marker
            id="position-arrow"
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#22d3ee" />
          </marker>
        </defs>

        {/* ────────── BACKGROUND ORIGIN GRID AND LOCAL COORDINATE SYSTEM AXES ────────── */}
        {showGridSetting && (
          <g>
            {/* Draw Local Face Origin */}
            <circle
              cx={dimensions.faceCenter.x}
              cy={dimensions.faceCenter.y}
              r="6"
              fill="rgba(255,255,255,0.15)"
              stroke="#6366f1"
              strokeWidth="2.5"
            />
            {/* Horizontal Axis (U Local) */}
            <line
              x1={dimensions.faceCenter.x - 300}
              y1={dimensions.faceCenter.y}
              x2={dimensions.faceCenter.x + 300}
              y2={dimensions.faceCenter.y}
              stroke="#6366f1"
              strokeWidth="1.2"
              strokeDasharray="4,4"
              opacity="0.45"
            />
            {/* Vertical Axis (V Local) */}
            <line
              x1={dimensions.faceCenter.x}
              y1={dimensions.faceCenter.y - 300}
              x2={dimensions.faceCenter.x}
              y2={dimensions.faceCenter.y + 300}
              stroke="#6366f1"
              strokeWidth="1.2"
              strokeDasharray="4,4"
              opacity="0.45"
            />
          </g>
        )}

        {/* ────────── DIMENSION 1: SHAPE SIZES ────────── */}
        {sketchProfile.type === 'rect' && (
          <>
            {/* WIDTH DIMENSION LINE */}
            <g className="opacity-90">
              <line
                x1={dimensions.widthArrowLeft.x}
                y1={dimensions.widthArrowLeft.y}
                x2={dimensions.widthArrowRight.x}
                y2={dimensions.widthArrowRight.y}
                stroke="#c084fc"
                strokeWidth="1.5"
                markerStart="url(#arrow)"
                markerEnd="url(#arrow)"
              />
              {/* Left witness line */}
              <line
                x1={dimensions.shapeCenter.x - (dimensions.widthArrowRight.x - dimensions.widthArrowLeft.x) / 2}
                y1={dimensions.shapeCenter.y + sketchProfile.height * 0.1}
                x2={dimensions.widthArrowLeft.x}
                y2={dimensions.widthArrowLeft.y}
                stroke="#c084fc"
                strokeWidth="1"
                strokeDasharray="2,3"
                opacity="0.5"
              />
              {/* Right witness line */}
              <line
                x1={dimensions.shapeCenter.x + (dimensions.widthArrowRight.x - dimensions.widthArrowLeft.x) / 2}
                y1={dimensions.shapeCenter.y + sketchProfile.height * 0.1}
                x2={dimensions.widthArrowRight.x}
                y2={dimensions.widthArrowRight.y}
                stroke="#c084fc"
                strokeWidth="1"
                strokeDasharray="2,3"
                opacity="0.5"
              />
            </g>

            {/* HEIGHT DIMENSION LINE */}
            <g className="opacity-90">
              <line
                x1={dimensions.heightArrowBottom.x}
                y1={dimensions.heightArrowBottom.y}
                x2={dimensions.heightArrowTop.x}
                y2={dimensions.heightArrowTop.y}
                stroke="#c084fc"
                strokeWidth="1.5"
                markerStart="url(#arrow)"
                markerEnd="url(#arrow)"
              />
              {/* Bottom witness line */}
              <line
                x1={dimensions.shapeCenter.x + sketchProfile.width * 0.1}
                y1={dimensions.shapeCenter.y + (dimensions.heightArrowTop.y - dimensions.heightArrowBottom.y) / 2}
                x2={dimensions.heightArrowBottom.x}
                y2={dimensions.heightArrowBottom.y}
                stroke="#c084fc"
                strokeWidth="1"
                strokeDasharray="2,3"
                opacity="0.5"
              />
              {/* Top witness line */}
              <line
                x1={dimensions.shapeCenter.x + sketchProfile.width * 0.1}
                y1={dimensions.shapeCenter.y - (dimensions.heightArrowTop.y - dimensions.heightArrowBottom.y) / 2}
                x2={dimensions.heightArrowTop.x}
                y2={dimensions.heightArrowTop.y}
                stroke="#c084fc"
                strokeWidth="1"
                strokeDasharray="2,3"
                opacity="0.5"
              />
            </g>
          </>
        )}

        {(sketchProfile.type === 'circle' || sketchProfile.type === 'polygon') && (
          /* RADIUS DIMENSION LINE */
          <g className="opacity-90">
            <line
              x1={dimensions.shapeCenter.x}
              y1={dimensions.shapeCenter.y}
              x2={dimensions.radiusArrowEnd.x}
              y2={dimensions.radiusArrowEnd.y}
              stroke="#c084fc"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
            {/* Tiny center point */}
            <circle cx={dimensions.shapeCenter.x} cy={dimensions.shapeCenter.y} r="3" fill="#c084fc" />
          </g>
        )}

        {/* ────────── DIMENSION 2: LOCATION ALIGNMENT OFFSETS (U & V) ────────── */}
        <g className="opacity-95">
          {/* U Position Line */}
          {Math.abs(sketchProfile.u) > 1 && (
            <line
              x1={dimensions.uLineStart.x}
              y1={dimensions.uLineStart.y}
              x2={dimensions.uLineEnd.x}
              y2={dimensions.uLineEnd.y}
              stroke="#22d3ee"
              strokeWidth="2"
              strokeDasharray="1,1"
              markerEnd="url(#position-arrow)"
            />
          )}

          {/* V Position Line */}
          {Math.abs(sketchProfile.v) > 1 && (
            <line
              x1={dimensions.vLineStart.x}
              y1={dimensions.vLineStart.y}
              x2={dimensions.vLineEnd.x}
              y2={dimensions.vLineEnd.y}
              stroke="#22d3ee"
              strokeWidth="2"
              strokeDasharray="1,1"
              markerEnd="url(#position-arrow)"
            />
          )}

          {/* Target sketched center point dot */}
          <circle
            cx={dimensions.shapeCenter.x}
            cy={dimensions.shapeCenter.y}
            r="4.5"
            fill="#22d3ee"
            stroke="#1e1b4b"
            strokeWidth="1.5"
          />
        </g>
      </svg>

      {/* ────────── DYNAMIC INTERACTIVE LABELS OVERLAY (HTML BUTTONS) ────────── */}
      {/* Width Label */}
      {sketchProfile.type === 'rect' && (
        <button
          onClick={() => handleLabelClick('width', widthMidLabel.x, widthMidLabel.y + 15, sketchProfile.width)}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 text-purple-300 hover:text-white hover:bg-indigo-600 font-mono text-xs px-2 py-1 rounded border border-purple-500/30 font-bold select-none cursor-pointer pointer-events-auto transition shadow-lg shadow-purple-950/20"
          style={{ left: widthMidLabel.x, top: widthMidLabel.y + 16 }}
        >
          W: {sketchProfile.width} mm
        </button>
      )}

      {/* Height Label */}
      {sketchProfile.type === 'rect' && (
        <button
          onClick={() => handleLabelClick('height', heightMidLabel.x + 24, heightMidLabel.y, sketchProfile.height)}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 text-purple-300 hover:text-white hover:bg-indigo-600 font-mono text-xs px-2 py-1 rounded border border-purple-500/30 font-bold select-none cursor-pointer pointer-events-auto transition shadow-lg shadow-purple-950/20"
          style={{ left: heightMidLabel.x + 28, top: heightMidLabel.y }}
        >
          H: {sketchProfile.height} mm
        </button>
      )}

      {/* Radius Label */}
      {(sketchProfile.type === 'circle' || sketchProfile.type === 'polygon') && (
        <button
          onClick={() => handleLabelClick('radius', radiusMidLabel.x, radiusMidLabel.y - 14, sketchProfile.radius)}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 text-purple-200 hover:text-white hover:bg-indigo-600 font-mono text-xs px-2 py-1 rounded border border-purple-500/30 font-bold select-none cursor-pointer pointer-events-auto transition shadow-lg shadow-purple-950/20"
          style={{ left: radiusMidLabel.x, top: radiusMidLabel.y - 16 }}
        >
          R: {sketchProfile.radius} mm
        </button>
      )}

      {/* Horizontal Offset U Label */}
      {Math.abs(sketchProfile.u) > 1 && (
        <button
          onClick={() => handleLabelClick('u', uLocationMidLabel.x, uLocationMidLabel.y - 14, sketchProfile.u)}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-slate-950/95 text-cyan-300 hover:text-white hover:bg-cyan-600 font-mono text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 font-bold select-none cursor-pointer pointer-events-auto transition shadow"
          style={{ left: uLocationMidLabel.x, top: uLocationMidLabel.y - 12 }}
        >
          U: {sketchProfile.u} mm
        </button>
      )}

      {/* Vertical Offset V Label */}
      {Math.abs(sketchProfile.v) > 1 && (
        <button
          onClick={() => handleLabelClick('v', vLocationMidLabel.x + 24, vLocationMidLabel.y, sketchProfile.v)}
          className="absolute transform -translate-x-1/2 -translate-y-1/2 bg-slate-950/95 text-cyan-300 hover:text-white hover:bg-cyan-600 font-mono text-[10px] px-2 py-0.5 rounded border border-cyan-500/30 font-bold select-none cursor-pointer pointer-events-auto transition shadow"
          style={{ left: vLocationMidLabel.x + 28, top: vLocationMidLabel.y }}
        >
          V: {sketchProfile.v} mm
        </button>
      )}

      {/* ────────── DYNAMIC FLOAT VALUE INPUT MODAL ────────── */}
      {editField && (
        <div
          className="absolute bg-slate-900 text-slate-100 p-2.5 rounded-lg shadow-xl shadow-slate-950 border border-indigo-500 pointer-events-auto flex items-center gap-2"
          style={{
            left: Math.min(editPosition.x, dimensions.width - 250),
            top: Math.min(editPosition.y, dimensions.height - 100),
          }}
        >
          <div className="flex flex-col">
            <span className="text-[9px] uppercase font-bold text-indigo-400">
              Set {editField.toUpperCase()} Dimension
            </span>
            <input
              type="number"
              step="0.5"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyPress}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono font-bold w-28 focus:border-indigo-500 outline-none"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1 shrink-0 justify-end h-full pt-4">
            <button
              onClick={submitValue}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] px-2.5 py-1.5 rounded cursor-pointer transition"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
