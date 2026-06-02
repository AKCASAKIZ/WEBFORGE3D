import React from 'react';
import { 
  FolderOpen, 
  Save, 
  RotateCcw, 
  RotateCw, 
  Trash2, 
  Layers, 
  Sun, 
  Moon, 
  Info,
  HelpCircle
} from 'lucide-react';

interface HeaderProps {
  projectName: string;
  setProjectName: (name: string) => void;
  onSave: () => void;
  onLoad: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  onOpenTutorial: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projectName,
  setProjectName,
  onSave,
  onLoad,
  onClear,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  theme,
  setTheme,
  onOpenTutorial,
}) => {
  return (
    <header className="h-14 border-b flex items-center justify-between px-6 bg-slate-900 border-slate-800 text-slate-100 shrink-0 z-20 shadow-md">
      {/* Brand & Project Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-6 w-6 text-indigo-400 stroke-[2.5]" />
          <h1 className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
            WebForge3D <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-900/30">PRO</span>
          </h1>
        </div>
        
        <div className="h-5 w-px bg-slate-800" />
        
        {/* Project Rename Input */}
        <input
          id="project-name-input"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium text-sm px-3 py-1 rounded w-44 text-slate-100 transition-all outline-none"
          title="Click to rename project"
        />
      </div>

      {/* Action Utilities & Undo/Redo */}
      <div className="flex items-center gap-3">
        {/* Undo/Redo group */}
        <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800">
          <button
            id="undo-btn"
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition ${
              canUndo 
                ? 'text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer' 
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          
          <button
            id="redo-btn"
            onClick={onRedo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition ${
              canRedo 
                ? 'text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer' 
                : 'text-slate-600 cursor-not-allowed'
            }`}
            title="Redo (Ctrl+Y)"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-800" />

        {/* File actions */}
        <button
          id="save-btn"
          onClick={onSave}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3 py-1.5 rounded cursor-pointer transition shadow shadow-indigo-900/30"
          title="Save Scene (.json)"
        >
          <Save className="h-3.5 w-3.5" />
          <span>Save</span>
        </button>

        <label
          id="load-label"
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs px-3 py-1.5 rounded cursor-pointer transition"
          title="Load saved .json design"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Load</span>
          <input
            type="file"
            accept=".json"
            onChange={onLoad}
            className="hidden"
          />
        </label>

        <button
          id="clear-btn"
          onClick={onClear}
          className="flex items-center gap-1.5 border border-red-950/30 text-red-400 hover:bg-red-950/40 font-medium text-xs px-3 py-1.5 rounded cursor-pointer transition-all"
          title="Delete all bodies and sketches"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear All</span>
        </button>

        <div className="h-5 w-px bg-slate-800" />

        {/* Info/Guide & Theme Toggle */}
        <button
          id="tutorial-btn"
          onClick={onOpenTutorial}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
          title="CAD Guide & Tutorial"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        <button
          id="theme-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition cursor-pointer"
          title={theme === 'dark' ? 'Switch to Light Slate Theme' : 'Switch to Industrial Dark Slate Theme'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-400" />}
        </button>
      </div>
    </header>
  );
};
