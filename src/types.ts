export type SolidType = 'box' | 'cylinder' | 'sphere' | 'cone' | 'extruded_sketch' | 'subtracted_sketch' | 'torus';

export interface BoxParams {
  width: number;
  height: number;
  depth: number;
}

export interface CylinderParams {
  radius: number;
  height: number;
}

export interface SphereParams {
  radius: number;
}

export interface ConeParams {
  radius: number;
  height: number;
}

export interface TorusParams {
  radius: number; // Major/outer radius
  tube: number;   // Minor/tube radius
}

export interface SketchParams {
  profileType: 'rect' | 'circle' | 'polygon';
  width: number;
  height: number;
  radius: number;
  sides: number;
  u: number;
  v: number;
  depth: number;
  operation: 'extrude' | 'cut';
  parentSolidId: string;
}

export type SolidParams = BoxParams | CylinderParams | SphereParams | ConeParams | TorusParams | SketchParams;

export type MaterialType = 'steel' | 'aluminum' | 'plastic' | 'copper' | 'wood' | 'glass';

export interface MaterialProperties {
  name: string;
  density: number; // g / cm3
  color: string;
  roughness: number;
  metalness: number;
}

export const MATERIAL_SPECS: Record<MaterialType, MaterialProperties> = {
  steel: { name: 'Steel (S235JR)', density: 7.85, color: '#7f8c8d', roughness: 0.3, metalness: 0.8 },
  aluminum: { name: 'Aluminum (6061)', density: 2.7, color: '#bdc3c7', roughness: 0.4, metalness: 0.7 },
  plastic: { name: 'ABS Plastic', density: 1.04, color: '#2c3e50', roughness: 0.6, metalness: 0.1 },
  copper: { name: 'Copper (pure)', density: 8.96, color: '#d35400', roughness: 0.35, metalness: 0.8 },
  wood: { name: 'Oak Wood', density: 0.75, color: '#d35400', roughness: 0.9, metalness: 0.0 },
  glass: { name: 'Silica Glass', density: 2.2, color: '#e0f7fa', roughness: 0.1, metalness: 0.1 },
};

export interface DimensionConstraint {
  min: number;
  max: number;
  enabled: boolean;
}

export interface CADSolid {
  id: string;
  name: string;
  type: SolidType;
  position: [number, number, number];
  rotation: [number, number, number]; // [x, y, z] in radians
  scale: [number, number, number];
  color: string;
  materialType: MaterialType;
  params: SolidParams;
  parentSolidId?: string; // used for feature tree history
  constraints?: Record<string, DimensionConstraint>;
  fillets?: Record<string, number>;
  chamfers?: Record<string, number>;
  selectedEdgeId?: string | null;
}

export interface SketchProfile {
  id: string;
  type: 'rect' | 'circle' | 'polygon';
  width: number;
  height: number;
  radius: number;
  sides: number;
  u: number; // offset on plane U axis (mm)
  v: number; // offset on plane V axis (mm)
  color: string;
}

export interface ActiveFace {
  solidId: string;
  faceIndex: number;
  normal: [number, number, number]; // World normal vector
  center: [number, number, number]; // World center of face
  uVector: [number, number, number]; // Face horizontal coordinate axis in 3D
  vVector: [number, number, number]; // Face vertical coordinate axis in 3D
}
