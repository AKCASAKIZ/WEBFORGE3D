import * as THREE from 'three';
import { 
  ActiveFace, 
  CADSolid, 
  MATERIAL_SPECS, 
  MaterialType,
  BoxParams,
  CylinderParams,
  SphereParams,
  ConeParams,
  SketchParams
} from './types';

/**
 * Calculates standard U & V coordinate axes for a given face index of a box.
 * This is crucial for placing sketch profiles and dimensions relative to the face coordinate system.
 */
export function getFaceCoordinates(
  faceIndex: number,
  solidPosition: [number, number, number],
  solidRotation: [number, number, number],
  solidScale: [number, number, number],
  width: number,
  height: number,
  depth: number
): { normal: THREE.Vector3; center: THREE.Vector3; uVector: THREE.Vector3; vVector: THREE.Vector3 } {
  
  // Base normals and coordinates relative to model center before rotation
  let localNormal = new THREE.Vector3();
  let localU = new THREE.Vector3();
  let localV = new THREE.Vector3();
  let localCenter = new THREE.Vector3();

  const halfW = (width * solidScale[0]) / 2;
  const halfH = (height * solidScale[1]) / 2;
  const halfD = (depth * solidScale[2]) / 2;

  switch (faceIndex) {
    case 0: // Right Face (+X)
      localNormal.set(1, 0, 0);
      localU.set(0, 0, -1); // +Z is backward, out of face U is aligned left/right
      localV.set(0, 1, 0); // V is upwards
      localCenter.set(halfW, 0, 0);
      break;
    case 1: // Left Face (-X)
      localNormal.set(-1, 0, 0);
      localU.set(0, 0, 1);
      localV.set(0, 1, 0);
      localCenter.set(-halfW, 0, 0);
      break;
    case 2: // Top Face (+Y)
      localNormal.set(0, 1, 0);
      localU.set(1, 0, 0);
      localV.set(0, 0, -1);
      localCenter.set(0, halfH, 0);
      break;
    case 3: // Bottom Face (-Y)
      localNormal.set(0, -1, 0);
      localU.set(1, 0, 0);
      localV.set(0, 0, 1);
      localCenter.set(0, -halfH, 0);
      break;
    case 4: // Front Face (+Z)
      localNormal.set(0, 0, 1);
      localU.set(1, 0, 0);
      localV.set(0, 1, 0);
      localCenter.set(0, 0, halfD);
      break;
    case 5: // Back Face (-Z)
      localNormal.set(0, 0, -1);
      localU.set(-1, 0, 0);
      localV.set(0, 1, 0);
      localCenter.set(0, 0, -halfD);
      break;
    default:
      // Fallback
      localNormal.set(0, 0, 1);
      localU.set(1, 0, 0);
      localV.set(0, 1, 0);
  }

  // Create solid orientation matrix
  const euler = new THREE.Euler(solidRotation[0], solidRotation[1], solidRotation[2]);
  const quaternion = new THREE.Quaternion().setFromEuler(euler);

  // Apply rotation
  const normal = localNormal.clone().applyQuaternion(quaternion).normalize();
  const uVector = localU.clone().applyQuaternion(quaternion).normalize();
  const vVector = localV.clone().applyQuaternion(quaternion).normalize();
  
  // Calculate world center of face
  const center = localCenter.clone()
    .applyQuaternion(quaternion)
    .add(new THREE.Vector3(solidPosition[0], solidPosition[1], solidPosition[2]));

  return { normal, center, uVector, vVector };
}

/**
 * Calculates total volume of a list of solids in cubic centimeters (cm3).
 * Primitives' dimensions are modeled in millimeters (mm), so we convert from mm3 to cm3 (divide by 1000).
 */
