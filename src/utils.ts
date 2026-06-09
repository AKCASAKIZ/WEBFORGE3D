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
  TorusParams,
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
    } else if (solid.type === 'torus') {
      const p = solid.params as TorusParams;
      mm3Volume += (2 * Math.pow(Math.PI, 2) * p.radius * Math.pow(p.tube, 2)) * scaleFactor;
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
    } else if (solid.type === 'torus') {
      const p = solid.params as TorusParams;
      mm3Volume = (2 * Math.pow(Math.PI, 2) * p.radius * Math.pow(p.tube, 2)) * scaleFactor;
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

/**
 * Procedurally rounded/chamfered box geometry generator shifts the base vertices
 * of a high-subdivision box mathematically towards fillet or chamfer edges.
 */
export function createModifiedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  fillets: Record<string, number> = {},
  chamfers: Record<string, number> = {}
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, height, depth, 16, 16, 16);
  const posAttr = geo.attributes.position;
  if (!posAttr) return geo;

  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  const temp = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    temp.fromBufferAttribute(posAttr, i);
    let x = temp.x;
    let y = temp.y;
    let z = temp.z;

    // --- 1. VERTICAL EDGES (parallel to Y, rounding in XZ plane) ---
    // front-left (x < 0, z > 0)
    if (fillets['vertical-FL'] || chamfers['vertical-FL']) {
      const R = fillets['vertical-FL'] || 0;
      const C = chamfers['vertical-FL'] || 0;
      if (x < -hw + Math.max(R, C) && z > hd - Math.max(R, C)) {
        if (R > 0) {
          const cx = -hw + R;
          const cz = hd - R;
          const dx = x - cx;
          const dz = z - cz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R || (dx < 0 && dz > 0)) {
            const angle = Math.atan2(dz, dx);
            x = cx + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = -hw - x;
          const v = z - hd;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            x += over;
            z -= over;
          }
        }
      }
    }

    // front-right (x > 0, z > 0)
    if (fillets['vertical-FR'] || chamfers['vertical-FR']) {
      const R = fillets['vertical-FR'] || 0;
      const C = chamfers['vertical-FR'] || 0;
      if (x > hw - Math.max(R, C) && z > hd - Math.max(R, C)) {
        if (R > 0) {
          const cx = hw - R;
          const cz = hd - R;
          const dx = x - cx;
          const dz = z - cz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R || (dx > 0 && dz > 0)) {
            const angle = Math.atan2(dz, dx);
            x = cx + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = x - hw;
          const v = z - hd;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            x -= over;
            z -= over;
          }
        }
      }
    }

    // back-left (x < 0, z < 0)
    if (fillets['vertical-BL'] || chamfers['vertical-BL']) {
      const R = fillets['vertical-BL'] || 0;
      const C = chamfers['vertical-BL'] || 0;
      if (x < -hw + Math.max(R, C) && z < -hd + Math.max(R, C)) {
        if (R > 0) {
          const cx = -hw + R;
          const cz = -hd + R;
          const dx = x - cx;
          const dz = z - cz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R || (dx < 0 && dz < 0)) {
            const angle = Math.atan2(dz, dx);
            x = cx + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = -hw - x;
          const v = -hd - z;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            x += over;
            z += over;
          }
        }
      }
    }

    // back-right (x > 0, z < 0)
    if (fillets['vertical-BR'] || chamfers['vertical-BR']) {
      const R = fillets['vertical-BR'] || 0;
      const C = chamfers['vertical-BR'] || 0;
      if (x > hw - Math.max(R, C) && z < -hd + Math.max(R, C)) {
        if (R > 0) {
          const cx = hw - R;
          const cz = -hd + R;
          const dx = x - cx;
          const dz = z - cz;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R || (dx > 0 && dz < 0)) {
            const angle = Math.atan2(dz, dx);
            x = cx + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = x - hw;
          const v = -hd - z;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            x -= over;
            z += over;
          }
        }
      }
    }

    // --- 2. HORIZONTAL EDGES ---
    // Top-Front (y > 0, z > 0, parallel to X. Rounding in YZ plane)
    if (fillets['top-F'] || chamfers['top-F']) {
      const R = fillets['top-F'] || 0;
      const C = chamfers['top-F'] || 0;
      if (y > hh - Math.max(R, C) && z > hd - Math.max(R, C)) {
        if (R > 0) {
          const cy = hh - R;
          const cz = hd - R;
          const dy = y - cy;
          const dz = z - cz;
          const d = Math.sqrt(dy * dy + dz * dz);
          if (d > R || (dy > 0 && dz > 0)) {
            const angle = Math.atan2(dz, dy);
            y = cy + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = y - hh;
          const v = z - hd;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y -= over;
            z -= over;
          }
        }
      }
    }

    // Top-Back (y > 0, z < 0, parallel to X)
    if (fillets['top-B'] || chamfers['top-B']) {
      const R = fillets['top-B'] || 0;
      const C = chamfers['top-B'] || 0;
      if (y > hh - Math.max(R, C) && z < -hd + Math.max(R, C)) {
        if (R > 0) {
          const cy = hh - R;
          const cz = -hd + R;
          const dy = y - cy;
          const dz = z - cz;
          const d = Math.sqrt(dy * dy + dz * dz);
          if (d > R || (dy > 0 && dz < 0)) {
            const angle = Math.atan2(dz, dy);
            y = cy + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = y - hh;
          const v = -hd - z;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y -= over;
            z += over;
          }
        }
      }
    }

    // Top-Left (y > 0, x < 0, parallel to Z. Rounding in YX plane)
    if (fillets['top-L'] || chamfers['top-L']) {
      const R = fillets['top-L'] || 0;
      const C = chamfers['top-L'] || 0;
      if (y > hh - Math.max(R, C) && x < -hw + Math.max(R, C)) {
        if (R > 0) {
          const cy = hh - R;
          const cx = -hw + R;
          const dy = y - cy;
          const dx = x - cx;
          const d = Math.sqrt(dy * dy + dx * dx);
          if (d > R || (dy > 0 && dx < 0)) {
            const angle = Math.atan2(dx, dy);
            y = cy + R * Math.cos(angle);
            x = cx + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = y - hh;
          const v = -hw - x;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y -= over;
            x += over;
          }
        }
      }
    }

    // Top-Right (y > 0, x > 0, parallel to Z)
    if (fillets['top-R'] || chamfers['top-R']) {
      const R = fillets['top-R'] || 0;
      const C = chamfers['top-R'] || 0;
      if (y > hh - Math.max(R, C) && x > hw - Math.max(R, C)) {
        if (R > 0) {
          const cy = hh - R;
          const cx = hw - R;
          const dy = y - cy;
          const dx = x - cx;
          const d = Math.sqrt(dy * dy + dx * dx);
          if (d > R || (dy > 0 && dx > 0)) {
            const angle = Math.atan2(dx, dy);
            y = cy + R * Math.cos(angle);
            x = cx + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = y - hh;
          const v = x - hw;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y -= over;
            x -= over;
          }
        }
      }
    }

    // Bottom-Front (y < 0, z > 0, parallel to X)
    if (fillets['bottom-F'] || chamfers['bottom-F']) {
      const R = fillets['bottom-F'] || 0;
      const C = chamfers['bottom-F'] || 0;
      if (y < -hh + Math.max(R, C) && z > hd - Math.max(R, C)) {
        if (R > 0) {
          const cy = -hh + R;
          const cz = hd - R;
          const dy = y - cy;
          const dz = z - cz;
          const d = Math.sqrt(dy * dy + dz * dz);
          if (d > R || (dy < 0 && dz > 0)) {
            const angle = Math.atan2(dz, dy);
            y = cy + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = -hh - y;
          const v = z - hd;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y += over;
            z -= over;
          }
        }
      }
    }

    // Bottom-Back (y < 0, z < 0, parallel to X)
    if (fillets['bottom-B'] || chamfers['bottom-B']) {
      const R = fillets['bottom-B'] || 0;
      const C = chamfers['bottom-B'] || 0;
      if (y < -hh + Math.max(R, C) && z < -hd + Math.max(R, C)) {
        if (R > 0) {
          const cy = -hh + R;
          const cz = -hd + R;
          const dy = y - cy;
          const dz = z - cz;
          const d = Math.sqrt(dy * dy + dz * dz);
          if (d > R || (dy < 0 && dz < 0)) {
            const angle = Math.atan2(dz, dy);
            y = cy + R * Math.cos(angle);
            z = cz + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = -hh - y;
          const v = -hd - z;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y += over;
            z += over;
          }
        }
      }
    }

    // Bottom-Left (y < 0, x < 0, parallel to Z)
    if (fillets['bottom-L'] || chamfers['bottom-L']) {
      const R = fillets['bottom-L'] || 0;
      const C = chamfers['bottom-L'] || 0;
      if (y < -hh + Math.max(R, C) && x < -hw + Math.max(R, C)) {
        if (R > 0) {
          const cy = -hh + R;
          const cx = -hw + R;
          const dy = y - cy;
          const dx = x - cx;
          const d = Math.sqrt(dy * dy + dx * dx);
          if (d > R || (dy < 0 && dx < 0)) {
            const angle = Math.atan2(dx, dy);
            y = cy + R * Math.cos(angle);
            x = cx + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = -hh - y;
          const v = -hw - x;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y += over;
            x += over;
          }
        }
      }
    }

    // Bottom-Right (y < 0, x > 0, parallel to Z)
    if (fillets['bottom-R'] || chamfers['bottom-R']) {
      const R = fillets['bottom-R'] || 0;
      const C = chamfers['bottom-R'] || 0;
      if (y < -hh + Math.max(R, C) && x > hw - Math.max(R, C)) {
        if (R > 0) {
          const cy = -hh + R;
          const cx = hw - R;
          const dy = y - cy;
          const dx = x - cx;
          const d = Math.sqrt(dy * dy + dx * dx);
          if (d > R || (dy < 0 && dx > 0)) {
            const angle = Math.atan2(dx, dy);
            y = cy + R * Math.cos(angle);
            x = cx + R * Math.sin(angle);
          }
        } else if (C > 0) {
          const u = -hh - y;
          const v = x - hw;
          if (u + v > C) {
            const over = (u + v - C) / 2;
            y += over;
            x -= over;
          }
        }
      }
    }

    posAttr.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Procedurally updates cylinder vertices towards rounded top/bottom caps or beveled chamfer lines.
 */
