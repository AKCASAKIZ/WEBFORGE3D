import React from 'react';
import { 
  Box, 
  Circle, 
  Trash2, 
  Copy, 
  Compass, 
  Database, 
  Maximize, 
  Weight, 
  Plus, 
  Scissors, 
  Info,
  Sliders,
  Type,
  PenTool,
  Lock,
  Unlock
} from 'lucide-react';
import { 
  CADSolid, 
  ActiveFace, 
  SketchProfile, 
  MaterialType, 
  MATERIAL_SPECS, 
  SolidParams, 
  BoxParams, 
  CylinderParams, 
  SphereParams, 
  ConeParams, 
  SketchParams,
  DimensionConstraint
} from '../types';

interface SidebarProps {
  solids: CADSolid[];
  selectedSolidId: string | null;
  onSelectSolid: (id: string | null) => void;
  onDeleteSolid: (id: string) => void;
  onDuplicateSolid: (id: string) => void;
  onFocusSolid: (id: string) => void;
  
  // Creation helpers
  onAddSolid: (type: 'box' | 'cylinder' | 'sphere' | 'cone') => void;
  
  // active sketch settings (only shown when sketching)
  sketchMode: boolean;
  sketchProfile: SketchProfile;
  setSketchProfile: (updater: (prev: SketchProfile) => SketchProfile) => void;
  sketchDepth: number;
  setSketchDepth: (depth: number) => void;
  sketchOperation: 'extrude' | 'cut';
  setSketchOperation: (op: 'extrude' | 'cut') => void;
  onApplySketch: () => void;
  onCancelSketch: () => void;
  activeFace: ActiveFace | null;
  
  // Material controls of selected solid
  onChangeSolidMaterial: (id: string, mat: MaterialType) => void;
  onChangeSolidColor: (id: string, color: string) => void;
  onChangeSolidName: (id: string, name: string) => void;
  
  // Geometric parameter controls of selected solid
  onChangeSolidParams: (id: string, p: SolidParams) => void;
  onChangeSolidPosition: (id: string, pos: [number, number, number]) => void;
  onChangeSolidRotation: (id: string, rot: [number, number, number]) => void;
  onChangeSolidConstraints?: (id: string, paramKey: string, constraint: DimensionConstraint) => void;
  