export function calculateTotalVolume(solids: CADSolid[]): number {
  let mm3Volume = 0;
  for (const solid of solids) {
    const scaleFactor = solid.scale[0] * solid.scale[1] * solid.scale[2];
    
    if (solid.type === 'box') {
      const p = solid.params as BoxParams;
      mm3Volume += p.width * p.height * p.depth * scaleFactor;
    } else if (solid.type === 'cylinder') {
      const p = solid.params as CylinderParams;
      mm3Volume += Math.PI * Math.pow(p.radius, 2) * p.height * scaleFactor;
    } else if (solid.type === 'sphere') {
      const p = solid.params as SphereParams;
      mm3Volume += ((4 / 3) * Math.PI * Math.pow(p.radius, 3)) * scaleFactor;
    } else if (solid.type === 'cone') {
      const p = solid.params as ConeParams;
      mm3Volume += ((1 / 3) * Math.PI * Math.pow(p.radius, 2) * p.height) * scaleFactor;
    } else if (solid.type === 'extruded_sketch') {
      const p = solid.params as SketchParams;
      const baseArea = p.profileType === 'rect' ? p.width * p.height :
                       p.profileType === 'circle' ? Math.PI * Math.pow(p.radius, 2) :
                       // Regular Polygon approximation logic
                       ((p.radius * p.radius * Math.sin((2 * Math.PI) / 6)) * 6) / 2; // Hexagon default
      mm3Volume += baseArea * p.depth * scaleFactor;
    } else if (solid.type === 'subtracted_sketch') {
      // Subtraction reduces parent volume if connected, but let's represent its cutout volume
      const p = solid.params as SketchParams;
      const baseArea = p.profileType === 'rect' ? p.width * p.height :
                       p.profileType === 'circle' ? Math.PI * Math.pow(p.radius, 2) :
                       ((p.radius * p.radius * Math.sin((2 * Math.PI) / 6)) * 6) / 2;
      mm3Volume -= baseArea * p.depth * scaleFactor;
    }
  }
  return Math.max(0, mm3Volume / 1000); // mm^3 to cm^3
}

/**
 * Calculates total mass of the list of CAD solids based on material densities.
 */
export function calculateTotalMass(solids: CADSolid[]): number {
  let totalMassG = 0;
  for (const solid of solids) {
    const scaleFactor = solid.scale[0] * solid.scale[1] * solid.scale[2];
    const spec = MATERIAL_SPECS[solid.materialType];
    let mm3Volume = 0;

    if (solid.type === 'box') {
      const p = solid.params as BoxParams;
      mm3Volume = p.width * p.height * p.depth * scaleFactor;
    } else if (solid.type === 'cylinder') {
      const p = solid.params as CylinderParams;
      mm3Volume = Math.PI * Math.pow(p.radius, 2) * p.height * scaleFactor;
    } else if (solid.type === 'sphere') {
      const p = solid.params as SphereParams;
      mm3Volume = ((4 / 3) * Math.PI * Math.pow(p.radius, 3)) * scaleFactor;
    } else if (solid.type === 'cone') {
      const p = solid.params as ConeParams;
      mm3Volume = ((1 / 3) * Math.PI * Math.pow(p.radius, 2) * p.height) * scaleFactor;
    } else if (solid.type === 'extruded_sketch') {
      const p = solid.params as SketchParams;
      const baseArea = p.profileType === 'rect' ? p.width * p.height :
                       p.profileType === 'circle' ? Math.PI * Math.pow(p.radius, 2) :
                       ((p.radius * p.radius * Math.sin((2 * Math.PI) / 6)) * 6) / 2;
      mm3Volume = baseArea * p.depth * scaleFactor;
    } else if (solid.type === 'subtracted_sketch') {
      const p = solid.params as SketchParams;
      const baseArea = p.profileType === 'rect' ? p.width * p.height :
                       p.profileType === 'circle' ? Math.PI * Math.pow(p.radius, 2) :
                       ((p.radius * p.radius * Math.sin((2 * Math.PI) / 6)) * 6) / 2;
      mm3Volume = -baseArea * p.depth * scaleFactor;
    }

    const cm3Volume = mm3Volume / 1000;
    totalMassG += cm3Volume * spec.density;
  }
  return Math.max(0, totalMassG / 1000); // grams to kilograms
}