export function createModifiedCylinderGeometry(
  radius: number,
  height: number,
  fillets: Record<string, number> = {},
  chamfers: Record<string, number> = {}
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, height, 48, 16);
  const posAttr = geo.attributes.position;
  if (!posAttr) return geo;

  const hh = height / 2;
  const temp = new THREE.Vector3();

  for (let i = 0; i < posAttr.count; i++) {
    temp.fromBufferAttribute(posAttr, i);
    let x = temp.x;
    let y = temp.y;
    let z = temp.z;
    const r = Math.sqrt(x * x + z * z);

    if (r > 0) {
      // --- 1. TOP RIM ---
      if (fillets['top-rim'] || chamfers['top-rim']) {
        const R_f = fillets['top-rim'] || 0;
        const C = chamfers['top-rim'] || 0;
        const maxOffset = Math.max(R_f, C);

        if (y > hh - maxOffset && r > radius - maxOffset) {
          if (R_f > 0) {
            const rc = radius - R_f;
            const yc = hh - R_f;
            const dr = r - rc;
            const dy = y - yc;
            if (dr > 0 && dy > 0) {
              const angle = Math.atan2(dy, dr);
              const rNew = rc + R_f * Math.cos(angle);
              const yNew = yc + R_f * Math.sin(angle);
              x = (x / r) * rNew;
              z = (z / r) * rNew;
              y = yNew;
            }
          } else if (C > 0) {
            const dr = r - (radius - C);
            const dy = y - (hh - C);
            if (dr + dy > C) {
              const over = (dr + dy - C) / 2;
              const rNew = r - over;
              x = (x / r) * rNew;
              z = (z / r) * rNew;
              y -= over;
            }
          }
        }
      }

      // --- 2. BOTTOM RIM ---
      if (fillets['bottom-rim'] || chamfers['bottom-rim']) {
        const R_f = fillets['bottom-rim'] || 0;
        const C = chamfers['bottom-rim'] || 0;
        const maxOffset = Math.max(R_f, C);

        if (y < -hh + maxOffset && r > radius - maxOffset) {
          if (R_f > 0) {
            const rc = radius - R_f;
            const yc = -hh + R_f;
            const dr = r - rc;
            const dy = y - yc;
            if (dr > 0 && dy < 0) {
              const angle = Math.atan2(dy, dr);
              const rNew = rc + R_f * Math.cos(angle);
              const yNew = yc + R_f * Math.sin(angle);
              x = (x / r) * rNew;
              z = (z / r) * rNew;
              y = yNew;
            }
          } else if (C > 0) {
            const dr = r - (radius - C);
            const dy = -hh - y;
            if (dr + dy > C) {
              const over = (dr + dy - C) / 2;
              const rNew = r - over;
              x = (x / r) * rNew;
              z = (z / r) * rNew;
              y += over;
            }
          }
        }
      }
    }

    posAttr.setXYZ(i, x, y, z);
  }

  geo.computeVertexNormals();
  return geo;
}