  // Stats
  totalVolume: number;
  totalMass: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  solids,
  selectedSolidId,
  onSelectSolid,
  onDeleteSolid,
  onDuplicateSolid,
  onFocusSolid,
  onAddSolid,
  sketchMode,
  sketchProfile,
  setSketchProfile,
  sketchDepth,
  setSketchDepth,
  sketchOperation,
  setSketchOperation,
  onApplySketch,
  onCancelSketch,
  activeFace,
  onChangeSolidMaterial,
  onChangeSolidColor,
  onChangeSolidName,
  onChangeSolidParams,
  onChangeSolidPosition,
  onChangeSolidRotation,
  onChangeSolidConstraints,
  totalVolume,
  totalMass,
}) => {
  const selectedSolid = solids.find((s) => s.id === selectedSolidId);

  const [expandedConstraints, setExpandedConstraints] = React.useState<Record<string, boolean>>({});

  const toggleConstraintConfig = (paramKey: string, isDefaultEnabled: boolean = false) => {
    setExpandedConstraints((prev) => {
      const alreadyOpen = prev[paramKey];
      // On toggle first open, if the constraint wasn't already configured in the solid,
      // we can prepopulate standard min/max values based on current parameter value
      if (!alreadyOpen && selectedSolid && onChangeSolidConstraints && (!selectedSolid.constraints || !selectedSolid.constraints[paramKey])) {
        const val = (selectedSolid.params as any)[paramKey] || 25;
        onChangeSolidConstraints(selectedSolid.id, paramKey, {
          min: Math.max(1, Math.round(val * 0.4)),
          max: Math.round(val * 2.5),
          enabled: false
        });
      }
      return {
        ...prev,
        [paramKey]: !alreadyOpen,
      };
    });
  };

  const getConstraint = (paramKey: string, defaultMin: number = 2, defaultMax: number = 200) => {
    if (selectedSolid && selectedSolid.constraints && selectedSolid.constraints[paramKey]) {
      return selectedSolid.constraints[paramKey];
    }
    if (selectedSolid) {
      const val = (selectedSolid.params as any)[paramKey] || 25;
      return {
        min: Math.max(1, Math.round(val * 0.5)),
        max: Math.round(val * 2),
        enabled: false
      };
    }
    return { min: defaultMin, max: defaultMax, enabled: false };
  };

  const handleUpdateConstraint = (paramKey: string, updated: DimensionConstraint) => {
    if (selectedSolid && onChangeSolidConstraints) {
      onChangeSolidConstraints(selectedSolid.id, paramKey, updated);
    }
  };

  // Quick preset sizes
  const handleAddNewBox = () => onAddSolid('box');
  const handleAddNewCylinder = () => onAddSolid('cylinder');
  const handleAddNewSphere = () => onAddSolid('sphere');
  const handleAddNewCone = () => onAddSolid('cone');

  const renderDimensionSlider = (
    label: string,
    paramKey: string,
    currentValue: number,
    minSliderVal: number,
    maxSliderVal: number,
    step: number,
    onValueChange: (val: number) => void
  ) => {
    const constraint = getConstraint(paramKey, minSliderVal, maxSliderVal);
    const isLocked = constraint.enabled;
    const isExpanded = !!expandedConstraints[paramKey];

    const effectiveMin = isLocked ? constraint.min : minSliderVal;
    const effectiveMax = isLocked ? constraint.max : maxSliderVal;

    return (
      <div className="space-y-1 bg-slate-900/40 p-2 rounded border border-slate-900/40 mb-2.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-slate-400 font-semibold">{label}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggleConstraintConfig(paramKey)}
              className={`p-1 rounded cursor-pointer transition flex items-center gap-0.5 ${
                isLocked 
                  ? 'text-amber-400 bg-amber-950/50 hover:bg-amber-900/50 border border-amber-800/30' 
                  : 'text-slate-500 hover:text-slate-350 hover:bg-slate-800/50 border border-transparent'
              }`}
              title={isLocked ? "Constraints are set. Click to configuration parameters." : "No constraints set. Click to configure bounds limit."}
            >
              {isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              <span className="text-[9px] font-mono leading-none">{isLocked ? 'Locked' : ''}</span>
            </button>
            <span className="font-mono font-bold text-slate-200">{currentValue} mm</span>
          </div>
        </div>

        <input
          type="range"
          min={effectiveMin}
          max={effectiveMax}
          step={step}
          value={currentValue}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            onValueChange(val);
          }}
          className={`w-full cursor-ew-resize ${isLocked ? 'accent-amber-500 text-amber-500' : 'accent-indigo-500'}`}
        />

        {isExpanded && (
          <div className="mt-1.5 pt-1.5 border-t border-slate-900/60 space-y-2 text-[10px] text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-400">Dim-Lock Limit Lock:</span>
              <label className="flex items-center gap-1 cursor-pointer select-none font-bold text-[10px]">
                <input
                  type="checkbox"
                  checked={isLocked}
                  onChange={(e) => {
                    handleUpdateConstraint(paramKey, {
                      ...constraint,
                      enabled: e.target.checked
                    });
                  }}
                  className="accent-amber-500 rounded cursor-pointer h-3 w-3"
                />
                <span className={isLocked ? 'text-amber-400' : 'text-slate-400'}>
                  {isLocked ? 'Locked' : 'Unlocked'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-500 text-[9px] font-bold uppercase">Min (mm)</span>
                <input
                  type="number"
                  value={constraint.min}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      handleUpdateConstraint(paramKey, {
                        ...constraint,
                        min: val
                      });
                    }
                  }}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-center font-mono rounded p-1 text-[10px] outline-none focus:border-indigo-600"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-slate-500 text-[9px] font-bold uppercase">Max (mm)</span>
                <input
                  type="number"
                  value={constraint.max}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      handleUpdateConstraint(paramKey, {
                        ...constraint,
                        max: val
                      });
                    }
                  }}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-center font-mono rounded p-1 text-[10px] outline-none focus:border-indigo-600"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-80 border-l bg-slate-950 border-slate-900 text-slate-100 shrink-0 flex flex-col h-full z-10 select-none overflow-y-auto">
      {/* SECTION 1: Stats & Overview */}
      <section className="p-4 border-b border-slate-900 bg-slate-900/30">
        <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-3">
          <span>Simulation Stats</span>
          <Database className="h-3.5 w-3.5 text-indigo-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950/70 p-2.5 rounded border border-slate-900/60 flex flex-col">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Volume</span>
            <span className="text-sm font-black text-slate-200 mt-0.5">{totalVolume.toFixed(2)} cm³</span>
          </div>
          <div className="bg-slate-950/70 p-2.5 rounded border border-slate-900/60 flex flex-col">
            <span className="text-[10px] text-slate-500 font-bold uppercase">Estimated Mass</span>
            <span className="text-sm font-black text-indigo-400 mt-0.5">{totalMass.toFixed(3)} kg</span>
          </div>
        </div>
      </section>

      {/* SECTION 2: CAD Model tree */}
      <section className="p-4 border-b border-slate-900 max-h-56 overflow-y-auto shrink-0">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          <span>Model Tree / Feat History</span>
          <span className="text-[10px] text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-900/30">
            {solids.length} parts
          </span>
        </div>

        {solids.length === 0 ? (
          <div className="text-center py-6 text-slate-600 text-xs italic border border-dashed border-slate-800 rounded">
            No parts in scene. Click below to add.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {solids.map((solid) => {
              const isSelected = solid.id === selectedSolidId;
              let subtitle = '';
              if (solid.type === 'box') {
                const p = solid.params as BoxParams;
                subtitle = `Box (${p.width}x${p.height}x${p.depth})`;
              } else if (solid.type === 'cylinder') {
                const p = solid.params as CylinderParams;
                subtitle = `Cyl (R:${p.radius}, H:${p.height})`;
              } else if (solid.type === 'sphere') {
                const p = solid.params as SphereParams;
                subtitle = `Sphere (R:${p.radius})`;
              } else if (solid.type === 'cone') {
                const p = solid.params as ConeParams;
                subtitle = `Cone (R:${p.radius}, H:${p.height})`;
              } else {
                subtitle = 'Extruded Sketch';
              }

              return (
                <div
                  key={solid.id}
                  onClick={() => onSelectSolid(solid.id)}
                  className={`group p-2 rounded cursor-pointer transition-all border flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-950/60 border-indigo-800 text-slate-100'
                      : 'bg-slate-950 border-slate-900 text-slate-400 hover:bg-slate-900/40 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <Box className={`h-4 w-4 shrink-0 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-bold truncate text-slate-200">{solid.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono truncate">{subtitle}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusSolid(solid.id);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-300"
                      title="Center Camera on Solid"
                    >
                      <Maximize className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateSolid(solid.id);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-indigo-400"
                      title="Duplicate solid"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSolid(solid.id);
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-red-400"
                      title="Delete Solid"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 3: Add new base primitives */}
      {!sketchMode && (
        <section className="p-4 border-b border-slate-900 shrink-0">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
            Add 3D Primitives
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleAddNewBox}
              className="flex items-center justify-center gap-2 p-2 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer transition-all"
            >
              <Box className="h-4 w-4 text-indigo-400" />
              <span>Add Box</span>
            </button>

            <button
              onClick={handleAddNewCylinder}
              className="flex items-center justify-center gap-2 p-2 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer transition-all"
            >
              <Circle className="h-3.5 w-3.5 text-emerald-400" />
              <span>Add Cylinder</span>
            </button>

            <button
              onClick={handleAddNewSphere}
              className="flex items-center justify-center gap-2 p-2 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer transition-all"
            >
              <Circle className="h-3.5 w-3.5 text-amber-400" style={{ borderRadius: '50%' }} />
              <span>Add Sphere</span>
            </button>

            <button
              onClick={handleAddNewCone}
              className="flex items-center justify-center gap-2 p-2 bg-slate-900 hover:bg-slate-850 rounded border border-slate-800 text-xs font-bold text-slate-200 cursor-pointer transition-all"
            >
              <Compass className="h-4 w-4 text-purple-400" />
              <span>Add Cone</span>
            </button>
          </div>
        </section>
      )}

      {/* SECTION 4: Active Sketch Panel (ONLY shown in SketchMode) */}
      {sketchMode && (
        <section className="p-4 bg-indigo-950/20 border-b border-indigo-900/30 flex-grow flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header Sketch */}
            <div className="flex items-center justify-between border-b border-indigo-900/30 pb-2">
              <div className="flex items-center gap-2">
                <PenTool className="h-4 w-4 text-indigo-400 animate-pulse" />
                <span className="text-xs font-black uppercase text-indigo-300 tracking-wider">
                  Active Face Sketcher
                </span>
              </div>
              <span className="text-[10px] bg-indigo-900 text-indigo-200 border border-indigo-800 px-2 py-0.5 rounded font-mono">
                Face {activeFace?.faceIndex}
              </span>
            </div>

            {/* Profile Selection */}
            <div className="space-y-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase">Drawer Tool</label>
              <div className="grid grid-cols-3 gap-1">
                {(['rect', 'circle', 'polygon'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSketchProfile((prev) => ({ ...prev, type }))}
                    className={`py-1.5 rounded text-xs font-bold capitalize transition-all border ${
                      sketchProfile.type === type
                        ? 'bg-indigo-600 border-indigo-500 text-white font-black'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Sketch Dimensions on face with perfect numeric control */}
            <div className="bg-slate-950/80 p-3 rounded border border-slate-900 space-y-3.5">
              <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center justify-between">
                <span>1. Shape Size Parameters</span>
                <Sliders className="h-3 w-3" />
              </div>

              {sketchProfile.type === 'rect' && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Width (mm)</span>
                      <span className="font-mono font-bold text-indigo-300">{sketchProfile.width} mm</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="0.5"
                      value={sketchProfile.width}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSketchProfile((prev) => ({ ...prev, width: val }));
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Height (mm)</span>
                      <span className="font-mono font-bold text-indigo-300">{sketchProfile.height} mm</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      step="0.5"
                      value={sketchProfile.height}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSketchProfile((prev) => ({ ...prev, height: val }));
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </>
              )}

              {sketchProfile.type === 'circle' && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400 font-semibold">Radius (mm)</span>
                    <span className="font-mono font-bold text-indigo-300">{sketchProfile.radius} mm</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="50"
                    step="0.5"
                    value={sketchProfile.radius}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSketchProfile((prev) => ({ ...prev, radius: val }));
                    }}
                    className="w-full accent-indigo-500"
                  />
                </div>
              )}

              {sketchProfile.type === 'polygon' && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Outer Radius (mm)</span>
                      <span className="font-mono font-bold text-indigo-300">{sketchProfile.radius} mm</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="0.5"
                      value={sketchProfile.radius}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSketchProfile((prev) => ({ ...prev, radius: val }));
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-semibold">Sides</span>
                      <span className="font-mono font-bold text-indigo-300">{sketchProfile.sides}</span>
                    </div>
                    <input
                      type="range"
                      min="3"
                      max="12"
                      step="1"
                      value={sketchProfile.sides}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setSketchProfile((prev) => ({ ...prev, sides: val }));
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Sketched Profile Positioning U and V */}
            <div className="bg-slate-950/80 p-3 rounded border border-slate-900 space-y-3.5">
              <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center justify-between">
                <span>2. Positioning (Coordinates)</span>
                <Sliders className="h-3 w-3 text-cyan-400" />
              </div>

              {/* U Position offset slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">U axis offset (Left/Right)</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {sketchProfile.u > 0 ? `+${sketchProfile.u}` : sketchProfile.u} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  step="0.5"
                  value={sketchProfile.u}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSketchProfile((prev) => ({ ...prev, u: val }));
                  }}
                  className="w-full accent-cyan-500"
                />
              </div>

              {/* V Position offset slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">V axis offset (Down/Up)</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {sketchProfile.v > 0 ? `+${sketchProfile.v}` : sketchProfile.v} mm
                  </span>
                </div>
                <input
                  type="range"
                  min="-60"
                  max="60"
                  step="0.5"
                  value={sketchProfile.v}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSketchProfile((prev) => ({ ...prev, v: val }));
                  }}
                  className="w-full accent-cyan-500"
                />
              </div>
            </div>

            {/* Operations Setup */}
            <div className="bg-slate-950/80 p-3 rounded border border-slate-900 space-y-3.5">
              <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                3. Feature Modeling Operation
              </div>
              
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSketchOperation('extrude')}
                  className={`py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                    sketchOperation === 'extrude'
                      ? 'bg-emerald-950/60 border-emerald-700 text-emerald-400 font-black'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Extrude - Create additive boss 3D feature"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Extrude</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSketchOperation('cut')}
                  className={`py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1.5 border transition-all ${
                    sketchOperation === 'cut'
                      ? 'bg-rose-950/60 border-rose-800 text-rose-400 font-black'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                  title="Cut - Create subtractive pocket/hole 3D feature"
                >
                  <Scissors className="h-3.5 w-3.5" />
                  <span>Cut Hole</span>
                </button>
              </div>

              {/* Modeling Thickness/Depth */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-semibold">{sketchOperation === 'extrude' ? 'Extrude Thickness' : 'Cut Depth'}</span>
                  <span className="font-mono font-bold text-amber-400">{sketchDepth} mm</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="120"
                  step="1"
                  value={sketchDepth}
                  onChange={(e) => setSketchDepth(parseFloat(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Action apply/cancel buttons */}
          <div className="space-y-2 mt-4">
            <button
              onClick={onApplySketch}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded shadow-lg shadow-emerald-900/25 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Apply CAD Feature</span>
            </button>
            <button
              onClick={onCancelSketch}
              className="w-full py-2 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800 rounded font-bold text-xs transition-all cursor-pointer"
            >
              Cancel Sketch
            </button>
          </div>
        </section>
      )}

      {/* SECTION 5: Selected Object Customization Properties */}
      {!sketchMode && selectedSolid && (
        <section className="p-4 bg-slate-900/20 border-b border-slate-900 flex-grow overflow-y-auto space-y-4">
          <div className="flex items-center gap-1.5 border-b border-slate-900 pb-2">
            <Box className="h-4 w-4 text-indigo-400" />
            <span className="text-xs font-black uppercase text-indigo-300 tracking-wider">
              Selected Part Specs
            </span>
          </div>

          {/* Rename field */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <Type className="h-3 w-3" />
              <span>Label</span>
            </label>
            <input
              type="text"
              value={selectedSolid.name}
              onChange={(e) => onChangeSolidName(selectedSolid.id, e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-600 rounded px-2.5 py-1.5 text-xs font-bold outline-none text-white"
            />
          </div>

          {/* Material Select */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
              <Weight className="h-3 w-3" />
              <span>Physical Material</span>
            </label>
            <select
              value={selectedSolid.materialType}
              onChange={(e) => onChangeSolidMaterial(selectedSolid.id, e.target.value as MaterialType)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-bold outline-none text-white cursor-pointer"
            >
              {(Object.keys(MATERIAL_SPECS) as MaterialType[]).map((mKey) => (
                <option key={mKey} value={mKey}>
                  {MATERIAL_SPECS[mKey].name} ({MATERIAL_SPECS[mKey].density} g/cm³)
                </option>
              ))}
            </select>
          </div>

          {/* Color select dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase">Anodized Color</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={selectedSolid.color}
                onChange={(e) => onChangeSolidColor(selectedSolid.id, e.target.value)}
                className="w-10 h-8 rounded shrink-0 bg-slate-950 p-0 border border-slate-800"
              />
              <input
                type="text"
                value={selectedSolid.color}
                onChange={(e) => onChangeSolidColor(selectedSolid.id, e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-bold outline-none text-slate-300 text-center uppercase font-mono"
              />
            </div>
          </div>

          {/* Core Shape Primitives Dimensions Modifier (size control) */}
          <div className="bg-slate-950/70 p-3 rounded border border-slate-900 space-y-3">
            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5" />
              <span>Modify Solid Dimensions</span>
            </div>            {selectedSolid.type === 'box' && (
              <>
                {renderDimensionSlider(
                  "Width (X)",
                  "width",
                  (selectedSolid.params as BoxParams).width,
                  10,
                  150,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as BoxParams),
                      width: val,
                    });
                  }
                )}

                {renderDimensionSlider(
                  "Height (Y)",
                  "height",
                  (selectedSolid.params as BoxParams).height,
                  2,
                  150,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as BoxParams),
                      height: val,
                    });
                  }
                )}

                {renderDimensionSlider(
                  "Depth (Z)",
                  "depth",
                  (selectedSolid.params as BoxParams).depth,
                  10,
                  150,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as BoxParams),
                      depth: val,
                    });
                  }
                )}
              </>
            )}

            {selectedSolid.type === 'cylinder' && (
              <>
                {renderDimensionSlider(
                  "Radius",
                  "radius",
                  (selectedSolid.params as CylinderParams).radius,
                  5,
                  80,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as CylinderParams),
                      radius: val,
                    });
                  }
                )}

                {renderDimensionSlider(
                  "Height",
                  "height",
                  (selectedSolid.params as CylinderParams).height,
                  10,
                  150,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as CylinderParams),
                      height: val,
                    });
                  }
                )}
              </>
            )}

            {selectedSolid.type === 'sphere' && (
              <>
                {renderDimensionSlider(
                  "Radius",
                  "radius",
                  (selectedSolid.params as SphereParams).radius,
                  5,
                  100,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      radius: val,
                    });
                  }
                )}
              </>
            )}

            {selectedSolid.type === 'cone' && (
              <>
                {renderDimensionSlider(
                  "Radius",
                  "radius",
                  (selectedSolid.params as ConeParams).radius,
                  5,
                  80,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as ConeParams),
                      radius: val,
                    });
                  }
                )}

                {renderDimensionSlider(
                  "Height",
                  "height",
                  (selectedSolid.params as ConeParams).height,
                  10,
                  150,
                  1,
                  (val) => {
                    onChangeSolidParams(selectedSolid.id, {
                      ...(selectedSolid.params as ConeParams),
                      height: val,
                    });
                  }
                )}
              </>
            )}

            {selectedSolid.type === 'extruded_sketch' && (
              <div className="space-y-1 text-slate-400 text-xs italic">
                Active feature profile extrudes { (selectedSolid.params as SketchParams).depth } mm from Parent Surface.
              </div>
            )}

            {selectedSolid.type === 'subtracted_sketch' && (
              <div className="space-y-1 text-slate-400 text-xs italic">
                Active subtractive cutout pierces { (selectedSolid.params as SketchParams).depth } mm into Parent Body.
              </div>
            )}
          </div>

          {/* Position modifier coord inputs */}
          <div className="bg-slate-950/70 p-3 rounded border border-slate-900 space-y-3">
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">
              3D Part Coordinates (mm)
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Pos X</span>
                <input
                  type="number"
                  value={selectedSolid.position[0].toFixed(1)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    onChangeSolidPosition(selectedSolid.id, [
                      val,
                      selectedSolid.position[1],
                      selectedSolid.position[2],
                    ]);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono text-center text-xs p-1 rounded"
                />
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Pos Y</span>
                <input
                  type="number"
                  value={selectedSolid.position[1].toFixed(1)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    onChangeSolidPosition(selectedSolid.id, [
                      selectedSolid.position[0],
                      val,
                      selectedSolid.position[2],
                    ]);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono text-center text-xs p-1 rounded"
                />
              </div>

              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase">Pos Z</span>
                <input
                  type="number"
                  value={selectedSolid.position[2].toFixed(1)}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    onChangeSolidPosition(selectedSolid.id, [
                      selectedSolid.position[0],
                      selectedSolid.position[1],
                      val,
                    ]);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 font-mono text-center text-xs p-1 rounded"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Quick context info */}
      <footer className="p-3 bg-slate-950 border-t border-slate-900/60 text-[10px] text-slate-500 flex items-center gap-1.5 shrink-0 select-none">
        <Info className="h-3 w-3 text-indigo-400 shrink-0" />
        <span>Select face on base solid using cursor to initiate <b>2D Sketching Board</b></span>
      </footer>
    </aside>
  );
};
