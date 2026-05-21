// ═══ MISSING CORE FUNCTIONS — injected ═══════════════════════════
// saveCheckpoint: save undo snapshot
window.saveCheckpoint = function() {
    try {
        var snap = (window.objects || []).map(function(mesh) {
            if (!mesh) return null;
            return {
                pos: mesh.position.clone(),
                rot: mesh.rotation.clone(),
                sca: mesh.scale.clone(),
                uuid: mesh.uuid
            };
        }).filter(Boolean);
        if (!window._undoHistory) window._undoHistory = [];
        window._undoHistory.push(snap);
        if (window._undoHistory.length > 30) window._undoHistory.shift();
        window._projectDirty = true;
    } catch(e) { /* silent */ }
};
if (typeof saveCheckpoint === 'undefined') {
    var saveCheckpoint = window.saveCheckpoint;
}

// performUndo: restore last snapshot
window.performUndo = function() {
    if (!window._undoHistory || !window._undoHistory.length) return;
    var snap = window._undoHistory.pop();
    if (!snap) return;
    snap.forEach(function(s) {
        var mesh = (window.objects || []).find(function(o){ return o && o.uuid === s.uuid; });
        if (mesh) {
            mesh.position.copy(s.pos);
            mesh.rotation.copy(s.rot);
            mesh.scale.copy(s.sca);
        }
    });
};

// selectObject: select a mesh and update UI
window.selectObject = window.selectObject || function(mesh, hit) {
    if (!mesh) return;
    window.targetSel = { mesh: mesh };
    if (typeof window.transformControl !== 'undefined' && window.transformControl) {
        window.transformControl.attach(mesh);
    }
    if (typeof updateInfoPanel === 'function') {
        try { updateInfoPanel(mesh); } catch(e) {}
    }
    if (typeof updateManualControls === 'function') {
        try { updateManualControls(mesh); } catch(e) {}
    }
    if (typeof showNotification === 'function') {
        showNotification(mesh.userData.id || 'Part selected', 'info');
    }
};

// resetSelection: clear current selection  
window.resetSelection = window.resetSelection || function() {
    window.targetSel = null;
    if (typeof window.transformControl !== 'undefined' && window.transformControl) {
        try { window.transformControl.detach(); } catch(e) {}
    }
};

// updateSceneTotals: update mass/volume display
window.updateSceneTotals = window.updateSceneTotals || function() {
    var objs = window.objects || [];
    var totalVol = 0, totalWeight = 0;
    objs.forEach(function(o) {
        if (o && o.userData) {
            totalVol += o.userData.volume || 0;
            totalWeight += o.userData.weight || 0;
        }
    });
    var vEl = document.getElementById('total-volume');
    var wEl = document.getElementById('total-weight');
    if (vEl) vEl.textContent = totalVol.toFixed(1) + ' cm³';
    if (wEl) wEl.textContent = totalWeight.toFixed(3) + ' kg';
};

// Expose local saveCheckpoint for same-script use
// (undoStack in main script local scope — bridge via window)
try {
    if (typeof undoStack !== 'undefined') {
        window._localSaveCheckpoint = function() {
            // Use local undoStack if available
            if (typeof objects !== 'undefined' && undoStack) {
                var state = objects.map(function(m){
                    if(!m||!m.geometry) return null;
                    return { uuid: m.uuid, pos: m.position.clone(), rot: m.rotation.clone(), sca: m.scale.clone() };
                }).filter(Boolean);
                undoStack.push(JSON.parse(JSON.stringify(state.map(function(s){
                    return {uuid:s.uuid,px:s.pos.x,py:s.pos.y,pz:s.pos.z,rx:s.rot.x,ry:s.rot.y,rz:s.rot.z,sx:s.sca.x,sy:s.sca.y,sz:s.sca.z};
                }))));
                if(undoStack.length > 20) undoStack.shift();
            }
        };
    }
} catch(e) {}
// ═══════════════════════════════════════════════════════════════════



        // --- GLOBAL VARIABLES ---

// --- POLAR ARRAY (DAİRESEL DUPLICATEMA) GÜNCELLENMİŞ KOD ---

// 1. Paneldeki butona basınca çalışacak fonksiyon
function openPolarModalFromSelection() {
    // Eğer bir parça seçili değilse uyar ve dur
    if (!targetSel) {
        showNotification("Lütfen önce çoğaltılacak parçayı seçin!", "error");
        return;
    }

    // KRİTİK NOKTA: Seçili parçanın ID'sini global değişkene ata
    contextMeshId = targetSel.mesh.uuid;

    // Modalı (Pencereyi) Aç
    document.getElementById('polar-modal').classList.remove('hidden');

    // Kullanıcıya bilgi ver (Pivot noktası hakkında)
    if (sourceSel) {
        showNotification(`Merkez: ${sourceSel.mesh.userData.id} etrafında çoğaltılacak.`, "success");
    } else {
        showNotification("Merkez seçilmedi. (0,0,0) noktası etrafında çoğaltılacak.", "warning");
    }
}

// 2. Modaldaki 'Uygula' butonuna basınca çalışacak fonksiyon
function applyPolarArray() {
    // Global değişkenden parçayı bul
    const originalMesh = objects.find(o => o.uuid === contextMeshId);
    
    // Değerleri Inputlardan al
    const count = Math.round(window.evalDim(document.getElementById('polar-count')));
    const totalAngle = window.evalDim(document.getElementById('polar-angle'));
    const rotateObjects = document.getElementById('polar-rotate-obj').checked;

    if (!originalMesh) {
        showNotification("Hata: Parça bulunamadı.", "error");
        return;
    }
    if (count < 2) {
        showNotification("Adet en az 2 olmalıdır.", "error");
        return;
    }

    // Merkez Noktasını (Pivot) Belirle
    let pivotPoint = new THREE.Vector3(0, 0, 0);
    // Eğer turuncu ok (Source) varsa onu merkez al
    if (sourceSel && sourceSel.mesh !== originalMesh) {
        pivotPoint.copy(sourceSel.mesh.position);
    }

    // İşlem başlıyor - Kayıt al
    saveCheckpoint();
    
    // Modalı gizle
    document.getElementById('polar-modal').classList.add('hidden');

    // Açı adımını hesapla
    // Eğer 360 derece tam tur ise: 360/sayı
    // Eğer yarım tur (örn 180) ise: 180/(sayı-1)
    const isFullCircle = (Math.abs(totalAngle) >= 360);
    const angleStep = isFullCircle ? (360 / count) : (totalAngle / (count - 1));

    let createdCount = 0;

    // Döngü (i=1'den başlıyor çünkü 0. parça orijinalin kendisi)
    for (let i = 1; i < count; i++) {
        const angleDeg = i * angleStep;
        const angleRad = THREE.Math.degToRad(angleDeg);

        // Klonla
        const clone = originalMesh.clone();
        clone.material = originalMesh.material.clone();
        clone.userData = JSON.parse(JSON.stringify(originalMesh.userData));
        
        // Yeni isim ver
        clone.userData.id = originalMesh.userData.id + "_ARR_" + i;

        // --- MATEMATİKSEL DÖNDÜRME İŞLEMİ ---
        
        // 1. Parçayı orijine (0,0,0) taşıyormuş gibi pivot farkını al
        const localPos = originalMesh.position.clone().sub(pivotPoint);
        
        // 2. Y ekseni etrafında döndür
        localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
        
        // 3. Pivot noktasını geri ekle
        clone.position.copy(localPos.add(pivotPoint));

        // 4. Parçanın kendi ekseninde dönmesi (Opsiyonel)
        if (rotateObjects) {
            const q = new THREE.Quaternion();
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
            clone.quaternion.premultiply(q);
        }

        // Sahneye ekle
        scene.add(clone);
        objects.push(clone);
        addMeshToTree(clone);
        createdCount++;
    }

    // Sahneyi güncelle
    updateSceneTotals();
    showNotification(`${createdCount} kopya başarıyla oluşturuldu.`, "success");
    
    // Seçimi temizle ki çizgiler karışmasın
    resetSelection();
}



// --- SAFARI & MACBOOK UYUMLU, AKILLI ÜSTÜNE YAZMALI KAYDETME FONKSİYONU ---
async function saveFileWithDialog(blob, defaultName, description, mimeType, extension) {
    try {
        // 1. YÖNTEM: Modern Tarayıcılar (Chrome, Edge, Opera)
        if (window.showSaveFilePicker) {
            let handle = currentFileHandle;

            // Eğer elimizde zaten bir dosya yetkisi varsa (projeyi daha önce kaydettiysek), SESSİZCE ÜSTÜNE YAZ
            if (handle) {
                try {
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    return true; // İşlem bitti, pencere açmaya gerek kalmadı!
                } catch (writeErr) {
                    console.warn("Üstüne yazma izni reddedildi veya dosya taşındı, yeniden sorulacak.", writeErr);
                    handle = null; // Hata verirse handle'ı sıfırla ve aşağıdan tekrar sorsun
                }
            }

            // İlk kez kaydediyorsak veya eski yetki kaybolduysa kaydetme penceresini aç
            if (!handle) {
                const options = {
                    suggestedName: defaultName,
                    types: [{
                        description: description,
                        accept: { [mimeType]: [extension] },
                    }],
                };

                handle = await window.showSaveFilePicker(options);
                currentFileHandle = handle; // DOSYA REFERANSINI HAFIZAYA AL!
            }

            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return true;
        }
    } catch (err) {
        // Kullanıcı iptal ederse sessizce çık
        if (err.name === 'AbortError') return false;
        console.warn("File System API hatası, klasik yönteme geçiliyor...", err);
    }

    // 2. YÖNTEM: SAFARI & FIREFOX (Klasik İndirme)
    // Güvenlik nedeniyle Safari/Firefox direkt üstüne yazmaya izin vermeyebilir, onlarda mecburen indirir.
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = defaultName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => { URL.revokeObjectURL(link.href); }, 100);
    
    return true;
}

// --- GLOBAL VARIABLES ---
let selectionHelper = null; // Seçim kutusu yardımcısı
        let scene, camera, renderer, controls, transformControl;
        let objects = []; window.objects = objects; 

window.setBgColor = function(hex){
  if(!window.scene || !window.THREE) return;
  var c = new window.THREE.Color(hex);
  window.scene.background = c;
  window._sceneBgColor = c.clone();
  var pick = document.getElementById('bg-color-pick');
  if(pick) pick.value = hex;
};
// ═══════════════════════════════════════════════════════════
// SNAP GROUP SYSTEM — parts stick together, move as unit
// ═══════════════════════════════════════════════════════════
window._snapGroups = []; // [{id:'grp_0', members:['uuid1','uuid2',...]}]
window._snapGroupDragActive = false;
window._snapGroupDragPrev = null;
window._snapGroupDragObj = null;
window._snapGroupPosSnapshot = {};

window.snapGroupHas = function(uuid) {
    return window._snapGroups.some(function(g) { return g.members.indexOf(uuid) >= 0; });
};

window.snapGroupOf = function(uuid) {
    return window._snapGroups.find(function(g) { return g.members.indexOf(uuid) >= 0; }) || null;
};

window.snapGroupConnect = function(obj) {
    // Find nearest snapped partner
    var snapPartner = null;
    var bestD = 5.0;
    var objCenters = typeof getCircularFaceCenters === 'function' ? getCircularFaceCenters(obj) : [obj.position.clone()];
    (window.objects || []).forEach(function(other) {
        if (!other || other === obj) return;
        var otherC = typeof getCircularFaceCenters === 'function' ? getCircularFaceCenters(other) : [other.position.clone()];
        objCenters.forEach(function(oc) {
            otherC.forEach(function(tc) {
                var d = oc.distanceTo(tc);
                if (d < bestD) { bestD = d; snapPartner = other; }
            });
        });
    });
    if (!snapPartner) return;

    var gA = window.snapGroupOf(obj.uuid);
    var gB = window.snapGroupOf(snapPartner.uuid);

    if (gA && gB && gA === gB) return; // already in same group

    if (gA && gB) {
        // Merge two groups
        gB.members.forEach(function(m) { if (gA.members.indexOf(m) < 0) gA.members.push(m); });
        window._snapGroups = window._snapGroups.filter(function(g) { return g !== gB; });
        showNotification('🔗 Groups merged (' + gA.members.length + ' parts)', 'success');
    } else if (gA) {
        if (gA.members.indexOf(snapPartner.uuid) < 0) gA.members.push(snapPartner.uuid);
        showNotification('🔗 Added to group (' + gA.members.length + ' parts)', 'success');
    } else if (gB) {
        if (gB.members.indexOf(obj.uuid) < 0) gB.members.push(obj.uuid);
        showNotification('🔗 Added to group (' + gB.members.length + ' parts)', 'success');
    } else {
        // New group
        var newGrp = { id: 'grp_' + Date.now(), members: [obj.uuid, snapPartner.uuid] };
        window._snapGroups.push(newGrp);
        showNotification('🔗 Snap group created (2 parts)', 'success');
    }
    if (typeof updateModelTree === 'function') updateModelTree();
};

window._moveSnapGroup = function(draggedObj) {
    if (!window._snapGroupDragPrev) return;
    var grp = window.snapGroupOf(draggedObj.uuid);
    if (!grp) return;
    var delta = new THREE.Vector3().subVectors(draggedObj.position, window._snapGroupDragPrev);
    if (delta.lengthSq() < 0.00001) return;
    grp.members.forEach(function(uuid) {
        if (uuid === draggedObj.uuid) return;
        var o = (window.objects || []).find(function(x) { return x && x.uuid === uuid; });
        if (o) o.position.add(delta);
    });
    window._snapGroupDragPrev.copy(draggedObj.position);
};

// ═══════════════════════════════════════════════════════════
// SNAP GUIDE SYSTEM — visual preview + commit on release
// ═══════════════════════════════════════════════════════════
window._snapGuideObjects = [];   // THREE objects for guide lines/spheres
window._snapCandidates   = null; // {objPt, otherPt, other, dist}

window.snapFindCandidates = function(obj) {
    if (!window.THREE || !window.objects) return null;
    var T = window.THREE;
    var myGrp = window.snapGroupOf ? window.snapGroupOf(obj.uuid) : null;
    var objCenters = (typeof getCircularFaceCenters === 'function')
        ? getCircularFaceCenters(obj) : [obj.position.clone()];

    var best = null, bestD = SNAP_PREVIEW_DIST;

    window.objects.forEach(function(other) {
        if (!other || other === obj || other.userData.isPMI) return;
        if (myGrp && window.snapGroupOf(other.uuid) === myGrp) return;
        var otherC = (typeof getCircularFaceCenters === 'function')
            ? getCircularFaceCenters(other) : [other.position.clone()];

        objCenters.forEach(function(oc) {
            otherC.forEach(function(tc) {
                var d = oc.distanceTo(tc);
                if (d < bestD) {
                    bestD = d;
                    best = { objPt: oc.clone(), otherPt: tc.clone(), other: other, dist: d };
                }
            });
        });
    });
    return best;
};

window.snapShowGuides = function(obj) {
    window.snapClearGuides();
if (!snapEnabled) return;
    var cand = window.snapFindCandidates(obj);
    window._snapCandidates = cand;
    if (!cand) return;

    var T = window.THREE;
    var scene = window.scene;

    // Color: green if commit-close, yellow if preview
    var isClose = cand.dist < SNAP_COMMIT_DIST;
    var color = isClose ? 0x00ff88 : 0xffdd00;
    var lineColor = isClose ? 0x00ff88 : 0x60a5fa;

    // --- Dashed guide line between snap points ---
    var pts = [cand.objPt, cand.otherPt];
    var lineGeo = new T.BufferGeometry().setFromPoints(pts);
    var lineMat = new T.LineDashedMaterial({
        color: lineColor, dashSize: 4, gapSize: 2, linewidth: 2, depthTest: false
    });
    var line = new T.Line(lineGeo, lineMat);
    line.computeLineDistances();
    line.renderOrder = 9999;
    scene.add(line);
    window._snapGuideObjects.push(line);

    // --- Sphere at each snap point ---
    var r = isClose ? 1.5 : 1.0;
    [cand.objPt, cand.otherPt].forEach(function(pt) {
        var geo = new T.SphereGeometry(r, 8, 8);
        var mat = new T.MeshBasicMaterial({ color: color, depthTest: false });
        var sph = new T.Mesh(geo, mat);
        sph.position.copy(pt);
        sph.renderOrder = 9999;
        scene.add(sph);
        window._snapGuideObjects.push(sph);
    });

    // --- Cross lines at target snap point ---
    var cross = 8;
    var axes = [
        new T.Vector3(cross,0,0), new T.Vector3(0,cross,0), new T.Vector3(0,0,cross)
    ];
    axes.forEach(function(ax) {
        var cg = new T.BufferGeometry().setFromPoints([
            cand.otherPt.clone().sub(ax), cand.otherPt.clone().add(ax)
        ]);
        var cm = new T.LineBasicMaterial({ color: color, linewidth: 1, depthTest: false });
        var cl = new T.Line(cg, cm);
        cl.renderOrder = 9998;
        scene.add(cl);
        window._snapGuideObjects.push(cl);
    });

    // --- Distance label via DOM ---
    var lbl = document.getElementById('_snapDistLabel');
    if (!lbl) {
        lbl = document.createElement('div');
        lbl.id = '_snapDistLabel';
        lbl.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;'
            + 'background:rgba(15,23,42,0.95);color:#fff;font-size:11px;font-weight:900;'
            + 'padding:3px 10px;border-radius:6px;white-space:nowrap;border:1.5px solid '+(isClose?'#00ff88':'#60a5fa')+';';
        document.body.appendChild(lbl);
    }
    lbl.style.borderColor = isClose ? '#00ff88' : '#60a5fa';
    lbl.style.color = isClose ? '#00ff88' : '#fff';
    lbl.textContent = (isClose ? '✓ SNAP ' : '⟶ ') + cand.dist.toFixed(1) + ' mm'
        + (isClose ? ' — release to mate' : '');
    // Position near cursor
    var mid = cand.otherPt.clone().add(cand.objPt).multiplyScalar(0.5);
    mid.project(window.camera);
    var sx = (mid.x * 0.5 + 0.5) * window.innerWidth;
    var sy = (-mid.y * 0.5 + 0.5) * window.innerHeight;
    lbl.style.left = (sx + 12) + 'px';
    lbl.style.top  = (sy - 20) + 'px';
    lbl.style.display = 'block';
};

window.snapClearGuides = function() {
    var scene = window.scene;
    if (scene) {
        window._snapGuideObjects.forEach(function(o) {
            scene.remove(o);
            if (o.geometry) o.geometry.dispose();
            if (o.material) o.material.dispose();
        });
    }
    window._snapGuideObjects = [];
    var lbl = document.getElementById('_snapDistLabel');
    if (lbl) lbl.style.display = 'none';
    window._snapCandidates = null;
};

window.snapCommit = function(obj) {
if (!snapEnabled) return;
    var cand = window._snapCandidates;
    if (!cand || cand.dist >= SNAP_COMMIT_DIST) return;
    // Move obj so its snap point aligns with target snap point
    var delta = new THREE.Vector3().subVectors(cand.otherPt, cand.objPt);
    obj.position.add(delta);
    // Also move group members
    var myGrp = window.snapGroupOf ? window.snapGroupOf(obj.uuid) : null;
    if (myGrp) {
        myGrp.members.forEach(function(uuid) {
            if (uuid === obj.uuid) return;
            var o = (window.objects||[]).find(function(x){return x&&x.uuid===uuid;});
            if (o) o.position.add(delta);
        });
    }
    // Connect to snap group
    if (window.snapGroupConnect) window.snapGroupConnect(obj);
    if (typeof updateModelTree === 'function') updateModelTree();
    if (typeof showNotification === 'function')
        showNotification('🔗 Mated! Move together. Use Model Tree to break.', 'success');
};

window.snapGroupBreak = function(uuid) {
    var grp = window.snapGroupOf(uuid);
    if (!grp) { showNotification('Not in any snap group', 'info'); return; }
    var obj = (window.objects || []).find(function(o) { return o && o.uuid === uuid; });
    var name = obj ? (obj.userData.id || uuid.slice(0,8)) : uuid.slice(0,8);
    // Remove this uuid from its group
    grp.members = grp.members.filter(function(m) { return m !== uuid; });
    if (grp.members.length < 2) {
        window._snapGroups = window._snapGroups.filter(function(g) { return g !== grp; });
    }
    showNotification('🔓 ' + name + ' disconnected from group', 'success');
    if (typeof updateModelTree === 'function') updateModelTree();
};

window.releaseAllSnaps = function() {
    var count = window._snapGroups.reduce(function(s,g){return s+g.members.length;},0);
    window._snapGroups = [];
    showNotification('🔓 All snap groups cleared (' + count + ' parts)', 'info');
    if (typeof updateModelTree === 'function') updateModelTree();
};

let multiSelection = []; // Çoklu seçim listesi
        let raycaster, mouse;
        let contextMeshId = null;
        let targetSel = null; 
        let sourceSel = null; 
        let lastSaveDirectory = null; // Son kayıt konumunu tutacak değişken
let currentFileHandle = null; // O an açık olan dosyanın yetkisini tutar
        let targetArrow, sourceArrow;
        let undoStack = [];
        let redoStack = []; // YENİ: İleri alma hafızası
        const MAX_HISTORY = 20;
        const DENSITY_G_MM3 = 0.00785; 

        let shiftDown = false;
let surfaceGridHelper = null;
let snapMarker = null;
let isSurfaceGridActive = false;
let isPMIMode = false;
let pmiPoints = [];
let pmiObjects = [];
let currentGridSpacing = 0.25; // Artık değiştirilebilir bir değişken
const GRID_SIZE = 50;           // Grid boyutu 50x50mm
let gridOrigin = new THREE.Vector3();
let gridQuaternion = new THREE.Quaternion();
        let lastScale = new THREE.Vector3();
        let snapEnabled = false; // Magnet Snap Mode
        const SNAP_THRESHOLD = 0; // auto-snap disabled
const SNAP_PREVIEW_DIST = 30.0; // mm — show guides when this close
const SNAP_COMMIT_DIST  =  5.0; // mm — auto-commit snap on release

        // Measurement Guides
        let measureGroup;

let measureMode = false;
let measurePoints = [];
let measureLines = []; // To store drawn lines for cleanup
        let measureLineX, measureLineY, measureLineZ;
        
        // ThreeBSP instance
        let ThreeBSP;
        
        // Model Tree Data Structure
        let modelTree = {
            nodes: [],
            expandedNodes: new Set()
        };
        
        // Feature creation variables
        let selectedFeatureType = 'hole';
        let featureModalVisible = false;
        
        // --- FEATURE FUNCTIONS ---
        
        function showFeatureModal() {
            document.getElementById('feature-modal').style.display = 'flex';
            featureModalVisible = true;
            // Reset all selections
            document.querySelectorAll('.feature-option').forEach(opt => {
                opt.classList.remove('selected');
            });
        }
        
        function hideFeatureModal() {
            document.getElementById('feature-modal').style.display = 'none';
            featureModalVisible = false;
        }
        
        function selectFeatureType(type) {
            selectedFeatureType = type;
            // Update UI
            document.querySelectorAll('.feature-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            event.target.closest('.feature-option').classList.add('selected');
        }
        
        function confirmFeatureType() {
            hideFeatureModal();
            updateFeatureUI();
        }
        
        function updateFeatureUI() {
            // Update the dropdown in the left panel
            document.getElementById('feature-type').value = selectedFeatureType;
            updateFeatureParams();
        }
        
    function updateFeatureParams() {
    const type = document.getElementById('feature-type').value;
    const paramsDiv = document.getElementById('feature-params');
    const throughContainer = document.getElementById('through-hole-container');
    const profileContainer = document.getElementById('profile-type-container');
    
    // Görünürlük ayarları
    throughContainer.style.display = (type === 'hole' || type === 'slot') ? 'block' : 'none';
    profileContainer.classList.toggle('hidden', type !== 'profile');

    let html = '';

    if (type === 'hole' || type === 'boss') {
        html += `<div><label>DIA (mm)</label><input type="number" id="feat-dia" value="10" step="0.5"></div>
                 <div><label>HEIGHT/DEPTH (mm)</label><input type="number" id="feat-depth" value="20" step="1"></div>`;
    } 
    else if (type === 'slot' || type === 'pocket') {
        html += `<div><label>Width (mm)</label><input type="number" id="feat-width" value="10" step="0.5"></div>
                 <div><label>Uzunluk (mm)</label><input type="number" id="feat-length" value="30" step="1"></div>
                 <div class="col-span-2"><label>Derinlik (mm)</label><input type="number" id="feat-depth" value="10" step="1"></div>`;
    }
    else if (type === 'profile') {
        html += `<div><label>Ölçü (mm)</label><input type="number" id="feat-size" value="15" step="1"></div>
                 <div><label>Derinlik (mm)</label><input type="number" id="feat-depth" value="20" step="1"></div>
                 <div class="col-span-2 mt-2"><label>Yön</label><select id="feat-dir" class="w-full border p-1"><option value="in">IN (Del)</option><option value="out">OUT (Uzat)</option></select></div>`;
    }
    
    // Chamfer ve Fillet input alanları buradan kaldırıldı.

    // Ortak Konum Ayarları
    html += `<div class="col-span-2 mt-3 pt-3 border-t border-gray-200">
                <label class="text-xs font-bold text-blue-600 uppercase mb-2">ON SURFACE POINT</label>
                <div class="grid grid-cols-3 gap-2">
                    <div><label class="text-xs">Ofset X</label><input type="number" id="feat-off-x" value="0"></div>
                    <div><label class="text-xs">Ofset Z</label><input type="number" id="feat-off-z" value="0"></div>
                    <div><label class="text-xs">Açı (°)</label><input type="number" id="feat-rot" value="0" step="45"></div>
                </div>
             </div>`;

    paramsDiv.innerHTML = html;
}
        
        function createFeature() {
            const type = document.getElementById('feature-type').value;
            
            if (!targetSel) {
                showNotification("Please select a target object first", "error");
                return;
            }
            
            let params = {};
            
            if (type === 'hole' || type === 'boss') {
                params.diameter = window.evalDim(document.getElementById('feat-dia'));
                params.depth = window.evalDim(document.getElementById('feat-depth'));
                params.through = document.getElementById('feat-through').checked;
                
                if (params.diameter <= 0 || params.depth <= 0) {
                    showNotification("Invalid dimensions", "error");
                    return;
                }
            }
            else if (type === 'slot') {
                params.width = window.evalDim(document.getElementById('feat-width'));
                params.length = window.evalDim(document.getElementById('feat-length'));
                params.depth = window.evalDim(document.getElementById('feat-depth'));
                params.through = document.getElementById('feat-through').checked;
                
                if (params.width <= 0 || params.length <= 0 || params.depth <= 0) {
                    showNotification("Invalid dimensions", "error");
                    return;
                }
            }
            else if (type === 'pocket') {
                params.width = window.evalDim(document.getElementById('feat-width'));
                params.length = window.evalDim(document.getElementById('feat-length'));
                params.depth = window.evalDim(document.getElementById('feat-depth'));
                
                if (params.width <= 0 || params.length <= 0 || params.depth <= 0) {
                    showNotification("Invalid dimensions", "error");
                    return;
                }
            }
            else if (type === 'profile') {
                params.size = window.evalDim(document.getElementById('feat-size'));
                params.depth = window.evalDim(document.getElementById('feat-depth'));
                params.shape = document.getElementById('profile-shape').value;
                
                if (params.size <= 0 || params.depth <= 0) {
                    showNotification("Invalid dimensions", "error");
                    return;
                }
            }
            
            // Apply the feature
            applyFeatureToSurface(type, params);
        }
        
      // --- YENİ GEOMETRİ OLUŞTURUCULAR ---
       function createChamferGeometry(params) {
            // 45 derece dönmüş kutu (Pah kırmak için)
            // Boyutlar kullanıcıdan gelir, uzunluk parça boyudur
            const s = params.size * 2.5; // Kesici biraz büyük olsun ki tam kessin
            const geo = new THREE.BoxGeometry(s, s, params.length);
            
            // Prizmayı 45 derece döndür (Köşeye oturması için)
            // Z ekseninde döndürüyoruz (Varsayılan duruşa göre)
            geo.rotateZ(Math.PI / 4);
            return geo;
        }

        function createFilletGeometry(params) {
            // Radyus yapmak için basit bir silindir kullanıyoruz.
            // Kullanıcı bunu köşeye koyup "SUBTRACT (-)" derse "İçbükey (Concave)" yüzey oluşur.
            const r = params.radius;
            const h = params.length;
            const geo = new THREE.CylinderGeometry(r, r, h, 32);
            // Silindiri yatır (Yüzeye paralel olsun)
            geo.rotateX(Math.PI / 2);
            return geo;
        }

       // --- GÜNCELLENMİŞ ANA FONKSİYON ---
       // --- GÜNCELLENMİŞ: BAĞIMSIZ FEATURE OLUŞTURMA (MERGE YOK) ---

function applyFeatureToSurface(featureType, customParams = null) {
    if (!targetSel) { showNotification("Lütfen bir yüzey seçin", "error"); return; }
    
    const mesh = targetSel.mesh;
    const hitNormal = targetSel.normal.clone();
    
    // 1. MERKEZ NOKTAYI BELİRLE
    let smartCenter;
    if (typeof isSurfaceGridActive !== 'undefined' && isSurfaceGridActive) {
        smartCenter = targetSel.point.clone(); 
    } else {
        smartCenter = getSmartSurfaceCenter(mesh, targetSel.point, hitNormal); 
    }

    let params = customParams;
    if (!params) { params = getFeatureParams(featureType); } // Not: getFeatureParams kodda yoksa params zaten yukarıda set ediliyor, burası existing mantığa göre kalabilir.
    // Eğer kodunuzda getFeatureParams yoksa (sizin kodda manuel alınıyor createFeature içinde), burayı dert etmeyin, createFeature zaten params yolluyor.

    saveCheckpoint(); 
    
    try {
        const EXTRA_LEN = 1.0; 
        let tempParams = {...params, depth: (params.depth||10) + EXTRA_LEN};
        
        // 2. GEOMETRİYİ OLUŞTUR
        let featureGeometry;
        
        if (featureType === 'hole') featureGeometry = createHoleGeometry(tempParams);
        else if (featureType === 'boss') featureGeometry = createBossGeometry(params); 
        else if (featureType === 'slot') featureGeometry = createSlotGeometry(tempParams);
        else if (featureType === 'pocket') featureGeometry = createPocketGeometry(tempParams);
        else if (featureType === 'profile') featureGeometry = createProfileGeometry(tempParams);
        // Chamfer ve Fillet geometri oluşturucuları kaldırıldı
        
        if (!featureGeometry) return;

        let finalGeo = featureGeometry;
        if (featureGeometry.isBufferGeometry) finalGeo = new THREE.Geometry().fromBufferGeometry(featureGeometry);

        // 3. MATERYAL VE COLOR AYARLARI
        const featureMaterial = createMaterial();
        
        const isSubtractive = ['hole', 'slot', 'pocket'].includes(featureType) || (featureType === 'profile' && params.direction === 'in');
        
        if (isSubtractive) {
            featureMaterial.color.setHex(0xff0000); // Kırmızı (Kesici)
            featureMaterial.transparent = true;
            featureMaterial.opacity = 0.6;
        } else {
            featureMaterial.color.setHex(0x2563eb); // Mavi (Parça)
            featureMaterial.transparent = false;
            featureMaterial.opacity = 1.0;
        }

        const featureMesh = new THREE.Mesh(finalGeo, featureMaterial);
        
        // 4. KONUMLANDIRMA
        const defaultUp = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, hitNormal);
        const helper = new THREE.Object3D();
        helper.position.copy(smartCenter); 
        helper.quaternion.copy(quaternion);
        
        if (params.offsetX) helper.translateX(params.offsetX);
        if (params.offsetZ) helper.translateZ(params.offsetZ); 
        if (params.rotation) helper.rotateY(THREE.Math.degToRad(params.rotation));

        let moveAmount = 0;
        if (!isSubtractive) {
            moveAmount = params.depth / 2; 
        } else {
            moveAmount = -((params.depth + EXTRA_LEN) / 2) + (EXTRA_LEN / 2);
        }
        
        helper.translateY(moveAmount);
        featureMesh.position.copy(helper.position); 
        featureMesh.quaternion.copy(helper.quaternion);

        // 5. SAHNEYE EKLE
        featureMesh.castShadow = true;
        featureMesh.receiveShadow = true;

        featureMesh.userData = { 
            type: "FEATURE (" + featureType.toUpperCase() + ")", 
            geoParams: params, 
            volume: getMeshVolume(finalGeo),
            id: featureType.toUpperCase() + "-" + Math.floor(Math.random()*1000),
            isFeature: true 
        };

        scene.add(featureMesh);
        objects.push(featureMesh);
        addMeshToTree(featureMesh); 
        
        resetSelection();
        selectObject(featureMesh, null);
        updateSceneTotals();

        showNotification(featureType.toUpperCase() + " bağımsız parça olarak eklendi.", "success");
        
    } catch (error) { 
        console.error("Feature error:", error); 
        showNotification("Hata: " + error.message, "error"); 
    }
}
        
        function createHoleGeometry(params, normal) {
            const radius = params.diameter / 2;
            const height = params.depth;
            const segments = 32;
            
            return new THREE.CylinderGeometry(radius, radius, height, segments);
        }




        
        function createBossGeometry(params, normal) {
            const radius = params.diameter / 2;
            const height = params.depth;
            const segments = 32;
            
            return new THREE.CylinderGeometry(radius, radius, height, segments);
        }
        
        function createSlotGeometry(params, normal) {
            const width = params.width;
            const length = params.length;
            const depth = params.depth;
            
            return new THREE.BoxGeometry(width, depth, length);
        }
        
        function createPocketGeometry(params, normal) {
            const width = Math.max(window.innerWidth - 704, 300);

            const height = Math.max(window.innerHeight - 56, 300);

            const depth = params.depth;
            
            return new THREE.BoxGeometry(width, depth, length);
        }
        
        function createProfileGeometry(params, normal) {
            const size = params.size;
            const depth = params.depth;
            const shapeType = params.shape; // 'shape' değişken adı çakışmasın diye 'shapeType' yaptık
            
            if (shapeType === 'circle') {
                const radius = size / 2;
                return new THREE.CylinderGeometry(radius, radius, depth, 32);
            }
            else if (shapeType === 'rectangle') {
                // BoxGeometry(Width, Height, Depth) -> Bizim sistemde Y ekseni (Height) derinliktir.
                return new THREE.BoxGeometry(size, depth, size);
            }
            else if (shapeType === 'triangle') {
                // Üçgen Şekli Çiz (2D)
                const shape = new THREE.Shape();
                const halfSize = size / 2;
                // Eşkenar üçgen benzeri bir yapı kuralım
                const height2d = size * Math.sqrt(3) / 2; // Üçgen yüksekliği
                
                shape.moveTo(0, height2d / 2);
                shape.lineTo(-halfSize, -height2d / 2);
                shape.lineTo(halfSize, -height2d / 2);
                shape.lineTo(0, height2d / 2);
                
                const extrudeSettings = {
                    depth: depth, // ExtrudeGeometry bunu Z ekseninde yapar!
                    bevelEnabled: false
                };
                
                const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                
                // DÜZELTME: Extrude Z ekseninde oluşur, ama bizim sistem Y eksenini bekler.
                // Bu yüzden geometriyi 90 derece (PI/2) X ekseninde çeviriyoruz.
                geo.rotateX(Math.PI / 2);
                
                // Merkezlemek için (Extrude tabandan başlar, biz merkezden istiyoruz)
                geo.translate(0, -depth / 2, 0);
                
                return geo;
            }
            else if (shapeType === 'hexagon') {
                const radius = size / 2;
                return new THREE.CylinderGeometry(radius, radius, depth, 6);
            }
            
            // Varsayılan (Fallback)
            const radius = size / 2;
            return new THREE.CylinderGeometry(radius, radius, depth, 32);
        }
        
        // Fonksiyon imzasını değiştirdik: params ve originalType eklendi
        function performFeatureCSG(targetMesh, featureMesh, operation, params, originalType) {
            document.getElementById('csg-loading').style.display = 'block';
            
            setTimeout(() => {
                try {
                    if (typeof ThreeBSP === 'undefined') throw new Error("ThreeBSP eksik");

                    // Geometri Hazırlığı (r108)
                    let geomA, geomB;
                    if (targetMesh.geometry.isBufferGeometry) geomA = new THREE.Geometry().fromBufferGeometry(targetMesh.geometry);
                    else geomA = targetMesh.geometry.clone();

                    if (featureMesh.geometry.isBufferGeometry) geomB = new THREE.Geometry().fromBufferGeometry(featureMesh.geometry);
                    else geomB = featureMesh.geometry.clone();
                    
                    const meshA = new THREE.Mesh(geomA);
                    const meshB = new THREE.Mesh(geomB);
                    meshA.applyMatrix(targetMesh.matrixWorld);
                    meshB.applyMatrix(featureMesh.matrixWorld);
                    
                    // BSP İşlemi
                    const bspA = new ThreeBSP(meshA);
                    const bspB = new ThreeBSP(meshB);
                    
                    let bspResult;
                    if (operation === 'hole' || operation === 'pocket' || operation === 'slot') bspResult = bspA.subtract(bspB);
                    else bspResult = bspA.union(bspB);
                    
                    const resultGeo = bspResult.toGeometry();
                    const finalGeo = new THREE.BufferGeometry().fromGeometry(resultGeo);
                    const resultMesh = new THREE.Mesh(finalGeo, targetMesh.material.clone());
                    
                    // Temizlik
                    scene.remove(targetMesh);
                    objects = objects.filter(o => o !== targetMesh);
                    scene.remove(featureMesh); 
                    
                    // Yeni Parça Özellikleri
                    resultMesh.castShadow = true; resultMesh.receiveShadow = true;
                    const newVol = getMeshVolume(resultMesh.geometry);
                    
                    resultMesh.userData = {
                        ...targetMesh.userData,
                        type: targetMesh.userData.type + " + " + operation,
                        volume: newVol,
                        // --- YENİ EKLENEN VERİ: Son İşlem Bilgisi ---
                        lastFeature: {
                            type: originalType || operation, // 'hole', 'slot' vb.
                            params: params || {}             // {diameter: 10, depth: 20...}
                        }
                    };
                    
                    scene.add(resultMesh); objects.push(resultMesh);
                    
                    // Model Ağacı Güncelleme
                    const nodeIndex = modelTree.nodes.findIndex(node => node.meshId === targetMesh.uuid);
                    if (nodeIndex !== -1) {
                        modelTree.nodes[nodeIndex].meshId = resultMesh.uuid;
                        modelTree.nodes[nodeIndex].name = resultMesh.userData.id;
                    }
                    
                    targetSel.mesh = resultMesh;
                    selectObject(resultMesh, null);
                    
                    updateModelTree(); updateSceneTotals(); showNotification("İşlem Başarılı", "success");

                } catch (error) {
                    console.error("CSG error:", error);
                    if(featureMesh) scene.remove(featureMesh);
                    showNotification("Hata: " + error.message, "error");
                } finally { document.getElementById('csg-loading').style.display = 'none'; }
            }, 50);
        }


// --- YENİ AKILLI MERKEZLEME FONKSİYONU ---
        function getSmartSurfaceCenter(mesh, hitPoint, hitNormal) {
            // 1. Hedef Yüzeyin Düzlemini Oluştur
            // Normali ve tıklanan noktayı kullanarak sonsuz bir düzlem tanımlıyoruz
            const plane = new THREE.Plane();
            plane.setFromNormalAndCoplanarPoint(hitNormal, hitPoint);
            
            // 2. Objenin Merkezini Al
            // (Eğer obje döndürülmüş veya taşınmışsa matrixWorld pozisyonunu alır)
            const objectCenter = new THREE.Vector3();
            mesh.getWorldPosition(objectCenter);
            
            // 3. Merkezi Yüzeye İzdüşür (Project)
            // Objenin merkezinden çıkan dikme, yüzey düzlemini nerede kesiyor?
            const projectedCenter = new THREE.Vector3();
            plane.projectPoint(objectCenter, projectedCenter);
            
            return projectedCenter;
        }
        
        // --- TOAST NOTIFICATION ---
        function showNotification(message, type = 'success') {
            const toast = document.getElementById('toast-msg');
            toast.innerHTML = `<span>${type === 'success' ? '✔' : '✖'}</span> ${message}`;
            toast.className = type === 'success' ? 'toast-success' : 'toast-error';
            toast.classList.add('toast-visible');
            setTimeout(() => { toast.classList.remove('toast-visible'); }, 3000);
        }

        // --- GÜNCELLENMİŞ TREE TOGGLE (SOL TARAFA UYUMLU) ---
function toggleModelTree() {
    const container = document.getElementById('model-tree-container');
    container.classList.toggle('collapsed');
    
    // İkon yönünü güncelle
    const icon = document.getElementById('tree-collapse-icon');
    if (container.classList.contains('collapsed')) {
        icon.className = 'fas fa-chevron-down'; // Kapalıyken aşağı ok
    } else {
        icon.className = 'fas fa-chevron-up';   // Açıkken yukarı ok
    }
}
        
        function toggleModelTreeCollapse() {
            toggleModelTree();
        }
        
        function createTreeNode(mesh, parentId = null) {
            const nodeId = 'node-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            const node = {
                id: nodeId,
                meshId: mesh.uuid,
                name: mesh.userData.id || 'Unnamed',
                type: mesh.userData.type || 'Unknown',
                icon: getIconForType(mesh.userData.type),
                parentId: parentId,
                children: [],
                expanded: true
            };
            
            modelTree.nodes.push(node);
            modelTree.expandedNodes.add(nodeId);
            
            return node;
        }
        
        function getIconForType(type) {
            if (type.includes('Cube') || type.includes('Box')) return 'fa-cube';
            if (type.includes('Cylinder')) return 'fa-cylinder';
            if (type.includes('Polygon') || type.includes('Nut')) return 'fa-bolt';
            if (type.includes('Cone')) return 'fa-cone';
            if (type.includes('Sphere')) return 'fa-circle';
            if (type.includes('CSG')) return 'fa-object-group';
            if (type.includes('Imported')) return 'fa-file-import';
            if (type.includes('Hole')) return 'fa-circle-notch';
            if (type.includes('Boss')) return 'fa-plus-circle';
            if (type.includes('Slot')) return 'fa-minus';
            if (type.includes('Pocket')) return 'fa-square';
            return 'fa-shapes';
        }
        
        function updateModelTree() {
            const treeContainer = document.getElementById('model-tree');
            if (objects.length === 0) {
                treeContainer.innerHTML = '<div class="empty-tree">No parts in scene</div>';
                return;
            }
            
            // Clear existing tree
            treeContainer.innerHTML = '';
            
            // Build tree HTML (FLAT LIST for simplicity based on your current code)
            // Mevcut kodunuz düz liste kullanıyor, sağ tık (oncontextmenu) ekliyoruz:
            objects.forEach(obj => {
                const li = document.createElement('li');
                li.className = 'tree-item';
                if (targetSel && targetSel.mesh === obj) li.classList.add('selected');
                
                // SAĞ TIK OLAYI BURADA EKLENİYOR:
                li.oncontextmenu = function(e) {
                    openTreeMenu(e, obj.uuid);
                    return false; 
                };
                
                li.onclick = function(e) {
  FSK.selectShape(index, e.ctrlKey || e.shiftKey);
};

                var _grp = window.snapGroupOf ? window.snapGroupOf(obj.uuid) : null;
                var _grpBadge = _grp ? '<span style="background:#4f46e5;color:#fff;font-size:8px;padding:1px 5px;border-radius:8px;font-weight:900;margin-left:4px;">🔗 G' + (window._snapGroups.indexOf(_grp)+1) + '</span>' : '';
                var _breakBtn = _grp ? '<button onclick="event.stopPropagation();window.snapGroupBreak(\'' + obj.uuid + '\')" style="margin-left:4px;background:#ef4444;color:#fff;border:none;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:900;cursor:pointer;" title="Break connection">✂ BREAK</button>' : '';
                li.innerHTML = `
                    <div class="tree-item-icon"><i class="fas fa-cube"></i></div>
                    <div class="tree-item-text" style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">
                        <span class="tree-item-name">${obj.userData.id}</span>
                        ${_grpBadge}${_breakBtn}
                        <span class="tree-item-type" style="font-size:0.7rem;color:#888;width:100%;">${obj.userData.type}</span>
                    </div>
                `;
                treeContainer.appendChild(li);
            });
        }
        
        function createTreeNodeElement(node) {
            const li = document.createElement('li');
            li.className = 'tree-item';
            li.dataset.nodeId = node.id;
            li.dataset.meshId = node.meshId;
            
            // Check if this node corresponds to the selected mesh
            if (targetSel && targetSel.mesh.uuid === node.meshId) {
                li.classList.add('selected');
            }
            
            // Find the mesh object
            const mesh = objects.find(obj => obj.uuid === node.meshId);
            
            li.innerHTML = `
                <div class="tree-item-icon">
                    <i class="fas ${node.icon}"></i>
                </div>
                <div class="tree-item-text">
                    <div>
                        <span class="tree-item-name">${node.name}</span>
                        <span class="tree-item-type">${node.type}</span>
                    </div>
                    <div class="tree-item-actions">
                        <button class="tree-action-btn" onclick="event.stopPropagation(); focusOnMesh('${node.meshId}')" title="Focus">
                            <i class="fas fa-search"></i>
                        </button>
                        <button class="tree-action-btn" onclick="event.stopPropagation(); selectMeshFromTree('${node.meshId}')" title="Select">
                            <i class="fas fa-mouse-pointer"></i>
                        </button>
                        <button class="tree-action-btn" onclick="event.stopPropagation(); deleteMeshFromTree('${node.meshId}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            
            // Add click event to select the mesh
            li.addEventListener('click', function(e) {
                if (!e.target.classList.contains('tree-action-btn')) {
                    selectMeshFromTree(node.meshId);
                }
            });
            
            // Add children if any
            if (node.children.length > 0 && modelTree.expandedNodes.has(node.id)) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'tree-children';
                
                node.children.forEach(childNode => {
                    const childElement = createTreeNodeElement(modelTree.nodes.find(n => n.id === childNode));
                    childrenContainer.appendChild(childElement);
                });
                
                li.appendChild(childrenContainer);
            }
            
            return li;
        }
        
        function selectMeshFromTree(meshId) {
            const mesh = objects.find(obj => obj.uuid === meshId);
            if (mesh) {
                resetSelection();
                selectObject(mesh, null);
                focusCameraOnMesh(mesh);
                updateModelTree(); // Update tree to show selection
            }
        }
        
        function focusOnMesh(meshId) {
            const mesh = objects.find(obj => obj.uuid === meshId);
            if (mesh) {
                focusCameraOnMesh(mesh);
            }
        }
        
        function focusCameraOnMesh(mesh) {
            // Calculate bounding box of the mesh
            const box = new THREE.Box3().setFromObject(mesh);
            const center = new THREE.Vector3();
            box.getCenter(center);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            // Calculate distance for camera
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov * (Math.PI / 180);
            let cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5;
            
            // Limit distance
            cameraDistance = Math.max(cameraDistance, 10);
            cameraDistance = Math.min(cameraDistance, 1000);
            
            // Position camera
            const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
            camera.position.copy(center).add(direction.multiplyScalar(cameraDistance));
            controls.target.copy(center);
            controls.update();
        }
        
        function deleteMeshFromTree(meshId) {
            const mesh = objects.find(obj => obj.uuid === meshId);
            if (mesh) {
                saveCheckpoint();
                deleteObject(mesh);
                // Remove node from tree
                modelTree.nodes = modelTree.nodes.filter(node => node.meshId !== meshId);
                // Remove references from parent nodes
                modelTree.nodes.forEach(node => {
                    node.children = node.children.filter(childId => {
                        const childNode = modelTree.nodes.find(n => n.id === childId);
                        return childNode && childNode.meshId !== meshId;
                    });
                });
                updateModelTree();
            }
        }
        
        function addMeshToTree(mesh, parentNode = null) {
            const node = createTreeNode(mesh, parentNode ? parentNode.id : null);
            
            if (parentNode) {
                parentNode.children.push(node.id);
            }
            
            // Store node reference in mesh userData
            mesh.userData.treeNodeId = node.id;
            
            updateModelTree();
            return node;
        }
        
        function updateTreeForCSGOperation(resultMesh, meshA, meshB, operation) {
            // Remove nodes for original meshes
            modelTree.nodes = modelTree.nodes.filter(node => 
                node.meshId !== meshA.uuid && node.meshId !== meshB.uuid
            );
            
            // Create new node for result
            const resultNode = addMeshToTree(resultMesh);
            
            // Add child references if we want to keep history
            const nodeA = modelTree.nodes.find(node => node.meshId === meshA.uuid);
            const nodeB = modelTree.nodes.find(node => node.meshId === meshB.uuid);
            
            // Store operation history in result mesh
            resultMesh.userData.csgHistory = {
                operation: operation,
                operandA: meshA.userData.id,
                operandB: meshB.userData.id
            };
        }

        // --- DÜZELTİLMİŞ VE TEMİZLENMİŞ INIT FONKSİYONU ---

// =============================================================================
// INIT FONKSİYONU (FUSION 360 KONTROLLERİ İLE YENİLENDİ)
// =============================================================================



// --- DİNAMİK INPUT HAFIZA REFERANSLARI ---
let startPos = new THREE.Vector3();
let startRot = new THREE.Euler();
let startSca = new THREE.Vector3();

function init() {
    if (typeof window.ThreeBSP !== 'undefined') { ThreeBSP = window.ThreeBSP; }
    
    // --- KRİTİK EKSİK BURADAYDI: ZOOM VE SEÇİM MOTORLARI BAŞLATILDI ---
    raycaster = new THREE.Raycaster();
    window.raycaster = raycaster;
    mouse = new THREE.Vector2();

    scene = new THREE.Scene(); window.scene = scene;
    window.scene = scene;
    window.objects = objects;
    scene.background = new THREE.Color(0x87afc7);
    window._sceneBgColor = scene.background.clone();
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    window.renderer = renderer;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth - 704, window.innerHeight - 56);
    renderer.shadowMap.enabled  = true;
    renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
    renderer.toneMapping        = THREE.ACESFilmicToneMapping;   // cinematic color
    renderer.toneMappingExposure= 1.15;
    renderer.outputEncoding     = THREE.sRGBEncoding;            // gamma correct
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    renderer.localClippingEnabled = true; // <-- BU SATIRI EKLE (Kesit alma için şart)


    const container = document.getElementById('canvas-container');
if (!container) {
    console.error("canvas-container bulunamadı");
    return;
}
    // Append renderer canvas to DOM
    container.appendChild(renderer.domElement);

    // --- ZOOM MOTORUNU BAĞLA ---
    renderer.domElement.addEventListener('wheel', onMouseWheel, { passive: false });

    var mainGridHelper = new THREE.GridHelper(500, 100, 0x999999, 0xe5e7eb);
    mainGridHelper.name = 'MainGrid';
    // ── Invisible ground plane that catches shadows ───────────────
    var groundGeo = new THREE.PlaneGeometry(1000, 1000);
    var groundMat = new THREE.ShadowMaterial({ opacity: 0.18, color: 0x000000 });
    var groundPlane = new THREE.Mesh(groundGeo, groundMat);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.position.y = -0.1;          // just below grid
    groundPlane.receiveShadow = true;
    groundPlane.name = 'ShadowGround';
    scene.add(groundPlane);
    window.shadowGroundPlane = groundPlane;
    scene.add(mainGridHelper);
    scene.add(new THREE.AxesHelper(50));

    camera = new THREE.PerspectiveCamera(45, (window.innerWidth - 768) / (window.innerHeight - 56), 0.1, 50000);
    window.camera = camera;
    camera.position.set(200, 200, 200);
    
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping      = false;   // Damping kapalı → anlık tepki
    controls.dampingFactor      = 0;
    controls.rotateSpeed        = 1.5;
    controls.panSpeed           = 1.5;
    controls.zoomSpeed          = 1.2;
    controls.enableZoom         = false;   // scroll ile zoom ayrı handle ediliyor
    controls.screenSpacePanning = true;    // pan ekranla paralel
    controls.minPolarAngle      = 0;
    controls.maxPolarAngle      = Math.PI * 0.95;  // zeminin altına düşmesin

    transformControl = new THREE.TransformControls(camera, renderer.domElement);
    transformControl.setSize(1.0);
    transformControl.setSpace('local');
    // Live update properties panel during transform
    transformControl.addEventListener('change', function() {
        var _tgt = window.targetSel || (typeof targetSel !== 'undefined' ? targetSel : null);
        if (_tgt && _tgt.mesh && typeof window.updatePropertiesPanel === 'function') {
            window.updatePropertiesPanel(_tgt.mesh);
        }
    });

    const dynInput = document.getElementById('dynamic-input-container');
    const dynVal = document.getElementById('dynamic-value');
    const dynLab = document.getElementById('dynamic-label');
    const dynUnit = document.getElementById('dyn-unit');

    transformControl.addEventListener('dragging-changed', function (event) {
        controls.enabled = !event.value;
        if (event.value && transformControl.object) {
            const obj = transformControl.object;
            startPos.copy(obj.position);
            startRot.copy(obj.rotation);
            startSca.copy(obj.scale);
            // Yeni drag başladı → önceki 20sn timer'ı iptal et
            if (window._dynInputTimer) { clearTimeout(window._dynInputTimer); window._dynInputTimer = null; }
            // Record positions of all objects for snap group delta
            window._snapGroupDragActive = true;
            window._snapGroupDragPrev = obj.position.clone();
            window.snapClearGuides && window.snapClearGuides();
            window._snapGroupDragObj = obj;
            // Snapshot positions of all objects
            window._snapGroupPosSnapshot = {};
            (window.objects || []).forEach(function(o) {
                if (o && o.uuid) window._snapGroupPosSnapshot[o.uuid] = o.position.clone();
            });
        } else {
            window._snapGroupDragActive = false;
            // Commit snap if within SNAP_COMMIT_DIST
            if (transformControl.object && !transformControl.object.userData.isPMI) {
                window.snapCommit(transformControl.object);
            }
            window.snapClearGuides();
            window._snapGroupDragPrev = null;
        }
        // Drag bitti → dynamic input 20 sn sonra gizle
        if (!event.value) {
            var di = document.getElementById('dynamic-input-container');
            if (di && !di.classList.contains('hidden')) {
                if (window._dynInputTimer) clearTimeout(window._dynInputTimer);
                window._dynInputTimer = setTimeout(function() {
                    var d = document.getElementById('dynamic-input-container');
                    if (d) d.classList.add('hidden');
                }, 20000);
            }
        }
    });
    
  transformControl.addEventListener('change', function () {
        
        // ---- YENİ EKLENEN KISIM: ÖLÇÜ (PMI) ÇİZGİLERİNİ ESNETME ----
        if (transformControl.object && transformControl.object.userData.isPMI) {
            if(typeof updateExtensionLines === 'function') {
                updateExtensionLines(transformControl.object);
            }
        }
        // -----------------------------------------------------------

        if (transformControl.object) {
            const obj = transformControl.object;
            const mode = transformControl.getMode();
            const axis = transformControl.axis;

            // ── Ctrl+Drag Copy ──
            if (!obj.userData.isPMI && obj.name !== "SectionHelperPlane") {
                if (typeof checkCtrlCopyStart === 'function') checkCtrlCopyStart(obj);
            }

            // SNAP GROUP: move group + show snap guides
            if (mode === 'translate' && !obj.userData.isPMI) {
                if (window._snapGroupDragActive) window._moveSnapGroup(obj);
                window.snapShowGuides(obj); // show preview lines
            }

            // --- DİNAMİK BİLGİ KUTUSU (Ekranda çıkan küçük X/Y/Z değeri) ---
            if (transformControl.dragging && axis && axis.length === 1 && !obj.userData.isPMI && obj.name !== "SectionHelperPlane") {
                const dynInput = document.getElementById('dynamic-input-container');
                const dynVal = document.getElementById('dynamic-value');
                const dynLab = document.getElementById('dynamic-label');
                const dynUnit = document.getElementById('dyn-unit');

                if (dynInput) {
                    dynInput.classList.remove('hidden');
                    if(dynLab) dynLab.innerText = (typeof _ctrlKeyDown !== 'undefined' && _ctrlKeyDown ? "⎘ " : "Δ") + axis;
                    
                    let displayVal = 0, unitStr = "mm";
                    if (mode === 'translate') displayVal = obj.position[axis.toLowerCase()] - startPos[axis.toLowerCase()];
                    else if (mode === 'rotate') { displayVal = THREE.Math.radToDeg(obj.rotation[axis.toLowerCase()] - startRot[axis.toLowerCase()]); unitStr = "°"; }
                    else if (mode === 'scale') { displayVal = obj.scale[axis.toLowerCase()] - startSca[axis.toLowerCase()]; unitStr = "x"; }
                    
                    if(dynVal) dynVal.value = displayVal.toFixed(2);
                    if(dynUnit) dynUnit.innerText = unitStr;

                    // Transform input is fixed centered at bottom - no repositioning needed
                }
            }

            // --- SAĞ PANEL BİLGİLERİNİ GÜNCELLE ---
            if(typeof updateInfoPanel === 'function' && !obj.userData.isPMI && obj.name !== "SectionHelperPlane") { 
                updateInfoPanel(obj);
            }
        }
    });

    scene.add(transformControl);
    // ─── LIGHTING: No dark side, soft environment ───
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    var hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.8);
    scene.add(hemiLight);
    // ── Main shadow-casting light (top-left diagonal) ──────────────
    var dirLight1 = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight1.position.set(80, 160, 100);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width  = 2048;
    dirLight1.shadow.mapSize.height = 2048;
    dirLight1.shadow.camera.near   = 1;
    dirLight1.shadow.camera.far    = 600;
    dirLight1.shadow.camera.left   = -200;
    dirLight1.shadow.camera.right  =  200;
    dirLight1.shadow.camera.top    =  200;
    dirLight1.shadow.camera.bottom = -200;
    dirLight1.shadow.bias          = -0.001;
    dirLight1.shadow.normalBias    =  0.02;
    scene.add(dirLight1);
    // ── Soft fill lights (no shadow, performance) ───────────────
    var dirLight2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dirLight2.position.set(-60, -40, -80); scene.add(dirLight2);
    var dirLight3 = new THREE.DirectionalLight(0xffffff, 0.2);
    dirLight3.position.set(0, -80, 0); scene.add(dirLight3);

    // ── Studio Environment Map (makes metals reflect) ────────────
    (function buildEnvMap() {
        try {
            // Paint a 512×256 studio-gradient canvas
            var ec = document.createElement('canvas');
            ec.width = 512; ec.height = 256;
            var cx = ec.getContext('2d');

            // Sky gradient (top → bottom)
            var sky = cx.createLinearGradient(0, 0, 0, 256);
            sky.addColorStop(0.00, '#ffffff');
            sky.addColorStop(0.18, '#e8f0ff');
            sky.addColorStop(0.50, '#c8d8f0');
            sky.addColorStop(0.75, '#9aaccc');
            sky.addColorStop(1.00, '#2a3448');
            cx.fillStyle = sky;
            cx.fillRect(0, 0, 512, 256);

            // Key light — top-left bright patch
            var kl = cx.createRadialGradient(100, 50, 5, 100, 50, 90);
            kl.addColorStop(0, 'rgba(255,255,255,0.95)');
            kl.addColorStop(1, 'rgba(255,255,255,0)');
            cx.fillStyle = kl; cx.fillRect(0, 0, 256, 160);

            // Fill light — top-right softer
            var fl = cx.createRadialGradient(400, 60, 5, 400, 60, 80);
            fl.addColorStop(0, 'rgba(220,235,255,0.8)');
            fl.addColorStop(1, 'rgba(220,235,255,0)');
            cx.fillStyle = fl; cx.fillRect(256, 0, 256, 160);

            // Rim light — bottom warm strip
            var rl = cx.createLinearGradient(0, 200, 0, 256);
            rl.addColorStop(0, 'rgba(255,240,200,0)');
            rl.addColorStop(1, 'rgba(255,240,200,0.4)');
            cx.fillStyle = rl; cx.fillRect(0, 180, 512, 76);

            var et = new THREE.CanvasTexture(ec);
            et.mapping = THREE.EquirectangularReflectionMapping;

            if (typeof THREE.PMREMGenerator !== 'undefined') {
                var pmrem = new THREE.PMREMGenerator(renderer);
                pmrem.compileEquirectangularShader();
                var envRT = pmrem.fromEquirectangular(et);
                scene.environment = envRT.texture;
                window._studioEnvMap = envRT.texture;
                et.dispose(); pmrem.dispose();
            } else {
                // fallback: direct mapping
                et.encoding = THREE.sRGBEncoding;
                scene.environment = et;
                window._studioEnvMap = et;
            }
            // Refresh all existing mesh materials with the new env map
            setTimeout(function() {
                var _objs = window.objects || (typeof objects !== 'undefined' ? objects : []);
                _objs.forEach(function(obj) {
                    if (obj && obj.material && obj.material.isMeshStandardMaterial) {
                        obj.material.envMap = window._studioEnvMap;
                        obj.material.needsUpdate = true;
                    }
                });
            }, 200);
        } catch(e) { console.warn('EnvMap build failed:', e); }
    })();
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(100, 200, 100);
    scene.add(dirLight);

    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    

function onKeyUp(event) {
             if (event.key === 'Shift') shiftDown = false;
        }

window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    targetArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 30, 0x10b981);
    targetArrow.visible = false;
    scene.add(targetArrow);
    sourceArrow = new THREE.ArrowHelper(new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,0), 30, 0xf59e0b);
    sourceArrow.visible = false;
    scene.add(sourceArrow);

    if(typeof setupFusionControls === 'function') setupFusionControls();	
    animate();
}

// ── Keyboard handlers (global scope) ──
function onKeyDown(event) {
    // 1. GÜVENLİK KONTROLÜ: Yazı yazarken kısayolları engelle
    // Eğer odaklanılan eleman bir INPUT, TEXTAREA veya SELECT ise işlem yapma.

    const tag = event.target.tagName.toLowerCase();
    const isEditable = event.target.isContentEditable; // Bazı özel editörler için
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || isEditable) {
        return; // Fonksiyonu burada durdur, silme veya taşıma yapma!
    }

// 2. DRAFT STUDIO KİLİDİ: Draft açıksa 3D kısayollarını (Ctrl+Z, Del vb.) durdur!
    if (typeof DS !== 'undefined' && DS.open) return;


    // --- BURADAN SONRASI STANDART KISAYOLLAR ---

    // Shift Tuşu (Tek yönlü scale için)
    if (event.key === 'Shift') shiftDown = true;

    // CTRL + S (Kaydet)
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault(); 
        saveScene(); 
        return; 
    }

    // CTRL + Z (Geri Al)
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        performUndo();
        return;
    }

    // DELETE / BACKSPACE (Toplu Parça Silme)
    if (event.key === 'Delete' || event.key === 'Backspace') { 
        saveCheckpoint(); 
        let deletedCount = 0;
        
        // Önce Çoklu Seçim listesine bak
        if (window.multiSelection && window.multiSelection.length > 0) {
            // Diziyi kopyalayarak dön (silme işlemi diziyi bozmasın diye)
            [...window.multiSelection].forEach(mesh => {
                deleteObject(mesh);
                deletedCount++;
            });
            clearMultiSelection();
        } 
        // Çoklu seçim yoksa tekil hedefe bak
        else if (targetSel && targetSel.mesh) { 
            deleteObject(targetSel.mesh); 
            deletedCount++;
        }
        
        if (deletedCount > 0) {
            showNotification(deletedCount + " adet parça silindi.", "warning");
        }
    }
    
    // Gizmo Araçları (T: Taşı, R: Döndür, S: Ölçekle)
    const key = event.key.toLowerCase();
    
    if (key === 't') setTransformMode('translate');
    if (key === 'r') setTransformMode('rotate');
    
    // Scale (Sadece CTRL basılı değilse, çünkü CTRL+S kaydettir)
    if (key === 's' && !event.ctrlKey && !event.metaKey) {
        setTransformMode('scale');
    }
    
    if (key === 'l') toggleSpace(); // Local/World
}



        // --- GÜNCELLENMİŞ: YAKALAMA NOKTALARI (BOX / PLATE DESTEKLİ) ---
function getCircularFaceCenters(mesh) {
    const centers = [];
    const p = mesh.userData.geoParams || {};
    
    // 1. Parametrik Şekiller
    if (p.shape) {
        if (p.shape === 'box') {
            // --- KÜP / PLAKA İÇİN 6 YÜZEY MERKEZİ ---
            // Genişlik, Yükseklik ve Derinliğin yarısını al (Scale dahil)
            const w = (p.w || 1) * mesh.scale.x / 2;
            const h = (p.h || 1) * mesh.scale.y / 2;
            const d = (p.d || 1) * mesh.scale.z / 2;

            const pos = mesh.position.clone();
            const quat = mesh.quaternion; // Parçanın dönüşünü al

            // Yerel eksen vektörlerini oluştur ve döndür
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).multiplyScalar(w);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).multiplyScalar(h);
            const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).multiplyScalar(d);

            // 6 Yüzeyin merkezini hesapla ve listeye ekle
            centers.push(pos.clone().add(up));    // Üst Merkez
            centers.push(pos.clone().sub(up));    // Alt Merkez
            centers.push(pos.clone().add(right)); // Sağ Merkez
            centers.push(pos.clone().sub(right)); // Sol Merkez
            centers.push(pos.clone().add(fwd));   // Ön Merkez
            centers.push(pos.clone().sub(fwd));   // Arka Merkez
        }
        else if (p.shape === 'cylinder' || p.shape === 'cone' || p.shape === 'polygon') {
            const height = (p.h || 0) * mesh.scale.y;
            const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            const halfHeightVec = direction.clone().multiplyScalar(height / 2);
            
            centers.push(mesh.position.clone().add(halfHeightVec)); // Üst
            centers.push(mesh.position.clone().sub(halfHeightVec)); // Alt
        }
        else if (p.shape === 'sphere') {
            centers.push(mesh.position.clone()); // Tam merkez
        } 

else if (p.shape === 'torus') {
        centers.push(mesh.position.clone()); // Halkanın tam göbeği
    }


else if (p.shape === 'torus') {
        const R = window.evalDim(document.getElementById('edit-r'));
        const t = window.evalDim(document.getElementById('edit-t'));
        newGeo = new THREE.TorusGeometry(R, t, 16, 64);
        newGeo.rotateX(Math.PI / 2); // Yatay durması için
        mesh.userData.geoParams = {shape: 'torus', radius: R, tube: t};
    }


        else if (p.shape === 'sphere_segment') {
            const direction = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            centers.push(mesh.position.clone().add(direction.multiplyScalar(p.height/2)));
        }
// --- BU KISMI EKLEYİN ---
       else if (p.shape === 'truncated_sphere_gen') {
            const h = p.height;
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
            // Lathe geometrisi 0 noktasından +/- h/2 kadar uzanır
            centers.push(mesh.position.clone().add(up.clone().multiplyScalar(h/2))); // Üst
            centers.push(mesh.position.clone().sub(up.clone().multiplyScalar(h/2))); // Alt
        }
        // -------------------------

    }
    // 2. CSG Sonuçları (Parametresiz)
    else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox;
        
        const localCenter = new THREE.Vector3();
        box.getCenter(localCenter);
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Dünya koordinatına çevir
        const worldCenter = localCenter.clone().applyMatrix4(mesh.matrixWorld);
        
        // Tahmini Üst ve Alt noktalar (Y eksenine göre)
        const halfHeight = (size.y * mesh.scale.y) / 2;
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
        
        centers.push(worldCenter.clone().add(up.clone().multiplyScalar(halfHeight))); // Üst
        centers.push(worldCenter.clone().sub(up.clone().multiplyScalar(halfHeight))); // Alt
        centers.push(worldCenter); // Göbek
    }
    
    return centers;
}

        // --- GÜNCELLENMİŞ MAGNET SNAP (KUTULARA YAPIŞMA) ---
function trySnapToCircularFaces(obj) {
    // Auto-snap during drag is disabled (SNAP_THRESHOLD=0)
    // snapShowGuides handles preview; snapCommit handles final placement
    return false;
}

        // --- MEASUREMENT GUIDES ---
        function initMeasurementGuides() {
            measureGroup = new THREE.Group();
            
            // Dashed Line Material
            const dashedMatX = new THREE.LineDashedMaterial({ color: 0xdc2626, dashSize: 2, gapSize: 1 });
            const dashedMatY = new THREE.LineDashedMaterial({ color: 0x16a34a, dashSize: 2, gapSize: 1 });
            const dashedMatZ = new THREE.LineDashedMaterial({ color: 0x2563eb, dashSize: 2, gapSize: 1 });

            // Create Geometry Buffers
            const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,10,0)]);
            
            measureLineY = new THREE.Line(geo.clone(), dashedMatY); // Height
            measureLineZ = new THREE.Line(geo.clone(), dashedMatZ); // Z dist
            measureLineX = new THREE.Line(geo.clone(), dashedMatX); // X dist
            
            measureLineY.computeLineDistances();
            measureLineZ.computeLineDistances();
            measureLineX.computeLineDistances();

            measureGroup.add(measureLineY);
            measureGroup.add(measureLineZ);
            measureGroup.add(measureLineX);
            measureGroup.visible = false;
            scene.add(measureGroup);
        }

        function updateMeasurementGuides(pos) {
            const x = pos.x;
            const y = pos.y;
            const z = pos.z;

            // 1. Height Line (Green): (x,y,z) -> (x,0,z)
            updateLine(measureLineY, pos, new THREE.Vector3(x, 0, z));
            updateLabel('proj-lbl-y', `Y: ${y.toFixed(1)}`, new THREE.Vector3(x, y/2, z));

            // 2. Z Distance Line (Blue): (x,0,z) -> (x,0,0) [Represents Z offset from X-axis]
            updateLine(measureLineZ, new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 0, 0));
            updateLabel('proj-lbl-z', `Z: ${z.toFixed(1)}`, new THREE.Vector3(x, 0, z/2));

            // 3. X Distance Line (Red): (x,0,z) -> (0,0,z) [Represents X offset from Z-axis]
            updateLine(measureLineX, new THREE.Vector3(x, 0, z), new THREE.Vector3(0, 0, z));
            updateLabel('proj-lbl-x', `X: ${x.toFixed(1)}`, new THREE.Vector3(x/2, 0, z));
        }

        function updateLine(line, p1, p2) {
            const positions = line.geometry.attributes.position.array;
            positions[0] = p1.x; positions[1] = p1.y; positions[2] = p1.z;
            positions[3] = p2.x; positions[4] = p2.y; positions[5] = p2.z;
            line.geometry.attributes.position.needsUpdate = true;
            line.computeLineDistances();
        }

        function updateLabel(id, text, worldPos) {
            const el = document.getElementById(id);
            el.innerText = text;
            el.style.display = 'block';
            
            // Project to 2D
            const vec = worldPos.clone();
            vec.project(camera);
            const x = (vec.x * .5 + .5) * window.innerWidth;
            const y = (-(vec.y * .5) + .5) * window.innerHeight;

            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        }

        function hideAxisLabels() {
            document.getElementById('proj-lbl-x').style.display = 'none';
            document.getElementById('proj-lbl-y').style.display = 'none';
            document.getElementById('proj-lbl-z').style.display = 'none';
        }

       function animate() {
    requestAnimationFrame(animate);
    
    if (controls && camera) {
        // Sabit hız - uzay hissi yok
        // controls.rotateSpeed = 0.6; (init'te set edildi, değişmiyor)

        // 2. ÖLÇÜ MARKERLARINI (X) GÜNCELLE
        if (typeof measureLines !== 'undefined') {
            measureLines.forEach(obj => {
                if (obj.isSprite) {
                    const markerDist = camera.position.distanceTo(obj.position);
                    const dynamicScale = markerDist * 0.01; 
                    obj.scale.set(dynamicScale, dynamicScale, 1);
                }
            });
        }

        // --- İPTAL EDİLDİ: SNAP MARKER ÖLÇEKLEME ---
        // (Buradaki kod silindi çünkü snapMarker artık kendi sabit boyutunu kullanıyor)
    }

    if (controls) controls.update();
    // selectionHelper update removed (BoxHelper kaldırıldı)
    if (typeof updateViewCube === 'function') updateViewCube();    
    if (typeof updateGizmoLabels === 'function') updateGizmoLabels(); 
    
    if (renderer && scene && camera) renderer.render(scene, camera);
}
        // --- GELİŞMİŞ EKRAN BOYUTLANDIRMA (RETINA DESTEKLİ) ---
function onWindowResize() {
    var W = window.innerWidth - 768;
    var H = window.innerHeight - 56;
    // 1. Kameranın en-boy oranını güncelle
    camera.aspect = W / H;
    camera.updateProjectionMatrix();

    // 2. Render alanını pencereye tam oturt
    renderer.setSize(W, H);
    
    // 3. MacOS Retina Ekranlar için Keskinlik Ayarı (Pixel Ratio)
    renderer.setPixelRatio(window.devicePixelRatio);

    // 4. Teknik Resim Kamerası varsa onu da güncelle (Eğer açıksa)
    // Orthographic kamera kullanıyorsak onun da oranını düzeltmeliyiz
    const orthoCam = scene.children.find(c => c.isOrthographicCamera);
    if (orthoCam) {
        // Ortho kamera için aspect güncellemesi farklıdır, 
        // ancak teknik resim modülümüz anlık çalıştığı için
        // buraya ekleme yapmaya gerek yok, butona basınca yeniden hesaplıyor.
    }

    // Sahneyi yeniden çiz
    renderer.render(scene, camera);
}

    



        function updateFeedbackTooltip(obj, mode, snapped) {
            const tooltip = document.getElementById('measure-tooltip');
            let text = "";

            if (mode === 'scale') {
                const s = obj.scale;
                const p = obj.userData.geoParams || {};
                let dimX = (p.w || p.r * 2 || p.radius * 2 || 10) * s.x;
                let dimY = (p.h || p.height || p.radius * 2 || 10) * s.y;
                let dimZ = (p.d || p.r * 2 || p.radius * 2 || 10) * s.z;
                text = `SCALE\nX: ${s.x.toFixed(2)}x (${dimX.toFixed(1)}mm)\nY: ${s.y.toFixed(2)}x (${dimY.toFixed(1)}mm)\nZ: ${s.z.toFixed(2)}x (${dimZ.toFixed(1)}mm)`;
            } else if (mode === 'rotate') {
                const rot = obj.rotation;
                const r2d = (rad) => (rad * 180 / Math.PI).toFixed(1);
                text = `ROTATION\nX: ${r2d(rot.x)}°\nY: ${r2d(rot.y)}°\nZ: ${r2d(rot.z)}°`;
            } else if (mode === 'translate') {
                 const pos = obj.position;
                 text = `POSITION\nX: ${pos.x.toFixed(1)}\nY: ${pos.y.toFixed(1)}\nZ: ${pos.z.toFixed(1)}`;
                 if(snapped) text += "\n\n🧲 SNAPPED TO FACE CENTER!";
            }
            tooltip.innerText = text;
        }

        // --- MANUAL CONTROLS ---
        function updateManualControls(mesh) {
            if (!mesh) return;
            const panel = document.getElementById('manual-control-panel');
            panel.classList.remove('hidden');
            
            // Pozisyon
            document.getElementById('control-pos-x').value = mesh.position.x.toFixed(1);
            document.getElementById('control-pos-y').value = mesh.position.y.toFixed(1);
            document.getElementById('control-pos-z').value = mesh.position.z.toFixed(1);
            
            // Rotasyon (Düzeltme: MathUtils yerine Math kullanıldı)
            const rotX = THREE.Math.radToDeg(mesh.rotation.x);
            const rotY = THREE.Math.radToDeg(mesh.rotation.y);
            const rotZ = THREE.Math.radToDeg(mesh.rotation.z);
            
            document.getElementById('control-rot-x').value = rotX.toFixed(1);
            document.getElementById('control-rot-y').value = rotY.toFixed(1);
            document.getElementById('control-rot-z').value = rotZ.toFixed(1);

            // Ölçek
            document.getElementById('control-scale-x').value = mesh.scale.x.toFixed(2);
            document.getElementById('control-scale-y').value = mesh.scale.y.toFixed(2);
            document.getElementById('control-scale-z').value = mesh.scale.z.toFixed(2);
        }

        function applyManualPosition() {
            if (!targetSel) return;
            saveCheckpoint();
            
            const mesh = targetSel.mesh;
            const x = window.evalDim(document.getElementById('control-pos-x'));
            const y = window.evalDim(document.getElementById('control-pos-y'));
            const z = window.evalDim(document.getElementById('control-pos-z'));
            
            mesh.position.set(x, y, z);
            transformControl.update();
            updateInfoPanel(mesh);
            updateSceneTotals();
        }

        function applyManualRotation() {
            if (!targetSel) return;
            saveCheckpoint();
            
            const mesh = targetSel.mesh;
            
            // Düzeltme: MathUtils yerine Math kullanıldı
            const x = THREE.Math.degToRad(window.evalDim(document.getElementById('control-rot-x')));
            const y = THREE.Math.degToRad(window.evalDim(document.getElementById('control-rot-y')));
            const z = THREE.Math.degToRad(window.evalDim(document.getElementById('control-rot-z')));
            
            mesh.rotation.set(x, y, z);
            transformControl.update();
            updateInfoPanel(mesh);
        }

        function applyManualScale() {
            if (!targetSel) return;
            saveCheckpoint();
            
            const mesh = targetSel.mesh;
            const x = window.evalDim(document.getElementById('control-scale-x'));
            const y = window.evalDim(document.getElementById('control-scale-y'));
            const z = window.evalDim(document.getElementById('control-scale-z'));
            
            mesh.scale.set(x, y, z);
            transformControl.update();
            updateInfoPanel(mesh);
            updateSceneTotals();
        }

        function applyAllManualControls() {
            applyManualPosition();
            applyManualRotation();
            applyManualScale();
            showNotification("All manual controls applied", "success");
        }

        function resetManualControls() {
            if (!targetSel) return;
            
            const mesh = targetSel.mesh;
            mesh.position.set(0, 0, 0);
            mesh.rotation.set(0, 0, 0);
            mesh.scale.set(1, 1, 1);
            
            transformControl.update();
            updateManualControls(mesh);
            updateInfoPanel(mesh);
            updateSceneTotals();
            showNotification("Controls reset to default", "success");
        }

      // =============================================================================
// GÜNCEL GEOMETRİ GÜNCELLEME (HEPSİ BİR ARADA)
// =============================================================================
window.updateSelectedGeometry = function() {
    if (!targetSel) return;
    const mesh = targetSel.mesh;
    const p = mesh.userData.geoParams;
    if (!p) return;

    saveCheckpoint();

    // Helper: how many segments for a given dimension (mm)
    // Unit = 10mm per segment, min 2, max 20
    function segsFor(mm) { return Math.min(20, Math.max(2, Math.ceil(Math.abs(mm) / 10))); }
    // Radial segments for circular shapes
    var radSegs = 64;
    try { if(window.getMeshSegs) radSegs = window.getMeshSegs() || 64; } catch(e){}

    let newGeo;

    if (p.shape === 'box') {
        const w = window.evalDim(document.getElementById('edit-w'));
        const h = window.evalDim(document.getElementById('edit-h'));
        const d = window.evalDim(document.getElementById('edit-d'));
        // Subdivide EACH dimension independently
        const ws = segsFor(w), hs = segsFor(h), ds = segsFor(d);
        newGeo = new THREE.BoxGeometry(w, h, d, ws, hs, ds);
        mesh.userData.geoParams = {shape:'box', w, h, d};

    } else if (p.shape === 'cylinder') {
        const d = window.evalDim(document.getElementById('edit-d')) || (p.r*2) || 40;
        const h = window.evalDim(document.getElementById('edit-h')) || p.h || 50;
        const r = d / 2;
        const hSegs = segsFor(h); // height subdivisions
        newGeo = new THREE.CylinderGeometry(r, r, h, radSegs, hSegs);
        mesh.userData.geoParams = {shape:'cylinder', r, h};

    } else if (p.shape === 'sphere') {
        const d = window.evalDim(document.getElementById('edit-d'));
        const segs = Math.max(24, Math.min(64, Math.ceil(d/2)));
        newGeo = new THREE.SphereGeometry(d/2, segs, segs);
        mesh.userData.geoParams = {shape:'sphere', radius:d/2};

    } else if (p.shape === 'cone') {
        const d1 = window.evalDim(document.getElementById('edit-d1'));
        const d2 = window.evalDim(document.getElementById('edit-d2'));
        const h  = window.evalDim(document.getElementById('edit-h'));
        const hSegs = segsFor(h);
        newGeo = new THREE.CylinderGeometry(d1/2, d2/2, h, radSegs, hSegs);
        mesh.userData.geoParams = {shape:'cone', r1:d1/2, r2:d2/2, h};

    } else if (p.shape === 'polygon') {
        const sw = window.evalDim(document.getElementById('edit-sw'));
        const s  = Math.round(window.evalDim(document.getElementById('edit-s')));
        const h  = window.evalDim(document.getElementById('edit-h'));
        const r  = (sw/2) / Math.cos(Math.PI/s);
        const hSegs = segsFor(h);
        newGeo = new THREE.CylinderGeometry(r, r, h, s, hSegs);
        mesh.userData.geoParams = {shape:'polygon', sw, r, h, s};

    } else if (p.shape === 'square_prism') {
        const botW = window.evalDim(document.getElementById('sq-bot'));
        const topW = window.evalDim(document.getElementById('sq-top'));
        let h = window.evalDim(document.getElementById('sq-h'));
        const angle = window.evalDim(document.getElementById('sq-angle')) || 0;
        if (angle > 0 && angle < 90 && Math.abs(botW-topW) > 0.1) {
            h = (Math.abs(botW-topW)/2) / Math.tan(angle*(Math.PI/180));
            document.getElementById('sq-h').value = h.toFixed(2);
        }
        const hSegs = segsFor(h);
        newGeo = new THREE.CylinderGeometry(topW/Math.sqrt(2), botW/Math.sqrt(2), h, 4, hSegs);
        newGeo.rotateY(Math.PI/4);
        mesh.userData.geoParams = {shape:'square_prism', topW, botW, height:h, angle};

    } else if (p.shape === 'torus_custom') {
        const od = window.evalDim(document.getElementById('edit-od')) || p.od;
        const id2 = window.evalDim(document.getElementById('edit-id-val')) || p.id;
        const tubeR = (od-id2)/4;
        const mainR = (od/2)-tubeR;
        newGeo = new THREE.TorusGeometry(mainR, tubeR, 48, 80);
        newGeo.rotateX(Math.PI/2);
        mesh.userData.geoParams = {...p, od, id:id2};

    } else if (p.shape === 'truncated_sphere_gen') {
        const topDia = window.evalDim(document.getElementById('edit-td'));
        const botDia = window.evalDim(document.getElementById('edit-bd'));
        const height = window.evalDim(document.getElementById('edit-h'));
        if (typeof generateLatheTruncatedSphere === 'function') {
            const res = generateLatheTruncatedSphere(topDia, botDia, height);
            if (res) { newGeo = res.geometry; mesh.userData.geoParams = {shape:'truncated_sphere_gen',topDia,botDia,height,calcR:res.R}; }
        }
    }

    if (newGeo) {
        if (newGeo.isBufferGeometry) {
            newGeo.computeVertexNormals();
        } else {
            newGeo.computeVertexNormals ? newGeo.computeVertexNormals() : null;
            newGeo.computeFaceNormals  ? newGeo.computeFaceNormals()   : null;
        }
        mesh.geometry.dispose();
        mesh.geometry = newGeo;
        mesh.userData.volume = getMeshVolume(newGeo);
        mesh.scale.set(1,1,1);
        updateInfoPanel(mesh);
        if (typeof updateManualControls === 'function') updateManualControls(mesh);
        if (typeof updateSceneTotals   === 'function') updateSceneTotals();
        showNotification('Part updated with ' + (newGeo.attributes && newGeo.attributes.position ? newGeo.attributes.position.count + ' verts' : 'new mesh'), 'success');
    }
};



        // --- GIZMO MODES & SNAP ---
        function setTransformMode(mode) {
            transformControl.setMode(mode);
            
            const modes = ['trans', 'rotate', 'scale'];
            const modeMap = { 'trans': 'translate', 'rotate': 'rotate', 'scale': 'scale' };
            
            modes.forEach(m => {
                const btn = document.getElementById('btn-' + m);
                if (modeMap[m] === mode) {
                    btn.classList.add('active-mode');
                    btn.classList.remove('text-gray-600');
                } else {
                    btn.classList.remove('active-mode');
                    btn.classList.add('text-gray-600');
                }
            });
        }

        function toggleSpace() {
            const btn = document.getElementById('btn-space');
            if (transformControl.space === 'world') {
                transformControl.setSpace('local');
                btn.innerText = "LOCAL";
                btn.classList.add('active-space');
                btn.classList.remove('text-gray-500');
            } else {
                transformControl.setSpace('world');
                btn.innerText = "WORLD";
                btn.classList.remove('active-space');
                btn.classList.add('text-gray-500');
            }
        }

        function toggleSnap() {
            snapEnabled = !snapEnabled;
            const btn = document.getElementById('btn-snap');
            if (snapEnabled) {
                btn.classList.add('active-snap');
                btn.classList.remove('text-gray-500');
                btn.innerHTML = "<span>🧲</span> ON";
            } else {
                btn.classList.remove('active-snap');
                btn.classList.add('text-gray-500');
                btn.innerHTML = "<span>🧲</span> OFF";
            }
        }

        // --- BACKGROUND COLOR ---
        function updateBackgroundColor(hex) {
            scene.background = new THREE.Color(hex);
        }

        // --- PART COLOR ---
        function updatePartColor(hex) {
            if(targetSel) {
                targetSel.mesh.material.color.set(hex);
                targetSel.mesh.userData.originalColor = parseInt(hex.replace('#','0x'), 16);
            }
        }

        // --- SURFACE AREA CALCULATION ---
        // --- GÜVENLİ ALAN HESAPLAMA (CRASH FIX) ---
function getSurfaceArea(mesh) {
    if (!mesh || !mesh.geometry) return 0;
    
    const geometry = mesh.geometry;
    let area = 0;

    if (geometry.isBufferGeometry) {
        // HATA KORUMASI
        if (!geometry.attributes || !geometry.attributes.position) return 0;

        const pos = geometry.attributes.position;
        const index = geometry.index;
        const count = index ? index.count : pos.count;
        
        const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();
        const ab = new THREE.Vector3(), ac = new THREE.Vector3();

        // Helper
        function getPoint(i, target) {
            target.fromBufferAttribute(pos, i);
            target.multiply(mesh.scale); // Scale'i hesaba kat
        }

        for (let i = 0; i < count; i += 3) {
            try {
                if (index) {
                    getPoint(index.getX(i), p1);
                    getPoint(index.getX(i+1), p2);
                    getPoint(index.getX(i+2), p3);
                } else {
                    getPoint(i, p1);
                    getPoint(i+1, p2);
                    getPoint(i+2, p3);
                }
                ab.subVectors(p2, p1);
                ac.subVectors(p3, p1);
                ab.cross(ac);
                area += 0.5 * ab.length();
            } catch (e) { continue; } // Hata olursa o yüzeyi atla
        }
    } 
    else if (geometry.faces && geometry.vertices) {
        const ab = new THREE.Vector3(), ac = new THREE.Vector3();
        for (let i = 0; i < geometry.faces.length; i++) {
            const face = geometry.faces[i];
            const p1 = geometry.vertices[face.a].clone().multiply(mesh.scale);
            const p2 = geometry.vertices[face.b].clone().multiply(mesh.scale);
            const p3 = geometry.vertices[face.c].clone().multiply(mesh.scale);
            ab.subVectors(p2, p1);
            ac.subVectors(p3, p1);
            ab.cross(ac);
            area += 0.5 * ab.length();
        }
    }
    
    return area;
}

        // --- IMPORT / EXPORT STL ---
    // --- DÜZELTİLMİŞ STL EXPORT (Sadece Parçalar) ---
        // --- OBJ EXPORT FONKSİYONU ---
        function exportOBJ() {
            if (objects.length === 0) { 
                showMsg("Dışarı aktarılacak parça yok!", "error"); 
                return; 
            }
            
            // 1. Temiz bir grup oluştur (Grid ve okları dahil etmemek için)
            const exportGroup = new THREE.Group();
            
            // 2. Sadece çizim parçalarını bu gruba kopyala
            objects.forEach(obj => {
                const clone = obj.clone();
                // Parçanın sahnedeki konumunu ve duruşunu kopyala
                clone.applyMatrix(obj.matrixWorld); 
                exportGroup.add(clone);
            });

            // 3. OBJ Formatına Çevir
            const exporter = new THREE.OBJExporter();
            const result = exporter.parse(exportGroup);
            
            // 4. Dosyayı İndir
            const blob = new Blob([result], { type: 'text/plain' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'ezel_tasarim.obj';
            link.click();
            
            showMsg("OBJ dosyası başarıyla oluşturuldu.", "success");
        }

        function exportSTL(mode) {
            if (!objects || objects.length === 0) {
                showMsg('Dışarı aktarılacak parça yok!', 'error');
                return;
            }
            mode = mode || 'binary';

            /* Collect all meshes with world transform */
            var meshes = [];
            objects.forEach(function(obj) {
                obj.traverse(function(child) {
                    if (child.isMesh && child.geometry) {
                        meshes.push(child);
                    }
                });
            });
            if (meshes.length === 0) {
                showMsg('Dışarı aktarılacak mesh bulunamadı!', 'error');
                return;
            }

            /* Merge all geometries into triangles */
            var triangles = [];
            meshes.forEach(function(mesh) {
                mesh.updateMatrixWorld(true);
                var geo = mesh.geometry;
                var pos = geo.attributes.position;
                var idx = geo.index;
                var mw  = mesh.matrixWorld;
                var nmat = new THREE.Matrix3().getNormalMatrix(mw);
                var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
                var nrm = new THREE.Vector3();

                function pushTri(ia, ib, ic) {
                    vA.fromBufferAttribute(pos, ia).applyMatrix4(mw);
                    vB.fromBufferAttribute(pos, ib).applyMatrix4(mw);
                    vC.fromBufferAttribute(pos, ic).applyMatrix4(mw);
                    var edge1 = new THREE.Vector3().subVectors(vB, vA);
                    var edge2 = new THREE.Vector3().subVectors(vC, vA);
                    nrm.crossVectors(edge1, edge2).normalize();
                    triangles.push({
                        n: [nrm.x, nrm.y, nrm.z],
                        a: [vA.x, vA.y, vA.z],
                        b: [vB.x, vB.y, vB.z],
                        c: [vC.x, vC.y, vC.z]
                    });
                }

                if (idx) {
                    for (var i = 0; i < idx.count; i += 3)
                        pushTri(idx.getX(i), idx.getX(i+1), idx.getX(i+2));
                } else {
                    for (var i = 0; i < pos.count; i += 3)
                        pushTri(i, i+1, i+2);
                }
            });

            var blob, filename;

            if (mode === 'binary') {
                /* ── Binary STL ── */
                var buf = new ArrayBuffer(84 + triangles.length * 50);
                var view = new DataView(buf);
                /* 80-byte header */
                var header = 'EZELStudio STL Export';
                for (var i = 0; i < 80; i++)
                    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
                view.setUint32(80, triangles.length, true);
                var off = 84;
                triangles.forEach(function(tri) {
                    view.setFloat32(off,    tri.n[0], true); off += 4;
                    view.setFloat32(off,    tri.n[1], true); off += 4;
                    view.setFloat32(off,    tri.n[2], true); off += 4;
                    view.setFloat32(off,    tri.a[0], true); off += 4;
                    view.setFloat32(off,    tri.a[1], true); off += 4;
                    view.setFloat32(off,    tri.a[2], true); off += 4;
                    view.setFloat32(off,    tri.b[0], true); off += 4;
                    view.setFloat32(off,    tri.b[1], true); off += 4;
                    view.setFloat32(off,    tri.b[2], true); off += 4;
                    view.setFloat32(off,    tri.c[0], true); off += 4;
                    view.setFloat32(off,    tri.c[1], true); off += 4;
                    view.setFloat32(off,    tri.c[2], true); off += 4;
                    view.setUint16(off, 0, true); off += 2; /* attribute byte count */
                });
                blob = new Blob([buf], { type: 'application/octet-stream' });
                filename = 'ezel_tasarim.stl';

            } else {
                /* ── ASCII STL ── */
                var lines = ['solid EZELStudio'];
                triangles.forEach(function(tri) {
                    lines.push('  facet normal ' + tri.n[0].toFixed(6) + ' ' + tri.n[1].toFixed(6) + ' ' + tri.n[2].toFixed(6));
                    lines.push('    outer loop');
                    lines.push('      vertex ' + tri.a[0].toFixed(6) + ' ' + tri.a[1].toFixed(6) + ' ' + tri.a[2].toFixed(6));
                    lines.push('      vertex ' + tri.b[0].toFixed(6) + ' ' + tri.b[1].toFixed(6) + ' ' + tri.b[2].toFixed(6));
                    lines.push('      vertex ' + tri.c[0].toFixed(6) + ' ' + tri.c[1].toFixed(6) + ' ' + tri.c[2].toFixed(6));
                    lines.push('    endloop');
                    lines.push('  endfacet');
                });
                lines.push('endsolid EZELStudio');
                blob = new Blob([lines.join('\n')], { type: 'text/plain' });
                filename = 'ezel_tasarim_ascii.stl';
            }

            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            setTimeout(function() { URL.revokeObjectURL(link.href); }, 5000);
            showMsg('STL (' + mode + ') başarıyla dışa aktarıldı — ' + triangles.length + ' üçgen.', 'success');
        }

        // --- GÜVENLİ VOLUME HESAPLAMA (CRASH FIX) ---
function getMeshVolume(geometry) {
    if (!geometry) return 0;
    let sum = 0;

    if (geometry.isBufferGeometry) {
        if (!geometry.attributes || !geometry.attributes.position || !geometry.attributes.position.array) return 0;
        const pos = geometry.attributes.position;
        const idx = geometry.index;
        const p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();

        if (idx) {
            // Indexed geometry
            for (let i = 0; i < idx.count; i += 3) {
                p1.fromBufferAttribute(pos, idx.getX(i));
                p2.fromBufferAttribute(pos, idx.getX(i+1));
                p3.fromBufferAttribute(pos, idx.getX(i+2));
                sum += p1.dot(p2.clone().cross(p3)) / 6.0;
            }
        } else {
            // Non-indexed
            const faces = Math.floor(pos.count / 3);
            for (let i = 0; i < faces; i++) {
                p1.fromBufferAttribute(pos, i*3);
                p2.fromBufferAttribute(pos, i*3+1);
                p3.fromBufferAttribute(pos, i*3+2);
                sum += p1.dot(p2.clone().cross(p3)) / 6.0;
            }
        }
    } 
    else if (geometry.faces && geometry.vertices) {
        for (let i = 0; i < geometry.faces.length; i++) {
            const face = geometry.faces[i];
            const p1 = geometry.vertices[face.a];
            const p2 = geometry.vertices[face.b];
            const p3 = geometry.vertices[face.c];
            sum += p1.dot(p2.clone().cross(p3)) / 6.0;
        }
    }
    return Math.abs(sum);
}
       
// ─────────────────────────────────────────────────────────────
// YENİ DEFAULT MATERIAL — Çok Daha Mat, Yumuşak ve CAD Tarzı
// ─────────────────────────────────────────────────────────────
window.createMaterial = function(customColor) {
    var color = customColor || 0x8a9bb0;
    return new THREE.MeshStandardMaterial({
        color:           color,
        metalness:       0.12,
        roughness:       0.72,
        envMap:          window._studioEnvMap || null,
        envMapIntensity: 0.35,
        side:            THREE.DoubleSide,
        flatShading:     false
    });
};

        // --- GÜNCELLENMİŞ: PARÇA EKLEME (GRID SNAP DESTEKLİ) ---

function addMesh(mesh, type, vol, params) {
    saveCheckpoint();
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // --- GRID KONTROLÜ: Eğer Grid Açıksa ve Nokta Belliyse Oraya Koy ---
    if (typeof isSurfaceGridActive !== 'undefined' && isSurfaceGridActive && snapMarker && snapMarker.visible) {
        
        // 1. Pozisyonu Kırmızı Noktaya (Snap Marker) Taşı
        mesh.position.copy(snapMarker.position);

        // 2. Açıyı Yüzeyin Açısına (Grid Helper'a) Eşitle
        if (surfaceGridHelper) {
            mesh.quaternion.copy(surfaceGridHelper.quaternion);
        }

        // 3. Parçayı Yüzeye "Gömülmekten" Kurtar (Tabanı Yüzeye Oturt)
        // Three.js'de objelerin merkezi (pivot) genelde ortadadır.
        // Bu yüzden yüksekliğin yarısı kadar "Yerel Yukarı (Y)" yönünde kaldırmalıyız.
        
        let heightOffset = 0;

        if (params.h) {
            heightOffset = params.h / 2; // Küp, Silindir, Koni, Poligon
        } 
        else if (params.height) {
            heightOffset = params.height / 2; // Sphere Segment
        } 
        else if (params.radius && params.shape === 'sphere') {
            heightOffset = params.radius; // Küre (Yarıçap kadar kalkmalı)
        }

        // Parçanın kendi Y ekseni yönünde (Normal yönü) öteleme yap
        const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
        mesh.position.add(localUp.multiplyScalar(heightOffset));

        showNotification(type + " işaretli noktaya yerleştirildi.", "success");
    } 
    else {
        // --- NORMAL MOD: RASTGELE KONUM ---
        if (params.shape === 'sphere') {
            mesh.position.y = params.radius;
        } else if (params.shape === 'sphere_segment') {
            mesh.position.y = params.height / 2;
        } else {
            mesh.position.y = params.h ? params.h/2 : 10;
        }
        
        mesh.position.x = (Math.random() - 0.5) * 50;
        mesh.position.z = (Math.random() - 0.5) * 50;
    }

const isCircular = params && ['cylinder', 'sphere', 'truncated_sphere_gen', 'cone'].includes(params.shape);
if (isCircular) {
    const axisMaterial = new THREE.LineDashedMaterial({ 
        color: 0xff0000, 
        dashSize: 2, 
        gapSize: 2, 
        depthTest: false 
    });
    
    let h = (params.h || params.height || params.radius * 2 || 20);
    const axisPoints = [];
    axisPoints.push(new THREE.Vector3(0, -h/2 - 5, 0)); // Alt taraftan 5mm taşsın
    axisPoints.push(new THREE.Vector3(0, h/2 + 5, 0));  // Üst taraftan 5mm taşsın
    
    const axisGeo = new THREE.BufferGeometry().setFromPoints(axisPoints);
    const axisLine = new THREE.Line(axisGeo, axisMaterial);
    axisLine.computeLineDistances();
    axisLine.name = "CenterAxis";
    
    mesh.add(axisLine); // Ekseni parçaya bağla (Parça hareket edince eksen de gider)
}

    // --- STANDART PROPERTIES ---
    // Default: steel material
    var _steelMat = (typeof MATS !== 'undefined' && MATS.metal) ? MATS.metal : null;
    if (_steelMat) {
        mesh.material.color.setHex(_steelMat.color);
        if (mesh.material.metalness !== undefined) mesh.material.metalness = _steelMat.metalness;
        if (mesh.material.roughness !== undefined) mesh.material.roughness = _steelMat.roughness;
        mesh.userData.material = 'metal';
        mesh.userData.density  = _steelMat.density;
    } else {
        mesh.material.color.setHex(0xaab0b8); // steel grey fallback
    }

    mesh.userData.type = type;
    mesh.userData.volume = vol;
    mesh.userData.id = "PRT-" + Math.floor(Math.random()*1000).toString().padStart(3, '0');
    mesh.userData.geoParams = params;
    mesh.userData.originalColor = mesh.material.color.getHex();
    
    scene.add(mesh);
    objects.push(mesh);
    
    // Model Ağacına Ekle
    addMeshToTree(mesh);
    
    // Seçimi Yeni Parçaya Getir
    resetSelection();
    selectObject(mesh, null);
    updateSceneTotals();
}
// =========================================================
// HALKA (TORUS/RING) EKLEME FONKSİYONU
// =========================================================
function addTorus() {
    // Değerleri kutulardan al
    const R = window.evalDim(document.getElementById('torus-r')) || 20; // Ana Yarıçap
    const t = window.evalDim(document.getElementById('torus-t')) || 5;  // Kalınlık (Et)

    // Geometriyi Oluştur (16 radyal, 64 tübüler segment - pürüzsüz)
    const geo = new THREE.TorusGeometry(R, t, 16, 64);
    
    // Yatay durması için X ekseninde 90 derece çevir
    geo.rotateX(Math.PI / 2);

    // Hacim Hesabı: V = (π * r^2) * (2 * π * R)
    const vol = (Math.PI * t * t) * (2 * Math.PI * R);

    // Sahneye Ekle
    addMesh(new THREE.Mesh(geo, createMaterial()), "Ring / Torus", vol, {
        shape: 'torus', 
        radius: R, 
        tube: t
    });
}
        function addCube() {
    // 1. Değerleri al, input okunamıyorsa varsayılan boyutlar ata
    const w = window.evalDim(document.getElementById('cube-w')) || 50;
    const h = window.evalDim(document.getElementById('cube-h')) || 10;
    const d = window.evalDim(document.getElementById('cube-d')) || 50;

    // 2. Çökmeyi önlemek için Mesh segmentini güvenli (try-catch) şekilde al
    let _q = 16;
    try {
        if (window.getMeshSegs) _q = window.getMeshSegs() || 16;
    } catch(e) {
        _q = 16; // Hata verirse varsayılan olarak 16 segment kullan
    }
    
    // 3. Segment sayıları Three.js'de her zaman tam sayı (integer) olmalıdır
    // Dimension-based segments: more subdivisions for larger parts
    const wseg = Math.min(20, Math.max(2, Math.ceil(w / 10)));
    const hseg = Math.min(20, Math.max(2, Math.ceil(h / 10)));
    const dseg = Math.min(20, Math.max(2, Math.ceil(d / 10)));

    const geo = new THREE.BoxGeometry(w, h, d, wseg, hseg, dseg);
    addMesh(new THREE.Mesh(geo, createMaterial()), "Cube", w * h * d, {shape: 'box', w, h, d});
}

        // =============================================================================
// GÜNCEL DELETEİNDİR EKLEME (PÜRÜZSÜZ - 64 SEGMENT)
// =============================================================================
function addCylinder() {
    const diameter = window.evalDim(document.getElementById('cyl-dia'));
    const h = window.evalDim(document.getElementById('cyl-h'));
    const r = diameter / 2; 
    
    // Son parametre 32'den 64'e çıkarıldı: Daha pürüzsüz yüzey sağlar
    const geo = new THREE.CylinderGeometry(r, r, h, 64, Math.min(20, Math.max(2, Math.ceil(h/10))));
    
    addMesh(new THREE.Mesh(geo, createMaterial()), "Cylinder", Math.PI*r*r*h, {shape:'cylinder', r, h});
}
        
        function addPolygon() {
            const sw = window.evalDim(document.getElementById('poly-sw'));
            const s = Math.round(window.evalDim(document.getElementById('poly-s')));
            const h = window.evalDim(document.getElementById('poly-h'));
            
            // Calculate Radius (circumradius) from SW (diameter of inscribed circle)
            const r = (sw / 2) / Math.cos(Math.PI / s);
            const geo = new THREE.CylinderGeometry(r, r, h, s);
            
            // DÜZELTİLMİŞ VOLUME HESABI
            const apothem = r * Math.cos(Math.PI / s); // iç yarıçap
            const sideLength = 2 * r * Math.sin(Math.PI / s);
            const perimeter = s * sideLength;
            const baseArea = (perimeter * apothem) / 2;
            const vol = baseArea * h;
            
            addMesh(new THREE.Mesh(geo, createMaterial()), "Polygon", vol, {shape:'polygon', sw, r, h, s});
        }

        function addCone() {
    const d1 = window.evalDim(document.getElementById('cone-d1'));
    const d2 = window.evalDim(document.getElementById('cone-d2'));
    const h = window.evalDim(document.getElementById('cone-h'));
    const r1 = d1 / 2;
    const r2 = d2 / 2;
    
    // 32 -> 64 yapıldı.
    const geo = new THREE.CylinderGeometry(r1, r2, h, 64);
    const vol = (1/3) * Math.PI * h * (r1*r1 + r2*r2 + r1*r2);
    addMesh(new THREE.Mesh(geo, createMaterial()), "Cone", vol, {shape:'cone', r1, r2, h});
}

      function addSphere() {
    // 1. Çapı al, okunamıyorsa varsayılan 40 ata
    const diameter = window.evalDim(document.getElementById('sphere-d')) || 40;
    const radius = diameter / 2;

    // 2. Çökmeyi önlemek için Mesh segmentini güvenli (try-catch) şekilde al
    let _q = 32;
    try {
        if (window.getMeshSegs) _q = window.getMeshSegs() || 32;
    } catch(e) {
        _q = 32;
    }
    
    // 3. Kürenin yüzeyinde çok fazla kareleşme olmaması için en az 32 kullan
    const segs = Math.max(32, _q);

    const geo = new THREE.SphereGeometry(radius, segs, segs);
    const vol = (4 / 3) * Math.PI * Math.pow(radius, 3);
    addMesh(new THREE.Mesh(geo, createMaterial()), "Sphere", vol, {shape: 'sphere', radius});
}

        

        // --- EDIT LOGIC ---
       // =============================================================================
// GÜNCEL EDİT PANELİ (TÜM PARÇALAR + DUPLICATEMA BUTONU)
// =============================================================================
window.populateEditPanel = function(mesh) {
    const p = mesh.userData.geoParams; 
    const lastFeat = mesh.userData.lastFeature;
    const container = document.getElementById('edit-inputs');
    const panel = document.getElementById('edit-panel');
    
    // Güvenlik kontrolü
    if (!container || !panel) return;

    // 1. PANELİ GÖRÜNÜR YAP
    panel.classList.remove('hidden');
    
    // Başlık ve Renk
    document.getElementById('edit-id').innerText = mesh.userData.id;
    if(mesh.material && mesh.material.color) {
        document.getElementById('part-color-picker').value = '#' + mesh.material.color.getHexString();
    }
    
    container.innerHTML = '';

    // 2. PARAMETRELERİ OLUŞTUR (Tüm Şekiller İçin)
    if (p && p.shape) {
        // KÜP / LEVHA
        if (p.shape === 'box') { 
            container.innerHTML += createInputRow('Width (W)', 'edit-w', p.w);
            container.innerHTML += createInputRow('Height (H)', 'edit-h', p.h);
            container.innerHTML += createInputRow('Deep (D)', 'edit-d', p.d);
        }
        // DELETEİNDİR
        else if (p.shape === 'cylinder') { 
            container.innerHTML += createInputRow('Dia (Ø)', 'edit-d', p.r * 2);
            container.innerHTML += createInputRow('Length (L)', 'edit-h', p.h);
        }
        // KARE PRİZMA (YENİ)
        else if (p.shape === 'square_prism') {
            container.innerHTML += createInputRow('Taban', 'sq-bot', p.botW);
            container.innerHTML += createInputRow('Tavan', 'sq-top', p.topW);
            container.innerHTML += createInputRow('Yükseklik', 'sq-h', p.height);
            // Açı Ayarı
            container.innerHTML += `
            <div class="flex items-center justify-between mb-1 mt-2 pt-2 border-t border-blue-100">
                <label class="text-xs font-bold text-purple-600 w-16">Açı (°)</label>
                <input type="number" id="sq-angle" value="${p.angle || 0}" class="border rounded px-1 py-0.5 text-sm font-bold w-20 text-right text-purple-700">
            </div>`;
        }
        // ÇOKGEN (SOMUN)
        else if (p.shape === 'polygon') { 
            container.innerHTML += createInputRow('SW (Anahtar)', 'edit-sw', p.sw);
            container.innerHTML += createInputRow('Köşe Sayısı', 'edit-s', p.s);
            container.innerHTML += createInputRow('Boy', 'edit-h', p.h);
        }
        // KONİ (PAH)
        else if (p.shape === 'cone') { 
            container.innerHTML += createInputRow('top dia', 'edit-d1', p.r1 * 2);
            container.innerHTML += createInputRow('bottom dia', 'edit-d2', p.r2 * 2);
            container.innerHTML += createInputRow('height', 'edit-h', p.h);
        }
        // KÜRE
        else if (p.shape === 'sphere') { 
            container.innerHTML += createInputRow('dia (Ø)', 'edit-d', p.radius * 2);
        }
        // HALKA (TORUS)
        else if (p.shape === 'torus') {
            container.innerHTML += createInputRow('Radius (R)', 'edit-r', p.radius);
            container.innerHTML += createInputRow('thickness (T)', 'edit-t', p.tube);
        }
        // DÜZ HALKA (PUL)
        else if (p.shape === 'flat_ring') {
            container.innerHTML += `<div class="text-xs text-gray-500 italic mb-2">Parametrik Düzenleme Yok (Statik)</div>`;
        }
        // KESİK KÜRE
        else if (p.shape === 'truncated_sphere_gen') {
            container.innerHTML += createInputRow('Top Dia', 'edit-td', p.topDia);
            container.innerHTML += createInputRow('Bot Dia', 'edit-bd', p.botDia);
            container.innerHTML += createInputRow('Height', 'edit-h', p.height);
        }
    } 
    
    // 3. DELİK/KESME İŞLEMİ DÜZENLEME
    if (lastFeat) {
        container.innerHTML += `
            <div class="mt-3 pt-3 border-t border-blue-200 bg-orange-50 p-2 rounded">
                <div class="text-[10px] font-bold text-orange-600 mb-1">SON İŞLEM: ${lastFeat.type.toUpperCase()}</div>
                <button onclick="editLastFeature()" class="w-full bg-white hover:bg-orange-100 text-orange-700 border border-orange-300 py-1 px-2 rounded text-xs font-bold transition flex items-center justify-center gap-1">
                    <i class="fas fa-undo"></i> back& edit
                </button>
            </div>`;
    }

    // 4. DUPLICATEMA BUTONU (PANELİN EN ALTINA)
    // Mevcut butonların hemen üstüne ekliyoruz
    const btnContainer = document.createElement('div');
    btnContainer.className = "mt-4 pt-2 border-t border-gray-200";
    btnContainer.innerHTML = `
        <button onclick="duplicateSelected()" class="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 mb-1">
            <i class="far fa-clone"></i> DUPLICATE
        </button>
        <div class="grid grid-cols-2 gap-1">
            <button onclick="openArrayModal('linear')" class="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-1.5 rounded-lg text-xs font-black transition flex items-center justify-center gap-1">
                <i class="fas fa-ellipsis-h text-xs"></i> LİNEER ARRAY
            </button>
            <button onclick="openArrayModal('polar')" class="bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 py-1.5 rounded-lg text-xs font-black transition flex items-center justify-center gap-1">
                <i class="fas fa-circle-notch text-xs"></i> POLAR ARRAY
            </button>
        </div>
        <div class="mt-1 text-[9px] text-gray-400 text-center font-bold">
            💡 Hold down  <kbd class="bg-gray-100 px-1 rounded border">Ctrl</kbd> during Move/Rotate→ Release to copy
        </div>
    `;
    container.appendChild(btnContainer);
};

// Yardımcı: Input Satırı Oluşturucu (Eğer yoksa diye tekrar ekliyorum)
function createInputRow(label, id, val) {
    return `<div class="flex items-center justify-between mb-2">
                <label class="text-xs font-bold text-gray-600">${label}</label>
                <input type="number" id="${id}" value="${val}" class="border rounded px-2 py-1 text-sm font-bold w-24 text-right text-gray-700">
            </div>`;
}
function editLastFeature() {
            if (!targetSel) return;
            const mesh = targetSel.mesh;
            const lastFeat = mesh.userData.lastFeature;
            
            if (!lastFeat || !lastFeat.params) {
                showNotification("Düzenlenecek özellik verisi bulunamadı.", "error");
                return;
            }

            // 1. İşlemi Geri Al (Undo)
            // Bu işlem parçayı eski haline (delik delinmeden önceki haline) döndürür
            performUndo();
            
            // 2. Parametreleri Panele Geri Yükle
            const p = lastFeat.params;
            const type = lastFeat.type;
            
            // Özellik tipini seç
            document.getElementById('feature-type').value = type;
            // Arayüzü güncelle (kutucuklar oluşsun)
            updateFeatureParams(); 
            
            // Değerleri kutulara yaz
            if (p.diameter) document.getElementById('feat-dia').value = p.diameter;
            if (p.depth) document.getElementById('feat-depth').value = p.depth;
            if (p.width) document.getElementById('feat-width').value = p.width;
            if (p.length) document.getElementById('feat-length').value = p.length;
            if (p.size) document.getElementById('feat-size').value = p.size;
            
            // Konumlandırma değerlerini yükle (Eğer varsa)
            if (p.offsetX) document.getElementById('feat-off-x').value = p.offsetX;
            if (p.offsetZ) document.getElementById('feat-off-z').value = p.offsetZ;
            if (p.rotation) document.getElementById('feat-rot').value = p.rotation;
            if (p.direction) document.getElementById('feat-dir').value = p.direction;
            
            // 3. Kullanıcıyı Bilgilendir
            showNotification("Parametreler yüklendi. Değerleri değiştirip tekrar 'CREATE FEATURE' butonuna basın.", "success");
            
            // Feature panelini vurgula (Dikkat çekmek için)
            const panel = document.querySelector('.hover\\:border-indigo-400'); // Feature panel class
            if(panel) {
                panel.style.borderColor = '#4f46e5';
                panel.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.2)';
                setTimeout(() => { 
                    panel.style.borderColor = ''; 
                    panel.style.boxShadow = '';
                }, 1000);
            }
        }

        function createInputRow(label, id, val) {
            return `<div class="flex gap-2 items-center"><label class="w-16">${label}</label><input type="number" id="${id}" value="${val}"></div>`;
        }

        function duplicateSelected() {
    if(!targetSel || !targetSel.mesh) {
        showNotification("Lütfen önce çoğaltılacak parçayı seçin!", "error");
        return;
    }
    
    saveCheckpoint(); // Geri alma noktası oluştur
    
    const original = targetSel.mesh;
    const clone = original.clone();
    
    // Bağımsız olması için materyali de kopyala
    if(original.material) clone.material = original.material.clone(); 
    
    // Üst üste binmemeleri için hafifçe kaydır
    clone.position.x += 15; 
    clone.position.z += 15;
    
    // Verileri temizle ve yeni ID ver
    clone.userData = JSON.parse(JSON.stringify(original.userData));
    clone.userData.id = original.userData.id + "_COPY_" + Math.floor(Math.random() * 100);
    
    scene.add(clone);
    objects.push(clone);
    
    // Model ağacına ekle ve yeni parçayı seç
    if(typeof addMeshToTree === 'function') addMeshToTree(clone);
    
    resetSelection();
    selectObject(clone, null);
    
    if(typeof updateSceneTotals === 'function') updateSceneTotals();
    showNotification("Parça başarıyla çoğaltıldı.", "success");
}

        function clearScene() {
currentFileHandle = null; // Sahne temizlendi, dosya bağlantısını kopar

            saveCheckpoint();
            objects.forEach(function(o) { if(o){ scene.remove(o); if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); } });
            objects.length = 0;
            window.objects = objects;
            window._snapGroups = [];
            modelTree.nodes = [];
            modelTree.expandedNodes.clear();
            resetSelection();
            var mp = document.getElementById('manual-control-panel'); if(mp) mp.classList.add('hidden');
            var ic = document.getElementById('info-content'); if(ic) ic.innerHTML = '<p class="text-gray-400 italic text-center py-2">Scene cleared</p>';
            updateModelTree();
            updateSceneTotals();
        }
// --- YÜZEY GRID FONKSİYONLARI (YENİ) ---

function toggleSurfaceGrid() {
    if (!targetSel) {
        showNotification("Lütfen önce üzerinde çalışılacak bir yüzey seçin!", "error");
        return;
    }
    
    isSurfaceGridActive = !isSurfaceGridActive;
    const btn = document.getElementById('btn-surf-grid');
    
    if (isSurfaceGridActive) {
        // Butonu aktif (mavi) yap
        if(btn) {
            btn.classList.add('bg-blue-600', 'text-white');
            btn.classList.remove('bg-white', 'text-blue-700');
        }
        createSurfaceGridOnTarget();
        showNotification("Yüzey Grid (0.25mm) AKTİF. İstediğiniz noktaya tıklayın.", "success");
    } else {
        // Butonu pasif (beyaz) yap
        if(btn) {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('bg-white', 'text-blue-700');
        }
        removeSurfaceGrid();
        showNotification("Yüzey Grid KAPATILDI.", "warning");
    }
}



// --- SAĞ TIK MENÜSÜ VE POLAR ARRAY İŞLEMLERİ ---

        function openTreeMenu(e, uuid) {
            e.preventDefault();
            e.stopPropagation();
            contextMeshId = uuid;
            
            // Sağ tıklananı seç
            const mesh = objects.find(o => o.uuid === uuid);
            if (mesh && (!targetSel || targetSel.mesh !== mesh)) {
                resetSelection();
                selectObject(mesh, null);
            }

            const menu = document.getElementById('tree-context-menu');
            menu.style.left = e.clientX + 'px';
            menu.style.top = e.clientY + 'px';
            menu.classList.remove('hidden');
            
            document.getElementById('ctx-header').innerText = mesh.userData.id.toUpperCase();
        }

        function ctxDuplicate() {
            if (!contextMeshId) return;
            const original = objects.find(o => o.uuid === contextMeshId);
            if (!original) return;
            
            saveCheckpoint();
            const clone = original.clone();
            clone.material = original.material.clone();
            clone.position.x += 15; 
            clone.userData = JSON.parse(JSON.stringify(original.userData));
            clone.userData.id = original.userData.id + "_COPY";
            
            scene.add(clone);
            objects.push(clone);
            addMeshToTree(clone);
            resetSelection(); selectObject(clone, null);
            updateSceneTotals();
        }

        function ctxAlignToSource() {
            if (!contextMeshId) return;
            const targetMesh = objects.find(o => o.uuid === contextMeshId);
            
            if (!sourceSel) { showNotification("Önce bir KAYNAK (Source) seçin (Sağ Tık)!", "error"); return; }
            if(targetMesh === sourceSel.mesh) { showNotification("Hedef ve Kaynak aynı olamaz.", "error"); return; }

            saveCheckpoint();
            
            // Merkezleri eşle
            if(!targetMesh.geometry.boundingBox) targetMesh.geometry.computeBoundingBox();
            if(!sourceSel.mesh.geometry.boundingBox) sourceSel.mesh.geometry.computeBoundingBox();
            
            // Basitçe pozisyonu kopyala (Pivotlar düzgünse)
            targetMesh.position.copy(sourceSel.mesh.position);
            
            showNotification("Merkeze hizalandı.", "success");
        }

        function ctxRename() {
            if (!contextMeshId) return;
            const mesh = objects.find(o => o.uuid === contextMeshId);
            const newName = prompt("Yeni isim:", mesh.userData.id);
            if(newName) {
                mesh.userData.id = newName;
                updateModelTree();
            }
        }

        function ctxDelete() {
            if (!contextMeshId) return;
            const mesh = objects.find(o => o.uuid === contextMeshId);
            if(confirm("Silmek istiyor musunuz?")) {
                saveCheckpoint();
                deleteObject(mesh);
            }
        }

        // --- POLAR ARRAY MANTIĞI ---
        function openPolarModal() {
            if (!contextMeshId) return;
            document.getElementById('tree-context-menu').classList.add('hidden');
            document.getElementById('polar-modal').classList.remove('hidden');
        }

        function applyPolarArray() {
            const meshId = contextMeshId;
            const originalMesh = objects.find(o => o.uuid === meshId);
            const count = Math.round(window.evalDim(document.getElementById('polar-count')));
            const totalAngle = window.evalDim(document.getElementById('polar-angle'));
            const rotateObjects = document.getElementById('polar-rotate-obj').checked;

            if (!originalMesh || count < 2) return;

            let pivotPoint = new THREE.Vector3(0, 0, 0);
            if (sourceSel && sourceSel.mesh !== originalMesh) {
                pivotPoint.copy(sourceSel.mesh.position);
            }

            saveCheckpoint();
            document.getElementById('polar-modal').classList.add('hidden');

            const angleStep = (totalAngle === 360) ? (360 / count) : (totalAngle / (count - 1));
            
            for (let i = 1; i < count; i++) {
                const angleDeg = i * angleStep;
                const angleRad = THREE.Math.degToRad(angleDeg);

                const clone = originalMesh.clone();
                clone.material = originalMesh.material.clone();
                clone.userData = JSON.parse(JSON.stringify(originalMesh.userData));
                clone.userData.id = originalMesh.userData.id + "_ARR_" + i;

                const localPos = originalMesh.position.clone().sub(pivotPoint);
                localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
                clone.position.copy(localPos.add(pivotPoint));

                if (rotateObjects) {
                    clone.rotateY(angleRad);
                }

                scene.add(clone);
                objects.push(clone);
                addMeshToTree(clone); // Ağaca ekle (Aslında updateModelTree çağırır)
            }
            updateSceneTotals();
            showNotification(count + " adet çoğaltıldı.", "success");
        }

        function ctxSelectCopies() {
            if (!contextMeshId) return;
            const original = objects.find(o => o.uuid === contextMeshId);
            const baseId = original.userData.id.split("_")[0]; // Basit isim kökü
            
            let found = 0;
            objects.forEach(o => {
                if(o.userData.id.startsWith(baseId) && o !== original) {
                    // Seçim mantığı (Burada sadece highlight yapıyoruz görsel olarak)
                    o.material.emissive.setHex(0xffff00);
                    found++;
                }
            });
            showNotification(found + " kopya işaretlendi.", "success");
        }



// NEW: Load .ezl file
// =============================================================================
// GÜÇLENDİRİLMİŞ PROJE YÜKLEME (LOAD) - HATA DÜZELTİCİ
// =============================================================================

function loadScene(event) {

currentFileHandle = null; // Yeni proje yükleniyor, eski kayıt referansını sıfırla!
    const file = event.target.files[0];
    if (!file) return;

    // Proje başlığını güncelle
    if(document.getElementById('project-title')) {
        document.getElementById('project-title').innerText = file.name.replace('.ezl', '').toUpperCase();
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            // Sahneyi temizle
            clearScene(); 

            let successCount = 0;

            if (!data.objects) {
                showNotification("Hata: Dosya formatı geçersiz.", "error");
                return;
            }

            data.objects.forEach(d => {
                let mesh = null;

                // --- YÖNTEM 1: PARAMETRİK YENİDEN OLUŞTURMA (Küp, Silindir vb.) ---
                // Eğer parça parametrikse (w, h, d, r gibi değerleri varsa) sıfırdan üret
                if (d.geoParams && Object.keys(d.geoParams).length > 0) {
                     const p = d.geoParams;
                     let geo;
                     
                     // Şekil tipine göre geometri üret
                     if (p.shape === 'box') geo = new THREE.BoxGeometry(p.w, p.h, p.d);
                     else if (p.shape === 'cylinder') geo = new THREE.CylinderGeometry(p.r, p.r, p.h, 32);
                     else if (p.shape === 'sphere') geo = new THREE.SphereGeometry(p.radius, 32, 32);
                     else if (p.shape === 'cone') geo = new THREE.CylinderGeometry(p.r1, p.r2, p.h, 32);
                     else if (p.shape === 'polygon') geo = new THREE.CylinderGeometry(p.r, p.r, p.h, p.s);
                     else if (p.shape === 'sphere_segment') {
                         const phiLength = Math.PI * 2;
                         const thetaLength = Math.acos((p.radius - p.height) / p.radius);
                         geo = new THREE.SphereGeometry(p.radius, 32, 32, 0, phiLength, 0, thetaLength);
                     }
                     else if (p.shape === 'truncated_sphere_gen' && typeof generateLatheTruncatedSphere === 'function') {
                         const res = generateLatheTruncatedSphere(p.topDia, p.botDia, p.height);
                         geo = res.geometry;
                     }
                     
                     if(geo) {
                         const mat = createMaterial();
                         mat.color.setHex(d.color);
                         mesh = new THREE.Mesh(geo, mat);
                     }
                }

                // --- YÖNTEM 2: RAW GEOMETRİ YÜKLEME (CSG, STL, Import edilmiş parçalar) ---
                // Eğer parametrik değilse veya yukarıda oluşturulamadıysa, kayıtlı geometri verisini kullan
                if (!mesh && (d.geometry || d.geometryJSON)) {
                    const loader = new THREE.BufferGeometryLoader();
                    const geoData = d.geometry || d.geometryJSON; // Eski/Yeni versiyon uyumluluğu
                    
                    try {
                        const geo = loader.parse(geoData);
                        const mat = createMaterial();
                        mat.color.setHex(d.color);
                        mesh = new THREE.Mesh(geo, mat);
                    } catch(err) {
                        console.warn("Parça geometrisi yüklenemedi: " + d.id, err);
                    }
                }

                // --- SAHNEYE EKLEME ---
                if (mesh) {
                    // Pozisyon, Dönüş ve Ölçek bilgilerini geri yükle
                    mesh.position.fromArray(d.position);
                    mesh.rotation.fromArray(d.rotation);
                    mesh.scale.fromArray(d.scale);
                    
                    // Kullanıcı verilerini geri yükle
                    mesh.userData = { 
                        type: d.type, 
                        id: d.id, 
                        geoParams: d.geoParams || {}, 
                        volume: d.volume,
                        originalColor: d.color,
                        lastFeature: d.lastFeature || null
                    };
                    
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;

                    // Sisteme kaydet
                    scene.add(mesh);
                    objects.push(mesh);
                    addMeshToTree(mesh);
                    successCount++;
                }
            });

            // Kamera konumunu geri yükle
            if (data.camera) {
                camera.position.fromArray(data.camera.position);
                camera.rotation.fromArray(data.camera.rotation);
                if(data.camera.target && controls) {
                    controls.target.fromArray(data.camera.target);
                }
                controls.update();
            }

            updateSceneTotals();
            showNotification(`Proje başarıyla yüklendi! (${successCount} parça)`, "success");

        } catch (err) {
            console.error(err);
            showNotification("Dosya okuma hatası: " + err.message, "error");
        }
    };
    reader.readAsText(file);
    event.target.value = ""; // Aynı dosyayı tekrar seçebilmek için input'u sıfırla
}

// NEW: Toggle measure mode
function toggleMeasureMode() {
    measureMode = !measureMode;
    if (measureMode) {
        showNotification("Ölçü modu aktif: İki nokta seçin.", "success");
        measurePoints = [];
        // Clear old lines
        measureLines.forEach(line => scene.remove(line));
        measureLines = [];
    } else {
        showNotification("Ölçü modu kapatıldı.", "success");
    }
}

// NEW: Save scene as .ezl (JSON) with Dialog
// --- GÜNCELLENMİŞ: SAHNEYİ KAYDETME (.EZL) ---
async function saveScene() {
    const sceneData = {
        objects: objects.map(obj => {
            const data = {
                type: obj.userData.type,
                id: obj.userData.id,
                geoParams: obj.userData.geoParams || {},
                volume: obj.userData.volume,
                position: obj.position.toArray(),
                rotation: obj.rotation.toArray(),
                scale: obj.scale.toArray(),
                color: obj.material.color.getHex(),
                lastFeature: obj.userData.lastFeature || null 
            };

            // Eğer parametrik değilse (STL, Kesilmiş parça vb.) geometrisini sakla
            if (!obj.userData.geoParams || Object.keys(obj.userData.geoParams).length === 0) {
                // Standart isim olarak 'geometry' kullanıyoruz
                data.geometry = obj.geometry.toJSON(); 
            }

            return data;
        }),
        camera: {
            position: camera.position.toArray(),
            rotation: camera.rotation.toArray(),
            target: controls.target.toArray()
        }
    };
    
    const jsonStr = JSON.stringify(sceneData);
    const blob = new Blob([jsonStr], {type: 'application/json'});
    
    await saveFileWithDialog(
        blob, 
        'proje.ezl', 
        'Ezel Project File', 
        'application/json', 
        '.ezl'
    );
    
    showNotification("Proje kaydetme işlemi başlatıldı!", "success");
}


// --- OBJ EXPORT FONKSİYONU (Dialoglu) ---
async function exportOBJ() {
    if (objects.length === 0) { 
        showNotification("Dışarı aktarılacak parça yok!", "error"); 
        return; 
    }
    
    const exportGroup = new THREE.Group();
    objects.forEach(obj => {
        const clone = obj.clone();
        clone.applyMatrix(obj.matrixWorld); 
        exportGroup.add(clone);
    });

    const exporter = new THREE.OBJExporter();
    const result = exporter.parse(exportGroup);
    const blob = new Blob([result], { type: 'text/plain' });
    
    await saveFileWithDialog(
        blob, 
        'ezel_tasarim.obj', 
        '3D Object File', 
        'text/plain', 
        '.obj'
    );
    
    showNotification("OBJ dosyası kaydedildi.", "success");
}

// --- PDF EXPORT (Dialoglu) ---
// --- DÜZELTİLMİŞ VE GÜÇLENDİRİLMİŞ PDF EXPORT ---
async function exportTechnicalPDF() {
    try {
        if (objects.length === 0) { 
            showNotification("Sahnede parça yok!", "error"); 
            return; 
        }
        
        showNotification("Teknik Resim Hazırlanıyor...", "warning");

        // --- A) SAHNE HAZIRLIĞI ---
        const originalBg = scene.background.clone();
        scene.background = new THREE.Color(0xffffff); // Arka planı BEYAZ yap (Kağıt rengi)
        
        // Yardımcı çizgileri (Grid, Eksen, Oklar) gizle
        const hiddenHelpers = [];
        scene.traverse(obj => {
            if (obj.isLine || obj.type.includes("Helper") || obj.name === "EdgeHelper") {
                if (obj.visible) {
                    obj.visible = false;
                    hiddenHelpers.push(obj);
                }
            }
        });
        if(transformControl) transformControl.visible = false;

        // --- B) PARÇA BOYUTLARINI HESAPLA ---
        const box = new THREE.Box3();
        objects.forEach(o => {
            if(!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox.clone();
            b.applyMatrix4(o.matrixWorld);
            box.union(b);
        });
        const size = new THREE.Vector3(); box.getSize(size);
        const center = new THREE.Vector3(); box.getCenter(center);
        
        // Zoom Faktörü (Parçayı kadraja sığdırmak için)
        const maxDim = Math.max(size.x, size.y, size.z);
        const zoomDist = maxDim * 2.5; 

        // --- C) GEÇİCİ KAMERA OLUŞTUR ---
        // Perspektif kamera kullanıyoruz ki "fotoğraf gibi" görünsün.
        // Tam teknik resim isterseniz OrthographicCamera kullanılabilir ama "fotoğraf" dediğiniz için Perspective daha iyi.
        const exportCam = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
        scene.add(exportCam);

        // Görüntü Yakalama Yardımcısı
        function captureView(posX, posY, posZ, upX, upY, upZ) {
            exportCam.position.set(center.x + posX, center.y + posY, center.z + posZ);
            exportCam.up.set(upX, upY, upZ);
            exportCam.lookAt(center);
            renderer.render(scene, exportCam);
            return renderer.domElement.toDataURL("image/jpeg", 1.0); // Yüksek kalite JPEG
        }

        // --- D) 4 GÖRÜNÜŞÜ ÇEK ---
        // 1. ÜST (TOP)
        const imgTop = captureView(0, zoomDist, 0, 0, 0, -1);
        // 2. ÖN (FRONT)
        const imgFront = captureView(0, 0, zoomDist, 0, 1, 0);
        // 3. YAN (SIDE)
        const imgSide = captureView(zoomDist, 0, 0, 0, 1, 0);
        // 4. PERSPEKTİF (ISO)
        const imgIso = captureView(zoomDist, zoomDist, zoomDist, 0, 1, 0);

        // --- E) PDF OLUŞTURMA (A4 YATAY) ---
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape, mm, A4

        // 1. Çerçeve ve Antet
        doc.setLineWidth(0.5);
        doc.rect(10, 10, 277, 190); // Dış Çerçeve
        
        // Antet Kutusu (Sağ Alt)
        doc.rect(190, 170, 97, 30); 
        doc.line(190, 185, 287, 185); // Orta çizgi
        
        doc.setFont("helvetica", "bold"); doc.setFontSize(14);
        doc.text("WebForge3D", 195, 180);
        
        doc.setFontSize(10); doc.setFont("helvetica", "normal");
        doc.text("Tarih: " + new Date().toLocaleDateString(), 195, 192);
        doc.text("Parça: " + (targetSel ? targetSel.mesh.userData.id : "Assembly"), 195, 197);

        // 2. Görünüşleri Yerleştir
        const viewW = 80; // Resim Genişliği
        const viewH = 80; // Resim Yüksekliği
        
        // ÜST GÖRÜNÜŞ (Sol Üst)
        const xTop = 20, yTop = 20;
        doc.addImage(imgTop, 'JPEG', xTop, yTop, viewW, viewH);
        doc.setFontSize(10); doc.setTextColor(100);
        doc.text("UST GORUNUS (TOP)", xTop + viewW/2, yTop - 2, {align:'center'});
        // Ölçü: Genişlik
        drawDim(doc, xTop, yTop + viewH + 5, xTop + viewW, yTop + viewH + 5, `W: ${size.x.toFixed(1)} mm`);

        // ÖN GÖRÜNÜŞ (Sol Alt)
        const xFront = 20, yFront = 110;
        doc.addImage(imgFront, 'JPEG', xFront, yFront, viewW, viewH);
        doc.text("ON GORUNUS (FRONT)", xFront + viewW/2, yFront - 2, {align:'center'});
        // Ölçü: Yükseklik (Dikey)
        drawDim(doc, xFront - 5, yFront + viewH, xFront - 5, yFront, `H: ${size.y.toFixed(1)} mm`, true);

        // YAN GÖRÜNÜŞ (Orta Alt)
        const xSide = 110, ySide = 110;
        doc.addImage(imgSide, 'JPEG', xSide, ySide, viewW, viewH);
        doc.text("YAN GORUNUS (SIDE)", xSide + viewW/2, ySide - 2, {align:'center'});
        // Ölçü: Derinlik
        drawDim(doc, xSide, ySide + viewH + 5, xSide + viewW, ySide + viewH + 5, `D: ${size.z.toFixed(1)} mm`);

        // PERSPEKTİF (Sağ Üst - Renkli/Gölgeli)
        const xIso = 150, yIso = 15;
        doc.addImage(imgIso, 'JPEG', xIso, yIso, 100, 100);
        doc.setTextColor(0, 0, 255); // Mavi başlık
        doc.text("PERSPEKTIF (ISO)", xIso + 50, yIso + 5, {align:'center'});

        // --- F) KAYDETME VE TEMİZLİK ---
        const blob = doc.output('blob');
        await saveFileWithDialog(blob, 'Teknik_Resim.pdf', 'PDF Dosyası', 'application/pdf', '.pdf');

        // Sahneyi Eski Haline Getir
        scene.background = originalBg;
        hiddenHelpers.forEach(o => o.visible = true);
        if(transformControl) transformControl.visible = true;
        scene.remove(exportCam);
        
        showNotification("Teknik Resim İndirildi!", "success");

    } catch (err) {
        console.error(err);
        showNotification("Hata: " + err.message, "error");
        // Hata durumunda kurtarma
        scene.background = new THREE.Color(0xf0f2f5);
        scene.children.forEach(c => { 
            if(c.name==="GridHelper" || c.name==="AxesHelper") c.visible=true; 
        });
    }
}


        

// --- AKILLI YÜZEY UZATMA (SMART FACE EXTRUDE) ---
        // --- AKILLI YÜZEY UZATMA (DÜZELTİLMİŞ: MERKEZ NOKTA HATASI GİDERİLDİ) ---
       // --- AKILLI YÜZEY UZATMA (GÜNCELLENMİŞ: PIVOT VE VOLUME DÜZELTME) ---
       // =============================================================================
// GÜNCELLENMİŞ SMART EXTRUDE (PUSH/PULL) - TEKRARLANABİLİR VERSİYON
// =============================================================================

// =============================================================================
// GÜÇLENDİRİLMİŞ SMART EXTRUDE (PUSH/PULL) - HATA KORUMALI & SÜREKLİ
// =============================================================================

function extrudeSmartSurface() {
    // 1. Seçim Kontrolü
    if (!targetSel) {
        showNotification("Lütfen uzatılacak düz bir yüzey seçin!", "error");
        return;
    }

    // 2. Kullanıcıdan Mesafe İste
    const distanceStr = prompt("Uzatma Miktarı (mm)?\n(Çıkarmak/Oyuk açmak için eksi değer girin: -10)", "20");
    if (distanceStr === null) return; // İptal
    
    const depth = parseFloat(distanceStr);
    if (isNaN(depth) || depth === 0) return;

    const mesh = targetSel.mesh;

    // Loading Ekranını Aç
    const loadingEl = document.getElementById('csg-loading');
    if(loadingEl) loadingEl.style.display = 'block';

    // UI donmasın diye işlemi azıcık gecikmeli başlat
    setTimeout(() => {
        saveCheckpoint(); // Geri alma noktası

        try {
            // --- A) GEOMETRİ HAZIRLIĞI (HATA KORUMALI) ---
            let geometry = mesh.geometry;
            
            // Analiz için BufferGeometry'yi normal Geometry'ye çevir (Daha güvenli seçim için)
            if (geometry.isBufferGeometry) {
                // HATA KORUMASI: Pozisyon verisi var mı?
                if (!geometry.attributes || !geometry.attributes.position) {
                    throw new Error("Parça geometrisi bozuk (Position verisi yok). Lütfen parçayı silip tekrar oluşturun.");
                }
                geometry = new THREE.Geometry().fromBufferGeometry(geometry);
            } else {
                // Zaten Geometry ise kopyasını al
                geometry = geometry.clone();
            }
            
            // KRİTİK ADIM: Noktaları kaynaştır (Yüzey bütünlüğü sağlar)
            geometry.mergeVertices();

            // --- B) SEÇİLEN YÜZEYİ ALGILA ---
            const clickNormal = targetSel.normal.clone().normalize();
            // Yüzeyin düzlem sabitini hesapla
            const planeConstant = clickNormal.dot(targetSel.point);
            const plane = new THREE.Plane(clickNormal, -planeConstant);
            
            // MatrixWorld ile dünya koordinatlarına geç
            const worldMatrix = mesh.matrixWorld;
            const rawPoints = [];
            const tolerance = 0.1; // 0.1mm tolerans

            // Yüzeydeki noktaları topla
            geometry.vertices.forEach(vLocal => {
                const vWorld = vLocal.clone().applyMatrix4(worldMatrix);
                if (Math.abs(plane.distanceToPoint(vWorld)) < tolerance) {
                    rawPoints.push(vWorld);
                }
            });

            if (rawPoints.length < 3) {
                throw new Error("Yüzey algılanamadı veya düz değil.");
            }

            // --- C) NOKTALARI SIRALA VE ŞEKİL OLUŞTUR ---
            // Yüzeyin merkezini bul
            const center = new THREE.Vector3();
            rawPoints.forEach(p => center.add(p));
            center.divideScalar(rawPoints.length);

            // Yerel eksenleri oluştur (U ve V)
            let up = new THREE.Vector3(0, 1, 0);
            if (Math.abs(clickNormal.dot(up)) > 0.99) up.set(1, 0, 0);
            const axisU = new THREE.Vector3().crossVectors(clickNormal, up).normalize();
            const axisV = new THREE.Vector3().crossVectors(clickNormal, axisU).normalize();

            // Açılara göre saat yönünde sırala (Convex Hull benzeri)
            rawPoints.sort((a, b) => {
                const vecA = a.clone().sub(center);
                const vecB = b.clone().sub(center);
                return Math.atan2(vecA.dot(axisV), vecA.dot(axisU)) - Math.atan2(vecB.dot(axisV), vecB.dot(axisU));
            });

            // 2D Şekli Çiz
            const shape = new THREE.Shape();
            const startX = rawPoints[0].clone().sub(center).dot(axisU);
            const startY = rawPoints[0].clone().sub(center).dot(axisV);
            shape.moveTo(startX, startY);

            for (let i = 1; i < rawPoints.length; i++) {
                const px = rawPoints[i].clone().sub(center).dot(axisU);
                const py = rawPoints[i].clone().sub(center).dot(axisV);
                shape.lineTo(px, py);
            }
            shape.lineTo(startX, startY); // Kapat

            // --- D) EXTRUDE (UZATMA) PARÇASINI OLUŞTUR ---
            const extrudeSettings = { depth: Math.abs(depth), bevelEnabled: false };
            const extGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            const extMesh = new THREE.Mesh(extGeo, mesh.material.clone());

            // Yönü ve Konumu Ayarla
            const targetDir = depth > 0 ? clickNormal : clickNormal.clone().negate();
            const defaultDir = new THREE.Vector3(0, 0, 1); // Extrude Z yönünde oluşur
            extMesh.quaternion.setFromUnitVectors(defaultDir, targetDir);
            extMesh.position.copy(center);
            extMesh.updateMatrixWorld(); 

            // --- E) CSG (KATI MODEL UNIONME) ---
            if (typeof ThreeBSP === 'undefined') throw new Error("ThreeBSP kütüphanesi eksik!");

            // Ana parçayı hazırla (Matrixleri içine göm/bake)
            // Not: geometry zaten yukarıda mergeVertices yapılmış ve temizlenmişti
            const meshClone = new THREE.Mesh(geometry);
            meshClone.applyMatrix(mesh.matrixWorld);
            const bspA = new ThreeBSP(meshClone);

            // Uzatma parçasını hazırla
            const extCloneGeo = new THREE.Geometry().fromBufferGeometry(extGeo);
            const extClone = new THREE.Mesh(extCloneGeo);
            extClone.applyMatrix(extMesh.matrixWorld);
            const bspB = new ThreeBSP(extClone);

            // İşlemi Yap (Union: Birleştir, Subtract: Çıkar)
            const bspResult = bspA.union(bspB);
            
            // --- F) SONUCU OLUŞTUR VE İYİLEŞTİR ---
            const resultGeo = bspResult.toGeometry();
            
            // --- EN ÖNEMLİ KISIM: PARÇAYI İYİLEŞTİRME ---
            // Noktaları birleştir (Merge) ve Normalleri hesapla
            // Bu sayede parça "yekpare" olur ve tekrar işlem yapılabilir.
            resultGeo.mergeVertices();
            resultGeo.computeVertexNormals();
            
            // BufferGeometry'ye çevir (Performans için)
            const finalBufferGeo = new THREE.BufferGeometry().fromGeometry(resultGeo);
            const resultMesh = new THREE.Mesh(finalBufferGeo, mesh.material.clone());
            // ThreeBSP world-space → merkeze taşıma YOK, orijinal konumda kal
            resultMesh.position.set(0, 0, 0);
            resultMesh.rotation.set(0, 0, 0);
            resultMesh.scale.set(1, 1, 1);

            // Verileri Aktar
            resultMesh.castShadow = true;
            resultMesh.receiveShadow = true;
            resultMesh.userData = { ...mesh.userData };
            resultMesh.userData.id = mesh.userData.id + "_EXT";
            // Güvenli hacim hesaplama
            if (typeof getMeshVolume === 'function') {
                resultMesh.userData.volume = getMeshVolume(finalBufferGeo);
            }

            // Sahneyi Güncelle
            scene.remove(mesh);
            objects = objects.filter(o => o !== mesh);
            
            scene.add(resultMesh);
            objects.push(resultMesh);
            
            // Model ağacı güncellemesi varsa yap
            if(typeof addMeshToTree === 'function') addMeshToTree(resultMesh);

            resetSelection();
            selectObject(resultMesh, null);
            if(typeof updateSceneTotals === 'function') updateSceneTotals();
            
            showNotification("İşlem Başarılı! (Devam edebilirsiniz)", "success");

        } catch (err) {
            console.error(err);
            showNotification("Hata: " + err.message, "error");
        } finally {
            if(loadingEl) loadingEl.style.display = 'none';
        }
    }, 50);
}
// --- PIVOT (MERKEZ) NOKTASINI GEOMETRİNİN ORTASINA TAŞIMA ---
        function centerMeshPivot(mesh) {
            // 1. Geometrinin sınırlarını hesapla
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            
            // 2. Geometrik merkezi bul
            const center = new THREE.Vector3();
            mesh.geometry.boundingBox.getCenter(center);
            
            // 3. Geometriyi merkeze ters yönde kaydır (Böylece vertexler yerel 0,0,0 etrafında toplanır)
            mesh.geometry.translate(-center.x, -center.y, -center.z);
            
            // 4. Mesh'in dünya üzerindeki pozisyonuna bu farkı ekle (Böylece parça yerinden oynamaz ama gizmo merkeze gelir)
            // Mesh'in kendi rotasyonunu hesaba katarak dünya koordinatına çeviriyoruz
            const worldOffset = center.applyQuaternion(mesh.quaternion);
            mesh.position.add(worldOffset);
        }


// --- KESİN ÇALIŞAN POLAR ARRAY FONKSİYONU ---
// Bu kodu script'in en sonuna ekleyin

function openPolarModalFromSelection() {
    if (!targetSel) {
        showNotification("Lütfen önce çoğaltılacak parçayı seçin!", "error");
        return;
    }
    contextMeshId = targetSel.mesh.uuid; // Seçili ID'yi kaydet
    document.getElementById('polar-modal').classList.remove('hidden'); // Pencereyi aç

    if (sourceSel) {
        showNotification(`Merkez: ${sourceSel.mesh.userData.id}`, "success");
    } else {
        showNotification("Merkez: Orijin (0,0,0)", "warning");
    }
}

function applyPolarArray() {
    const originalMesh = objects.find(o => o.uuid === contextMeshId);
    if (!originalMesh) {
        showNotification("Hata: Parça bulunamadı.", "error");
        return;
    }

    const count = Math.round(window.evalDim(document.getElementById('polar-count')));
    const totalAngle = window.evalDim(document.getElementById('polar-angle'));
    const rotateObjects = document.getElementById('polar-rotate-obj').checked;

    if (count < 2) return;

    // Merkez Belirle
    let pivotPoint = new THREE.Vector3(0, 0, 0);
    if (sourceSel && sourceSel.mesh !== originalMesh) {
        pivotPoint.copy(sourceSel.mesh.position);
    }

    saveCheckpoint();
    document.getElementById('polar-modal').classList.add('hidden');

    // Açı Hesabı
    const isFullCircle = (Math.abs(totalAngle) >= 360);
    const angleStep = isFullCircle ? (360 / count) : (totalAngle / (count - 1));

    let created = 0;
    for (let i = 1; i < count; i++) {
        const angleRad = THREE.Math.degToRad(i * angleStep);
        const clone = originalMesh.clone();
        clone.material = originalMesh.material.clone();
        clone.userData = JSON.parse(JSON.stringify(originalMesh.userData));
        clone.userData.id = originalMesh.userData.id + "_ARR_" + i;

        // Döndürme İşlemi
        const localPos = originalMesh.position.clone().sub(pivotPoint);
        localPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
        clone.position.copy(localPos.add(pivotPoint));

        if (rotateObjects) {
            const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleRad);
            clone.quaternion.premultiply(q);
        }

        scene.add(clone);
        objects.push(clone);
        addMeshToTree(clone);
        created++;
    }
    updateSceneTotals();
    showNotification(created + " adet kopya oluşturuldu.", "success");
    resetSelection();
}

// --- YENİ: MEVCUT SAHNEYE .EZL DOSYASI EKLEME (MERGE / IMPORT) ---
function importEZL(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            let addedCount = 0;

            if (!data.objects) {
                showNotification("Hata: Dosya boş veya hatalı.", "error");
                return;
            }

            data.objects.forEach(d => {
                let mesh;

                // 1. Parametrik Parça mı? (Küp, Silindir vb. düzenlenebilir)
                if (d.geoParams && Object.keys(d.geoParams).length > 0) {
                    const mockData = {
                        type: d.type,
                        geoParams: d.geoParams,
                        volume: d.volume,
                        id: d.id + "_IMP", // İsim karışmasın diye ek
                        color: d.color,
                        position: new THREE.Vector3().fromArray(d.position),
                        quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(d.rotation)),
                        scale: new THREE.Vector3().fromArray(d.scale)
                    };
                    // reconstructMesh fonksiyonunu kullan
                    if(typeof reconstructMesh === 'function') {
                        mesh = reconstructMesh(mockData);
                    }
                }
                
                // 2. Eğer Parametrik değilse veya mesh oluşmadıysa Geometri verisini dene
                if (!mesh) {
                    // Kayıt versiyonuna göre 'geometry' veya 'geometryJSON' olabilir, ikisini de dene
                    const geoData = d.geometry || d.geometryJSON;
                    
                    if (geoData) {
                        const loader = new THREE.BufferGeometryLoader();
                        const geo = loader.parse(geoData);
                        const mat = createMaterial();
                        mat.color.setHex(d.color);
                        
                        mesh = new THREE.Mesh(geo, mat);
                        mesh.position.fromArray(d.position);
                        mesh.rotation.fromArray(d.rotation);
                        mesh.scale.fromArray(d.scale);
                        
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        
                        mesh.userData = {
                            type: d.type,
                            id: d.id + "_IMP",
                            volume: d.volume,
                            geoParams: {}, // Parametresi yok
                            originalColor: d.color,
                            lastFeature: d.lastFeature
                        };
                    }
                }

                // 3. Parçayı Sahneye Ekle
                if (mesh) {
                    scene.add(mesh);
                    objects.push(mesh);
                    addMeshToTree(mesh);
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                updateSceneTotals();
                showNotification(`${addedCount} parça başarıyla eklendi!`, "success");
            } else {
                showNotification("Uyarı: Dosyada uygun parça bulunamadı (0 eklendi).", "error");
                console.log("Import Data:", data); // Hata ayıklama için konsola yaz
            }

        } catch (err) {
            console.error(err);
            showNotification("Import hatası: " + err.message, "error");
        }
    };
    reader.readAsText(file);
    
    // Aynı dosyayı peş peşe seçebilmek için inputu temizle
    event.target.value = "";
}

// --- STL IMPORT FONKSİYONU ---
function loadSTL(event) {
    const file = event.target.files[0];
    if (!file) return;

    showNotification("STL Yükleniyor...", "warning");

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const loader = new THREE.STLLoader();
            const geometry = loader.parse(e.target.result);
            
            // Geometriyi merkezle ve normalleri hesapla
            geometry.center();
            geometry.computeVertexNormals();

            // Materyal oluştur
            const material = createMaterial();
            const colors = [0x93c5fd, 0xc4b5fd, 0x86efac, 0xfca5a5, 0xfde047, 0xd1d5db];
            material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);

            const mesh = new THREE.Mesh(geometry, material);
            
            // Yere oturt (Yüksekliğinin yarısı kadar yukarı kaldır)
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const height = box.max.y - box.min.y;
            mesh.position.y = height / 2;

            // Gölge ve Veri Ayarları
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Hacim Hesapla
            const vol = getMeshVolume(geometry);

            mesh.userData = {
                type: "Imported STL",
                id: file.name.replace('.stl', '').substring(0, 15), // İsmi kısalt
                volume: vol,
                geoParams: {}, // Parametrik değildir, düzenlenemez (sadece scale/move)
                originalColor: material.color.getHex()
            };

            scene.add(mesh);
            objects.push(mesh);
            addMeshToTree(mesh);
            
            // Temizlik ve Seçim
            event.target.value = ""; // Aynı dosyayı tekrar seçebilmek için
            resetSelection();
            selectObject(mesh, null);
            updateSceneTotals();
            
            showNotification("STL Başarıyla Eklendi!", "success");

        } catch (err) {
            console.error(err);
            showNotification("STL Hatası: " + err.message, "error");
        }
    };
    
    // Dosyayı okumaya başla
    if (reader.readAsArrayBuffer) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsBinaryString(file);
    }
}



// --- YÜZEY GRID DEĞİŞKENLERİ ---




// --- YÜZEY GRID FONKSİYONLARI ---

// --- YÜZEY GRID FONKSİYONLARI (GÜNCELLENDİ) ---

// 1. Grid Aralığını Değiştirme (Dropdown Tetikler)
function changeGridSpacing(val) {
    currentGridSpacing = parseFloat(val);
    
    // Eğer grid şu an açıksa, yeni ölçüyle hemen yeniden çiz
    if (isSurfaceGridActive && surfaceGridHelper) {
        createSurfaceGridOnTarget();
        showNotification(`Grid Aralığı: ${currentGridSpacing} mm`, "success");
    }
}

// 2. Grid Modunu Aç/Kapat
function toggleSurfaceGrid() {
    if (!targetSel) {
        showNotification("Lütfen önce üzerinde çalışılacak bir yüzey seçin!", "error");
        return;
    }
    
    isSurfaceGridActive = !isSurfaceGridActive;
    const btn = document.getElementById('btn-surf-grid');
    const select = document.getElementById('grid-spacing-select');
    
    if (isSurfaceGridActive) {
        // Görsel Aktifleşme
        if(btn) {
            btn.classList.add('bg-blue-600', 'text-white');
            btn.classList.remove('text-blue-700');
        }
        createSurfaceGridOnTarget();
        showNotification(`Yüzey Grid (${currentGridSpacing}mm) AKTİF.`, "success");
    } else {
        // Görsel Pasifleşme
        if(btn) {
            btn.classList.remove('bg-blue-600', 'text-white');
            btn.classList.add('text-blue-700');
        }
        removeSurfaceGrid();
        showNotification("Yüzey Grid KAPATILDI.", "warning");
    }
}

// 3. Gridi Oluştur
// --- GÜNCELLENMİŞ: AKILLI YÜZEY GRID (ŞEKLE GÖRE KEDELETEEN) ---



// --- DİNAMİK GRID DOKUSU OLUŞTURUCU ---
function createGridTexture() {
    const size = 512; // Texture çözünürlüğü
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Arka plan (Tam şeffaf veya hafif renkli)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; 
    ctx.fillRect(0, 0, size, size);

    // Çizgi Ayarları
    ctx.strokeStyle = '#0000FF'; // Mavi Grid
    ctx.lineWidth = 4; // Çizgi kalınlığı (Scale edilince incelir)

    // Kare Çiz (Doku tekrar edeceği için sadece kenarları çiziyoruz)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    // Texture keskinliği için
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

function removeSurfaceGrid() {
    if (surfaceGridHelper) { scene.remove(surfaceGridHelper); surfaceGridHelper = null; }
    if (snapMarker) { scene.remove(snapMarker); snapMarker = null; }
}

// 4. Snap Hesaplama (Dinamik)
// --- DÜZELTİLMİŞ SNAP HESAPLAMA ---
function calculateGridSnap(intersectPoint) {
    // Grid yoksa noktayı olduğu gibi döndür
    if (!surfaceGridHelper || !surfaceGridHelper.userData.origin) return intersectPoint;

    const data = surfaceGridHelper.userData;
    const spacing = (typeof currentGridSpacing !== 'undefined') ? parseFloat(currentGridSpacing) : 0.25;

    // 1. Fark Vektörü: Tıklanan nokta ile Grid Orijini arasındaki mesafe
    const diff = intersectPoint.clone().sub(data.origin);
    
    // 2. İzdüşüm: Bu mesafeyi Grid'in yerel eksenlerine (Right/Up) yansıt
    let localX = diff.dot(data.right);
    let localY = diff.dot(data.up);
    
    // 3. Yuvarlama (SNAP): En yakın aralığa yuvarla
    localX = Math.round(localX / spacing) * spacing;
    localY = Math.round(localY / spacing) * spacing;
    
    // 4. Dönüşüm: Yeni koordinatı tekrar 3D Dünya koordinatına çevir
    // Formül: Orijin + (Sağ * X) + (Yukarı * Y)
    const snappedPos = data.origin.clone()
        .add(data.right.clone().multiplyScalar(localX))
        .add(data.up.clone().multiplyScalar(localY));

    // Marker'ın yüzeyin içine girmemesi için normal yönünde çok az kaldır
    const normal = new THREE.Vector3().crossVectors(data.right, data.up).normalize();
    snappedPos.add(normal.multiplyScalar(0.02));

    return snappedPos;
}
// --- GÜNCELLENMİŞ VE DÜZELTİLMİŞ GRID FONKSİYONU ---

// --- DÜZELTİLMİŞ GRID OLUŞTURMA (ALIGNMENT SORUNU GİDERİLDİ) ---
function createSurfaceGridOnTarget() {
    // Varsa eski gridi ve markeri temizle
    removeSurfaceGrid(); 

    if (!targetSel) return;

    const mesh = targetSel.mesh;
    const clickNormal = targetSel.normal.clone().normalize();
    const clickPoint = targetSel.point.clone();
    
    // --- 1. EKSENLERİ HESAPLA (Sağ ve Yukarı Vektörleri) ---
    let tempUp = new THREE.Vector3(0, 1, 0);
    // Eğer yüzey zaten yukarı bakıyorsa (Y), geçici up olarak Z eksenini kullan
    if (Math.abs(clickNormal.dot(tempUp)) > 0.9) tempUp.set(0, 0, 1);
    
    const rightAxis = new THREE.Vector3().crossVectors(clickNormal, tempUp).normalize();
    const upAxis = new THREE.Vector3().crossVectors(rightAxis, clickNormal).normalize();

    // --- 2. GEOMETRİ VE DOKU OLUŞTUR ---
    const size = 200; // Grid boyutu (Yeterince büyük)
    const gridGeo = new THREE.PlaneGeometry(size, size);
    
    // Grid Dokusu (Canvas ile dinamik çizim)
    const texture = createGridTexture(); 
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    
    // Grid sıklığına göre tekrarı ayarla
    const spacing = (typeof currentGridSpacing !== 'undefined') ? parseFloat(currentGridSpacing) : 0.25;
    const repeat = size / spacing;
    texture.repeat.set(repeat, repeat);

    const gridMat = new THREE.MeshBasicMaterial({ 
        map: texture,
        transparent: true,
        opacity: 0.5,
        depthWrite: false, // Z-Fighting önlemek için
        side: THREE.DoubleSide
    });

    surfaceGridHelper = new THREE.Mesh(gridGeo, gridMat);
    
    // --- 3. KONUMLANDIRMA ---
    // Grid'i tıklanan noktaya taşı
    surfaceGridHelper.position.copy(clickPoint);
    
    // Grid normalini (Z), yüzey normaline hizala
    const defaultNormal = new THREE.Vector3(0, 0, 1); 
    surfaceGridHelper.quaternion.setFromUnitVectors(defaultNormal, clickNormal);
    
    // Dokunun yönünü (Rotation) bizim hesapladığımız eksenlere hizala
    // Bu adım Grid çizgilerinin düzgün durması için kritiktir
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(rightAxis, upAxis, clickNormal);
    surfaceGridHelper.rotation.setFromRotationMatrix(rotMatrix);

    // --- 4. VERİLERİ SAKLA (SNAP İÇİN GEREKLİ) ---
    surfaceGridHelper.userData = { 
        isGrid: true, 
        origin: clickPoint, 
        right: rightAxis,
        up: upAxis 
    };
    
    // Görsel çakışmayı önlemek için yüzeyden çok az (0.02mm) yukarı kaldır
    surfaceGridHelper.position.add(clickNormal.multiplyScalar(0.02));
    
    scene.add(surfaceGridHelper);
}
// --- GELİŞMİŞ ZOOM (CURSOR ZOOM) FONKSİYONU ---
function onMouseWheel(event) {
    event.preventDefault(); 
    const zoomSpeed = 0.1; 
    const delta = Math.sign(event.deltaY); 

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        const hitPoint = intersects[0].point;
        const direction = hitPoint.clone().sub(camera.position);
        const moveStep = direction.multiplyScalar(delta < 0 ? zoomSpeed : -zoomSpeed);
        camera.position.add(moveStep);
        controls.target.add(moveStep);
    } else {
        const scale = (delta > 0) ? 1.1 : 0.9;
        const offset = camera.position.clone().sub(controls.target);
        offset.multiplyScalar(scale);
        camera.position.copy(controls.target).add(offset);
    }
    controls.update();

    // Pre-load font for brand motor and arc text
    setTimeout(function() {
        if (typeof THREE.FontLoader !== 'undefined' && (typeof loadedFont === 'undefined' || !loadedFont)) {
            var ldr = new THREE.FontLoader();
            ldr.load('https://cdn.jsdelivr.net/npm/three@0.108.0/examples/fonts/helvetiker_bold.typeface.json',
                function(fnt) { 
                    loadedFont = fnt; 
                    console.log('[Font] helvetiker_bold preloaded');
                });
        }
    }, 500);
}

// --- ÖLÇÜM YARDIMCI FONKSİYONLARI ---

// 1. Numaralı Marker Oluşturucu
// --- GÜNCELLENMİŞ MARKER FONKSİYONU (X İŞARETLİ VE KÜÇÜK) ---
function createNumberedMarker(position, number) {
    // 1. Canvas ile doku oluştur
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    // Kırmızı Daire (Zemin)
    ctx.fillStyle = '#dc2626'; 
    ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
    
    // Beyaz "X" İşareti (Numara yerine)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px Arial'; // Font boyutu
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("X", 32, 34); // Ekrana X yazıyoruz
    
    // 2. Texture ve Sprite Ayarları
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    
    sprite.position.copy(position);
    
    // 3. BOYUT AYARI (Eskiden 5 idi, şimdi 2.5 yaparak yarıya indirdik)
    sprite.scale.set(2.5, 2.5, 1); 
    
    sprite.renderOrder = 999; // Her şeyin önünde görünsün
    
    scene.add(sprite);
    measureLines.push(sprite); // Silmek için listeye ekle
}
// 2. UI Panelini Güncelle
function updateMeasurePanelUI() {
    const listDiv = document.getElementById('measure-list-content');
    const resultDiv = document.getElementById('measure-result');
    listDiv.innerHTML = '';

    if (measurePoints.length === 0) {
        listDiv.innerHTML = '<div class="text-gray-400 italic">1. Noktayı seçin...</div>';
        resultDiv.classList.add('hidden');
    } else {
        measurePoints.forEach((p, index) => {
            const row = document.createElement('div');
            row.className = "flex justify-between items-center bg-gray-50 p-1 rounded border border-gray-200";
            row.innerHTML = `
                <span class="font-bold text-red-600 bg-red-100 px-2 rounded-full text-xs">${index + 1}</span>
                <span class="text-xs text-gray-600">[${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}]</span>
            `;
            listDiv.appendChild(row);
        });
        
        if (measurePoints.length === 1) {
            const hint = document.createElement('div');
            hint.className = "text-gray-400 italic text-xs mt-1";
            hint.innerText = "2. Noktayı seçin...";
            listDiv.appendChild(hint);
            resultDiv.classList.add('hidden');
        }
    }
}

// 3. Grafikleri Temizle
function clearMeasureGraphics() {
    measureLines.forEach(obj => scene.remove(obj));
    measureLines = [];
    document.getElementById('measure-result').classList.add('hidden');
    document.getElementById('measure-dist-val').innerText = "0.00 mm";
}

// 4. Mod Açma/Kapama (Toggle) Fonksiyonunu da Güncelleyelim
function toggleMeasureMode() {
    measureMode = !measureMode;
    const panel = document.getElementById('measure-panel-ui');
    
    if (measureMode) {
        showNotification("Ölçü Modu AÇIK", "success");
        measurePoints = [];
        clearMeasureGraphics();
        panel.classList.remove('hidden');
        updateMeasurePanelUI();
    } else {
        showNotification("Ölçü Modu KAPALI", "warning");
        panel.classList.add('hidden');
        clearMeasureGraphics();
        measurePoints = [];
    }
}

// --- GELİŞMİŞ SNAP HESAPLAMA MOTORU ---
function calculateAdvancedSnap(hit) {
    const mesh = hit.object;
    const hitPoint = hit.point;
    let bestPoint = hitPoint.clone();
    let bestDist = Infinity;
    let snapType = 'none'; // 'none', 'end', 'mid', 'center', 'edge'

    // Ayarları Kontrol Et (HTML Checkbox'lardan)
    const snapEnd = document.getElementById('snap-end')?.checked;
    const snapMid = document.getElementById('snap-mid')?.checked;
    const snapCenter = document.getElementById('snap-center')?.checked;
    const snapEdge = document.getElementById('snap-edge')?.checked;

    // Eşik Değeri (Ne kadar yaklaşınca yapışsın? - mm cinsinden)
    const SNAP_RADIUS = 2.0; 
// --- GELİŞMİŞ TEĞET (TANGENT) YAKALAMA ---
const snapTangent = document.getElementById('snap-tangent')?.checked;
if (snapTangent && snapType === 'none') {
    const p = mesh.userData.geoParams;
    const isCircular = p && ['cylinder', 'sphere', 'truncated_sphere_gen', 'cone'].includes(p.shape);

    if (isCircular) {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);

        // Tıklanan nokta ile merkez arasındaki vektör
        const dirToHit = new THREE.Vector3().subVectors(hitPoint, worldPos);
        
        // Silindir ve Kesik Küre için sadece yatay düzlemde teğet al
        if (p.shape !== 'sphere') dirToHit.y = 0;
        dirToHit.normalize();

        // Ölçeklendirilmiş yarıçapı hesapla
        const baseRadius = (p.r || p.radius || p.topDia / 2 || 10);
        const radius = baseRadius * mesh.scale.x;

        // Teğet Noktası = Merkez + (Yön * Yarıçap)
        const tangentPoint = worldPos.clone().add(dirToHit.multiplyScalar(radius));
        
        if (p.shape !== 'sphere') tangentPoint.y = hitPoint.y; // Yüksekliği koru

        const dist = hitPoint.distanceTo(tangentPoint);
        if (dist < (SNAP_RADIUS * 2)) { // Teğet için toleransı biraz artırdık
            bestPoint = tangentPoint;
            snapType = 'tangent';
        }
    }
}
    // Mesh Geometrisini Al
    const geometry = mesh.geometry;
    
    // --- 1. MERKEZ (CENTER) SNAP ---
    // (Silindir, Küre, Delik merkezleri için)
    if (snapCenter) {
        const centers = getCircularFaceCenters(mesh); // Daha önce yazdığımız fonksiyonu kullanıyoruz
        for (let c of centers) {
            const dist = hitPoint.distanceTo(c);
            if (dist < SNAP_RADIUS && dist < bestDist) {
                bestDist = dist;
                bestPoint = c;
                snapType = 'center';
            }
        }
    }

    // --- GEOMETRİ ANALİZİ (VERTEX & EDGE) ---
    // Eğer vertex veya face verisi varsa işle
    if (bestDist > 0.1 && (snapEnd || snapMid || snapEdge)) {
        
        let vertices = [];
        
        // Face (Üçgen) üzerindeki noktaları al
        if (hit.face) {
            // Mesh'in dünya matrisini al
            const matrix = mesh.matrixWorld;
            
            // Geometri tipine göre vertexleri bul
            let a, b, c;
            if (geometry.isBufferGeometry) {
                const pos = geometry.attributes.position;
                a = new THREE.Vector3().fromBufferAttribute(pos, hit.face.a).applyMatrix4(matrix);
                b = new THREE.Vector3().fromBufferAttribute(pos, hit.face.b).applyMatrix4(matrix);
                c = new THREE.Vector3().fromBufferAttribute(pos, hit.face.c).applyMatrix4(matrix);
            } else {
                a = geometry.vertices[hit.face.a].clone().applyMatrix4(matrix);
                b = geometry.vertices[hit.face.b].clone().applyMatrix4(matrix);
                c = geometry.vertices[hit.face.c].clone().applyMatrix4(matrix);
            }
            

            // --- 2. UÇ NOKTA (END POINT) ---
            if (snapEnd) {
                [a, b, c].forEach(v => {
                    const dist = hitPoint.distanceTo(v);
                    if (dist < SNAP_RADIUS && dist < bestDist) {
                        bestDist = dist;
                        bestPoint = v;
                        snapType = 'end';
                    }
                });
            }

            // --- 3. ORTA NOKTA (MID POINT) ---
            if (snapMid) {
                // Kenar Ortaları: (A+B)/2, (B+C)/2, (C+A)/2
                const mid1 = a.clone().add(b).multiplyScalar(0.5);
                const mid2 = b.clone().add(c).multiplyScalar(0.5);
                const mid3 = c.clone().add(a).multiplyScalar(0.5);

                [mid1, mid2, mid3].forEach(m => {
                    const dist = hitPoint.distanceTo(m);
                    if (dist < SNAP_RADIUS && dist < bestDist) {
                        bestDist = dist;
                        bestPoint = m;
                        snapType = 'mid';
                    }
                });
            }
            const snapTangent = document.getElementById('snap-tangent')?.checked;

if (snapTangent && snapType === 'none') {
    // Eğer obje dairesel ise (Cylinder, Sphere, Truncated Sphere vb.)
    const isCircular = mesh.userData.geoParams && 
        ['cylinder', 'sphere', 'truncated_sphere_gen', 'cone'].includes(mesh.userData.geoParams.shape);

    if (isCircular) {
        // Objenin dünya koordinatlarındaki merkezini al
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);

        // Tıklanan nokta ile merkez arasındaki yön vektörü
        const dirToHit = new THREE.Vector3().subVectors(hitPoint, worldPos);
        
        // Sadece X ve Z düzleminde (yarıçap yönünde) dış sınırı bul
        // Silindirler için Y ekseni korunur, sadece radyal teğet alınır
        if (mesh.userData.geoParams.shape === 'cylinder' || mesh.userData.geoParams.shape === 'truncated_sphere_gen') {
             dirToHit.y = 0; 
        }
        
        dirToHit.normalize();

        // Parçanın yarıçapını al (Scale dahil)
        const p = mesh.userData.geoParams;
        const radius = (p.r || p.radius || p.topDia / 2 || 10) * mesh.scale.x;

        // Teğet Noktası = Merkez + (Yön * Yarıçap)
        const tangentPoint = worldPos.clone().add(dirToHit.multiplyScalar(radius));
        
        // Tıklanan yerle teğet noktası dikeyde farklıysa (Silindir boyu gibi) Y'yi eşitle
        if (mesh.userData.geoParams.shape === 'cylinder' || mesh.userData.geoParams.shape === 'truncated_sphere_gen') {
            tangentPoint.y = hitPoint.y;
        }

        const dist = hitPoint.distanceTo(tangentPoint);
        if (dist < SNAP_RADIUS) {
            bestPoint = tangentPoint;
            snapType = 'tangent';
        }
    }
}
            // --- 4. KENAR (EDGE/NEAREST ON LINE) ---
            if (snapEdge && snapType === 'none') {
                // Tıklanan noktaya en yakın kenar üzerindeki nokta
                // Matematiksel izdüşüm (Projection) gerekir.
                // Basitlik için: Eğer köşe veya ortaya yapışmadıysa ve kenara yakınsa, kenara çek.
                
                function closestPointOnSegment(p, a, b) {
                    const ab = b.clone().sub(a);
                    const ap = p.clone().sub(a);
                    let t = ap.dot(ab) / ab.lengthSq();
                    t = Math.max(0, Math.min(1, t)); // 0 ile 1 arasında sınırla
                    return a.clone().add(ab.multiplyScalar(t));
                }

                const p1 = closestPointOnSegment(hitPoint, a, b);
                const p2 = closestPointOnSegment(hitPoint, b, c);
                const p3 = closestPointOnSegment(hitPoint, c, a);

                [p1, p2, p3].forEach(p => {
                    const dist = hitPoint.distanceTo(p);
                    if (dist < SNAP_RADIUS && dist < bestDist) {
                        bestDist = dist;
                        bestPoint = p;
                        snapType = 'edge';
                    }
                });
            }
        }
    }

    return { point: bestPoint, type: snapType };
}

//======================================================




// --- KESİK KÜRE EKLEME FONKSİYONU ---
// --- DÜZELTİLMİŞ KESİK KÜRE (SOLID / KATI MODEL) ---
// --- KESİK KÜRE EKLEME (SOLID CSG YÖNTEMİ) ---
// --- KESİK KÜRE EKLEME (DÜZELTİLMİŞ) ---
// --- YENİ KESİK KÜRE (LATHE GEOMETRY - %100 HASSAS) ---
// 1. ANA EKLEME FONKSİYONU
// =============================================================================
// TRUNCATED SPHERE (KESİK KÜRE) TAMİR PAKETİ
// =============================================================================

// 1. ANA BUTON FONKSİYONU
function addTruncatedSphere() {
    // Inputları güvenli şekilde oku
    const topDia = parseInput('trunc-td');
    const botDia = parseInput('trunc-bd');
    const height = parseInput('trunc-h');

    // Hata kontrolü
    if (height <= 0) { 
        showNotification("Yükseklik (Height) 0'dan büyük olmalı!", "error"); 
        return; 
    }

    // Geometriyi oluştur
    const result = generateLatheTruncatedSphere(topDia, botDia, height);
    
    // Eğer matematiksel bir hata olduysa dur
    if (!result) {
        showNotification("Geometri oluşturulamadı (Çapları kontrol edin)", "error");
        return;
    }

    // Mesh oluştur
    const mesh = new THREE.Mesh(result.geometry, createMaterial());
    
    // Parçayı ızgara üzerine oturt (Yüksekliğin yarısı kadar yukarı)
    mesh.position.y = height / 2; 

    // Hacim hesapla
    const vol = getMeshVolume(result.geometry);
    
    // Bilgi ver
    showNotification(`Oluşturuldu! Yay Çapı: ${(result.R * 2).toFixed(2)} mm`, "success");

    // Sahneye ekle
    addMesh(mesh, "Truncated Sphere", vol, {
        shape: 'truncated_sphere_gen',
        topDia: topDia, 
        botDia: botDia, 
        height: height,
        calcR: result.R
    });
}

// 2. MATEMATİK MOTORU (YAY VE GEOMETRİ HESABI)
function generateLatheTruncatedSphere(topDia, botDia, height) {
    const r1 = topDia / 2;
    const r2 = botDia / 2;
    const h = height;

    // Pisagor kullanarak yay merkezini ve yarıçapını bul
    // (r1^2 - r2^2) / 2h formülü yayın dikey kaymasını verir
    const y_shift = (r1 * r1 - r2 * r2) / (2 * h);
    const R = Math.sqrt(r1 * r1 + Math.pow((h / 2) - y_shift, 2));

    // Noktaları oluştur
    const points = [];
    points.push(new THREE.Vector2(0, h / 2)); // Üst merkez (Kapak)
    
    // Yayı çiz (32 segment hassasiyetinde)
    const segments = 32;
    for (let i = 0; i <= segments; i++) {
        // Y koordinatı (Yukarıdan aşağıya iner)
        const y = (h / 2) - (i / segments) * h;
        
        // X koordinatı (Çember denklemi: x^2 + y^2 = R^2)
        // y_shift kadar kaydırılmış merkeze göre hesapla
        const term = R * R - Math.pow(y - y_shift, 2);
        
        // Eğer kök içi negatifse (matematiksel hata) en yakın yarıçapı kullan
        let x = 0;
        if (term > 0) {
            x = Math.sqrt(term);
        } else {
            x = (i < segments / 2) ? r1 : r2; // Hata toleransı
        }
        
        points.push(new THREE.Vector2(x, y));
    }

    points.push(new THREE.Vector2(0, -h / 2)); // Alt merkez (Kapak)
    
    // Döndürerek katı oluştur (Lathe)
    const geometry = new THREE.LatheGeometry(points, 64);
    geometry.computeVertexNormals(); // Işıklandırma için gerekli
    
    return { geometry, R };
}

// 3. YARDIMCI: GÜVENLİ SAYI OKUYUCU (HATA ÖNLEYİCİ)
function parseInput(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn("Input bulunamadı: " + id);
        return 0;
    }
    // Virgüllü sayı girilirse noktaya çevir (Örn: 5,5 -> 5.5)
    let val = el.value.replace(',', '.');
    return parseFloat(val) || 0;
}

// --- EKSİK OLAN ÖLÇÜ ÇİZİM FONKSİYONU ---
// --- 1. YARDIMCI FONKSİYON: ÖLÇÜ OKLARI ÇİZME ---
function drawDim(doc, x1, y1, x2, y2, text, style = 'horizontal') {
    doc.setDrawColor(0); doc.setTextColor(0); doc.setFontSize(8); doc.setLineWidth(0.2);
    doc.line(x1, y1, x2, y2);
    const S = 3.0; // Ok uzunluğu 3, Genişlik ekseni 1 (0.5+0.5) olduğu için 1:3 oranını verir
    if (style === 'vertical') {
        doc.triangle(x1, y1, x1 - 0.5, y1 + S, x1 + 0.5, y1 + S, 'FD'); // Üst ok
        doc.triangle(x2, y2, x2 - 0.5, y2 - S, x2 + 0.5, y2 - S, 'FD'); // Alt ok
        doc.text(text, x1 - 2, (y1 + y2) / 2, { align: 'right', baseline: 'middle' });
    } else {
        doc.triangle(x1, y1, x1 + S, y1 - 0.5, x1 + S, y1 + 0.5, 'FD'); // Sol ok
        doc.triangle(x2, y2, x2 - S, y2 - 0.5, x2 - S, y2 + 0.5, 'FD'); // Sağ ok
        doc.text(text, (x1 + x2) / 2, y1 - 2, { align: 'center' });
    }
}



// =============================================================================
// REVOLVE CUT (DÖNDÜREREK KESME / TORNALAMA) MODÜLÜ
// =============================================================================

function performRevolveCut() {
    // 1. Seçim Kontrolü
    if (!targetSel || !sourceSel) {
        showNotification("Lütfen önce HEDEF (Sol Tık) ve KESİCİ (Sağ Tık) seçin!", "error");
        return;
    }

    // 2. Eksen ve Ayarlar
    const axisInput = prompt("Döndürme Ekseni ve Açısı?\n(Örn: Y veya Y 360 veya X 180)", "Y 360");
    if (!axisInput) return;

    const parts = axisInput.toUpperCase().split(" ");
    const axisChar = parts[0]; // X, Y, Z
    const angleDeg = parts.length > 1 ? parseFloat(parts[1]) : 360;

    if (!['X', 'Y', 'Z'].includes(axisChar)) {
        showNotification("Geçersiz Eksen! (X, Y veya Z girin)", "error");
        return;
    }

    // Loading Başlat
    const loadingEl = document.getElementById('csg-loading');
    if(loadingEl) loadingEl.style.display = 'block';

    setTimeout(() => {
        saveCheckpoint(); // Geri alma noktası

        try {
            const targetMesh = targetSel.mesh;
            const cutterMesh = sourceSel.mesh; // Profil

            // --- A) PROFİLİN GEOMETRİSİNİ ANALİZ ET ---
            // Kesici profilin "Bounding Box"ını (Sınırlarını) kullanarak 
            // dönme eksenine göre 2D bir kesit çıkaracağız.
            
            if (!cutterMesh.geometry.boundingBox) cutterMesh.geometry.computeBoundingBox();
            const box = new THREE.Box3().setFromObject(cutterMesh);
            
            // Hedef parçanın merkezi (Dönme Merkezi)
            const pivot = targetMesh.position.clone();
            
            // Profilin boyutları
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center);

            // Dönme eksenine göre yarıçap ve yükseklikleri hesapla
            let points = [];
            
            // Basit Yaklaşım: Profilin "kutu" halini döndüreceğiz.
            // Bu, çoğu kama kanalı, o-ring kanalı vb. için yeterlidir.
            
            // Göreceli Pozisyon (Target merkezine göre)
            const relPos = center.clone().sub(pivot);
            
            let radiusInner, radiusOuter, yMin, yMax;

            if (axisChar === 'Y') {
                // Y ekseninde dönüyorsa, yarıçap X veya Z mesafesidir.
                // Biz XZ düzlemindeki hipotenüsü yarıçap kabul edelim.
                const dist = Math.sqrt(relPos.x*relPos.x + relPos.z*relPos.z);
                
                // Genişlik (Radyal kalınlık)
                const thickness = Math.max(size.x, size.z); 
                
                radiusInner = dist - (thickness/2);
                radiusOuter = dist + (thickness/2);
                yMin = relPos.y - (size.y/2);
                yMax = relPos.y + (size.y/2);
            } 
            else if (axisChar === 'Z') {
                const dist = Math.sqrt(relPos.x*relPos.x + relPos.y*relPos.y);
                const thickness = Math.max(size.x, size.y);
                
                radiusInner = dist - (thickness/2);
                radiusOuter = dist + (thickness/2);
                yMin = relPos.z - (size.z/2);
                yMax = relPos.z + (size.z/2);
            }
            else { // X
                const dist = Math.sqrt(relPos.y*relPos.y + relPos.z*relPos.z);
                const thickness = Math.max(size.y, size.z);
                
                radiusInner = dist - (thickness/2);
                radiusOuter = dist + (thickness/2);
                yMin = relPos.x - (size.x/2);
                yMax = relPos.x + (size.x/2);
            }

            // Güvenlik: Yarıçap negatif olamaz
            if (radiusInner < 0) radiusInner = 0;

            // --- B) LATHE (DÖNDÜRME) GEOMETRİSİ OLUŞTUR ---
            // 4 Köşe noktası (Saat yönünün tersi)
            points.push(new THREE.Vector2(radiusInner, yMin));
            points.push(new THREE.Vector2(radiusOuter, yMin));
            points.push(new THREE.Vector2(radiusOuter, yMax));
            points.push(new THREE.Vector2(radiusInner, yMax));
            points.push(new THREE.Vector2(radiusInner, yMin)); // Kapat

            const segments = 64; // Pürüzsüz daire
            const phiLength = THREE.Math.degToRad(angleDeg);
            
            const latheGeo = new THREE.LatheGeometry(points, segments, 0, phiLength);
            
            // Lathe her zaman Y ekseninde oluşur. Eğer X veya Z istendiyse döndürmeliyiz.
            if (axisChar === 'X') {
                latheGeo.rotateZ(-Math.PI / 2); // Y -> X
            } else if (axisChar === 'Z') {
                latheGeo.rotateX(Math.PI / 2);  // Y -> Z
            }

            // --- C) CSG İŞLEMİ (KESME) ---
            if (typeof ThreeBSP === 'undefined') throw new Error("CSG Kütüphanesi eksik.");

            // 1. Kesici Kalıbı Mesh Yap ve Konumlandır
            const cutterTool = new THREE.Mesh(latheGeo);
            // Kalıbı hedef parçanın merkezine taşı (Çünkü Lathe 0,0,0 etrafında oluştu, pivot orasıydı)
            cutterTool.position.copy(pivot);
            cutterTool.updateMatrixWorld();

            // 2. Ana Parçayı Hazırla
            let targetGeo = targetMesh.geometry.isBufferGeometry ? 
                            new THREE.Geometry().fromBufferGeometry(targetMesh.geometry) : 
                            targetMesh.geometry.clone();
            const targetModel = new THREE.Mesh(targetGeo);
            targetModel.applyMatrix(targetMesh.matrixWorld); // Pişir

            // 3. BSP Çıkarma
            const bspTarget = new ThreeBSP(targetModel);
            const bspCutter = new ThreeBSP(cutterTool);
            const bspResult = bspTarget.subtract(bspCutter);

            // --- D) SONUÇ ---
            const resultGeo = bspResult.toGeometry();
            resultGeo.mergeVertices();
            resultGeo.computeVertexNormals();

            const finalBufferGeo = new THREE.BufferGeometry().fromGeometry(resultGeo);
            const resultMesh = new THREE.Mesh(finalBufferGeo, targetMesh.material.clone());
            // ThreeBSP world-space → merkeze taşıma YOK
            resultMesh.position.set(0, 0, 0);
            resultMesh.rotation.set(0, 0, 0);
            resultMesh.scale.set(1, 1, 1);

            // Verileri Aktar
            resultMesh.castShadow = true;
            resultMesh.receiveShadow = true;
            resultMesh.userData = {
                type: "REVOLVE CUT",
                volume: getMeshVolume(finalBufferGeo),
                id: targetMesh.userData.id + "_REV",
                geoParams: {},
                originalColor: targetMesh.material.color.getHex()
            };

            // Sahneyi Güncelle
            deleteObject(targetMesh);
            // İsteğe bağlı: Kesici profili de gizle/sil
            // deleteObject(cutterMesh); 

            scene.add(resultMesh);
            objects.push(resultMesh);
            if(typeof addMeshToTree === 'function') addMeshToTree(resultMesh);

            resetSelection();
            selectObject(resultMesh, null);
            if(typeof updateSceneTotals === 'function') updateSceneTotals();

            showNotification("Döndürerek Kesme Başarılı!", "success");

        } catch (e) {
            console.error(e);
            showNotification("Hata: " + e.message, "error");
            performUndo();
        } finally {
            if(loadingEl) loadingEl.style.display = 'none';
        }
    }, 100);
}

// =============================================================================
// FUSION 360 KONTROLLERİ - KESİN ÇÖZÜM (SİNYAL ENGELİ KALDIRILDI)
// =============================================================================
function setupFusionControls() {
    if (!controls || !renderer) return;

    // 1. Varsayılan Tuş Atamaları (Shift BASILI DEĞİLKEN)
    // Sol: Pan (Seçimle çakışmaması için) | Orta: PAN | Sağ: ROTATE
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN, 
        MIDDLE: THREE.MOUSE.PAN, 
        RIGHT: THREE.MOUSE.ROTATE 
    };
    
    // Zoom'u OrbitControls üzerinden kapat (Özel tekerlek fonksiyonu kullanıyoruz)
    controls.enableZoom = true; 
    controls.screenSpacePanning = true; // Her yöne kaydırma açık

    // 2. TARAYICI ENGELLEYİCİ (DÜZELTİLDİ)
    // Sadece 'preventDefault' yapıyoruz. 'stopPropagation' KULLANMIYORUZ.
    // Böylece sinyal Three.js'e ulaşıyor ama tarayıcı araya girmiyor.
    
    const blockBrowserScroll = function(e) {
        if (e.button === 1) { // 1 = Orta Tuş
            e.preventDefault(); // Tarayıcının yuvarlak ikonunu engelle
            // e.stopPropagation(); // <-- BU SATIR DELETEİNDİ! Artık Three.js duyabilir.
        }
    };

    // Hem pointer hem mouse olaylarını dinle (Garanti olsun)
    renderer.domElement.addEventListener('pointerdown', blockBrowserScroll, false);
    renderer.domElement.addEventListener('mousedown', blockBrowserScroll, false);

    // 3. SHIFT TUŞU MEKANİZMASI (Anlık Mod Değişimi)
    window.addEventListener('keydown', function(e) {
        if (e.key === 'Shift') {
            // Shift basılıyken Orta Tuş -> DÖNDÜRME (ROTATE) olsun
            controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
            
            // Eğer o an sürükleme yapılıyorsa algılaması için update şart değil ama iyidir
            // OrbitControls durumunu o an güncellemez, bir sonraki tıklamada algılar.
            // Kullanıcıya hissettirmek için imleci değiştir:
            document.body.style.cursor = "all-scroll"; 
        }
    });

    window.addEventListener('keyup', function(e) {
        if (e.key === 'Shift') {
            // Shift bırakılınca Orta Tuş -> KAYDIRMA (PAN) olsun
            controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
            document.body.style.cursor = "default";
        }
    });

    console.log("Fusion 360 Kontrolleri: Orta=PAN, Shift+Orta=ROTATE (Düzeltildi)");
}    

// =============================================================================
// GÜNCELLENMİŞ KARE PRİZMA FONKSİYONU (PANELDEN VERİ OKUR)
// =============================================================================
window.addSquarePrism = function() {
    // 1. Değerleri Yeni Panelden Al
    const botW = window.evalDim(document.getElementById('create-sq-bot')) || 20;
    const topW = window.evalDim(document.getElementById('create-sq-top')) || 20;
    let h = window.evalDim(document.getElementById('create-sq-h')) || 40;
    const angle = window.evalDim(document.getElementById('create-sq-angle')) || 0;

    // 2. Açı Hesabı (Eğer açı girildiyse yüksekliği ona göre ayarla)
    if (angle > 0 && angle < 90 && Math.abs(botW - topW) > 0.1) {
        // h = (Genişlik Farkı / 2) / tan(acı)
        h = (Math.abs(botW - topW) / 2) / Math.tan(angle * (Math.PI / 180));
    }

    // 3. Geometriyi Oluştur (4 Köşeli Silindir = Kare Prizma)
    const rTop = topW / Math.sqrt(2);
    const rBot = botW / Math.sqrt(2);
    
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, 4);
    geo.rotateY(Math.PI / 4); // Yüzeyleri eksene hizala

    // 4. Hacim Hesabı (Kesik Piramit Formülü)
    const areaTop = topW * topW;
    const areaBot = botW * botW;
    const vol = (h * (areaTop + areaBot + Math.sqrt(areaTop * areaBot))) / 3;

    // 5. Parametreleri Kaydet (Edit Modu İçin)
    const params = {
        shape: 'square_prism',
        topW: topW,    
        botW: botW,    
        height: h,
        angle: angle    
    };
    
    // 6. Sahneye Ekle
    if (typeof addMesh === 'function') {
        addMesh(new THREE.Mesh(geo, createMaterial()), "Kare Prizma", vol, params);
    }
};
// =============================================================================
// GELİŞMİŞ TORUS (HALKA) - DÜZELTİLMİŞ VERSİYON (SCENE HATASI GİDERİLDİ)
// =============================================================================
window.addAdvancedTorus = function() {
    const od = window.evalDim(document.getElementById('torus-od')) || 40;
    const id = document.getElementById('torus-id') ? window.evalDim(document.getElementById('torus-id')) : 20;
    const th = document.getElementById('torus-th') ? window.evalDim(document.getElementById('torus-th')) : 5;
    const isSquare = document.getElementById('torus-square')?.checked;

    if (id >= od) {
        showNotification("HATA: İç çap dış çaptan büyük olamaz!", "error");
        return;
    }

    let geometry;
    let typeName = "Torus";

    if (isSquare) {
        typeName = "Flat Ring";
        const shape = new THREE.Shape();
        shape.absarc(0, 0, od / 2, 0, Math.PI * 2, false);
        const holePath = new THREE.Path();
        holePath.absarc(0, 0, id / 2, 0, Math.PI * 2, true);
        shape.holes.push(holePath);
        geometry = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false, curveSegments: 64 });
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, th / 2, 0);
    } else {
        typeName = "Torus";
        const tubeR = (od - id) / 4;
        const mainR = (od / 2) - tubeR;
        // PÜRÜZSÜZLEŞTİRME BURADA: 48 (Radial), 80 (Tubular)
        geometry = new THREE.TorusGeometry(mainR, tubeR, 48, 80);
        geometry.rotateX(Math.PI / 2); 
        geometry.translate(0, tubeR, 0);
    }

    const material = new THREE.MeshStandardMaterial({ color: 0x22d3ee, metalness: 0.5, roughness: 0.25 });
    const mesh = new THREE.Mesh(geometry, material);

    if (typeof scene !== 'undefined') {
        scene.add(mesh);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        const vol = isSquare ? (Math.PI * ((od/2)**2 - (id/2)**2) * th) : (2 * Math.PI * Math.PI * ((od-id)/4)**2 * ((od/2)-((od-id)/4)));
        mesh.userData = {
            type: typeName,
            id: "RING-" + Math.floor(Math.random()*999),
            volume: vol,
            geoParams: { shape: isSquare ? 'flat_ring' : 'torus_custom', od, id, th, isSquare },
            originalColor: material.color.getHex()
        };

        objects.push(mesh);
        if(typeof addMeshToTree === 'function') addMeshToTree(mesh);
        selectObject(mesh, null);
    }
};

// =============================================================================
// HELİS VE VİDA MOTORU (R108 UYUMLU - HATA DÜZELTİLDİ)
// =============================================================================

window.addHelicalObject = function() {
    console.log("Helis/Vida motoru (r108) çalışıyor...");

    // 1. GİRDİLERİ AL
    const dia = window.evalDim(document.getElementById('helix-dia')) || 20;
    const height = window.evalDim(document.getElementById('helix-len')) || 50;
    const pitch = window.evalDim(document.getElementById('helix-pitch')) || 5;
    const wireDia = window.evalDim(document.getElementById('helix-wire')) || 2; 
    const isThread = document.getElementById('helix-thread')?.checked;

    if (pitch <= 0 || height <= 0) { 
        alert("Hata: Boy ve Hatve 0'dan büyük olmalı!"); 
        return; 
    }

    const radius = dia / 2;
    
    // 2. GEOMETRİYİ OLUŞTUR
    let geometry;
    let typeName = "";
    
    if (isThread) {
        // --- VİDA DİŞİ (R108 Uyumlu Custom Geometry) ---
        typeName = "Thread (Vida)";
        try {
            geometry = createFixedThreadGeometry(radius, height, pitch, wireDia);
        } catch (err) {
            console.error(err);
            // Hata olursa yedek olarak üçgen tüp kullan
            const curve = createHelixCurve(radius, height, pitch);
            geometry = new THREE.TubeGeometry(curve, Math.ceil(height/pitch)*10, wireDia/2, 3, false);
        }
    } else {
        // --- YAY (DAİRESEL) ---
        typeName = "Spring (Yay)";
        const curve = createHelixCurve(radius, height, pitch);
        const segments = Math.ceil((height / pitch) * 30);
        geometry = new THREE.TubeGeometry(curve, segments, wireDia / 2, 16, false);
    }

    // 3. SAHNEYE EKLE
    // Sahneyi bul (Hem scene hem window.scene kontrolü)
    let targetScene = null;
    if (typeof scene !== 'undefined') targetScene = scene;
    else if (window.scene) targetScene = window.scene;

    if (targetScene) {
        const material = new THREE.MeshStandardMaterial({ 
            color: isThread ? 0x64748b : 0x3b82f6, 
            metalness: 0.5, 
            roughness: 0.5,
            side: THREE.DoubleSide,
            flatShading: isThread 
        });

        const mesh = new THREE.Mesh(geometry, material);
        
        // Merkezle
        mesh.position.set(0, 0, 0); 
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Verileri Kaydet
        mesh.userData = {
            type: typeName,
            id: (isThread ? "TH-" : "SPR-") + Math.floor(Math.random()*999),
            volume: 100, // Temsili hacim
            geoParams: { shape: 'helix_gen', dia, height, pitch, wireDia, isThread },
            originalColor: material.color.getHex()
        };

        targetScene.add(mesh);
        
        // Listeleri Güncelle (Hata önleyici bloklar)
        if (typeof objects !== 'undefined') objects.push(mesh);
        try { if(typeof addMeshToTree === 'function') addMeshToTree(mesh); } catch(e){}
        try { if(typeof selectObject === 'function') selectObject(mesh, null); } catch(e){}
        
        if(typeof showNotification === 'function') showNotification(typeName + " eklendi.", "success");
        
    } else {
        alert("Sahne (scene) bulunamadı! Sayfayı yenileyin.");
    }
};
function updateGizmoLabels() {
    const lx = document.getElementById('lbl-gx'), ly = document.getElementById('lbl-gy'), lz = document.getElementById('lbl-gz');
    if (targetSel && transformControl.object) {
        const center = transformControl.object.position;
        const dist = camera.position.distanceTo(center) * 0.22;
        const axes = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
        if (transformControl.space === "local") axes.forEach(a => a.applyQuaternion(transformControl.object.quaternion));
        
        [lx, ly, lz].forEach((el, i) => {
            const pos = center.clone().add(axes[i].multiplyScalar(dist));
            pos.project(camera);
            el.style.left = (pos.x * 0.5 + 0.5) * window.innerWidth + 'px';
            el.style.top = (-(pos.y * 0.5) + 0.5) * window.innerHeight + 'px';
            el.style.display = pos.z < 1 ? 'block' : 'none';
        });
    } else { [lx, ly, lz].forEach(el => el.style.display = 'none'); }
}
// --- YARDIMCI 1: YAY YOLU OLUŞTURUCU ---
function createHelixCurve(radius, height, pitch) {
    const points = [];
    const turns = height / pitch;
    const segments = Math.ceil(turns * 20);
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = 2 * Math.PI * t * turns;
        const x = radius * Math.cos(angle);
        const z = radius * Math.sin(angle);
        const y = height * t;
        points.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(points);
}

// --- YARDIMCI 2: R108 UYUMLU VİDA DİŞİ ÖRÜCÜ ---
function createFixedThreadGeometry(radius, height, pitch, depth) {
    const geo = new THREE.BufferGeometry();
    const vertices = [];
    
    const segments = 32; 
    const turns = height / pitch;
    const totalSteps = Math.ceil(turns * segments);
    const angleStep = (Math.PI * 2) / segments;
    
    const rOut = radius;          
    const rIn = radius - depth;   

    // Koordinat Hesaplayıcı
    function getV(idx) {
        const ang = idx * angleStep;
        const yBase = (idx / segments) * pitch;
        const cos = Math.cos(ang);
        const sin = Math.sin(ang);

        return {
            bot: { x: cos * rIn, y: yBase, z: sin * rIn },           // Alt Dip
            mid: { x: cos * rOut, y: yBase + pitch * 0.5, z: sin * rOut }, // Tepe
            top: { x: cos * rIn, y: yBase + pitch, z: sin * rIn }    // Üst Dip
        };
    }

    // Üçgenleri Ör
    for (let i = 0; i < totalSteps; i++) {
        const c = getV(i);     // Current (Şu anki dilim)
        const n = getV(i + 1); // Next (Sonraki dilim)

        // Alt Yüzey (Bottom Slope)
        vertices.push(
            c.bot.x, c.bot.y, c.bot.z,
            c.mid.x, c.mid.y, c.mid.z,
            n.mid.x, n.mid.y, n.mid.z
        );
        vertices.push(
            c.bot.x, c.bot.y, c.bot.z,
            n.mid.x, n.mid.y, n.mid.z,
            n.bot.x, n.bot.y, n.bot.z
        );

        // Üst Yüzey (Top Slope)
        vertices.push(
            c.mid.x, c.mid.y, c.mid.z,
            c.top.x, c.top.y, c.top.z,
            n.mid.x, n.mid.y, n.mid.z
        );
        vertices.push(
            n.mid.x, n.mid.y, n.mid.z,
            c.top.x, c.top.y, c.top.z,
            n.top.x, n.top.y, n.top.z
        );
        
        // İç Duvar (Kapatma)
        vertices.push(
            c.bot.x, c.bot.y, c.bot.z,
            n.bot.x, n.bot.y, n.bot.z,
            c.top.x, c.top.y, c.top.z
        );
        vertices.push(
            c.top.x, c.top.y, c.top.z,
            n.bot.x, n.bot.y, n.bot.z,
            n.top.x, n.top.y, n.top.z
        );
    }

    // --- KRİTİK DÜZELTME: R108 İÇİN 'addAttribute' KULLANIMI ---
    // setAttribute yerine addAttribute kullanıyoruz.
    geo.addAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
    
    geo.computeVertexNormals();
    return geo;
}



window.changeAppTheme = function(theme) {
    const root = document.documentElement.style;
    
    if (theme === 'dark') {
        // --- KARANLIK MOD (DARK) ---
        root.setProperty('--panel-bg', 'rgba(30, 41, 59, 0.95)'); 
        root.setProperty('--panel-border', '#475569');            
        root.setProperty('--text-main', '#f1f5f9');               
        root.setProperty('--text-sub', '#94a3b8');                
        root.setProperty('--input-bg', '#0f172a');                
        root.setProperty('--input-border', '#334155');            
        root.setProperty('--input-text', '#e2e8f0');              
        root.setProperty('--btn-bg', '#1e293b');                  
        root.setProperty('--btn-text', '#60a5fa');                
        
        // Sahne Arka Planı
        if(typeof scene !== 'undefined' && scene) scene.background = new THREE.Color(0x111827); 
        
    } else if (theme === 'blue') {
        // --- TEKNOLOJİK MOD (TECH BLUE) ---
        root.setProperty('--panel-bg', 'rgba(15, 23, 42, 0.85)'); 
        root.setProperty('--panel-border', '#3b82f6');            
        root.setProperty('--text-main', '#bfdbfe');               
        root.setProperty('--text-sub', '#60a5fa');                
        root.setProperty('--input-bg', 'rgba(30, 58, 138, 0.5)'); 
        root.setProperty('--input-border', '#2563eb');            
        root.setProperty('--input-text', '#ffffff');              
        root.setProperty('--btn-bg', 'rgba(29, 78, 216, 0.3)');   
        root.setProperty('--btn-text', '#93c5fd');                
        
        // Sahne Arka Planı
        if(typeof scene !== 'undefined' && scene) scene.background = new THREE.Color(0x0f172a);

    } else {
        // --- AYDINLIK MOD (LIGHT - Varsayılan) ---
        root.setProperty('--panel-bg', 'rgba(255, 255, 255, 0.98)');
        root.setProperty('--panel-border', '#d1d5db');
        root.setProperty('--text-main', '#333333');
        root.setProperty('--text-sub', '#4b5563');
        root.setProperty('--input-bg', '#ffffff');
        root.setProperty('--input-border', '#cccccc');
        root.setProperty('--input-text', '#333333');
        root.setProperty('--btn-bg', '#ffffff');
        root.setProperty('--btn-text', '#2563eb');
        
        if(typeof scene !== 'undefined' && scene) scene.background = new THREE.Color(0xf0f2f5);
    }
    
    // Grid Rengini Ayarla
    const grid = (typeof scene !== 'undefined' && scene) ? scene.getObjectByName("GridHelper") : null;
    if (grid) {
        if (theme === 'light') {
            grid.material.color.setHex(0x999999);
            grid.material.opacity = 0.5;
        } else {
            grid.material.color.setHex(0x444444); 
            grid.material.opacity = 0.3;
        }
    }
    
    if(typeof showNotification === 'function') showNotification("Tema: " + theme.toUpperCase(), "success");
};
// Küpü Kameraya Göre Döndürür
// ──────────────────────────────────────────────────────────────
// VIEW CUBE v2 — updateViewCube
// Kameranın rotasyonunu CSS matrix3d olarak küpe yansıt
// ──────────────────────────────────────────────────────────────
function updateViewCube() {
    var cube = document.getElementById('vc2-cube');
    if (!camera || !cube) return;

    // camera.matrixWorldInverse'in rotasyon kısmını al
    // Sadece rotasyon — konum/scale yok
    var m = new THREE.Matrix4();
    m.extractRotation(camera.matrixWorldInverse);
    var e = m.elements;

    // CSS matrix3d: THREE column-major → CSS row-major transpoz gerekli
    // THREE: e[col*4+row], CSS: row-major
    cube.style.transform =
        'matrix3d(' +
        e[0]+','+e[1]+','+e[2]+',0,' +
        e[4]+','+e[5]+','+e[6]+',0,' +
        e[8]+','+e[9]+','+e[10]+',0,' +
        '0,0,0,1)';
}

// =============================================================================
// VIEW CUBE v2 — TAŞINABİLİR, SAHNEYİ DÖNDÜRÜR, KÜPÜ DEĞİL
// =============================================================================
var isCubeActive = false;  // küp üzerinden sahne döndürme
var vc2IsDragging = false; // küpü taşıma
var vc2DragOX = 0, vc2DragOY = 0;  // konum offset
var vc2DragMX = 0, vc2DragMY = 0;  // mouse başlangıç
var vc2PosX = 24, vc2PosY = 80;    // mevcut fixed pozisyon (px)
var lastX, lastY;

(function initVC2() {
    var wrap  = document.getElementById('vc2-wrap');
    var stage = document.getElementById('vc2-stage');
    if (!wrap || !stage) return;

    // ── STAGE: Küpü sürükleyerek sahneyi döndür ──
    stage.addEventListener('mousedown', function(e) {
        // Face veya corner/iso butonu tıklandıysa döndürme başlatma (onclick halleder)
        if (e.target.classList.contains('vc2-face') ||
            e.target.classList.contains('vc2-corner') ||
            e.target.classList.contains('vc2-iso-btn')) return;

        isCubeActive = true;
        lastX = e.clientX;
        lastY = e.clientY;
        if (controls) {
            controls.enabled = false;
        }
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    // ── WRAP: stage dışında (boş alan) tıklanırsa küpü taşı ──
    wrap.addEventListener('mousedown', function(e) {
        // Stage, face, corner, iso-btn üzerindeyse taşıma yapma
        if (e.target === stage ||
            e.target.id === 'vc2-cube' ||
            e.target.classList.contains('vc2-face') ||
            e.target.classList.contains('vc2-corner') ||
            e.target.classList.contains('vc2-iso-btn')) return;
        // Already handled by stage?
        if (isCubeActive) return;

        vc2IsDragging = true;
        var r = wrap.getBoundingClientRect();
        vc2DragOX = e.clientX - r.left;
        vc2DragOY = e.clientY - r.top;
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });
})();

// ── WINDOW MOUSEMOVE: taşıma VEYA döndürme
window.addEventListener('mousemove', function(e) {
    // Taşıma modu
    if (vc2IsDragging) {
        var wrap = document.getElementById('vc2-wrap');
        if (!wrap) return;
        var nx = e.clientX - vc2DragOX;
        var ny = e.clientY - vc2DragOY;
        // Ekran sınırları içinde tut
        nx = Math.max(0, Math.min(window.innerWidth  - 120, nx));
        ny = Math.max(0, Math.min(window.innerHeight - 160, ny));
        wrap.style.right = 'unset';
        wrap.style.left  = nx + 'px';
        wrap.style.top   = ny + 'px';
        return;
    }

    // Sahneyi döndürme (küp üzerinden sürükleme)
    if (!isCubeActive || !controls || !camera) return;

    var deltaX = e.clientX - lastX;
    var deltaY = e.clientY - lastY;
    var rotateSpeed = 0.005;

    var offset = camera.position.clone().sub(controls.target);
    var spherical = new THREE.Spherical();
    spherical.setFromVector3(offset);
    spherical.theta -= deltaX * rotateSpeed;
    spherical.phi   -= deltaY * rotateSpeed;
    spherical.phi    = Math.max(0.01, Math.min(Math.PI - 0.01, spherical.phi));
    offset.setFromSpherical(spherical);
    camera.position.copy(controls.target).add(offset);
    camera.lookAt(controls.target);
    controls.update();

    lastX = e.clientX;
    lastY = e.clientY;
}, { passive: false });

// ── WINDOW MOUSEUP
window.addEventListener('mouseup', function() {
    if (vc2IsDragging) {
        vc2IsDragging = false;
        var wrap = document.getElementById('vc2-wrap');
        if (wrap) wrap.style.cursor = 'move';
    }
    if (isCubeActive) {
        isCubeActive = false;
        if (controls) {
            controls.enabled = true;
            controls.update();  // Birikmiş velocity'yi temizle
        }
    }
    // Push/Pull drag bitti
    if (typeof pushPullMode !== 'undefined' && pushPullMode && typeof ppV3MouseUp === 'function') {
        ppV3MouseUp(event);
    }
});








// Görünüşü Değiştirir

// =============================================================================
// CTRL+SÜRÜKLE / CTRL+DÖNDÜR — KOPYA DUPLICATEMA
// =============================================================================
var _ctrlCopyActive  = false;   // Ctrl basılı + drag başladı
var _ctrlCopyGhost   = null;    // Sürükleme sırasında gösterilen kopyalar
var _ctrlCopySource  = null;    // Orijinal obje
var _ctrlCopyStartPos = null;
var _ctrlCopyStartRot = null;
var _ctrlKeyDown     = false;

window.addEventListener('keydown', function(e) {
    if (e.key === 'Control') _ctrlKeyDown = true;
});
window.addEventListener('keyup', function(e) {
    if (e.key === 'Control') {
        _ctrlKeyDown = false;
        _ctrlCopyActive = false;
    }
});

// Hook into transformControl dragging-changed for Ctrl-copy
(function patchCtrlCopy() {
    if (!window._ctrlCopyPatched) {
        window._ctrlCopyPatched = true;

        // After drag ends: if ctrl was held, create a permanent copy and reset original
        var origDraggingChanged = null;
        document.addEventListener('DOMContentLoaded', function() {});

        // We patch via the global mouseup
        window.addEventListener('mouseup', function() {
            if (_ctrlCopyActive && _ctrlCopySource) {
                var src = _ctrlCopySource;
                var curPos = src.position.clone();
                var curRot = src.rotation.clone();

                // Reset original to start position/rotation
                if (_ctrlCopyStartPos) src.position.copy(_ctrlCopyStartPos);
                if (_ctrlCopyStartRot) src.rotation.copy(_ctrlCopyStartRot);

                // Create permanent copy at the dragged position
                var copy = src.clone();
                copy.material = src.material.clone();
                copy.userData = JSON.parse(JSON.stringify(src.userData));
                copy.userData.id = (src.userData.id || 'obj') + '_CPY_' + Date.now().toString(36);
                copy.position.copy(curPos);
                copy.rotation.copy(curRot);
                scene.add(copy);
                objects.push(copy);
                if (typeof addMeshToTree === 'function') addMeshToTree(copy);
                if (typeof updateSceneTotals === 'function') updateSceneTotals();
                showNotification('⎘ Ctrl-Kopya oluşturuldu', 'success');
                saveCheckpoint();

                _ctrlCopyActive  = false;
                _ctrlCopySource  = null;
                _ctrlCopyStartPos = null;
                _ctrlCopyStartRot = null;
            }
        });
    }
})();

// Called from transformControl 'change' to check Ctrl state
function checkCtrlCopyStart(obj) {
    if (_ctrlKeyDown && !_ctrlCopyActive && transformControl && transformControl.dragging) {
        _ctrlCopyActive   = true;
        _ctrlCopySource   = obj;
        _ctrlCopyStartPos = obj.position.clone();
        _ctrlCopyStartRot = obj.rotation.clone();
        showNotification('⎘ Ctrl basılı — bırakınca kopya oluşacak', 'info');
    }
}

// =============================================================================
// ARRAY MODAL — Tab, Axis, Pivot state
// =============================================================================
var _arrayTab       = 'linear';
var _polarAxis      = 'y';
var _polarPivot     = 'origin';
var _arraySourceMesh = null;

window.switchArrayTab = function(tab) {
    _arrayTab = tab;
    document.getElementById('arr-panel-linear').classList.toggle('hidden', tab !== 'linear');
    document.getElementById('arr-panel-polar').classList.toggle('hidden', tab !== 'polar');
    document.getElementById('arr-tab-linear').className =
        'flex-1 py-2.5 text-sm font-black transition ' +
        (tab === 'linear' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-gray-500 border-b-2 border-transparent hover:bg-gray-50');
    document.getElementById('arr-tab-polar').className =
        'flex-1 py-2.5 text-sm font-black transition ' +
        (tab === 'polar' ? 'text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50' : 'text-gray-500 border-b-2 border-transparent hover:bg-gray-50');
    updateArrayPreview();
};

window.selectPolarAxis = function(ax) {
    _polarAxis = ax;
    ['x','y','z'].forEach(function(a) {
        var btn = document.getElementById('pol-ax-' + a);
        if (btn) btn.className = 'flex-1 py-1.5 text-xs font-black rounded-lg border-2 ' +
            (a === ax ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200');
    });
    updateArrayPreview();
};

window.selectPolarPivot = function(piv) {
    _polarPivot = piv;
    ['origin','object','source'].forEach(function(p) {
        var btn = document.getElementById('pol-piv-' + p);
        if (btn) btn.className = 'flex-1 py-1 text-[10px] font-black rounded border ' +
            (p === piv ? 'bg-indigo-600 text-white border-indigo-400' : 'bg-white text-gray-600 border-gray-300');
    });
};

function updateArrayPreview() {
    if (_arrayTab === 'linear') {
        var cnt     = Math.round(window.evalDim(document.getElementById('lin-count'))) || 4;
        var spacing = window.evalDim(document.getElementById('lin-spacing')) || 30;
        var axis    = document.getElementById('lin-axis').value || 'z';
        var both    = document.getElementById('lin-both').checked;
        var total   = both ? (cnt * 2 - 1) : cnt;
        var span    = spacing * (cnt - 1);
        var prev = document.getElementById('lin-preview');
        if (prev) prev.textContent =
            total + ' parça  |  ' + axis.toUpperCase() + ' yönünde  |  ' +
            (both ? '±' : '+') + span.toFixed(0) + ' mm aralık';
    } else {
        var cnt2  = Math.round(window.evalDim(document.getElementById('pol-count'))) || 6;
        var ang   = window.evalDim(document.getElementById('pol-angle')) || 360;
        var step  = (Math.abs(ang) >= 360) ? (360/cnt2) : (ang/(cnt2-1));
        var prev2 = document.getElementById('pol-preview');
        if (prev2) prev2.textContent =
            cnt2 + ' parça  |  ' + _polarAxis.toUpperCase() + ' eksen  |  her ' +
            step.toFixed(1) + '° | toplam ' + ang + '°';
    }
}

// Live preview on input change
['lin-count','lin-spacing','lin-axis','pol-count','pol-angle'].forEach(function(id) {
    document.addEventListener('DOMContentLoaded', function() {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', updateArrayPreview);
    });
});

// Open array modal
window.openArrayModal = function(tab, mesh) {
    _arraySourceMesh = mesh || (targetSel && targetSel.mesh) || null;
    if (!_arraySourceMesh) { showNotification('Önce bir parça seçin', 'error'); return; }
    document.getElementById('array-modal').classList.remove('hidden');
    switchArrayTab(tab || 'linear');
    updateArrayPreview();
};

// Apply
window.applyArrayModal = function() {
    var mesh = _arraySourceMesh;
    if (!mesh) { showNotification('Kaynak parça bulunamadı', 'error'); return; }
    saveCheckpoint();
    document.getElementById('array-modal').classList.add('hidden');

    if (_arrayTab === 'linear') {
        var cnt     = Math.max(2, Math.round(window.evalDim(document.getElementById('lin-count'))) || 4);
        var spacing = window.evalDim(document.getElementById('lin-spacing')) || 30;
        var axis    = document.getElementById('lin-axis').value || 'z';
        var both    = document.getElementById('lin-both').checked;
        var created = 0;

        var dirs = both ? [-1, 1] : [1];
        dirs.forEach(function(dir) {
            for (var i = 1; i < cnt; i++) {
                var copy = mesh.clone();
                copy.material = mesh.material.clone();
                copy.userData = JSON.parse(JSON.stringify(mesh.userData));
                copy.userData.id = (mesh.userData.id || 'obj') + '_LA' + dir + '_' + i;
                copy.position.copy(mesh.position);
                copy.position[axis] += dir * i * spacing;
                scene.add(copy);
                objects.push(copy);
                if (typeof addMeshToTree === 'function') addMeshToTree(copy);
                created++;
            }
        });
        if (typeof updateSceneTotals === 'function') updateSceneTotals();
        showNotification('✦ Lineer Array: ' + created + ' kopya oluşturuldu', 'success');

    } else {
        // Polar
        var cnt2  = Math.max(2, Math.round(window.evalDim(document.getElementById('pol-count'))) || 6);
        var ang   = window.evalDim(document.getElementById('pol-angle')) || 360;
        var rotObj= document.getElementById('pol-rotate-obj').checked;
        var axisVec = new THREE.Vector3(
            _polarAxis === 'x' ? 1 : 0,
            _polarAxis === 'y' ? 1 : 0,
            _polarAxis === 'z' ? 1 : 0
        );

        // Pivot
        var pivot = new THREE.Vector3();
        if (_polarPivot === 'object') {
            var b = new THREE.Box3().setFromObject(mesh);
            b.getCenter(pivot);
        } else if (_polarPivot === 'source' && sourceSel && sourceSel.mesh !== mesh) {
            var b2 = new THREE.Box3().setFromObject(sourceSel.mesh);
            b2.getCenter(pivot);
        }
        // else origin stays (0,0,0)

        var isFull = (Math.abs(ang) >= 360);
        var step   = isFull ? (360 / cnt2) : (ang / (cnt2 - 1));
        var created2 = 0;

        for (var i = 1; i < cnt2; i++) {
            var rad  = THREE.Math.degToRad(i * step);
            var copy2 = mesh.clone();
            copy2.material = mesh.material.clone();
            copy2.userData = JSON.parse(JSON.stringify(mesh.userData));
            copy2.userData.id = (mesh.userData.id || 'obj') + '_PA_' + i;

            var localPos = mesh.position.clone().sub(pivot);
            localPos.applyAxisAngle(axisVec, rad);
            copy2.position.copy(localPos.add(pivot));

            if (rotObj) {
                var q = new THREE.Quaternion().setFromAxisAngle(axisVec, rad);
                copy2.quaternion.copy(mesh.quaternion);
                copy2.quaternion.premultiply(q);
            }

            scene.add(copy2);
            objects.push(copy2);
            if (typeof addMeshToTree === 'function') addMeshToTree(copy2);
            created2++;
        }
        if (typeof updateSceneTotals === 'function') updateSceneTotals();
        showNotification('⟳ Polar Array: ' + created2 + ' kopya oluşturuldu', 'success');
    }
};


// =============================================================================
// FILLET / CHAMFER — Köşe Radyusu
// =============================================================================


window.toggleMainGrid = function() {
    var g = scene.getObjectByName('MainGrid');
    if (!g) return;
    g.visible = !g.visible;
    var btn = document.getElementById('btn-grid-toggle');
    if (btn) {
        btn.style.background = g.visible ? '' : '#ef4444';
        btn.style.color      = g.visible ? '' : '#fff';
        btn.title = g.visible ? 'Grid Gizle' : 'Grid Göster';
    }
    showNotification('Grid ' + (g.visible ? 'açık' : 'kapalı'), 'info');
};
window.setView = function(v) {
    if (!camera || !controls) return;
    var target = controls.target.clone();
    var d = 350;
    var S = d / Math.SQRT2;          // 45° isometric offset
    var H = d * Math.sin(Math.atan(1/Math.SQRT2)); // isometric height ~d*0.577

    if      (v === 'top')     camera.position.set(target.x,         target.y + d, target.z);
    else if (v === 'bottom')  camera.position.set(target.x,         target.y - d, target.z);
    else if (v === 'front')   camera.position.set(target.x,         target.y,     target.z + d);
    else if (v === 'back')    camera.position.set(target.x,         target.y,     target.z - d);
    else if (v === 'right' || v === 'side') camera.position.set(target.x + d, target.y, target.z);
    else if (v === 'left')    camera.position.set(target.x - d,     target.y,     target.z);
    // İzometrik görünümler: 45° yatay, ~35.26° dikey (gerçek izometrik)
    else if (v === 'iso-sw')  camera.position.set(target.x - S,  target.y + H, target.z + S);
    else if (v === 'iso-se')  camera.position.set(target.x + S,  target.y + H, target.z + S);
    else if (v === 'iso-nw')  camera.position.set(target.x - S,  target.y + H, target.z - S);
    else if (v === 'iso-ne')  camera.position.set(target.x + S,  target.y + H, target.z - S);
    else if (v === 'iso')     camera.position.set(target.x + S,  target.y + H, target.z + S); // compat

    camera.lookAt(target);
    controls.update();
    if (typeof updateViewCube === 'function') updateViewCube();
};

// =============================================================================
// SAĞ PANEL — glass hover ile görünürlük, slide/trigger kaldırıldı
// =============================================================================
// panel-visible ekleme/çıkarma artık kullanılmıyor; opacity CSS ile kontrol edilir
function toggleRightPanel() { /* disabled - glass CSS handles visibility */ }

// =============================================================================
// YÜZEY EKSEN SHOWİCİ (SURFACE AXIS HELPER)
// =============================================================================
function showSurfaceAxis(mesh, point, normal) {
    // Varsa eskisini sil
    const oldAxis = scene.getObjectByName("TempSurfaceAxis");
    if (oldAxis) scene.remove(oldAxis);

    // Eksen boyutunu biraz büyütelim (30 birim)
    const axisHelper = new THREE.AxesHelper(30);
    axisHelper.name = "TempSurfaceAxis";
    
    // Ekseni tıklanan noktaya koy
    axisHelper.position.copy(point);

    // Normal vektörünün geçerli olduğundan emin ol
    if (normal && normal.length() > 0) {
        const arrowDir = normal.clone().normalize();
        const defaultUp = new THREE.Vector3(0, 1, 0);
        
        // Eğer normal zaten yukarı bakıyorsa quaternion hata verebilir, kontrol et
        if (arrowDir.distanceTo(defaultUp) < 0.0001) {
            axisHelper.quaternion.set(0, 0, 0, 1);
        } else if (arrowDir.distanceTo(new THREE.Vector3(0, -1, 0)) < 0.0001) {
            axisHelper.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        } else {
            axisHelper.quaternion.setFromUnitVectors(defaultUp, arrowDir);
        }
    }

    scene.add(axisHelper);
}

// Sayfa yüklendiğinde küpü zorla aktif et
window.addEventListener('load', function() {
    setTimeout(() => {
        const cube = document.getElementById('viewcube');
        if(cube) {
            cube.style.pointerEvents = "auto"; // CSS ezilmesine karşı garanti
            console.log("ViewCube aktif edildi.");
        }
    }, 1000);
});

// Yüzeyin hangi yöne baktığını bulan fonksiyon
function getFaceDirectionName(normal) {
    const x = normal.x;
    const y = normal.y;
    const z = normal.z;
    const absX = Math.abs(x);
    const absY = Math.abs(y);
    const absZ = Math.abs(z);

    if (absY > absX && absY > absZ) {
        return y > 0 ? "TOP (Üst)" : "BOTTOM (Alt)";
    } else if (absZ > absX && absZ > absY) {
        return z > 0 ? "FRONT (Ön)" : "BACK (Arka)";
    } else {
        return x > 0 ? "RIGHT (Sağ)" : "LEFT (Sol)";
    }
}

// Tüm olayların ve sahnenin başlatıldığı son temiz blok
window.addEventListener('load', function() {
    // 1. Dinamik Kutu (Enter) Olayı
    const dv = document.getElementById('dynamic-value');
    if(dv) {
        dv.addEventListener('keydown', function(e) {
            const container = document.getElementById('dynamic-input-container');
            if (e.key === 'Enter') {
                const inputVal = parseFloat(this.value);
                const obj = transformControl.object;
                const axis = document.getElementById('dynamic-label').innerText.replace('Δ','').toLowerCase();
                const mode = transformControl.getMode();
                if (obj && !isNaN(inputVal)) {
                    saveCheckpoint();
                    if (mode === 'translate') obj.position[axis] = startPos[axis] + inputVal;
                    else if (mode === 'rotate') obj.rotation[axis] = startRot[axis] + THREE.Math.degToRad(inputVal);
                    else if (mode === 'scale') obj.scale[axis] = startSca[axis] + inputVal;
                    transformControl.update();
                    updateInfoPanel(obj);
                    container.classList.add('hidden');
                    this.blur();
                }
            }
            // Pick + Push/Pull modlarını ESC ile iptal et
    if (e.key === 'p' || e.key === 'P') {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement.tagName !== 'INPUT') {
            togglePushPullMode();
            return;
        }
    }
    if (e.key === 'Escape' && typeof pushPullMode !== 'undefined' && pushPullMode) {
        ppV3Reset();
        togglePushPullMode();
        return;
    }
    if (e.key === 'Escape' && window.edgePickState) {
        if (typeof cancelEdgePick === 'function') cancelEdgePick();
        return;
    }
    if (e.key === 'Escape' && window.cornerPickState) {
        if (typeof cancelCornerPick === 'function') cancelCornerPick();
        return;
    }

    if (e.key === 'Escape') { 
                container.classList.add('hidden'); 
                this.blur(); 
            }
        });
    }

    // 2. Sahneyi Başlat
    init();
    animate();
    console.log("Uygulama başarıyla başlatıldı.");
});

// =============================================================================
// SAĞ PANEL MANUEL HIDE/SHOW
// =============================================================================
function toggleRightPanel() { /* disabled - always open */ }




// =============================================================================
// MANUEL KOORDİNAT KONTROL MOTORU
// =============================================================================
function updateManualControls(mesh) {
    if (!mesh) return;
    var panel = document.getElementById('manual-control-panel');
    if (panel) panel.classList.remove('hidden');
    var nameEl = document.getElementById('transform-obj-name');
    if (nameEl) nameEl.textContent = mesh.name ? ('— ' + mesh.name) : '';
    var deg = THREE.Math ? THREE.Math.radToDeg.bind(THREE.Math) : function(r){ return r*180/Math.PI; };
    var set = function(id, v) { var el = document.getElementById(id); if(el) el.value = v; };
    set('control-pos-x', mesh.position.x.toFixed(1));
    set('control-pos-y', mesh.position.y.toFixed(1));
    set('control-pos-z', mesh.position.z.toFixed(1));
    set('control-rot-x', deg(mesh.rotation.x).toFixed(1));
    set('control-rot-y', deg(mesh.rotation.y).toFixed(1));
    set('control-rot-z', deg(mesh.rotation.z).toFixed(1));
    set('control-scale-x', mesh.scale.x.toFixed(3));
    set('control-scale-y', mesh.scale.y.toFixed(3));
    set('control-scale-z', mesh.scale.z.toFixed(3));
}

function applyAllManualControls() {
    applyManualPosition();
    applyManualRotation();
    applyManualScale();
    showNotification('✅ Transform uygulandı', 'success');
}

function applyManualPosition() {
    if (!targetSel) return;
    saveCheckpoint();
    const mesh = targetSel.mesh;
    mesh.position.x = window.evalDim(document.getElementById('control-pos-x')) || 0;
    mesh.position.y = window.evalDim(document.getElementById('control-pos-y')) || 0;
    mesh.position.z = window.evalDim(document.getElementById('control-pos-z')) || 0;
    if(transformControl) transformControl.update();
    updateSceneTotals();
}

function applyManualRotation() {
    if (!targetSel) return;
    saveCheckpoint();
    const mesh = targetSel.mesh;
    mesh.rotation.x = THREE.Math.degToRad(window.evalDim(document.getElementById('control-rot-x')) || 0);
    mesh.rotation.y = THREE.Math.degToRad(window.evalDim(document.getElementById('control-rot-y')) || 0);
    mesh.rotation.z = THREE.Math.degToRad(window.evalDim(document.getElementById('control-rot-z')) || 0);
    if(transformControl) transformControl.update();
}

function applyManualScale() {
    if (!targetSel) return;
    saveCheckpoint();
    const mesh = targetSel.mesh;
    mesh.scale.x = window.evalDim(document.getElementById('control-scale-x')) || 1;
    mesh.scale.y = window.evalDim(document.getElementById('control-scale-y')) || 1;
    mesh.scale.z = window.evalDim(document.getElementById('control-scale-z')) || 1;
    if(transformControl) transformControl.update();
    updateInfoPanel(mesh);
    updateSceneTotals();
}

function resetManualControls() {
    if (!targetSel) return;
    saveCheckpoint();
    targetSel.mesh.position.set(0,0,0);
    targetSel.mesh.rotation.set(0,0,0);
    targetSel.mesh.scale.set(1,1,1);
    updateManualControls(targetSel.mesh);
    if(transformControl) transformControl.update();
}

// =============================================================================
// GLB (GLTF) EXPORT MOTORU - MODERN 3D FORMATI
// =============================================================================
function exportGLTF() {
    if (objects.length === 0) { 
        showNotification("Dışarı aktarılacak parça yok!", "error"); 
        return; 
    }

    showNotification("GLB Dosyası Hazırlanıyor...", "warning");

    // 1. Export Edilecek Grubu Hazırla
    const exportGroup = new THREE.Group();
    
    // Sadece çizim parçalarını kopyala (Grid ve okları alma)
    objects.forEach(obj => {
        const clone = obj.clone();
        // Malzeme uyumluluğu için MeshStandardMaterial kullanıldığından emin ol
        if (!clone.material.isMeshStandardMaterial) {
            const oldColor = clone.material.color;
            clone.material = new THREE.MeshStandardMaterial({
                color: oldColor,
                metalness: 0.5,
                roughness: 0.5
            });
        }
        clone.applyMatrix(obj.matrixWorld); // Konumu sabitle
        exportGroup.add(clone);
    });

    // 2. GLTF Exporter'ı Çalıştır
    const exporter = new THREE.GLTFExporter();
    
    exporter.parse(exportGroup, function (result) {
        // 3. Dosyayı İndir (Binary GLB olarak)
        saveArrayBuffer(result, 'WebForge3D_Proje.glb');
        showNotification("GLB (AR) Dosyası İndirildi!", "success");
    }, {
        binary: true // .glb formatı için true (tek dosya)
    });
}

// Yardımcı: Binary Dosyayı Kaydetme
function saveArrayBuffer(buffer, filename) {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    
    // Modern Kayıt Penceresi (Varsa)
    if (window.showSaveFilePicker) {
        saveFileWithDialog(blob, filename, 'GLB 3D Model', 'model/gltf-binary', '.glb');
    } else {
        // Klasik İndirme (Yedek)
        const link = document.createElement('a');
        link.style.display = 'none';
        document.body.appendChild(link);
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        document.body.removeChild(link);
    }
}

// =============================================================================
// PUSH / PULL — Sıfırdan yazılmış, Three.js r108, BufferGeometry
// Kullanım: PUSH/PULL butonuna bas → yüzeye tıkla+sürükle
// =============================================================================
var pushPullMode = false;
var _pp = {
    active: false,
    mesh:   null,
    norm:   null,   // local normal
    worldNorm: null,// world normal
    hitWorld: null, // world-space hit point (drag plane origin)
    idxs:   [],     // vertex indices to move
    orig:   null,   // Float32Array snapshot
    y0:     0,
    scale:  1,
    lastDist: 0
};

function togglePushPullMode(forceOn) {
    if (forceOn !== undefined) pushPullMode = !forceOn; // will flip below
    pushPullMode = !pushPullMode;
    _pp.active = pushPullMode;
    _pp.mesh = null;

    var btn  = document.getElementById('btn-pushpull');
    var btnT = document.getElementById('btn-pushpull-top');
    var hint = document.getElementById('pushpull-hint');
    if (pushPullMode) {
        if (btn)  { btn.style.background='#f59e0b'; btn.style.color='#000'; btn.innerHTML='<i class="fas fa-hand-paper"></i> AKTİF — Yüzeye tıkla+sürükle'; }
        if (btnT) { btnT.style.background='#f59e0b'; btnT.textContent='✋ PUSH/PULL AKTİF — ESC ile çık'; }
        if (hint) { hint.classList.remove('hidden'); hint.textContent='Yüzeyin üzerine tıkla ve sürükle • ESC veya ✕ ile çık'; }
        if (renderer) renderer.domElement.style.cursor = 'crosshair';
        // Show floating exit button
        var ppExit = document.getElementById('pp-exit-btn');
        if(!ppExit){ ppExit=document.createElement('button'); ppExit.id='pp-exit-btn';
          ppExit.style.cssText='position:fixed;bottom:20px;right:20px;z-index:9999;background:#f59e0b;color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.4);';
          ppExit.innerHTML='✋ PUSH/PULL AKTİF<br><small style="font-size:9px">ESC veya buraya tıkla çıkmak için</small>';
          ppExit.onclick=function(){if(typeof ppV3Reset==='function')ppV3Reset();if(typeof togglePushPullMode==='function')togglePushPullMode();};
          document.body.appendChild(ppExit);
        } else { ppExit.style.display='block'; }
        showNotification('✋ Push/Pull: yüzeye tıkla+sürükle — ESC ile çık', 'success');
    } else {
        if (btn)  { btn.style.background=''; btn.style.color=''; btn.innerHTML='<i class="fas fa-hand-paper"></i> PUSH/PULL MODU AÇ'; }
        if (btnT) { btnT.style.background=''; btnT.textContent='✋ PUSH/PULL'; }
        if (hint) hint.classList.add('hidden');
        if (renderer) renderer.domElement.style.cursor = '';
        if (controls) controls.enabled = true;
        // Hide floating exit button
        var ppExit=document.getElementById('pp-exit-btn'); if(ppExit) ppExit.style.display='none';
    }
}

// Apply entered value to push/pull
window.applyPPValue = function() {
    var inp = document.getElementById('pp-val-input');
    if (!inp || !_pp.mesh) return;
    var dist = parseFloat(inp.value);
    if (isNaN(dist)) return;

    var posA = _pp.mesh.geometry.attributes.position;
    var n    = _pp.norm;
    if (!n || !_pp.orig) return;

    posA.array.set(_pp.orig);
    for (var i = 0; i < _pp.idxs.length; i++) {
        var vi = _pp.idxs[i];
        posA.setXYZ(vi,
            _pp.orig[vi*3]   + n.x * dist,
            _pp.orig[vi*3+1] + n.y * dist,
            _pp.orig[vi*3+2] + n.z * dist
        );
    }
    posA.needsUpdate = true;
    _pp.mesh.geometry.computeVertexNormals();
    _pp.mesh.geometry.computeBoundingBox();
    _pp.mesh.geometry.computeBoundingSphere();
    _pp.lastDist = dist;

    var hint = document.getElementById('pushpull-hint');
    if (hint) hint.textContent = (dist>=0?'＋':'−') + Math.abs(dist).toFixed(2) + 'mm ✓ uygulandı';
    if (typeof getMeshVolume === 'function') _pp.mesh.userData.volume = getMeshVolume(_pp.mesh.geometry);
    if (typeof updateInfoPanel === 'function') updateInfoPanel(_pp.mesh);
    if (typeof updateSceneTotals === 'function') updateSceneTotals();
    if (typeof showNotification === 'function') showNotification((dist>=0?'⬆ +':' ⬇ ') + Math.abs(dist).toFixed(2) + ' mm uygulandı', 'success');
};


window._ppLiveVal = function(val) {
    var dist = parseFloat(val);
    if (isNaN(dist) || !_pp.mesh || !_pp.orig || !_pp.norm) return;
    var posA = _pp.mesh.geometry.attributes.position;
    var n = _pp.norm;
    posA.array.set(_pp.orig);
    for (var i = 0; i < _pp.idxs.length; i++) {
        var vi = _pp.idxs[i];
        posA.setXYZ(vi, _pp.orig[vi*3]+n.x*dist, _pp.orig[vi*3+1]+n.y*dist, _pp.orig[vi*3+2]+n.z*dist);
    }
    posA.needsUpdate = true;
    _pp.mesh.geometry.computeVertexNormals();
    _pp.lastDist = dist;
    var hint = document.getElementById('pushpull-hint');
    if (hint) hint.textContent = (dist>=0?'⬆ +':'⬇ ') + Math.abs(dist).toFixed(2) + ' mm';
};

// Push/Pull auto-open removed

// Pick face → get coplanar vertex indices (r108 compatible)
function _ppPickFace(mesh, hitFace, hitPt) {
    var geo  = mesh.geometry;
    var posA = geo.attributes.position;
    mesh.updateMatrixWorld(true);

    // Local normal from face (r108: hitFace.normal is local-space)
    var locNorm;
    if (hitFace && hitFace.normal) {
        locNorm = hitFace.normal.clone().normalize();
    } else {
        // fallback: use world hit direction → local
        var invM = new THREE.Matrix4();
        invM.getInverse(mesh.matrixWorld);
        var lc = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
        locNorm = hitPt.clone().sub(lc).transformDirection(invM).normalize();
    }

    // Hit point in local space
    var invM2 = new THREE.Matrix4();
    invM2.getInverse(mesh.matrixWorld);
    var lHit = hitPt.clone().applyMatrix4(invM2);
    var hitD = locNorm.dot(lHit);

    // Bounding box tolerance
    if (!geo.boundingBox) geo.computeBoundingBox();
    var bsz = new THREE.Vector3();
    geo.boundingBox.getSize(bsz);
    var tol = Math.max(bsz.length() * 0.015, 0.1);

    // Collect vertices on this plane
    var idxs = [];
    for (var i = 0; i < posA.count; i++) {
        var d = locNorm.x*posA.getX(i) + locNorm.y*posA.getY(i) + locNorm.z*posA.getZ(i);
        if (Math.abs(d - hitD) < tol) idxs.push(i);
    }
    // World normal
    var nMat = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    var worldNorm = locNorm.clone().applyMatrix3(nMat).normalize();
    return { norm: locNorm, worldNorm: worldNorm, idxs: idxs, hitD: hitD };
}

// Attach PP event listeners once renderer is ready
(function attachPP() {
    if (!renderer || !renderer.domElement) { setTimeout(attachPP, 200); return; }

    var el = renderer.domElement;

    el.addEventListener('mousedown', function(e) {
        if (!pushPullMode || e.button !== 0) return;
        if (typeof transformControl !== 'undefined' && transformControl.axis !== null) return;

        var rect = el.getBoundingClientRect();
        var mx = ((e.clientX-rect.left)/rect.width)*2-1;
        var my = -((e.clientY-rect.top)/rect.height)*2+1;
        var rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(mx, my), camera);

        var meshes = objects.filter(function(o){ return o.isMesh && o.visible; });
        var hits = rc.intersectObjects(meshes, false);
        if (!hits.length) return;

        e.stopImmediatePropagation();
        e.preventDefault();

        var hit = hits[0];

        var hitMesh = hit.object;
        // Capture face normal BEFORE geometry conversion (face index may change)
        var savedFace = hit.face ? { normal: hit.face.normal.clone() } : null;
        // Convert indexed geometry so each face has independent vertices
        if (hitMesh.geometry && hitMesh.geometry.index) {
            hitMesh.geometry = hitMesh.geometry.toNonIndexed();
            hitMesh.geometry.computeVertexNormals();
            hitMesh.geometry.computeBoundingBox();
        }

        var res = _ppPickFace(hitMesh, savedFace, hit.point);
        if (!res.idxs.length) {
            showNotification('Yüzey bulunamadı', 'error'); return;
        }

        saveCheckpoint && saveCheckpoint();
        if (controls) controls.enabled = false;

        _pp.mesh  = hit.object;
        _pp.norm  = res.norm;
        _pp.worldNorm = res.worldNorm;
        _pp.hitWorld  = hit.point.clone();
        _pp.idxs  = res.idxs;
        _pp.hitD  = res.hitD || 0;
        _pp.orig  = new Float32Array(_pp.mesh.geometry.attributes.position.array);
        _pp.y0    = e.clientY;
        _pp.lastDist = 0;

        // Scale: pixels per mm based on camera distance
        var wc = hit.point;
        var camDist = camera.position.distanceTo(wc);
        _pp.scale = Math.max(0.05, 400 / camDist);

        _pp.active = true;
        el.style.cursor = 'ns-resize';

        var hint = document.getElementById('pushpull-hint');
        if (hint) hint.textContent = '▲▼ Sürükle — ' + res.idxs.length + ' vertex';
    }, true);

    el.addEventListener('mousemove', function(e) {
        if (!pushPullMode || !_pp.mesh) return;
        e.stopImmediatePropagation();

        // Project mouse onto drag plane (world-space plane through hit point, normal = camera view)
        var rect  = el.getBoundingClientRect();
        var mx    = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        var my    = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
        var ray   = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(mx, my), camera);

        // Drag plane: passes through _pp.hitWorld, faces the camera
        var camDir   = camera.position.clone().sub(_pp.hitWorld).normalize();
        var dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, _pp.hitWorld);
        var curPt    = new THREE.Vector3();
        ray.ray.intersectPlane(dragPlane, curPt);
        if (!curPt) return;

        // Project displacement onto world face normal → dist in mm
        var worldNorm = _pp.worldNorm;
        var delta     = curPt.clone().sub(_pp.hitWorld);
        var dist      = delta.dot(worldNorm);

        var posA = _pp.mesh.geometry.attributes.position;
        var n    = _pp.norm;  // local normal

        posA.array.set(_pp.orig);
        for (var i = 0; i < _pp.idxs.length; i++) {
            var vi = _pp.idxs[i];
            posA.setXYZ(vi,
                _pp.orig[vi*3]   + n.x * dist,
                _pp.orig[vi*3+1] + n.y * dist,
                _pp.orig[vi*3+2] + n.z * dist
            );
        }
        posA.needsUpdate = true;
        _pp.mesh.geometry.computeVertexNormals();
        _pp.lastDist = dist;

        var hint = document.getElementById('pushpull-hint');
        if (hint) hint.textContent = (dist>=0?'⬆ +':'⬇ ') + Math.abs(dist).toFixed(2) + ' mm';
    }, true);

    window.addEventListener('mouseup', function(e) {
        if (!pushPullMode || !_pp.mesh) return;

        // Finalize
        _pp.mesh.geometry.computeBoundingBox();
        _pp.mesh.geometry.computeBoundingSphere();
        _pp.mesh.geometry.computeVertexNormals();

        // Update EdgeHelper
        _pp.mesh.children.forEach(function(ch) {
            if (ch.name === 'EdgeHelper') {
                ch.geometry.dispose();
                ch.geometry = new THREE.EdgesGeometry(_pp.mesh.geometry, 5);
            }
        });

        var dist = _pp.lastDist || 0;

        if (typeof getMeshVolume === 'function') _pp.mesh.userData.volume = getMeshVolume(_pp.mesh.geometry);
        if (typeof updateInfoPanel === 'function') updateInfoPanel(_pp.mesh);
        if (typeof updateSceneTotals === 'function') updateSceneTotals();

        // ── Recenter geometry so pivot = bbox center ──────────────────
        (function() {
            var mesh = _pp.mesh;
            var geo  = mesh.geometry;
            geo.computeBoundingBox();
            var center = new THREE.Vector3();
            geo.boundingBox.getCenter(center);
            if (center.lengthSq() < 0.0001) return; // already centered
            var pa = geo.attributes.position;
            for (var vi = 0; vi < pa.count; vi++) {
                pa.setXYZ(vi, pa.getX(vi)-center.x, pa.getY(vi)-center.y, pa.getZ(vi)-center.z);
            }
            pa.needsUpdate = true;
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            // Move mesh.position to compensate (local→world via quaternion)
            var wc = center.clone().applyQuaternion(mesh.quaternion);
            mesh.position.add(wc);
            if (window.transformControl && window.selectedObject === mesh)
                window.transformControl.attach(mesh);
        })();

        // update PMI dimensions AFTER geometry recentering
        // Track moved face: update localPoint1/2 for endpoints on the pushed face
        (function updateDimsAfterPP() {
            var _pmiList = (typeof pmiObjects !== 'undefined' ? pmiObjects : null) || window.pmiObjects || [];
            var mesh = _pp.mesh;
            var norm = _pp.norm;
            var hitD = _pp.hitD || 0;
            var delta = _pp.lastDist;
            var tol  = 0.5; // mm tolerance for "on this face"
            if (!norm || !mesh || Math.abs(delta) < 0.001) {
                if (typeof updateSmartDimensions === 'function') updateSmartDimensions(mesh);
                return;
            }
            _pmiList.forEach(function(group) {
                if (!group.userData.isSmart || group.userData.targetUuid !== mesh.uuid) return;
                // For each stored local point, check if it was on the moved face
                // Moved face: locNorm · p ≈ hitD + delta (after move) or hitD (original)
                // We update localPoint1 and localPoint2 if they were on the moved face
                ['localPoint1','localPoint2'].forEach(function(key) {
                    var lp = group.userData[key];
                    if (!lp) return;
                    var d = norm.dot(lp); // plane distance of this point
                    // Was it approximately on the original moved face?
                    if (Math.abs(d - hitD) < tol) {
                        group.userData[key] = lp.clone().addScaledVector(norm, delta);
                    }
                });
                // Recalculate world positions
                var newP1 = mesh.localToWorld(group.userData.localPoint1.clone());
                var newP2 = mesh.localToWorld(group.userData.localPoint2.clone());
                var newDist = newP1.distanceTo(newP2);
                var center  = newP1.clone().add(newP2).multiplyScalar(0.5);
                group.position.copy(center);
                group.userData.localP1 = newP1.clone().sub(center);
                group.userData.localP2 = newP2.clone().sub(center);
                group.userData.originalP1 = newP1.clone();
                group.userData.originalP2 = newP2.clone();
                group.userData.dist = newDist;
                if (typeof drawLinearGraphics === 'function') drawLinearGraphics(group, group.userData.localP1, group.userData.localP2, newDist);
                if (typeof updateExtensionLines === 'function') updateExtensionLines(group);
            });
        })();

        showNotification('Push/Pull ✓ ' + dist.toFixed(1) + 'mm', 'success');

        if (controls) controls.enabled = true;
        if (renderer) renderer.domElement.style.cursor = 'crosshair';

        var hint = document.getElementById('pushpull-hint');
        if (hint) hint.textContent = 'Hazır — yeni yüzeye tıkla';

        _pp.mesh = null;
        _pp.orig = null;
        _pp.idxs = [];
    });

})();

// compat shims
function ppV3Reset() { _pp.mesh=null; if(controls) controls.enabled=true; }
window.ppV3ApplyTyped = function(val) {
    if (!_pp.mesh || !_pp.orig) return;
    var posA = _pp.mesh.geometry.attributes.position;
    var n = _pp.norm;
    posA.array.set(_pp.orig);
    for (var i=0;i<_pp.idxs.length;i++){
        var vi=_pp.idxs[i];
        posA.setXYZ(vi, _pp.orig[vi*3]+n.x*val, _pp.orig[vi*3+1]+n.y*val, _pp.orig[vi*3+2]+n.z*val);
    }
    posA.needsUpdate=true;
    _pp.mesh.geometry.computeVertexNormals();
    if (typeof updateSmartDimensions === 'function') updateSmartDimensions(_pp.mesh);
    showNotification('Push/Pull ✓ '+val.toFixed(1)+'mm','success');
};

// =============================================================================// =============================================================================
// MARKALAMA MOTORU v4 (BAĞIMSIZ OBJE + EDITABLE)
// =============================================================================
let isBrandMode = false;
let loadedFont = null;
let currentBrandLayout = 'linear'; 

// Font Listesi
const fontLib = {
    'helvetiker_bold': 'https://cdn.jsdelivr.net/npm/three@0.108.0/examples/fonts/helvetiker_bold.typeface.json',
    'optimer_bold': 'https://cdn.jsdelivr.net/npm/three@0.108.0/examples/fonts/optimer_bold.typeface.json',
    'gentilis_bold': 'https://cdn.jsdelivr.net/npm/three@0.108.0/examples/fonts/gentilis_bold.typeface.json',
    'droid_sans_bold': 'https://cdn.jsdelivr.net/npm/three@0.108.0/examples/fonts/droid/droid_sans_bold.typeface.json',
    'helvetiker_regular': 'https://cdn.jsdelivr.net/npm/three@0.108.0/examples/fonts/helvetiker_regular.typeface.json'
};

// 1. Font Yükleyici
function loadSelectedFont() {
    const fontKey = document.getElementById('brand-font').value;
    // THREE.FontLoader r108'de THREE.FontLoader altında
    var FLC = THREE.FontLoader || (window.THREE && THREE.FontLoader);
    if (!FLC) { 
        // r108 sonrası ayrı import gerekiyor, CDN'den kontrol et
        if (typeof FontLoader !== 'undefined') FLC = FontLoader;
        else { showNotification('FontLoader yüklenemedi — THREE r108+ gerekli', 'error'); return; }
    }
    var loader = new FLC();
    loader.load(fontLib[fontKey],
        function(font) { loadedFont = font; showNotification('Font yüklendi ✓', 'success'); },
        undefined,
        function(err) { console.error('Font load error:', err); showNotification('Font yüklenemedi, CDN kontrol edin', 'error'); }
    );
}
// Font'u sayfa yüklenince yükle
setTimeout(function() {
    loadSelectedFont();
}, 1500); // CDN'nin hazır olması için bekle

// 2. Yay / Düz Geçişi
function setBrandLayout(mode) {
    currentBrandLayout = mode;
    const btnL = document.getElementById('btn-layout-linear');
    const btnC = document.getElementById('btn-layout-circular');
    const set = document.getElementById('arc-settings');

    btnL.className = "flex-1 py-1.5 rounded-md text-[10px] font-bold text-gray-400 hover:text-gray-600 transition bg-gray-100";
    btnC.className = "flex-1 py-1.5 rounded-md text-[10px] font-bold text-gray-400 hover:text-gray-600 transition bg-gray-100";

    if (mode === 'linear') {
        if (btnL) { btnL.style.background='white'; btnL.style.color='#db2777'; btnL.style.boxShadow='0 1px 3px rgba(0,0,0,.1)'; }
        if (btnC) { btnC.style.background='transparent'; btnC.style.color='#9ca3af'; btnC.style.boxShadow='none'; }
        if (set) set.classList.add('hidden');
    } else {
        if (btnC) { btnC.style.background='#db2777'; btnC.style.color='white'; btnC.style.boxShadow='0 2px 6px rgba(219,39,119,.4)'; }
        if (btnL) { btnL.style.background='transparent'; btnL.style.color='#9ca3af'; btnL.style.boxShadow='none'; }
        if (set) set.classList.remove('hidden');
    }
    if (typeof scheduleLiveUpdate === 'function') scheduleLiveUpdate();
}

function updateArcInput(val) {
    document.getElementById('brand-radius').value = val;
    document.getElementById('arc-val-disp').innerText = val + " mm";
}

// 3. Panel Aç/Kapa
// 4. Modu Aktif Et
function toggleBrandMode() {
    const btn = document.getElementById('btn-brand-mode');
    // Font henüz yüklenmediyse yükle, sonra aktif et
    if (!loadedFont) {
        showNotification("Font yükleniyor, lütfen bekleyin...", "warning");
        loadSelectedFont();
        // Font yüklendikten sonra otomatik aktifleştir
        var waitFont = setInterval(function() {
            if (loadedFont) {
                clearInterval(waitFont);
                toggleBrandMode();
            }
        }, 300);
        return;
    }
    isBrandMode = !isBrandMode;
    if (isBrandMode) {
        btn.innerHTML = '<i class="fas fa-crosshairs"></i> YÜZEY SEÇİNİZ...';
        btn.className = "w-full bg-pink-600 text-white text-sm py-3 rounded-xl font-black shadow-inner flex items-center justify-center gap-2 animate-pulse";
        showNotification("✏️ Yüzeye tıklayın — 3D yazı oluşturulacak", "success");
        resetSelection();
    } else {
        btn.innerHTML = '<i class="fas fa-mouse-pointer"></i> YÜZEY SEÇ & TIKLA';
        btn.className = "w-full bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white text-sm py-3 rounded-xl font-black shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2";
    }
}

// 5. Bükme Motoru
function bendTextGeometry(geometry, radius) {
    geometry.center(); 
    const vertices = geometry.vertices;
    for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const angle = v.x / radius;
        const newX = radius * Math.sin(angle);
        const newZ = radius * (1 - Math.cos(angle)); 
        v.x = newX;
        v.z += newZ; 
    }
    geometry.verticesNeedUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
}

// 6. Tıklama Yakalayıcı
function applyTextToSurface(hit) {
    if (!loadedFont) { 
        showNotification("Font henüz hazır değil, lütfen 1-2 saniye bekleyin", "warning");
        loadSelectedFont();
        return; 
    }
    const targetMesh = hit.object;

    // Parametreleri Topla
    const p = {
        text: document.getElementById('brand-text').value,
        fontKey: document.getElementById('brand-font').value,
        layout: currentBrandLayout,
        radius: window.evalDim(document.getElementById('brand-radius')),
        size: window.evalDim(document.getElementById('brand-size')),
        depth: window.evalDim(document.getElementById('brand-depth')),
        type: document.getElementById('brand-type').value,
        color: (document.getElementById('brand-color')||{value:'#ff0055'}).value,
        metalness: window._brandMetal !== undefined ? window._brandMetal : 0.3,
        roughness: window._brandRough !== undefined ? window._brandRough : 0.5,
        
        // Konum ve Normali sakla
        hitPoint: hit.point.clone(),
        hitNormal: hit.face.normal.clone().transformDirection(targetMesh.matrixWorld).normalize()
    };


    createBrandObject(p);
}

// 7. ÇEKİRDEK İŞLEM: BAĞIMSIZ OBJE YARATMA (CSG YOK!)
function createBrandObject(p) {
    saveCheckpoint();

    // A) Geometri Oluştur
    var TextGeoCls = THREE.TextGeometry || (window.THREE && THREE.TextGeometry);
    if (!TextGeoCls) { showNotification('TextGeometry yüklenemedi','error'); return; }
    const textGeo = new TextGeoCls(p.text, {
        font: loadedFont,
        size: p.size,
        height: p.depth,
        curveSegments: 4,
        bevelEnabled: false
    });

    // B) Şekil Ver
    if (p.layout === 'circular') bendTextGeometry(textGeo, p.radius);
    else textGeo.center();

    // C) Materyal (Farklı renk olsun ki belli olsun)
    var _hex = p.color || '#ff0055';
    var _ci  = parseInt(_hex.replace('#',''), 16);
    var _mt  = (p.metalness !== undefined) ? p.metalness : 0.3;
    var _rg  = (p.roughness !== undefined) ? p.roughness : 0.5;
    const textMat = new THREE.MeshStandardMaterial({
        color: _ci, metalness: _mt, roughness: _rg,
    });
    
    const textMesh = new THREE.Mesh(textGeo, textMat);

    // D) Konumlandır
    const defaultUp = new THREE.Vector3(0, 0, 1);
    textMesh.quaternion.setFromUnitVectors(defaultUp, p.hitNormal);
    textMesh.position.copy(p.hitPoint);

    // Offset Ayarı:
    // Eğer 'Engrave' (Oyma) seçildiyse: Yüzeyin içine yarı yarıya gömülsün (CSG için hazır olsun)
    // Eğer 'Emboss' (Çıkıntı) seçildiyse: Yüzeyin tam üstüne otursun
    if (p.type === 'engrave') {
        textMesh.position.add(p.hitNormal.clone().multiplyScalar(-p.depth / 2));
    } else {
        // Tam yüzeye oturt (Floating point hatası olmasın diye çok az içerde başlar)
        textMesh.position.add(p.hitNormal.clone().multiplyScalar(-0.01));
    }
    
    textMesh.updateMatrixWorld();

    // E) Verileri Kaydet (Bu obje artık bir MARKA OBJESİDİR)
    textMesh.castShadow = true; 
    textMesh.receiveShadow = true;
    
    textMesh.userData = { 
        type: "3D TEXT",
        id: "TXT-" + Math.floor(Math.random()*999),
        volume: 0, // Önemsiz
        isBrandObject: true, // Bu bir marka objesidir (Edit için önemli)
        brandParams: p, // Ayarları içinde taşı
        geoParams: {} // Standart yapı bozulmasın
    };

    // Sahneye Ekle (Target mesh'e dokunma!)
    scene.add(textMesh);
    objects.push(textMesh);
    addMeshToTree(textMesh);

    // Yeni objeyi seç (Kullanıcı hemen yerini düzeltebilsin)
    resetSelection();
    selectObject(textMesh, null);
    
    if(isBrandMode) toggleBrandMode(); // Modu kapat
    showNotification("Marka Oluşturuldu (Bağımsız Obje)", "success");
}

// 8. PANELİ DOLDURMA (YAZI SEÇİLİNCE)
function populateBrandPanel(mesh) {
    // Sadece "Marka Objesi" seçilirse paneli doldur
    if (!mesh.userData.isBrandObject || !mesh.userData.brandParams) return;

    const p = mesh.userData.brandParams;
    const btnMode = document.getElementById('btn-brand-mode');
    const btnUpdate = document.getElementById('btn-brand-update');
    const msg = document.getElementById('brand-edit-msg');

    // Değerleri Panele Geri Yükle
    document.getElementById('brand-text').value = p.text;
    document.getElementById('brand-font').value = p.fontKey || 'helvetiker_bold';
    var _ce = document.getElementById('brand-color');
    if (_ce) _ce.value = p.color || '#ff0055';
    if (p.metalness !== undefined) window._brandMetal = p.metalness;
    if (p.roughness !== undefined) window._brandRough = p.roughness;
    
    setBrandLayout(p.layout || 'linear');
    
    const rad = p.radius || 50;
    document.getElementById('brand-radius').value = rad;
    document.getElementById('brand-radius-slider').value = rad;
    document.getElementById('arc-val-disp').innerText = rad + " mm";

    document.getElementById('brand-size').value = p.size;
    document.getElementById('brand-depth').value = p.depth;
    document.getElementById('brand-type').value = p.type;

    // Arayüzü Değiştir
    btnMode.classList.add('hidden');
    btnUpdate.classList.remove('hidden');
    msg.classList.remove('hidden');
    
    var panel2 = document.getElementById('brand-floating-panel');
    if(panel2 && panel2.style.display !== 'flex') panel2.style.display='flex';
}

// 9. GÜNCELLEME (UPDATE) MOTORU
function updateExistingBrand() {
    if (!targetSel || !targetSel.mesh.userData.isBrandObject) return;

    const oldMesh = targetSel.mesh;
    const oldP = oldMesh.userData.brandParams;

    // A) Yeni Ayarları Oku
    const newP = {
        text: document.getElementById('brand-text').value,
        fontKey: document.getElementById('brand-font').value,
        layout: currentBrandLayout,
        radius: window.evalDim(document.getElementById('brand-radius')),
        size: window.evalDim(document.getElementById('brand-size')),
        depth: window.evalDim(document.getElementById('brand-depth')),
        type: document.getElementById('brand-type').value,
        color: (document.getElementById('brand-color')||{value: oldP.color||'#ff0055'}).value,
        metalness: window._brandMetal !== undefined ? window._brandMetal : (oldP.metalness||0.3),
        roughness: window._brandRough !== undefined ? window._brandRough : (oldP.roughness||0.5),
        // Konumu ESKİ OBJEDEN AL (Kullanıcı eliyle kaydırmış olabilir!)
        hitPoint: oldMesh.position.clone(),
        // Normali, eski objenin duruşundan (quaternion) çıkarabiliriz
        hitNormal: new THREE.Vector3(0,0,1).applyQuaternion(oldMesh.quaternion)
    };

    // B) Eski Objeyi Sil
    deleteObject(oldMesh);

    // C) Yenisini Yarat (Aynı yere)
    createBrandObject(newP);
    
    showNotification("Yazı Güncellendi!", "success");
}

function cancelBrandEdit() {
    resetSelection();
}

// =============================================================================
// PANEL AÇMA/KAPAMA (GÜNCELLENDİ)
// =============================================================================
function toggleBrandPanel() {
    var panel = document.getElementById('brand-floating-panel');
    if (!panel) return;
    var isOpen = (panel.style.display === 'flex');
    if (!isOpen) {
        panel.style.display = 'flex';
        if (typeof loadedFont !== 'undefined' && !loadedFont && typeof loadSelectedFont === 'function') loadSelectedFont();
    } else {
        panel.style.display = 'none';
        if (typeof isBrandMode !== 'undefined' && isBrandMode && typeof toggleBrandMode === 'function') toggleBrandMode();
    }
}

// =============================================================================
// SWEEP (SÜPÜRME) VE BORU HATTI MOTORU
// =============================================================================
let isSweepMode = false;
let sweepPoints = [];
let sweepLineHelper = null;
let sweepMarkers = [];

// 1. Modu Başlat
function startSweepMode() {
    isSweepMode = true;
    sweepPoints = [];
    
    // UI Güncelle
    document.getElementById('sweep-controls').classList.remove('hidden');
    document.getElementById('btn-start-sweep').classList.add('hidden');
    
    showNotification("Sweep Modu: Noktaları belirlemek için tıklayın.", "success");
    resetSelection();
    
    // OrbitControls çakışmasını önle (İsteğe bağlı, rahat çizim için)
    // if(controls) controls.enabled = false; 
}

// 2. Modu İptal Et
function cancelSweep() {
    isSweepMode = false;
    clearSweepHelpers();
    
    document.getElementById('sweep-controls').classList.add('hidden');
    document.getElementById('btn-start-sweep').classList.remove('hidden');
    if(controls) controls.enabled = true;
}

// 3. Yardımcıları Temizle
function clearSweepHelpers() {
    if (sweepLineHelper) { scene.remove(sweepLineHelper); sweepLineHelper = null; }
    sweepMarkers.forEach(m => scene.remove(m));
    sweepMarkers = [];
    sweepPoints = [];
}

// 4. Görselleştirme (Noktaları Birleştiren Çizgi)
function updateSweepVisuals() {
    // Eski çizgiyi sil
    if (sweepLineHelper) scene.remove(sweepLineHelper);
    
    if (sweepPoints.length > 1) {
        const geometry = new THREE.BufferGeometry().setFromPoints(sweepPoints);
        const material = new THREE.LineBasicMaterial({ color: 0xff6600, linewidth: 3 });
        sweepLineHelper = new THREE.Line(geometry, material);
        scene.add(sweepLineHelper);
    }
}

// 5. Nokta Ekleme (Tıklama ile çağrılır)
function addSweepPoint(point) {
    sweepPoints.push(point);
    
    // Marker (Top) Ekle
    const geo = new THREE.SphereGeometry(1, 16, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const marker = new THREE.Mesh(geo, mat);
    marker.position.copy(point);
    scene.add(marker);
    sweepMarkers.push(marker);
    
    updateSweepVisuals();
}

// 6. SWEEP İŞLEMİNİ GERÇEKLEŞTİR (FINAL)
function finishSweep() {
    if (sweepPoints.length < 2) {
        showNotification("En az 2 nokta gerekli!", "error");
        return;
    }

    saveCheckpoint();

    const shapeType = document.getElementById('sweep-shape').value;
    const radius = window.evalDim(document.getElementById('sweep-radius'));
    const segments = Math.round(window.evalDim(document.getElementById('sweep-segments')));
    const isClosed = document.getElementById('sweep-closed').checked;

    // A) Yolu (Path) Oluştur - CatmullRom yumuşak geçiş sağlar
    const curve = new THREE.CatmullRomCurve3(sweepPoints);
    curve.closed = isClosed;
    curve.curveType = 'catmullrom'; 
    curve.tension = 0.5; // Yumuşaklık ayarı

    // B) Profili (Shape) Oluştur
    const shape = new THREE.Shape();
    
    if (shapeType === 'circle') {
        shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    } 
    else if (shapeType === 'square') {
        shape.moveTo(-radius, -radius);
        shape.lineTo(radius, -radius);
        shape.lineTo(radius, radius);
        shape.lineTo(-radius, radius);
        shape.lineTo(-radius, -radius);
    }
    else if (shapeType === 'star') {
        // Basit Yıldız
        const outer = radius;
        const inner = radius / 2;
        for (let i = 0; i < 5; i++) {
            const angle = (i * 2 * Math.PI) / 5;
            const angleMid = angle + Math.PI / 5;
            if(i===0) shape.moveTo(Math.cos(angle)*outer, Math.sin(angle)*outer);
            else shape.lineTo(Math.cos(angle)*outer, Math.sin(angle)*outer);
            shape.lineTo(Math.cos(angleMid)*inner, Math.sin(angleMid)*inner);
        }
        shape.closePath();
    }

    // C) Extrude Ayarları
    const extrudeSettings = {
        steps: segments, // Yol boyunca kaç parça olacağı (pürüzsüzlük)
        bevelEnabled: false,
        extrudePath: curve
    };

    // D) Mesh Oluştur
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    const material = createMaterial(); // Standart metalik materyal
    const mesh = new THREE.Mesh(geometry, material);

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    mesh.userData = {
        type: "SWEEP (" + shapeType.toUpperCase() + ")",
        id: "SWP-" + Math.floor(Math.random() * 999),
        volume: getMeshVolume(geometry),
        geoParams: {}, // Parametrik değil (Şimdilik)
        originalColor: material.color.getHex()
    };

    scene.add(mesh);
    objects.push(mesh);
    addMeshToTree(mesh);

    cancelSweep(); // Moddan çık ve temizle
    selectObject(mesh, null);
    updateSceneTotals();
    
    showNotification("Sweep işlemi tamamlandı!", "success");
}

// =============================================================================
// SHELL (KABUK/İÇ BOŞALTMA) MOTORU
// =============================================================================
function performShell() {
    // 1. Seçim Kontrolü
    if (!targetSel) {
        showNotification("Lütfen içi boşaltılacak parçayı ve açılacak yüzeyi seçin!", "error");
        return;
    }

    const mesh = targetSel.mesh;
    const thickness = window.evalDim(document.getElementById('shell-thickness')) || 2.0;
    
    // Güvenlik: Et kalınlığı çok büyükse uyar
    if (thickness <= 0) { showNotification("Kalınlık 0'dan büyük olmalı.", "error"); return; }

    showNotification("Kabuk oluşturuluyor...", "warning");
    document.getElementById('csg-loading').style.display = 'block';

    setTimeout(() => {
        saveCheckpoint(); // Geri alma noktası

        try {
            // --- A) HEDEF YÜZEYİN YÖNÜNÜ BUL (Lokal Koordinatta) ---
            // Tıklanan yüzeyin normalini (Dünya koordinatında) al
            const worldNormal = targetSel.normal.clone().normalize();
            
            // Parçanın duruşunu (Rotation) tersine çevirerek Lokal Normali bul
            const invRot = mesh.quaternion.clone().inverse();
            const localNormal = worldNormal.clone().applyQuaternion(invRot).normalize();
            
            // Hangi eksende işlem yapacağız? (En baskın ekseni bul)
            // Örn: (0, 1, 0) ise Y ekseni, (0, 0, -1) ise Z ekseni.
            const absX = Math.abs(localNormal.x);
            const absY = Math.abs(localNormal.y);
            const absZ = Math.abs(localNormal.z);
            
            let axis = 'y';
            let dir = Math.sign(localNormal.y);
            if (absX > absY && absX > absZ) { axis = 'x'; dir = Math.sign(localNormal.x); }
            else if (absZ > absX && absZ > absY) { axis = 'z'; dir = Math.sign(localNormal.z); }

            // --- B) İÇ PARÇAYI (KESİCİ) OLUŞTUR ---
            let coreGeo;
            
            // 1. KUTU İSE (BOX)
            if (mesh.userData.geoParams && mesh.userData.geoParams.shape === 'box') {
                const p = mesh.userData.geoParams;
                // İç boyutlar: Dış boyut - (2 * kalınlık)
                let w = Math.max(0.1, p.w - (axis === 'x' ? 0 : thickness * 2));
                let h = Math.max(0.1, p.h - (axis === 'y' ? 0 : thickness * 2));
                let d = Math.max(0.1, p.d - (axis === 'z' ? 0 : thickness * 2));
                
                // Açık olan yüzey yönünde boyutu uzat (ki orayı delsin)
                if (axis === 'x') w = p.w; // Tam boy (sonra kaydıracağız)
                if (axis === 'y') h = p.h;
                if (axis === 'z') d = p.d;

                coreGeo = new THREE.BoxGeometry(w, h, d);
                
                // Kaydırma İşlemi (Shift)
                // İç parçayı açık yüzeye doğru kaydır, böylece o yüzey delinir ama karşı taraf kalır.
                const offset = dir * (thickness / 2); // Yarım kalınlık kadar ileri
                
                // Ancak "uzatılan" eksende tam delmesi için merkezin de kayması lazım.
                // Basit mantık: İç parçanın merkezini, açık yüzeyin dışına taşmayacak ama tam sınıra gelecek şekilde ayarla.
                
                // Düzeltilmiş Mantık:
                // İç parça boyutları (w,h,d) şu an dış parçadan (2t) kadar küçük (açık eksen hariç).
                // Açık eksende boyutu eşitledik. Şimdi onu açık yöne (dir) doğru kaydıralım.
                // Kaydırma miktarı = (Kalınlık / 2) değil, (Kalınlık) kadar olmalı ki
                // bir taraf 2t kalınlıkta kalsın, diğer taraf 0 (açık) olsun.
                
                if(axis === 'x') coreGeo.translate(dir * thickness, 0, 0);
                if(axis === 'y') coreGeo.translate(0, dir * thickness, 0);
                if(axis === 'z') coreGeo.translate(0, 0, dir * thickness);
            }
            
            // 2. DELETEİNDİR İSE (CYLINDER)
            else if (mesh.userData.geoParams && mesh.userData.geoParams.shape === 'cylinder') {
                const p = mesh.userData.geoParams;
                // Sadece Y ekseninde (üst/alt) kapak açmaya izin verelim şimdilik
                if (axis !== 'y') {
                    throw new Error("Silindirlerde sadece Üst veya Alt yüzey seçilerek Shell yapılabilir.");
                }
                
                const r = Math.max(0.1, p.r - thickness);
                const h = p.h; // Boy aynı kalsın (kaydıracağız)
                
                coreGeo = new THREE.CylinderGeometry(r, r, h, 32);
                // Kaydır (Açık yüze doğru thickness kadar)
                coreGeo.translate(0, dir * thickness, 0);
            }
            
            // 3. GENEL PARÇA (FALLBACK) - Basit Scale Yöntemi
            else {
                // BufferGeometry ise Geometry'ye çevir
                if (mesh.geometry.isBufferGeometry) {
                    coreGeo = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
                } else {
                    coreGeo = mesh.geometry.clone();
                }
                // Basitçe küçült (Bu yöntem her zaman mükemmel sonuç vermez ama genel çözümüdür)
                const scaleFactor = 0.9; // Tahmini
                coreGeo.scale(scaleFactor, scaleFactor, scaleFactor);
                
                // Yüzeye doğru kaydır
                if(axis === 'x') coreGeo.translate(dir * thickness * 2, 0, 0);
                if(axis === 'y') coreGeo.translate(0, dir * thickness * 2, 0);
                if(axis === 'z') coreGeo.translate(0, 0, dir * thickness * 2);
            }

            // --- C) CSG SUBTRACTMA İŞLEMİ ---
            if (typeof ThreeBSP === 'undefined') throw new Error("CSG Kütüphanesi eksik!");

            // Ana Parça
            let targetGeoRaw = mesh.geometry.isBufferGeometry ? 
                               new THREE.Geometry().fromBufferGeometry(mesh.geometry) : 
                               mesh.geometry.clone();
            const targetModel = new THREE.Mesh(targetGeoRaw);
            targetModel.applyMatrix(mesh.matrixWorld);
            const bspTarget = new ThreeBSP(targetModel);

            // İç Parça (Kesici)
            const coreMesh = new THREE.Mesh(coreGeo);
            // Ana parçanın pozisyonuna ve dönüşüne eşitle
            coreMesh.position.copy(mesh.position);
            coreMesh.rotation.copy(mesh.rotation);
            coreMesh.scale.copy(mesh.scale);
            coreMesh.updateMatrixWorld(); // Matrix'i güncelle
            const bspCore = new ThreeBSP(coreMesh);

            // Çıkar (Subtract)
            const bspResult = bspTarget.subtract(bspCore);
            
            // --- D) SONUCU OLUŞTUR ---
            const resultGeo = bspResult.toGeometry();
            resultGeo.mergeVertices();
            resultGeo.computeVertexNormals();

            const finalBufferGeo = new THREE.BufferGeometry().fromGeometry(resultGeo);
            const resultMesh = new THREE.Mesh(finalBufferGeo, mesh.material.clone());

            // ThreeBSP world-space → merkeze taşıma YOK
            resultMesh.position.set(0, 0, 0);

            // Verileri Yaz
            resultMesh.castShadow = true; resultMesh.receiveShadow = true;
            resultMesh.userData = {
                type: "SHELL (" + thickness + "mm)",
                volume: getMeshVolume(finalBufferGeo),
                id: mesh.userData.id + "_SHELL",
                geoParams: {}, // Artık parametrik değil, özel şekil
                originalColor: mesh.material.color.getHex()
            };

            // Sahne Güncelleme
            scene.remove(mesh);
            objects = objects.filter(o => o !== mesh);
            
            scene.add(resultMesh);
            objects.push(resultMesh);
            if(typeof addMeshToTree === 'function') addMeshToTree(resultMesh);

            resetSelection();
            selectObject(resultMesh, null);
            updateSceneTotals();
            
            showNotification("Shell işlemi başarılı!", "success");let selectionHelper = null;

        } catch (e) {
            console.error(e);
            showNotification("Hata: " + e.message, "error");
        } finally {
            document.getElementById('csg-loading').style.display = 'none';
        }
    }, 100);
}


// =============================================================================
// PMI (KALICI ÖLÇÜ) VE OSNAP (AKILLI YAKALAMA) SİSTEMİ
// =============================================================================

// 1. Modu Aç/Kapa
function togglePMIMode() {
    isPMIMode = !isPMIMode;
    const btn = document.getElementById('btn-pmi-mode');
    const status = document.getElementById('pmi-status');
    const toolbar = document.getElementById('osnap-toolbar');
    
    if (isPMIMode) {
        btn.classList.add('bg-indigo-600', 'text-white');
        btn.classList.remove('bg-white', 'text-indigo-700');
        status.classList.remove('hidden');
        status.innerText = "1. Noktayı Yakala...";
        if(toolbar) toolbar.style.display = 'flex';
        pmiPoints = [];
        resetSelection(); // Seçimi temizle
        showNotification("PMI Modu: OSNAP açık. Köşeleri yakalayın.", "success");
    } else {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-white', 'text-indigo-700');
        status.classList.add('hidden');
        // if(toolbar) toolbar.style.display = 'none'; // İstersen toolbar'ı gizle
        pmiPoints = [];
        hideSnapMarker();
    }
}

// =============================================================================
// GELİŞMİŞ SNAP HESAPLAMA (FİLTRELİ - ENGEL TANIMAZ)
// =============================================================================
// =============================================================================
// GELİŞMİŞ SNAP HESAPLAMA (QUADRANT & PERPENDICULAR EKLENDİ)
// =============================================================================
function getSmartSnap(raycaster) {
    // 1. Filtreleme (Görünür ve Katı objeler)
    const validObjects = objects.filter(o => o.visible && !o.isLine && !o.isSprite && !o.userData.isHelper && !o.userData.isPMI);
    const intersects = raycaster.intersectObjects(validObjects, false);
    
    if (intersects.length === 0) { hideSnapMarker(); return null; }

    const hit = intersects[0];
    const hitPoint = hit.point;
    const mesh = hit.object;

    // 2. Ayarları Kontrol Et
    const sEnd = document.getElementById('snap-end')?.checked;
    const sMid = document.getElementById('snap-mid')?.checked;
    const sCen = document.getElementById('snap-center')?.checked;
    const sQuad = document.getElementById('snap-quad')?.checked; // YENİ
    const sPerp = document.getElementById('snap-perp')?.checked; // YENİ
    const sTan = document.getElementById('snap-tangent')?.checked;
    const sNear = document.getElementById('snap-edge')?.checked;

    let bestSnap = { point: hitPoint, type: 'NEAREST', dist: Infinity };
    const THRESHOLD = 2.5; // Yakalama mesafesi

    // --- A) GEOMETRİ ANALİZİ (KÖŞE & ORTA) ---
    if (mesh.geometry && (sEnd || sMid)) {
        if (hit.face) {
            const matrix = mesh.matrixWorld;
            const geo = mesh.geometry;
            let a, b, c;

            // Vertex pozisyonlarını al
            if (geo.isBufferGeometry && geo.attributes.position) {
                const pos = geo.attributes.position;
                a = new THREE.Vector3().fromBufferAttribute(pos, hit.face.a).applyMatrix4(matrix);
                b = new THREE.Vector3().fromBufferAttribute(pos, hit.face.b).applyMatrix4(matrix);
                c = new THREE.Vector3().fromBufferAttribute(pos, hit.face.c).applyMatrix4(matrix);
            } else if (geo.vertices) {
                a = geo.vertices[hit.face.a].clone().applyMatrix4(matrix);
                b = geo.vertices[hit.face.b].clone().applyMatrix4(matrix);
                c = geo.vertices[hit.face.c].clone().applyMatrix4(matrix);
            }

            if (a && b && c) {
                // ENDPOINT
                if (sEnd) {
                    [a, b, c].forEach(v => {
                        const d = hitPoint.distanceTo(v);
                        if (d < THRESHOLD && d < bestSnap.dist) bestSnap = { point: v, type: 'ENDPOINT', dist: d };
                    });
                }
                // MIDPOINT
                if (sMid) {
                    const mids = [a.clone().add(b).multiplyScalar(0.5), b.clone().add(c).multiplyScalar(0.5), c.clone().add(a).multiplyScalar(0.5)];
                    mids.forEach(m => {
                        const d = hitPoint.distanceTo(m);
                        if (d < THRESHOLD && d < bestSnap.dist) bestSnap = { point: m, type: 'MIDPOINT', dist: d };
                    });
                }
            }
        }
    }

    // --- B) DAİRESEL PROPERTIES (CENTER, QUADRANT, TANGENT) ---
    const p = mesh.userData.geoParams;
    const isCircular = p && ['cylinder', 'sphere', 'truncated_sphere_gen', 'cone', 'torus', 'hole', 'boss'].includes(p.shape);

    if (isCircular) {
        // Parametreleri hazırla
        const scale = mesh.scale.x; // Uniform scale varsayımı
        let radii = []; // Yarıçaplar ve yükseklikler
        let height = 0;

        if (p.shape === 'cylinder' || p.shape === 'hole' || p.shape === 'boss') {
            const r = (p.r || p.diameter / 2 || 10) * scale;
            height = (p.h || p.depth || 20) * mesh.scale.y;
            radii.push({ r: r, y: height/2 }, { r: r, y: -height/2 }); // Üst ve Alt
        } else if (p.shape === 'sphere') {
            radii.push({ r: (p.radius || 10) * scale, y: 0 }); // Merkez
        } else if (p.shape === 'cone') {
            radii.push({ r: p.r1 * scale, y: p.h * mesh.scale.y / 2 }); // Üst
            radii.push({ r: p.r2 * scale, y: -p.h * mesh.scale.y / 2 }); // Alt
        }

        // Objeye ait lokal eksenler
        const centerPos = new THREE.Vector3(); mesh.getWorldPosition(centerPos);
        const quat = mesh.quaternion;
        const vecUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
        const vecRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
        const vecFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);

        radii.forEach(data => {
            // Daire Merkezi
            const cPoint = centerPos.clone().add(vecUp.clone().multiplyScalar(data.y));
            
            // 1. CENTER SNAP
            if (sCen) {
                const d = hitPoint.distanceTo(cPoint);
                if (d < THRESHOLD + 2 && d < bestSnap.dist) bestSnap = { point: cPoint, type: 'CENTER', dist: d };
            }

            // 2. QUADRANT SNAP (0, 90, 180, 270 Derece)
            if (sQuad) {
                const qPoints = [
                    cPoint.clone().add(vecRight.clone().multiplyScalar(data.r)),  // 0
                    cPoint.clone().add(vecRight.clone().multiplyScalar(-data.r)), // 180
                    cPoint.clone().add(vecFwd.clone().multiplyScalar(data.r)),    // 90
                    cPoint.clone().add(vecFwd.clone().multiplyScalar(-data.r))    // 270
                ];
                qPoints.forEach(qp => {
                    const d = hitPoint.distanceTo(qp);
                    if (d < THRESHOLD && d < bestSnap.dist) bestSnap = { point: qp, type: 'QUADRANT', dist: d };
                });
            }
        });

        // 3. TANGENT SNAP (Dairenin dış teğeti)
        if (sTan && bestSnap.dist === Infinity) {
            const dirToHit = new THREE.Vector3().subVectors(hitPoint, centerPos);
            if (p.shape !== 'sphere') dirToHit.projectOnPlane(vecUp); // Yükseklik farkını yoksay
            dirToHit.normalize();
            
            // En yakın daire kesitini bul
            const rBase = radii[0].r; 
            const tanPoint = centerPos.clone().add(dirToHit.multiplyScalar(rBase));
            if (p.shape !== 'sphere') tanPoint.add(vecUp.clone().multiplyScalar(hitPoint.clone().sub(centerPos).dot(vecUp))); // Mouse yüksekliğine eşitle

            if (hitPoint.distanceTo(tanPoint) < THRESHOLD) bestSnap = { point: tanPoint, type: 'TANGENT', dist: 0 };
        }
    }

    // --- C) PERPENDICULAR (DİKLİK) ---
    // Sadece Ölçü Modunda ve en az 1 nokta seçilmişse çalışır
    if (sPerp && typeof measurePoints !== 'undefined' && measurePoints.length > 0 && bestSnap.dist === Infinity) {
        const lastPt = measurePoints[measurePoints.length - 1]; // Önceki nokta
        
        // Yüzey Normaline göre izdüşüm (Face Perpendicular)
        if (hit.face) {
            const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
            
            // Son noktadan yüzeye dik inen nokta (Projection)
            // Formül: P_proj = P - (distance) * N
            // Plane oluştur:
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hitPoint); // Mouse'un olduğu yüzey düzlemi
            const projectedPt = new THREE.Vector3();
            plane.projectPoint(lastPt, projectedPt); // Önceki noktayı bu düzleme yansıt

            // Eğer mouse bu yansıyan noktaya yakınsa oraya yapış
            if (hitPoint.distanceTo(projectedPt) < THRESHOLD * 2) {
                bestSnap = { point: projectedPt, type: 'PERPENDICULAR', dist: 0 };
            }
        }
    }

    // --- SONUÇ ---
    if (bestSnap.dist < Infinity) {
        updateSnapMarker(bestSnap.point, bestSnap.type);
        return bestSnap;
    } 
    else if (sNear) {
        updateSnapMarker(hitPoint, 'NEAREST');
        return { point: hitPoint, type: 'NEAREST' };
    }

    hideSnapMarker();
    return null;
}

// 3. Marker (İmleç) Güncelleme
// =============================================================================
// =============================================================================
// GÜNCELLENMİŞ SNAP MARKER (QUAD VE PERP EKLENDİ)
// =============================================================================
function updateSnapMarker(pos, type) {
    if (!snapMarker) {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;

        const mat = new THREE.SpriteMaterial({ 
            map: tex, depthTest: false, sizeAttenuation: false, 
            transparent: true, opacity: 1.0 
        });
        
        snapMarker = new THREE.Sprite(mat);
        snapMarker.scale.set(0.025, 0.025, 1); 
        snapMarker.renderOrder = 99999;
        scene.add(snapMarker);
    }

    snapMarker.visible = true;
    snapMarker.position.copy(pos);

    const ctx = snapMarker.material.map.image.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    
    // Çizgi Ayarları
    ctx.lineWidth = 5;              
    ctx.strokeStyle = '#00ffff';    
    ctx.lineCap = 'butt';           
    ctx.lineJoin = 'miter';         

    ctx.save();
    ctx.scale(2, 2); 
    ctx.beginPath();

    // --- ŞEKİLLER ---
    if (type === 'ENDPOINT') {
        ctx.strokeRect(20, 20, 24, 24); // Kare
    } 
    else if (type === 'MIDPOINT') {
        ctx.beginPath(); ctx.moveTo(32, 18); ctx.lineTo(18, 46); ctx.lineTo(46, 46); ctx.closePath(); ctx.stroke(); // Üçgen
    } 
    else if (type === 'CENTER') {
        ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.stroke(); // Daire
    }
    // --- YENİ: QUADRANT (BAKLAVA DİLİMİ) ---
    else if (type === 'QUADRANT') {
        ctx.beginPath();
        ctx.moveTo(32, 16); // Üst
        ctx.lineTo(48, 32); // Sağ
        ctx.lineTo(32, 48); // Alt
        ctx.lineTo(16, 32); // Sol
        ctx.closePath();
        ctx.stroke();
    }
    // --- YENİ: PERPENDICULAR (DİK AÇI) ---
    else if (type === 'PERPENDICULAR') {
        ctx.beginPath();
        // Diklik sembolü (Ters L gibi)
        ctx.moveTo(44, 44); ctx.lineTo(20, 44); ctx.lineTo(20, 20); // Köşe
        ctx.moveTo(20, 44); ctx.lineTo(32, 32); // İç nokta (opsiyonel)
        ctx.stroke();
        // İçine nokta
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(26, 38, 4, 4);
    }
    else if (type === 'TANGENT') {
        ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(54, 10); ctx.stroke();
    }
    else { // Nearest / Edge
        ctx.beginPath(); ctx.moveTo(22, 22); ctx.lineTo(42, 42);
        ctx.moveTo(42, 22); ctx.lineTo(22, 42); ctx.stroke();
    }
    
    ctx.restore();
    snapMarker.material.map.needsUpdate = true;
    
    // Bilgi yazısını güncelle
    const fb = document.getElementById('snap-feedback');
    if(fb) {
        fb.innerText = type;
        fb.style.color = '#00ffff';
        fb.style.textShadow = 'none';
        fb.style.fontWeight = 'bold';
    }
}




// =============================================================================
// GÜÇLENDİRİLMİŞ TOPLU DELETEME (GARANTİLİ TEMİZLİK)
// =============================================================================
function clearAllPMI() {
    // 1. Array kontrolü
    if (typeof pmiObjects === 'undefined' || pmiObjects.length === 0) {
        // Eğer liste boşsa, belki sahnede kalmış "yetim" ölçüler vardır?
        // Sahneyi tarayıp userData.isPMI olanları bulup silelim (Garanti Yöntem)
        const toRemove = [];
        scene.traverse(obj => {
            if (obj.userData && obj.userData.isPMI) {
                toRemove.push(obj);
            }
        });
        
        if (toRemove.length === 0) {
            showNotification("Silinecek ölçü bulunamadı.", "warning");
            return;
        }
        
        // Bulunanları sil
        toRemove.forEach(o => scene.remove(o));
        pmiObjects = []; // Listeyi sıfırla
        showNotification("Sahne temizlendi (" + toRemove.length + " öğe).", "success");
        return;
    }

    // 2. Normal Liste Silme
    let count = 0;
    // Listeyi kopyalayarak döngüye sok (Hata önler)
    [...pmiObjects].forEach(obj => {
        if (obj) {
            scene.remove(obj);
            // Eğer objenin geometrisi/materyali varsa bellekten de sil (Performans)
            if(obj.geometry) obj.geometry.dispose();
            if(obj.material) obj.material.dispose();
            count++;
        }
    });

    // 3. Listeyi Sıfırla
    pmiObjects = [];
    
    // UI Güncelleme
    const status = document.getElementById('pmi-status');
    if(status) {
        status.innerText = "Temizlendi.";
        setTimeout(() => status.innerText = "1. Noktayı Yakala...", 2000);
    }

    showNotification(count + " adet ölçü silindi.", "success");
}

// =============================================================================
// 1. KENAR İŞLEME MOTORU (YÖN KONTROLLÜ - FINAL v5.0)
// =============================================================================
let isEdgeMode = false;
let edgeCutter = null;
let selectedEdgeData = null; 
let edgeHoverLine = null;

function toggleEdgeMode() {
    isEdgeMode = !isEdgeMode;
    if (isEdgeMode) {
        showNotification("Kenar Modu: Çizgilere yaklaşın.", "success");
        resetSelection();
    } else {
        closeEdgeMode();
        showNotification("Kenar Modu KAPALI.", "warning");
    }
}

function closeEdgeMode() {
    isEdgeMode = false;
    // Paneli gizle ama içini temizle (HTML'i koru)
    const panel = document.getElementById('edge-panel');
    if (panel) panel.classList.add('hidden');
    if (edgeCutter) { scene.remove(edgeCutter); edgeCutter = null; }
    if (edgeHoverLine) { scene.remove(edgeHoverLine); edgeHoverLine = null; }
    selectedEdgeData = null;
}

// NEON PARLATMA (HAYALET ÖZELLİKLİ)
function highlightClosestEdge(hit) {
    const mesh = hit.object;
    if (!hit.face || !mesh.visible) return;

    // HİBRİT KONTROL
    const p = mesh.userData.geoParams;
    const isCircular = p && (p.shape === 'cylinder' || p.shape === 'cone' || p.shape === 'tube' || p.shape === 'truncated_sphere_gen');

    if (isCircular) return highlightCircularEdge(mesh, hit.point);
    return highlightStraightEdge(mesh, hit);
}

// A. DÜZ KENAR
function highlightStraightEdge(mesh, hit) {
    const geo = mesh.geometry;
    const face = hit.face;
    const matrix = mesh.matrixWorld;
    let a, b, c;

    if (geo.isBufferGeometry) {
        if(!geo.attributes.position) return;
        const pos = geo.attributes.position;
        a = new THREE.Vector3().fromBufferAttribute(pos, face.a).applyMatrix4(matrix);
        b = new THREE.Vector3().fromBufferAttribute(pos, face.b).applyMatrix4(matrix);
        c = new THREE.Vector3().fromBufferAttribute(pos, face.c).applyMatrix4(matrix);
    } else {
        if (!geo.vertices) return;
        a = geo.vertices[face.a].clone().applyMatrix4(matrix);
        b = geo.vertices[face.b].clone().applyMatrix4(matrix);
        c = geo.vertices[face.c].clone().applyMatrix4(matrix);
    }

    const pt = hit.point;
    const edges = [ { start: a, end: b }, { start: b, end: c }, { start: c, end: a } ];
    
    let bestEdge = edges[0];
    let minD = Infinity;
    edges.forEach(e => {
        const line = new THREE.Line3(e.start, e.end);
        const closest = new THREE.Vector3();
        line.closestPointToPoint(pt, true, closest);
        const d = pt.distanceTo(closest);
        if(d < minD) { minD = d; bestEdge = e; }
    });

    if (edgeHoverLine) scene.remove(edgeHoverLine);
    const len = bestEdge.start.distanceTo(bestEdge.end);
    const cylGeo = new THREE.CylinderGeometry(0.15, 0.15, len, 8); 
    const cylMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, depthTest: false, transparent: true, opacity: 0.8 });
    
    edgeHoverLine = new THREE.Mesh(cylGeo, cylMat);
    edgeHoverLine.raycast = function() {}; 
    
    const mid = bestEdge.start.clone().add(bestEdge.end).multiplyScalar(0.5);
    edgeHoverLine.position.copy(mid);
    edgeHoverLine.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), bestEdge.end.clone().sub(bestEdge.start).normalize());
    edgeHoverLine.renderOrder = 9999; 
    scene.add(edgeHoverLine);

    return { type: 'straight', p1: bestEdge.start, p2: bestEdge.end, object: mesh };
}

// B. DAİRESEL KENAR
function highlightCircularEdge(mesh, hitPoint) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    const center = new THREE.Vector3();
    mesh.getWorldPosition(center); 
    const height = (box.max.y - box.min.y) * mesh.scale.y;
    
    const localHit = hitPoint.clone().sub(center).applyQuaternion(mesh.quaternion.clone().inverse());
    const isTop = Math.abs(localHit.y - height/2) < Math.abs(localHit.y + height/2);
    const yLevel = isTop ? height/2 : -height/2;
    
    const p = mesh.userData.geoParams;
    let radius = (p.r || p.radius || 10) * mesh.scale.x;
    if(p.shape === 'cone') radius = (isTop ? p.r1 : p.r2) * mesh.scale.x;

    if (edgeHoverLine) scene.remove(edgeHoverLine);
    const ringGeo = new THREE.TorusGeometry(radius, 0.15, 8, 64);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, transparent: true, opacity: 0.8 });
    
    edgeHoverLine = new THREE.Mesh(ringGeo, ringMat);
    edgeHoverLine.raycast = function() {}; 
    edgeHoverLine.quaternion.copy(mesh.quaternion);
    
    const upVec = new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);
    edgeHoverLine.position.copy(center.clone().add(upVec.multiplyScalar(yLevel)));
    edgeHoverLine.renderOrder = 9999;
    scene.add(edgeHoverLine);

    return { type: 'circular', isTop: isTop, radius: radius, object: mesh };
}

// SEÇİM VE PANEL OLUŞTURMA (DİNAMİK PANEL)
function selectEdge(data) {
    selectedEdgeData = data;
    
    // Paneli oluştur veya güncelle
    let panel = document.getElementById('edge-panel');
    if (!panel) {
        // Eğer panel HTML'de yoksa JS ile oluştur (Güvenlik)
        panel = document.createElement('div');
        panel.id = 'edge-panel';
        panel.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-white/95 backdrop-blur border-2 border-orange-500 rounded-xl shadow-2xl p-4 w-80 z-[2000] pointer-events-auto font-sans';
        document.body.appendChild(panel);
    }
    
    // Panel İçeriğini Yenile (Checkbox ekledik!)
    panel.innerHTML = `
        <div class="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
            <h3 class="font-black text-orange-700 flex items-center gap-2">
                <i class="fas fa-ruler-combined"></i> KENAR İŞLEMCİSİ
            </h3>
            <button onclick="closeEdgeMode()" class="text-gray-400 hover:text-red-500 font-bold text-lg">×</button>
        </div>
        <div class="space-y-4">
            <div>
                <div class="flex justify-between text-xs font-bold text-gray-600 mb-1">
                    <span>KESİM BOYUTU</span><span id="edge-size-val" class="text-orange-600">2.0 mm</span>
                </div>
                <input type="range" id="edge-size" min="0.5" max="20" step="0.5" value="2" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" oninput="updateCutterVisuals()">
            </div>
            <div>
                <div class="flex justify-between text-xs font-bold text-gray-600 mb-1">
                    <span>AÇI</span><span id="edge-angle-val" class="text-blue-600">45°</span>
                </div>
                <input type="range" id="edge-angle" min="0" max="360" step="5" value="45" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" oninput="updateCutterVisuals()">
            </div>
            
            <label class="flex items-center gap-2 bg-orange-50 p-2 rounded border border-orange-200 cursor-pointer">
                <input type="checkbox" id="edge-invert" class="w-4 h-4 accent-red-600">
                <span class="text-xs font-bold text-orange-800">YÖNÜ TERS ÇEVİR (INVERT)</span>
            </label>

            <button onclick="applyEdgeOperation()" class="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-black py-3 rounded-lg shadow-md transition text-sm">
                <i class="fas fa-cut"></i> KES VE UYGULA
            </button>
        </div>
    `;

    panel.classList.remove('hidden');
    updateCutterVisuals();
}

// BIÇAK GÖRSELİ
function updateCutterVisuals() {
    if (!selectedEdgeData) return;
    if (edgeCutter) scene.remove(edgeCutter);

    const size = window.evalDim(document.getElementById('edge-size'));
    const angle = window.evalDim(document.getElementById('edge-angle'));
    document.getElementById('edge-size-val').innerText = size.toFixed(1) + " mm";
    document.getElementById('edge-angle-val').innerText = angle + "°";

    const data = selectedEdgeData;
    const cutterMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, depthTest: false });

    // DÜZ KENAR
    if (data.type === 'straight') {
        const len = data.p1.distanceTo(data.p2);
        const cutterGeo = new THREE.BoxGeometry(size * 2.5, size * 2.5, len + 10); 
        edgeCutter = new THREE.Mesh(cutterGeo, cutterMat);
        const midPoint = data.p1.clone().add(data.p2).multiplyScalar(0.5);
        edgeCutter.position.copy(midPoint);
        edgeCutter.lookAt(data.p2);
        edgeCutter.rotateZ(THREE.Math.degToRad(angle));
    }
    // DAİRESEL KENAR
    else if (data.type === 'circular') {
        const points = [];
        points.push(new THREE.Vector2(data.radius, 0)); 
        points.push(new THREE.Vector2(data.radius, (data.isTop ? -1 : 1) * size));
        points.push(new THREE.Vector2(data.radius - size, 0)); 
        points.push(new THREE.Vector2(data.radius + 5, (data.isTop ? -1 : 1) * (size + 5)));
        points.push(new THREE.Vector2(data.radius + 5, 0)); 
        points.push(new THREE.Vector2(data.radius, 0));
        // Reverse kaldırdık! (Varsayılan yön)

        const latheGeo = new THREE.LatheGeometry(points, 64);
        edgeCutter = new THREE.Mesh(latheGeo, cutterMat);
        edgeCutter.rotation.x = -Math.PI / 2; 
        edgeCutter.quaternion.copy(data.object.quaternion);
        edgeCutter.position.copy(edgeHoverLine.position);
    }

    edgeCutter.raycast = function() {}; 
    scene.add(edgeCutter);
}

// YARDIMCI: GEOMETRİ TERS ÇEVİRME
function invertGeometry(geometry) {
    for (let i = 0; i < geometry.faces.length; i++) {
        const face = geometry.faces[i];
        const temp = face.a;
        face.a = face.c;
        face.c = temp;
    }
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
}

// İŞLEMİ UYGULA
function applyEdgeOperation() {
    if (!selectedEdgeData || !edgeCutter) return;
    const targetMesh = selectedEdgeData.object;
    const loadingEl = document.getElementById('csg-loading');
    if(loadingEl) loadingEl.style.display = 'block';

    // CHECKBOX KONTROLÜ
    const invertMode = document.getElementById('edge-invert').checked;

    targetMesh.updateMatrixWorld(true);
    edgeCutter.updateMatrixWorld(true);

    setTimeout(() => {
        saveCheckpoint(); 
        try {
            if (typeof ThreeBSP === 'undefined') throw new Error("CSG Kütüphanesi eksik!");

            let targetGeo = targetMesh.geometry.isBufferGeometry ? new THREE.Geometry().fromBufferGeometry(targetMesh.geometry) : targetMesh.geometry.clone();
            const targetModel = new THREE.Mesh(targetGeo);
            targetModel.applyMatrix(targetMesh.matrixWorld);
            const bspTarget = new ThreeBSP(targetModel);

            let cutterGeo = edgeCutter.geometry.isBufferGeometry ? new THREE.Geometry().fromBufferGeometry(edgeCutter.geometry) : edgeCutter.geometry.clone();
            
            // --- EĞER TERS ÇEVİR SEÇİLİYSE YÜZEYLERİ DÖNDÜR ---
            if (invertMode) {
                invertGeometry(cutterGeo);
            }

            const cutterModel = new THREE.Mesh(cutterGeo);
            cutterModel.applyMatrix(edgeCutter.matrixWorld);
            const bspCutter = new ThreeBSP(cutterModel);

            const bspResult = bspTarget.subtract(bspCutter);
            const resultGeo = bspResult.toGeometry();
            resultGeo.mergeVertices();
            resultGeo.computeVertexNormals();
            
            const finalBufferGeo = new THREE.BufferGeometry().fromGeometry(resultGeo);
            const resultMesh = new THREE.Mesh(finalBufferGeo, targetMesh.material.clone());
            resultMesh.position.set(0,0,0);
            
            resultMesh.castShadow = true; resultMesh.receiveShadow = true;
            resultMesh.userData = {
                type: targetMesh.userData.type + " (Mod)",
                id: targetMesh.userData.id,
                volume: getMeshVolume(finalBufferGeo),
                geoParams: {}, 
                originalColor: targetMesh.material.color.getHex()
            };

            scene.remove(targetMesh);
            objects = objects.filter(o => o !== targetMesh);
            scene.add(resultMesh);
            objects.push(resultMesh);
            if(typeof addMeshToTree === 'function') addMeshToTree(resultMesh);

            closeEdgeMode();
            selectObject(resultMesh, null);
            showNotification("İşlem Başarılı!", "success");

        } catch (e) {
            console.error(e);
            alert("Hata: " + e.message);
        } finally {
            if(loadingEl) loadingEl.style.display = 'none';
        }
    }, 50);
}

/// =============================================================================
// 3. MOUSE HAREKET YÖNETİCİSİ (GÜNCELLENMİŞ - SNAP GARANTİLİ)
// =============================================================================
function onMouseMove(event) {
    // Mouse koordinatlarını güncelle
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);


    // ── EDGE PICK MODU (Mate Edge-to-Edge) ──
    if (window.edgePickState === 'pick_target' || window.edgePickState === 'pick_source') {
        var epHits = raycaster.intersectObjects(objects.filter(function(o){ return o.isMesh && o.visible; }));
        if (epHits.length > 0) {
            var epMesh = epHits[0].object;
            var epPt   = epHits[0].point;
            var ne = nearestEdgeToPoint(epMesh, epPt);
            if (ne) showEdgeHighlight(ne.a, ne.b, window.edgePickState === 'pick_target' ? 0x00e5ff : 0xff6600);
        } else {
            clearEdgeHighlight();
        }
        return;
    }

    // ── CORNER PICK MODU (Mate Corner-to-Corner) ──
    if (window.cornerPickState === 'pick_target' || window.cornerPickState === 'pick_source') {
        var cpHits = raycaster.intersectObjects(objects.filter(function(o){ return o.isMesh && o.visible; }));
        if (cpHits.length > 0) {
            var cpMesh = cpHits[0].object;
            var cpPt   = cpHits[0].point;
            var nv = nearestVertexToPoint(cpMesh, cpPt);
            if (nv) showCornerHighlight(nv, window.cornerPickState === 'pick_target' ? 0xffee00 : 0xff7700);
        } else {
            clearCornerHighlight();
        }
        return;
    }

    // 1. KENAR MODU ÖNCELİKLİ
    if (typeof isEdgeMode !== 'undefined' && isEdgeMode) {
        const hits = raycaster.intersectObjects(objects);
        if (hits.length > 0) {
            highlightClosestEdge(hits[0]); 
        } else {
            if(typeof edgeHoverLine !== 'undefined' && edgeHoverLine) {
                scene.remove(edgeHoverLine);
                edgeHoverLine = null;
            }
        }
        return; 
    }

    // 2. SNAP (MIKNATIS) KONTROLÜ - TÜM MODLAR İÇİN
    // Measure, PMI, Sketch, Sweep veya sadece Move işlemi...
    // Hangi modda olursak olalım, snap fonksiyonunu çalıştıracağız.
    
    let snapActive = false;

    // Modlardan herhangi biri açık mı?
    if ((typeof isPMIMode !== 'undefined' && isPMIMode) || 
        (typeof isSweepMode !== 'undefined' && isSweepMode) || 
        (typeof measureMode !== 'undefined' && measureMode)) {
        snapActive = true;
    }
    
    // Eğer modlar kapalıysa ama "Transform Control" sürükleme yapıyorsa (Move)
    if (!snapActive && transformControl && transformControl.dragging && transformControl.getMode() === 'translate') {
        snapActive = true; 
    }

    if (snapActive) {
        if(typeof getSmartSnap === 'function') getSmartSnap(raycaster);
    } else {
        // Hiçbir mod yoksa markeri gizle
        if(typeof hideSnapMarker === 'function') hideSnapMarker();
    }
}
// =============================================================================
// GELİŞMİŞ KESİT (SECTION VIEW) MOTORU - DİNAMİK BOYUT VE İÇ GÖRÜNÜM
// =============================================================================
let sectionPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
let sectionHelper = null; 
let currentSectionAxis = 'y';

function toggleSectionView() {
    const panel = document.getElementById('section-panel');
    panel.classList.toggle('hidden');
    
    if (!panel.classList.contains('hidden')) {
        document.getElementById('section-active').checked = true;
        
        // Kullanıcıya bilgi ver
        if(targetSel) {
            showNotification(`Kesit düzlemi ${targetSel.mesh.userData.id} boyutlarına uyarlandı.`, "info");
        } else {
            showNotification("Parça seçilmediği için tüm sahne kesiliyor.", "warning");
        }
        
        updateSectionPlane();
    } else {
        document.getElementById('section-active').checked = false;
        updateSectionPlane();
        resetGizmoAxes();
        if(sectionHelper) sectionHelper.visible = false;
    }
}

function setSectionAxis(axis) {
    currentSectionAxis = axis;
    // Butonların renklerini ayarla
    ['x', 'y', 'z'].forEach(a => {
        const btn = document.getElementById('sec-btn-' + a);
        if(btn) {
            if (a === axis) btn.className = "flex-1 py-1 text-xs font-bold rounded bg-red-500 text-white shadow-sm transition";
            else btn.className = "flex-1 py-1 text-xs font-bold rounded hover:bg-white shadow-sm transition text-gray-600";
        }
    });
    updateSectionPlane();
}

function updateSectionPlane() {
    const isActive = document.getElementById('section-active').checked;
    const value = window.evalDim(document.getElementById('section-slider'));
    const isFlipped = document.getElementById('section-flip').checked;
    const valDisplay = document.getElementById('section-val');
    
    if (valDisplay) valDisplay.innerText = value.toFixed(1);

    // --- 1. OTOMATİK BOYUT HESAPLAMA (Bounding Box) ---
    let planeSize = 100; // Varsayılan boyut
    const box = new THREE.Box3();
    
    if (targetSel && targetSel.mesh) {
        // Eğer bir parça seçiliyse sadece onun sınırlarını al
        if (!targetSel.mesh.geometry.boundingBox) targetSel.mesh.geometry.computeBoundingBox();
        box.setFromObject(targetSel.mesh);
    } else if (objects.length > 0) {
        // Seçili parça yoksa tüm sahnenin sınırlarını al
        objects.forEach(obj => box.expandByObject(obj));
    }
    
    if (!box.isEmpty()) {
        const size = new THREE.Vector3();
        box.getSize(size);
        // Plane boyutunu objenin en uzun kenarının %30 fazlası yap (Tam kapatsın diye)
        planeSize = Math.max(size.x, size.y, size.z) * 1.3;
    }

    // --- 2. GÖRSEL DÜZLEMİ (HELPER) OLUŞTUR ---
    if (!sectionHelper) {
        // Geometriyi 1x1 oluşturuyoruz, scale ile dinamik büyüteceğiz
        const geo = new THREE.PlaneGeometry(1, 1); 
        const mat = new THREE.MeshBasicMaterial({
            color: 0xef4444,     // Kırmızımsı kesit kapağı rengi
            transparent: true,
            opacity: 0.35,       // Parçanın içi cam gibi görünsün
            side: THREE.DoubleSide, 
            depthWrite: false    // Bu ayar sayesinde plane parçanın içini gizlemez
        });
        sectionHelper = new THREE.Mesh(geo, mat);
        sectionHelper.name = "SectionHelperPlane";
        sectionHelper.material.clippingPlanes = []; // Kendini kesmesini engelle
        scene.add(sectionHelper);

        // GİZMO SÜRÜKLEME (DRAG) OLAYI - Anlık kesit için
        transformControl.addEventListener('change', function () {
            if (transformControl.object === sectionHelper) {
                const pos = sectionHelper.position;
                const val = pos[currentSectionAxis];

                const slider = document.getElementById('section-slider');
                const vDisplay = document.getElementById('section-val');
                if (slider && vDisplay) {
                    slider.value = val;
                    vDisplay.innerText = val.toFixed(1);
                }

                let norm = new THREE.Vector3(0, 0, 0);
                if (currentSectionAxis === 'x') norm.set(-1, 0, 0);
                else if (currentSectionAxis === 'y') norm.set(0, -1, 0);
                else if (currentSectionAxis === 'z') norm.set(0, 0, -1);
                if (document.getElementById('section-flip').checked) norm.negate();

                sectionPlane.setFromNormalAndCoplanarPoint(norm, pos);
            }
        });
    }

    // Düzlem boyutunu uygulanan objeye göre güncelle
    sectionHelper.scale.set(planeSize, planeSize, 1);

    // --- 3. YÖN (NORMAL) VEKTÖRÜNÜ AYARLA ---
    let normal = new THREE.Vector3(0, 0, 0);
    if (currentSectionAxis === 'x') normal.set(-1, 0, 0);
    else if (currentSectionAxis === 'y') normal.set(0, -1, 0);
    else if (currentSectionAxis === 'z') normal.set(0, 0, -1);
    if (isFlipped) normal.negate();

    // --- 4. YENİ NOKTAYI HESAPLA VE MATEMATİKSEL DÜZLEMİ GÜNCELLE ---
    const planePoint = new THREE.Vector3(0, 0, 0);
    planePoint[currentSectionAxis] = value;
    sectionPlane.setFromNormalAndCoplanarPoint(normal, planePoint);

    // --- 5. GÖRSEL DÜZLEMİ KONUMLANDIR VE DÖNDÜR ---
    sectionHelper.position.copy(planePoint);

    const defaultUp = new THREE.Vector3(0, 0, 1); 
    const targetDir = normal.clone().normalize();
    
    if (targetDir.distanceTo(defaultUp) < 0.001) {
        sectionHelper.quaternion.set(0,0,0,1);
    } else if (targetDir.distanceTo(new THREE.Vector3(0,0,-1)) < 0.001) {
        sectionHelper.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI);
    } else {
        sectionHelper.quaternion.setFromUnitVectors(defaultUp, targetDir);
    }

    sectionHelper.visible = isActive;

    // --- 6. GİZMO'YU DÜZLEME BAĞLA ---
    if (isActive) {
        if (transformControl.object !== sectionHelper) {
            if (targetSel) resetSelection(); // Orijinal parça seçimini temizle
            transformControl.attach(sectionHelper);
            transformControl.setMode('translate');
        }
        // Sadece kesilen eksende hareket okunu göster
        transformControl.showX = (currentSectionAxis === 'x');
        transformControl.showY = (currentSectionAxis === 'y');
        transformControl.showZ = (currentSectionAxis === 'z');
    } else {
        if (transformControl.object === sectionHelper) {
            transformControl.detach();
            resetGizmoAxes();
        }
    }

    // --- 7. KESİT İŞLEMİNİ PARÇALARA UYGULA (İÇ GÖRÜNÜM OPTİMİZASYONU) ---
    objects.forEach(obj => {
        if (obj.material) {
            const shouldClip = isActive && (!targetSel || targetSel.mesh === obj);
            if (shouldClip) {
                obj.material.clippingPlanes = [sectionPlane];
                obj.material.clipShadows = true;
                obj.material.side = THREE.DoubleSide;
            } else {
                obj.material.clippingPlanes = [];
            }
            obj.material.needsUpdate = true;
        }
    });

    // --- 8. HATCH OVERLAY — Kesit yüzeyine tarama çizgileri ---
    updateSectionHatch(isActive, normal, planePoint);
}

// Hatch canvas texture üretici
function makeHatchTexture(angleDeg, color) {
    var c = document.createElement('canvas'); c.width = 32; c.height = 32;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(255,255,255,0)'; ctx.fillRect(0,0,32,32);
    ctx.strokeStyle = color || 'rgba(0,0,180,0.7)';
    ctx.lineWidth = 1.2;
    var rad = angleDeg * Math.PI / 180;
    // Çapraz çizgiler - tekrar eden pattern
    for (var i = -32; i < 64; i += 7) {
        ctx.beginPath();
        ctx.moveTo(i * Math.cos(rad) - 32 * Math.sin(rad), i * Math.sin(rad) + 32 * Math.cos(rad));
        ctx.lineTo(i * Math.cos(rad) + 64 * Math.sin(rad), i * Math.sin(rad) - 64 * Math.cos(rad) + 64);
        ctx.stroke();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
}

// Hatch mesh'lerini tutan array
window._sectionHatchMeshes = window._sectionHatchMeshes || [];

function updateSectionHatch(isActive, normal, planePoint) {
    // Eski hatch mesh'lerini temizle
    window._sectionHatchMeshes.forEach(function(m) { scene.remove(m); if(m.geometry) m.geometry.dispose(); if(m.material) m.material.dispose(); });
    window._sectionHatchMeshes = [];

    if (!isActive) return;

    // Hatch açıları ve renkleri — her parça için farklı
    var hatchConfigs = [
        { angle: 45,  color: 'rgba(0,60,160,0.65)' },
        { angle: -45, color: 'rgba(160,40,0,0.65)'  },
        { angle: 30,  color: 'rgba(0,120,60,0.65)'  },
        { angle: -30, color: 'rgba(120,0,120,0.65)' },
        { angle: 60,  color: 'rgba(160,100,0,0.65)' },
        { angle: -60, color: 'rgba(0,100,140,0.65)' },
    ];

    var clipObjs = objects.filter(function(obj) {
        return obj && obj.isMesh && obj.material && obj.material.clippingPlanes && obj.material.clippingPlanes.length > 0;
    });

    clipObjs.forEach(function(obj, idx) {
        obj.updateMatrixWorld(true);
        var bbox = new THREE.Box3().setFromObject(obj);
        var bSz  = new THREE.Vector3(); bbox.getSize(bSz);

        // Hatch plane boyutu: bounding box + kenar boşluğu
        var axis = currentSectionAxis;
        var w = axis === 'x' ? bSz.z : bSz.x;
        var h = axis === 'y' ? bSz.z : bSz.y;
        var pad = 4;

        var geo = new THREE.PlaneGeometry(w + pad, h + pad);
        var cfg = hatchConfigs[idx % hatchConfigs.length];
        var tex = makeHatchTexture(cfg.angle, cfg.color);

        var mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            clippingPlanes: []
        });

        var mesh = new THREE.Mesh(geo, mat);
        mesh.name = '__SectionHatch__';

        // Pozisyon: plane noktasına yerleştir, objenin center'ına hizala
        var bCen = new THREE.Vector3(); bbox.getCenter(bCen);
        mesh.position.set(
            axis === 'x' ? planePoint.x : bCen.x,
            axis === 'y' ? planePoint.y : bCen.y,
            axis === 'z' ? planePoint.z : bCen.z
        );

        // Yönlendir: section normal'ine bak
        var defaultUp = new THREE.Vector3(0, 0, 1);
        var targetDir = normal.clone().normalize();
        if (targetDir.distanceTo(defaultUp) > 0.001 && targetDir.distanceTo(new THREE.Vector3(0,0,-1)) > 0.001) {
            mesh.quaternion.setFromUnitVectors(defaultUp, targetDir);
        } else if (targetDir.distanceTo(new THREE.Vector3(0,0,-1)) < 0.001) {
            mesh.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI);
        }

        scene.add(mesh);
        window._sectionHatchMeshes.push(mesh);
    });
}

// Gizmo'nun oklarını eski haline (3 eksenli) getirir
function resetGizmoAxes() {
    if (typeof transformControl !== 'undefined' && transformControl) {
        transformControl.showX = true;
        transformControl.showY = true;
        transformControl.showZ = true;
    }
}



   
// =============================================================================
// YARDIMCI GÜVENLİK FONKSİYONLARI (KESİTTEN ÇIKINCA HER ŞEYİN NORMALE DÖNMESİ İÇİN)
// =============================================================================

// Gizmo'nun oklarını eski haline (3 eksenli) getirir
function resetGizmoAxes() {
    if (typeof transformControl !== 'undefined' && transformControl) {
        transformControl.showX = true;
        transformControl.showY = true;
        transformControl.showZ = true;
    }
}

// Kullanıcı normal bir parçaya tıkladığında Gizmo'nun (3 oku birden) normale dönmesi için 
// Ana seçim fonksiyonunuzu yamalıyoruz (Zararsız ve güvenli bir eklentidir)
if (typeof window.selectObject === 'function') {
    const _originalSelectObject = window.selectObject;
    window.selectObject = function(mesh, hit) {
        resetGizmoAxes();
        _originalSelectObject(mesh, hit);
    };
}
if (typeof window.resetSelection === 'function') {
    const _originalResetSelection = window.resetSelection;
    window.resetSelection = function() {
        resetGizmoAxes();
        _originalResetSelection();
    };
}

// =============================================================================
// KESİTİ KALICI HALE GETİRME (SLICE / TRIM) MOTORU
// =============================================================================

function applySectionCut() {
    // 1. Seçim ve Durum Kontrolleri
    if (!targetSel) {
        showNotification("Lütfen kesilecek (uygulanacak) parçayı seçin!", "error");
        return;
    }

    const isActive = document.getElementById('section-active').checked;
    if (!isActive) {
        showNotification("Lütfen önce 'Kesiti Aktif Et' kutusunu işaretleyip düzlemi ayarlayın.", "warning");
        return;
    }

    const mesh = targetSel.mesh;

    // Yükleniyor Ekranı
    document.getElementById('csg-loading').style.display = 'block';

    setTimeout(() => {
        saveCheckpoint(); // Geri alma (Undo) noktası oluştur

        try {
            if (typeof ThreeBSP === 'undefined') throw new Error("CSG Kütüphanesi eksik!");

            // --- A) HEDEF PARÇAYI HAZIRLA ---
            let targetGeo = mesh.geometry.isBufferGeometry ? 
                            new THREE.Geometry().fromBufferGeometry(mesh.geometry) : 
                            mesh.geometry.clone();
            const targetModel = new THREE.Mesh(targetGeo);
            targetModel.applyMatrix(mesh.matrixWorld); // Matrix'i göm
            const bspTarget = new ThreeBSP(targetModel);

            // --- B) KESİCİ KUTUYU (SUBTRACTOR) OLUŞTUR ---
            // Kesilen görünmez tarafı tamamen içine alacak devasa bir kutu yaratıyoruz
            const L = 5000; 
            const cutterGeo = new THREE.BoxGeometry(L, L, L);
            const cutterMesh = new THREE.Mesh(cutterGeo);

            // Düzlemin o anki noktasını ve normalini al
            const planePoint = new THREE.Vector3();
            sectionPlane.coplanarPoint(planePoint);
            const normal = sectionPlane.normal.clone().normalize();

            // Kutunun Y eksenini, düzlemin normaline (görünen tarafa) doğru çevir
            cutterMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
            
            // Kutuyu, üst yüzeyi tam "kesim düzlemine" gelecek şekilde geriye (görünmez alana) ötele
            cutterMesh.position.copy(planePoint).add(normal.clone().multiplyScalar(-L / 2));
            cutterMesh.updateMatrixWorld();

            const bspCutter = new ThreeBSP(cutterMesh);

            // --- C) KESME (SUBTRACT) İŞLEMİ ---
            // Ana parçadan, görünmez taraftaki o devasa kutuyu çıkarıyoruz
            const bspResult = bspTarget.subtract(bspCutter);

            // --- D) SONUCU OLUŞTUR VE İYİLEŞTİR ---
            const resultGeo = bspResult.toGeometry();
            resultGeo.mergeVertices();
            resultGeo.computeVertexNormals();

            const finalBufferGeo = new THREE.BufferGeometry().fromGeometry(resultGeo);
            const resultMesh = new THREE.Mesh(finalBufferGeo, mesh.material.clone());

            // ThreeBSP world-space → merkeze taşıma YOK
            resultMesh.position.set(0, 0, 0);

            // Görsel hataları gidermek için kesit modunu kapat
            resultMesh.material.clippingPlanes = [];
            resultMesh.material.side = THREE.DoubleSide; 

            // Verileri Yaz
            resultMesh.castShadow = true; 
            resultMesh.receiveShadow = true;
            resultMesh.userData = {
                type: mesh.userData.type + " (Trimmed)",
                id: mesh.userData.id + "_TRIM",
                volume: getMeshVolume(finalBufferGeo),
                geoParams: {}, // Parça artık parametrik değil, özel şekil oldu
                originalColor: mesh.material.color.getHex()
            };

            // --- E) SAHNEYİ GÜNCELLE ---
            // Eski Parçayı Sil
            scene.remove(mesh);
            objects = objects.filter(o => o !== mesh);
            
            // Yeni Kesilmiş Parçayı Ekle
            scene.add(resultMesh);
            objects.push(resultMesh);
            if(typeof addMeshToTree === 'function') addMeshToTree(resultMesh);

            // UI'ı Temizle ve Menüyü Kapat
            resetSelection();
            document.getElementById('section-active').checked = false;
            updateSectionPlane();
            toggleSectionView(); // Kesit panelini kapat
            
            selectObject(resultMesh, null);
            if(typeof updateSceneTotals === 'function') updateSceneTotals();
            
            showNotification("Parça başarıyla kesildi ve kalıcı hale getirildi!", "success");

        } catch (e) {
            console.error(e);
            showNotification("Kesim Hatası: " + e.message, "error");
        } finally {
            document.getElementById('csg-loading').style.display = 'none';
        }
    }, 100);
}



// =============================================================================
// PARÇALARI AYIRMA MOTORU (SEPARATE LOOSE PARTS)
// =============================================================================
function separateDisconnectedParts() {
    // 1. Seçim Kontrolü
    if (!targetSel) {
        showNotification("Lütfen ayrılacak birleşik parçayı seçin!", "error");
        return;
    }

    const mesh = targetSel.mesh;
    
    showNotification("Parçalar analiz ediliyor...", "warning");
    document.getElementById('csg-loading').style.display = 'block';

    setTimeout(() => {
        saveCheckpoint(); // Geri alma noktası

        try {
            // A) Geometriyi İşlenebilir Hale Getir (Geometry Formatı)
            let geom = mesh.geometry;
            if (geom.isBufferGeometry) {
                geom = new THREE.Geometry().fromBufferGeometry(geom);
            } else {
                geom = geom.clone();
            }
            geom.mergeVertices(); // Köşeleri birleştir ki bağlar kopsun

            // B) Bağlantı Haritası Oluştur (Hangi vertex hangi yüzlerde var?)
            // Bu, "Flood Fill" algoritması için gereklidir.
            const vertexToFaces = new Array(geom.vertices.length).fill(null).map(() => []);
            geom.faces.forEach((face, index) => {
                vertexToFaces[face.a].push(index);
                vertexToFaces[face.b].push(index);
                vertexToFaces[face.c].push(index);
            });

            // C) Yüzeyleri Grupla (Flood Fill / Adacık Bulma)
            const visitedFaces = new Set();
            const islands = []; // Her bir eleman bağımsız bir parça olacak

            for (let i = 0; i < geom.faces.length; i++) {
                if (visitedFaces.has(i)) continue;

                // Yeni bir ada (parça) keşfedildi
                const currentIsland = [];
                const queue = [i]; // İşlenecek yüzeyler kuyruğu
                visitedFaces.add(i);

                while (queue.length > 0) {
                    const faceIndex = queue.pop();
                    currentIsland.push(faceIndex);

                    // Bu yüzeyin köşelerini al
                    const face = geom.faces[faceIndex];
                    const vertices = [face.a, face.b, face.c];

                    // Bu köşelere bağlı diğer yüzeyleri bul
                    vertices.forEach(vIdx => {
                        const neighbors = vertexToFaces[vIdx];
                        neighbors.forEach(neighborFaceIdx => {
                            if (!visitedFaces.has(neighborFaceIdx)) {
                                visitedFaces.add(neighborFaceIdx);
                                queue.push(neighborFaceIdx);
                            }
                        });
                    });
                }
                islands.push(currentIsland);
            }

            if (islands.length < 2) {
                throw new Error("Bu parça zaten tek parça! Ayrılacak kısım bulunamadı.");
            }

            // D) Adacıkları Yeni Mesh'lere Dönüştür
            let createdCount = 0;
            
            islands.forEach((islandFaces, idx) => {
                const newGeo = new THREE.Geometry();
                
                // Sadece bu adaya ait yüzeyleri ve vertexleri kopyala
                // Vertex haritalama (Eski Index -> Yeni Index)
                const vertexMap = {}; 
                let newVertexIndex = 0;

                islandFaces.forEach(faceIdx => {
                    const oldFace = geom.faces[faceIdx];
                    
                    // Yüzeyin 3 köşesini yeni geometriye ekle (eğer eklenmediyse)
                    [oldFace.a, oldFace.b, oldFace.c].forEach(oldVIdx => {
                        if (vertexMap[oldVIdx] === undefined) {
                            newGeo.vertices.push(geom.vertices[oldVIdx]);
                            vertexMap[oldVIdx] = newVertexIndex++;
                        }
                    });

                    // Yeni yüzeyi oluştur (Yeni vertex indeksleriyle)
                    const newFace = new THREE.Face3(
                        vertexMap[oldFace.a],
                        vertexMap[oldFace.b],
                        vertexMap[oldFace.c],
                        oldFace.normal.clone()
                    );
                    newGeo.faces.push(newFace);
                });

                // Mesh Oluştur
                newGeo.computeBoundingBox();
                newGeo.computeFaceNormals();
                newGeo.computeVertexNormals();

                // Merkezleme İşlemi (Pivotu parçanın ortasına al)
                const center = new THREE.Vector3();
                newGeo.boundingBox.getCenter(center);
                newGeo.translate(-center.x, -center.y, -center.z);

                const newMesh = new THREE.Mesh(newGeo, mesh.material.clone());
                
                // Konumu ayarla:
                // Ana parçanın pozisyonu + Parçanın kendi merkezi (Rotasyon uygulanmış haliyle)
                const offset = center.applyQuaternion(mesh.quaternion);
                newMesh.position.copy(mesh.position).add(offset);
                newMesh.rotation.copy(mesh.rotation);
                newMesh.scale.copy(mesh.scale);

                // Verileri Kaydet
                newMesh.castShadow = true;
                newMesh.receiveShadow = true;
                newMesh.userData = {
                    type: "SEPARATED PART",
                    id: mesh.userData.id + "_P" + (idx + 1),
                    volume: getMeshVolume(newGeo),
                    geoParams: {},
                    originalColor: mesh.material.color.getHex()
                };

                scene.add(newMesh);
                objects.push(newMesh);
                addMeshToTree(newMesh);
                createdCount++;
            });

            // Eski birleşik parçayı sil
            deleteObject(mesh);
            
            showNotification(`${createdCount} parça başarıyla ayrıldı!`, "success");

        } catch (e) {
            console.error(e);
            showNotification(e.message, "error");
        } finally {
            document.getElementById('csg-loading').style.display = 'none';
            if(typeof updateSceneTotals === 'function') updateSceneTotals();
        }
    }, 100);
}

function setMeasureType(type) {
    currentMeasureType = type;
    
    // Buton Renklerini Güncelle
    ['linear', 'radius', 'diameter'].forEach(t => {
        const btn = document.getElementById('btn-meas-' + t);
        if (t === type) {
            btn.className = "flex-1 py-1.5 text-[10px] font-black bg-blue-600 text-white rounded shadow transition";
        } else {
            btn.className = "flex-1 py-1.5 text-[10px] font-bold text-blue-700 hover:bg-white rounded transition";
        }
    });

    // Listeyi Temizle
    measurePoints = [];
    document.getElementById('measure-list-content').innerHTML = '<div class="text-gray-400 italic text-center">Mod Hazır: ' + type.toUpperCase() + '</div>';
    
    // Radius/Diameter için Snap ayarlarını optimize et
    if (type !== 'linear') {
        document.getElementById('snap-end').checked = false;
        document.getElementById('snap-mid').checked = false;
        document.getElementById('snap-center').checked = false; 
        // Radius için yüzeye tıklanacağı için snapleri kapatmak daha rahattır, 
        // ancak kullanıcı isterse açabilir.
        showNotification(type.toUpperCase() + " Modu: Dairesel yüzeye tıklayın.", "info");
    } else {
        // Linear için varsayılanları aç
        document.getElementById('snap-end').checked = true;
        document.getElementById('snap-center').checked = true;
        showNotification("LINEAR Modu: İki nokta seçin.", "info");
    }
}


// YARDIMCI: Ok Ucu Ekleyici (Sivri Uç Hedef Noktada)
function addArrowTip(group, from, to, color) {
    const arrowLen = 3.0;
    const arrowRad = 0.5; // Çap 1.0 (Radius 0.5) ve Boy 3.0 = 1:3 Oranı
    
    // Koni: Varsayılan olarak ucu (0, h/2, 0), Tabanı (0, -h/2, 0)
    // Biz ucun (Tip) 0 noktasında olmasını istiyoruz.
    const coneGeo = new THREE.ConeGeometry(arrowRad, arrowLen, 16);
    coneGeo.translate(0, -arrowLen / 2, 0); // Ucu merkeze (0,0,0) çek, gövde -Y'de kalsın.
    
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: color, depthTest: false }));
    
    cone.position.copy(to); // Ucu hedef noktaya koy
    cone.lookAt(from);      // -Z eksenini 'from'a çevir
    
    // Koni -Y ekseninde uzanıyor. lookAt Z eksenini hizalar.
    // -Y'yi +Z'ye döndürmek için X ekseninde -90 derece çevir.
    cone.rotateX(-Math.PI / 2);
    
    group.add(cone);
}



function addArrowTip(group, lookAtPoint, positionPoint, color) {
    const arrowLen = 3.0;
    const arrowRad = 0.8;
    const coneGeo = new THREE.ConeGeometry(arrowRad, arrowLen, 16);
    coneGeo.translate(0, -arrowLen / 2, 0);

    const mat = new THREE.MeshBasicMaterial({ color: color, depthTest: false });
    const cone = new THREE.Mesh(coneGeo, mat);

    cone.position.copy(positionPoint);
    cone.lookAt(lookAtPoint);
    cone.rotateX(-Math.PI / 2);

    group.add(cone);
}



function addLabelSprite(group, text, pos) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "black"; ctx.lineWidth = 4; ctx.strokeRect(0, 0, 256, 64);
    ctx.font = "bold 40px Arial"; ctx.fillStyle = "black";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.position.copy(pos);
    sprite.scale.set(10, 2.5, 1);
    group.add(sprite);
}

// =============================================================================
// AKILLI ÖLÇÜ MOTORU (PARÇAYI TAKİP EDEN ÖLÇÜLER VE YARDIMCI ÇİZGİLER)
// =============================================================================

function updateSmartDimensions(mesh) {
    if (typeof pmiObjects === 'undefined' || !pmiObjects) return;
    
    pmiObjects.forEach(group => {
        // Eğer bu ölçü "Akıllı" ise ve sürüklenen parçaya aitse
        if (group.userData.isSmart && group.userData.targetUuid === mesh.uuid) {
            
            // Objenin lokal (iç) koordinatlarını tekrar dünya (gerçek) koordinatına çevir
            const newP1 = mesh.localToWorld(group.userData.localPoint1.clone());
            const newP2 = mesh.localToWorld(group.userData.localPoint2.clone());
            const newDist = newP1.distanceTo(newP2);

            // Ölçü grubunun pivotunu yeni merkeze taşı
            const center = newP1.clone().add(newP2).multiplyScalar(0.5);
            group.position.copy(center);

            // Yeni lokal noktaları hesapla
            const newLocalP1 = newP1.clone().sub(center);
            const newLocalP2 = newP2.clone().sub(center);

            // Verileri güncelle
            group.userData.originalP1 = newP1.clone();
            group.userData.originalP2 = newP2.clone();
            group.userData.localP1 = newLocalP1.clone();
            group.userData.localP2 = newLocalP2.clone();
            group.userData.dist = newDist;

            // Grafikleri anlık olarak yeniden çiz
            drawLinearGraphics(group, newLocalP1, newLocalP2, newDist);
            updateExtensionLines(group);
        }
    });
}

function createPMIDimension(m1, m2) {
    // Verileri Güvenle Al (Hem nokta hem obje bilgisini okur)
    const p1 = m1.point || m1;
    const p2 = m2.point || m2;
    const obj1 = m1.object || null;
    const obj2 = m2.object || null;

    if (!p1 || !p2) return;
    const dist = p1.distanceTo(p2);
    // allow same corner — only block truly identical point
    if (dist < 0.001) return;

    const group = new THREE.Group();

    // --- AKILLI TAKİP KİLİDİ ---
    // Eğer iki nokta da AYNI parça üzerindeyse, ölçüyü o parçaya kilitleriz.
    if (obj1 && obj2 && obj1.uuid === obj2.uuid) {
        group.userData.isSmart = true;
        group.userData.targetUuid = obj1.uuid;
        // Noktaları objenin içine (lokal eksene) göre kaydet
        group.userData.localPoint1 = obj1.worldToLocal(p1.clone());
        group.userData.localPoint2 = obj1.worldToLocal(p2.clone());
    } else {
        group.userData.isSmart = false;
    }

    // Taşıma okunun tam ortada çıkması için PIVOT MERKEZLEME
    const center = p1.clone().add(p2).multiplyScalar(0.5);
    group.position.copy(center);

    const localP1 = p1.clone().sub(center);
    const localP2 = p2.clone().sub(center);

    group.userData.isPMI = true;
    group.userData.originalP1 = p1.clone();
    group.userData.originalP2 = p2.clone();
    group.userData.localP1 = localP1.clone();
    group.userData.localP2 = localP2.clone();
    group.userData.dist = dist;

    // Ana Grafikleri Çiz
    drawLinearGraphics(group, localP1, localP2, dist);

    // İnce Yardımcı Kılavuz Çizgileri
    const extMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, depthTest: false });
    const extLine1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([localP1, localP1]), extMat);
    const extLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([localP2, localP2]), extMat);
    extLine1.name = "ext1"; extLine2.name = "ext2";
    
    group.add(extLine1); 
    group.add(extLine2);
    scene.add(group);
    
    if (typeof pmiObjects !== 'undefined') pmiObjects.push(group);

    updateExtensionLines(group);

    // UI Paneli Güncelle
    const resDiv = document.getElementById('measure-result');
    const valDiv = document.getElementById('measure-dist-val');
    if (resDiv && valDiv) {
        resDiv.classList.remove('hidden');
        valDiv.innerText = dist.toFixed(2) + " mm";
    }
}

function drawLinearGraphics(group, localP1, localP2, dist) {
    // Taşırken üst üste binmemesi için eskileri temizle
    while (group.children.length > 0) { group.remove(group.children[0]); }

    const color = 0x000000;

    // A) Çizgi
    const lineGeo = new THREE.BufferGeometry().setFromPoints([localP1, localP2]);
    const lineMat = new THREE.LineBasicMaterial({ color: color, depthTest: false });
    group.add(new THREE.Line(lineGeo, lineMat));

    // B) Oklar (<----->)
    addArrowTip(group, localP2, localP1, color);
    addArrowTip(group, localP1, localP2, color);

    // C) Yazı Etiketi
    const mid = localP1.clone().add(localP2).multiplyScalar(0.5);
    mid.y += 2.0;
    addLabelSprite(group, dist.toFixed(2) + " mm", mid);
    
    // Kılavuz çizgileri temizlendiği için geri ekle
    if(group.userData.isPMI) {
        const extMat = new THREE.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.5, depthTest: false });
        const extLine1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([localP1, localP1]), extMat);
        const extLine2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([localP2, localP2]), extMat);
        extLine1.name = "ext1"; extLine2.name = "ext2";
        group.add(extLine1); group.add(extLine2);
        updateExtensionLines(group);
    }
}

function addArrowTip(group, lookAtPoint, positionPoint, color) {
    const arrowLen = 3.0;
    const arrowRad = 0.8;
    const coneGeo = new THREE.ConeGeometry(arrowRad, arrowLen, 16);
    coneGeo.translate(0, -arrowLen / 2, 0);

    const mat = new THREE.MeshBasicMaterial({ color: color, depthTest: false });
    const cone = new THREE.Mesh(coneGeo, mat);

    cone.position.copy(positionPoint);
    cone.lookAt(lookAtPoint);
    cone.rotateX(-Math.PI / 2);

    group.add(cone);
}

function updateExtensionLines(group) {
    if(!group.userData.isPMI || !group.userData.originalP1) return;

    const ext1 = group.getObjectByName("ext1");
    const ext2 = group.getObjectByName("ext2");

    if(ext1 && ext2) {
        const localOrigP1 = group.worldToLocal(group.userData.originalP1.clone());
        const localOrigP2 = group.worldToLocal(group.userData.originalP2.clone());

        ext1.geometry.setFromPoints([localOrigP1, group.userData.localP1]);
        ext2.geometry.setFromPoints([localOrigP2, group.userData.localP2]);
    }
}

function addLabelSprite(group, text, pos) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = "black"; ctx.lineWidth = 4; ctx.strokeRect(0, 0, 256, 64);
    ctx.font = "bold 40px Arial"; ctx.fillStyle = "black";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.position.copy(pos);
    sprite.scale.set(10, 2.5, 1);
    group.add(sprite);
}

// === TIKLAMA YÖNETİCİSİ ===
function onMouseDown(event) {
    if (transformControl.dragging) return;
    if (transformControl.axis !== null) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Push/Pull handled by dedicated listeners

    // --- ÖLÇÜ (PMI) TAŞIMA / DELETEME MOTORU ---
    if (typeof pmiObjects !== 'undefined' && pmiObjects.length > 0) {
        const pmiIntersects = raycaster.intersectObjects(pmiObjects, true);
        if (pmiIntersects.length > 0) {
            let pmiGroup = pmiIntersects[0].object;
            while(pmiGroup.parent && !pmiGroup.userData.isPMI) {
                if(pmiGroup.parent.type === "Scene") break;
                pmiGroup = pmiGroup.parent;
            }

            if (pmiGroup.userData && pmiGroup.userData.isPMI) {
                if (event.button === 2) { 
                    // SAĞ TIK -> DELETE
                    event.preventDefault();
                    scene.remove(pmiGroup);
                    pmiObjects = pmiObjects.filter(o => o !== pmiGroup);
                    if (transformControl.object === pmiGroup) transformControl.detach();
                    showNotification("Ölçü Silindi.", "warning");
                    return; 
                } else if (event.button === 0) { 
                    // SOL TIK -> MOVE
                    event.preventDefault();
                    if(typeof resetSelection === 'function') resetSelection(); 
                    transformControl.attach(pmiGroup);
                    transformControl.setMode('translate');
                    transformControl.showX = true; transformControl.showY = true; transformControl.showZ = true;
                    return;
                }
            }
        }
    }

    // ── CORNER PICK MODU (Mate Corner-to-Corner) ──
    if (window.cornerPickState && event.button === 0) {
        var cpHits2 = raycaster.intersectObjects(objects.filter(function(o){ return o.isMesh && o.visible; }));
        if (cpHits2.length > 0) {
            var cpMesh2 = cpHits2[0].object;
            var cpPt2   = cpHits2[0].point;
            var nv2 = nearestVertexToPoint(cpMesh2, cpPt2);
            if (!nv2) return;

            if (window.cornerPickState === 'pick_target') {
                window.targetCornerPick = { mesh: cpMesh2, vertex: nv2 };
                showCornerHighlight(nv2, 0xffee00);
                window.cornerPickState = 'pick_source';
                showNotification('🟠 Şimdi KAYNAK köşeyi seçin','info');
                var cbtn = document.getElementById('btn-mate-crnr');
                if (cbtn) { cbtn.style.background='#f97316'; cbtn.innerHTML='🟠 KAYNAK KÖŞE SEÇ…'; }
            } else if (window.cornerPickState === 'pick_source') {
                if (window.targetCornerPick && cpMesh2 === window.targetCornerPick.mesh) {
                    showNotification('Farklı bir parçanın köşesini seçin!','error'); return;
                }
                window.sourceCornerPick = { mesh: cpMesh2, vertex: nv2 };
                showCornerHighlight(nv2, 0xff7700);
                setTimeout(function(){ mateCornerToCorner(); }, 300);
            }
        }
        return;
    }

    // ── EDGE PICK MODU (Mate Edge-to-Edge) ──
    if (window.edgePickState && event.button === 0) {
        var epHits = raycaster.intersectObjects(objects.filter(function(o){ return o.isMesh && o.visible; }));
        if (epHits.length > 0) {
            var epMesh = epHits[0].object;
            var epPt   = epHits[0].point;
            var ne = nearestEdgeToPoint(epMesh, epPt);
            if (!ne) return;
            ne.mesh = epMesh;

            if (window.edgePickState === 'pick_target') {
                window.targetEdgePick = ne;
                showEdgeHighlight(ne.a, ne.b, 0x00e5ff); // cyan = hedef
                window.edgePickState = 'pick_source';
                showNotification('🟠 Şimdi KAYNAK kenarı seçin (sağ tık ile kaynak parça seçili olmalı)','info');
                var btn = document.getElementById('btn-mate-e2e');
                if (btn) { btn.style.background='#f97316'; btn.textContent='🟠 KAYNAK KENAR SEÇ...'; }
            } else if (window.edgePickState === 'pick_source') {
                if (window.targetEdgePick && epMesh === window.targetEdgePick.mesh) {
                    showNotification('Farklı bir parçanın kenarını seçin!','error'); return;
                }
                window.sourceEdgePick = ne;
                // İki kenar seçildi → uygula
                // Target kenarını mavi, source kenarı turuncu göster (kısa süre)
                showEdgeHighlight(ne.a, ne.b, 0xff6600);
                setTimeout(function() { mateEdgeToEdge(); }, 300);
            }
        }
        return;
    }

    // ── MATCH PROPERTIES MODE ──
    if (window._mpActive && event.button === 0) {
        var _mpHits = raycaster.intersectObjects(objects.filter(function(o){ return o.isMesh && !o.userData.isPMI && o.visible; }), false);
        if (_mpHits.length > 0) {
            var _mpMesh = _mpHits[0].object;
            if (window._mpPhase === 1) {
                window._mpSource = _mpMesh;
                window._mpPhase = 2;
                window._mpSetStatus(2, _mpMesh);
                window._mpFlash(_mpMesh, 0xf59e0b);
            } else if (window._mpPhase === 2) {
                if (_mpMesh === window._mpSource) {
                    showNotification('⚠️ Kaynak ve hedef aynı olamaz', 'warning'); return;
                }
                window._mpApply(window._mpSource, _mpMesh);
                window._mpCount++;
                window._mpFlash(_mpMesh, 0x22d3ee);
                showNotification('✅ Özellikler aktarıldı → ' + (_mpMesh.userData.id || 'Nesne'), 'success');
            }
        }
        return;
    }

    if (event.button === 0) {
        if (typeof isEdgeMode !== 'undefined' && isEdgeMode) {
            const hits = raycaster.intersectObjects(objects);
            if (hits.length > 0) { const e = highlightClosestEdge(hits[0]); if(e) selectEdge(e); }
            return;
        }
        if (typeof isSweepMode !== 'undefined' && isSweepMode) {
            let pt = null;
            if(typeof getSmartSnap === 'function') { const s = getSmartSnap(raycaster); if(s) pt = s.point; }
            if(!pt) { const hits = raycaster.intersectObjects(objects); if(hits.length > 0) pt = hits[0].point; }
            if(pt) addSweepPoint(pt);
            return;
        }
        
        // --- ÖLÇÜ ALMA (MEASURE MODE) ---
        if (typeof measureMode !== 'undefined' && measureMode) {
            const hits = raycaster.intersectObjects(objects);
            if (hits.length > 0) {
                let pt = hits[0].point;
                let hitObj = hits[0].object; // OBJEYİ KAYDET
                
                if(typeof getSmartSnap === 'function') { 
                    const s = getSmartSnap(raycaster); 
                    if(s) pt = s.point; 
                }
                
                // Artık sadece noktayı değil, tıkladığımız OBJEYİ DE gönderiyoruz!
                measurePoints.push({ point: pt, object: hitObj });
                
                if(typeof createNumberedMarker === 'function') createNumberedMarker(pt, measurePoints.length);
                if(typeof updateMeasurePanelUI === 'function') updateMeasurePanelUI();
                
                if (measurePoints.length === 2) {
                    createPMIDimension(measurePoints[0], measurePoints[1]);
                    measurePoints = [];
                    setTimeout(() => { if(typeof measureLines !== 'undefined') measureLines.forEach(l => { if(l.isSprite) scene.remove(l); }); }, 1000);
                }
            }
            return;
        }
        
        // --- PMI MODU ---
        if (typeof isPMIMode !== 'undefined' && isPMIMode) {
            const hits = raycaster.intersectObjects(objects);
            if (hits.length > 0) {
                let pt = hits[0].point;
                let hitObj = hits[0].object; // OBJEYİ KAYDET
                
                if(typeof getSmartSnap === 'function') { 
                    const s = getSmartSnap(raycaster); 
                    if(s) pt = s.point; 
                }
                
                // Objeyle beraber ekle
                pmiPoints.push({ point: pt, object: hitObj });
                
                const m = new THREE.Mesh(new THREE.SphereGeometry(0.5), new THREE.MeshBasicMaterial({color:0xff0000}));
                m.position.copy(pt); scene.add(m); 
                if(!window.tempPMIMarkers) window.tempPMIMarkers=[]; window.tempPMIMarkers.push(m);
                
                if (pmiPoints.length === 2) {
                    createPMIDimension(pmiPoints[0], pmiPoints[1]);
                    window.tempPMIMarkers.forEach(o=>scene.remove(o)); window.tempPMIMarkers=[]; pmiPoints=[];
                }
            }
            return;
        }
    }

    const intersects = raycaster.intersectObjects(objects);
    if (intersects.length > 0) {
        // ── MARKALAMA MODU ──
        if (event.button === 0 && typeof isBrandMode !== 'undefined' && isBrandMode) {
            applyTextToSurface(intersects[0]);
            return;
        }
        if (event.button === 0) {
            if (event.ctrlKey || event.metaKey) {
                // Ctrl+Click: multi-select toggle
                if (!window.multiSelection) window.multiSelection = [];
                var obj = intersects[0].object;
                var msIdx = window.multiSelection.indexOf(obj);
                if (msIdx >= 0) {
                    window.multiSelection.splice(msIdx, 1);
                    if(obj.material&&obj.material.emissive) obj.material.emissive.setHex(0x000000);
                    obj.userData._msHighlight = false;
                } else {
                    // Add to selection, keep previous selection highlighted too
                    if (targetSel && targetSel.mesh && window.multiSelection.indexOf(targetSel.mesh)<0) {
                        window.multiSelection.push(targetSel.mesh);
                        if(targetSel.mesh.material&&targetSel.mesh.material.emissive) targetSel.mesh.material.emissive.setHex(0x223366);
                        targetSel.mesh.userData._msHighlight = true;
                    }
                    window.multiSelection.push(obj);
                    if(obj.material&&obj.material.emissive) obj.material.emissive.setHex(0x334488);
                    obj.userData._msHighlight = true;
                    // Also select this object normally so transform works
                    selectObject(obj, intersects[0]);
                }
                if(window.updateMultiSelectUI) window.updateMultiSelectUI();
                return;
            } else {
                // Normal click: clear multi-select, select single
                if(window.clearMultiSelection) window.clearMultiSelection();
                resetSelection();
                selectObject(intersects[0].object, intersects[0]);
            }
        } 
        else if (event.button === 2) { controls.target.copy(intersects[0].point); controls.update(); selectSource(intersects[0].object, intersects[0]); }
    } else {
        if (event.button === 0) resetSelection();
    }
}

// =============================================================================
// BAŞLATMA (INIT) VE KANCA (HOOK)
// =============================================================================
window.onload = function() {
    // Mevcut init() fonksiyonunu çalıştır
   
    
    // TransformControl (Taşıma Gizmosu) üzerine özel takip kancası at
    if (typeof transformControl !== 'undefined') {
        transformControl.addEventListener('change', function() {
            // Eğer sürüklenen şey bir parçaysa, ona bağlı akıllı ölçüleri de peşinden sürükle
            if (transformControl.object && !transformControl.object.userData.isPMI) {
                updateSmartDimensions(transformControl.object);
            }
        });
    }
};

// =============================================================================
// UNIONİLMİŞ PARÇALAR (CSG) İÇİN AKILLI ÇAP/YARIÇAP ÖLÇÜM MOTORU
// =============================================================================

window.createRadialDimension = function(hit, type) {
    const mesh = hit.object;
    const hitPoint = hit.point;
    const p = mesh.userData.geoParams || {};
    
    let radius = 0;
    let center = new THREE.Vector3();
    let oppositePoint = new THREE.Vector3();
    let isCalculated = false;

    // YÖNTEM 1: Eğer parça henüz birleştirilmemiş saf bir şekilse (Eski yöntem)
    if (p && (p.r || p.radius || p.diameter || p.topDia || p.r1)) {
        if (p.r) radius = p.r;               
        else if (p.radius) radius = p.radius; 
        else if (p.diameter) radius = p.diameter / 2; 
        else if (p.topDia) radius = p.topDia / 2; 
        else if (p.r1) radius = p.r1; 
        
        radius *= mesh.scale.x; 
        
        if (radius > 0) {
            mesh.getWorldPosition(center);
            if (p.shape !== 'sphere') {
                const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
                const vecToHit = hitPoint.clone().sub(center);
                const heightDiff = vecToHit.dot(upVec);
                center.add(upVec.multiplyScalar(heightDiff));
            }
            isCalculated = true;
            const dir = hitPoint.clone().sub(center).normalize();
            oppositePoint = center.clone().add(dir.clone().multiplyScalar(-radius));
        }
    } 
    
    // YÖNTEM 2: FİZİKSEL TARAMA (Birleştirilmiş Parçalar, Delikler, Katılar İçin YENİ YÖNTEM)
    if (!isCalculated && hit.face) {
        // Tıklanan yüzeyin normalini (yönünü) al
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        const hitNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
        
        // A) İÇE DOĞRU IŞIN GÖNDER (Delik ölçümü için: Normal yönünde tarama yapar)
        const inwardRay = new THREE.Raycaster(hitPoint.clone().add(hitNormal.clone().multiplyScalar(0.01)), hitNormal);
        let intersects = inwardRay.intersectObject(mesh);
        
        if (intersects.length > 0) {
            const dist = intersects[0].distance + 0.01;
            radius = dist / 2;
            oppositePoint = intersects[0].point;
            center = hitPoint.clone().add(hitNormal.clone().multiplyScalar(radius));
            isCalculated = true;
        } else {
            // B) DIŞA DOĞRU IŞIN GÖNDER (Dolu silindir çıkıntısı ölçümü için: Normalin tersine tarama yapar)
            const outwardRay = new THREE.Raycaster(hitPoint.clone().add(hitNormal.clone().multiplyScalar(-0.01)), hitNormal.clone().negate());
            intersects = outwardRay.intersectObject(mesh);
            
            if (intersects.length > 0) {
                const dist = intersects[0].distance + 0.01;
                radius = dist / 2;
                oppositePoint = intersects[0].point;
                center = hitPoint.clone().add(hitNormal.clone().multiplyScalar(-radius));
                isCalculated = true;
            }
        }
    }

    // Eğer ölçüm başarısızsa kullanıcıyı uyar
    if (!isCalculated || radius <= 0.1) {
        showNotification("Bu yüzeyden çap ölçülemedi! Dairesel/Eğimli bir yüzeye tıkladığınızdan emin olun.", "error");
        return;
    }

    // --- EKRANA ÇİZİM İŞLEMLERİ ---
    const group = new THREE.Group();
    const color = 0x000000; 
    let labelVal = "";
    
    if (type === 'radius') {
        labelVal = "R " + radius.toFixed(2);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([center, hitPoint]);
        group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: color })));
        if (typeof addArrowTip === 'function') addArrowTip(group, center, hitPoint, color); 
    } else { 
        labelVal = "Ø " + (radius * 2).toFixed(2);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([oppositePoint, hitPoint]);
        group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: color })));
        if (typeof addArrowTip === 'function') {
            addArrowTip(group, center, hitPoint, color);      
            addArrowTip(group, center, oppositePoint, color); 
        }
    }

    // Yazı Etiketi
    const lblDiv = document.createElement('canvas');
    lblDiv.width = 256; lblDiv.height = 64;
    const ctx = lblDiv.getContext('2d');
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(0,0,256,64);
    ctx.strokeStyle = "black"; ctx.lineWidth = 4; ctx.strokeRect(0,0,256,64);
    ctx.font = "bold 40px Arial"; ctx.fillStyle = "black";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(labelVal, 128, 32);
    
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(lblDiv), depthTest: false }));
    sprite.scale.set(8, 2, 1);
    const labelPos = hitPoint.clone().lerp(center, 0.5);
    labelPos.y += 1.5; 
    sprite.position.copy(labelPos);
    group.add(sprite);

    // Silinebilir olması için verileri işle
    group.userData = { isPMI: true }; 
    scene.add(group);
    
    if(!window.pmiObjects) window.pmiObjects = [];
    window.pmiObjects.push(group);
    
    const resDiv = document.getElementById('measure-result');
    if (resDiv) {
        resDiv.classList.remove('hidden');
        document.getElementById('measure-dist-val').innerText = labelVal;
    }
    
    showNotification("Ölçü Başarıyla Alındı.", "success");
};

// --- YÖNETİCİYİ GÜNCELLE (YENİ FONKSİYONU ÇAĞIRMASI İÇİN) ---
// FIX: Store reference to the actual onMouseDown function, NOT window.onMouseDown (which is undefined at this point)
const _originalOnMouseDown = onMouseDown;
window.onMouseDown = function(event) {
    if (typeof measureMode !== 'undefined' && measureMode && event.button === 0) {
        if (typeof currentMeasureType !== 'undefined' && (currentMeasureType === 'radius' || currentMeasureType === 'diameter')) {
            raycaster.setFromCamera(mouse, camera);
            const hits = raycaster.intersectObjects(objects);
            // ESKİ HATA BURADAYDI: Sadece noktayı yolluyordu. Şimdi objenin tüm verisini yolluyoruz.
            if (hits.length > 0) {
                window.createRadialDimension(hits[0], currentMeasureType);
                return; 
            }
        }
    }
    // Eğer ölçü modu değilse normal işlemlere devam et
    if (typeof _originalOnMouseDown === 'function') _originalOnMouseDown(event);
};

window.addEventListener('load', function() {
    // Fix: keep onMouseDown as primary, wrap window.onMouseDown to also call it
    renderer.domElement.removeEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousedown', function(event) {
        // measureMode intercept
        if (typeof measureMode !== 'undefined' && measureMode && event.button === 0) {
            if (typeof currentMeasureType !== 'undefined' && (currentMeasureType === 'radius' || currentMeasureType === 'diameter')) {
                raycaster.setFromCamera(mouse, camera);
                const hits = raycaster.intersectObjects(objects);
                if (hits.length > 0) { window.createRadialDimension(hits[0], currentMeasureType); return; }
            }
        }
        // Call main handler
        onMouseDown(event);
    });
});

// =============================================================================
// GERÇEK CAD KALİTESİ: İÇ DETAYLI VE "PDF" ÇIKTILI TEKNİK RESİM MOTORU
// =============================================================================

window.takePhotoRender = async function() {
    alert("📐 Profesyonel PDF Teknik Resim Çıkarılıyor...\n(Silüetler, Ölçüler ve Detaylar hesaplanıyor. Lütfen bekleyin.)");
    
    try {
        var validObjects = objects.filter(function(o) { 
            return o && o.isMesh && o.visible && o.name !== "GridHelper" && (!o.userData || !o.userData.isPMI); 
        });

        if (validObjects.length === 0) {
            alert("Hata: Sahnede teknik resmi çizilecek katı bir parça yok!");
            return;
        }

        var originalBg = scene.background;
        var origClearColor = renderer.getClearColor().clone();
        var origClearAlpha = renderer.getClearAlpha();

        // Arka planı şeffaf yap
        scene.background = null;
        renderer.setClearColor(0xffffff, 0);

        var hidden = [];
        scene.traverse(function(obj) {
            if (obj.isHelper || obj.isLine || obj.isSprite || obj.name === "GridHelper" || obj.name === "AxesHelper" || (obj.userData && obj.userData.isPMI)) {
                if (obj.visible && obj.name !== "EdgeHelper") {
                    obj.visible = false;
                    hidden.push(obj);
                }
            }
        });
        if (typeof transformControl !== 'undefined' && transformControl) transformControl.visible = false;

        var restoreStack = [];
        validObjects.forEach(function(obj) {
            restoreStack.push({ obj: obj, mat: obj.material });
            var edges = null;
            if (obj.children) {
                for (var i = 0; i < obj.children.length; i++) {
                    if (obj.children[i].name === "EdgeHelper") edges = obj.children[i];
                }
            }
            if (!edges) {
                var geo = new THREE.EdgesGeometry(obj.geometry, 5); // 5 Derece (İnce detaylar için)
                var mat = new THREE.LineBasicMaterial({color: 0x000000, linewidth: 2});
                edges = new THREE.LineSegments(geo, mat);
                edges.name = "EdgeHelper";
                obj.add(edges);
                restoreStack[restoreStack.length-1].newEdge = edges;
            } else {
                restoreStack[restoreStack.length-1].oldColor = edges.material.color.getHex();
                restoreStack[restoreStack.length-1].oldVis = edges.visible;
            }
        });

        var box = new THREE.Box3();
        validObjects.forEach(function(o) {
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            var b = o.geometry.boundingBox.clone();
            b.applyMatrix4(o.matrixWorld);
            box.union(b);
        });
        
        var size = new THREE.Vector3(); box.getSize(size);
        var center = new THREE.Vector3(); box.getCenter(center);
        var maxDim = Math.max(size.x, size.y, size.z) || 100;
        var viewSize = maxDim * 1.6; // Ölçülere yer bırak

        var orthoCam = new THREE.OrthographicCamera(-viewSize/2, viewSize/2, viewSize/2, -viewSize/2, -maxDim*10, maxDim*10);
        scene.add(orthoCam);
        
        var oldW = window.innerWidth;
        var oldH = window.innerHeight;
        renderer.setSize(1200, 1200); 

        function capture(px, py, pz, ux, uy, uz) {
            orthoCam.position.set(center.x + px, center.y + py, center.z + pz);
            orthoCam.up.set(ux, uy, uz);
            orthoCam.lookAt(center);
            orthoCam.updateProjectionMatrix();
            renderer.render(scene, orthoCam);
            return renderer.domElement.toDataURL("image/png", 1.0); 
        }

        var dist = maxDim * 2;

        // 1. DELETEÜET MOTORU (SİYAH DIŞ HATLAR)
        validObjects.forEach(function(obj) {
            obj.material = new THREE.MeshBasicMaterial({ color: 0x000000 }); 
            var edges = obj.children.find(function(c) { return c.name === "EdgeHelper"; });
            if(edges) edges.visible = false;
        });
        var imgTopSil = capture(0, dist, 0, 0, 0, -1);
        var imgFrontSil = capture(0, 0, dist, 0, 1, 0);
        var imgIsoSil = capture(dist, dist, dist, 0, 1, 0);

        // 2. DETAY MOTORU (BEYAZ GÖVDE VE İÇ ÇİZGİLER)
        validObjects.forEach(function(obj) {
            obj.material = new THREE.MeshBasicMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: 1 });
            var edges = obj.children.find(function(c) { return c.name === "EdgeHelper"; });
            if(edges) {
                edges.material.color.setHex(0x000000);
                edges.visible = true;
            }
        });
        var imgTopMain = capture(0, dist, 0, 0, 0, -1);
        var imgFrontMain = capture(0, 0, dist, 0, 1, 0);
        var imgIsoMain = capture(dist, dist, dist, 0, 1, 0);

        // Sistemi Eski Haline Çevir
        renderer.setSize(oldW, oldH);
        renderer.setClearColor(origClearColor, origClearAlpha);
        scene.background = originalBg;
        scene.remove(orthoCam);
        hidden.forEach(function(h) { h.visible = true; });
        if (typeof transformControl !== 'undefined') transformControl.visible = true;

        restoreStack.forEach(function(r) {
            r.obj.material = r.mat;
            if (r.newEdge) {
                r.obj.remove(r.newEdge);
            } else if(r.obj.children) {
                for(var i=0; i<r.obj.children.length; i++) {
                    var c = r.obj.children[i];
                    if(c.name === "EdgeHelper") {
                        c.material.color.setHex(r.oldColor);
                        c.visible = r.oldVis;
                    }
                }
            }
        });
        renderer.render(scene, camera);

        // =======================================================
        // 3. 2D CANVAS ÇİZİMİ VE UNIONME (1920x1080)
        // =======================================================
        var canvas = document.createElement('canvas');
        canvas.width = 1920; canvas.height = 1080;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,1920,1080);
        ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,1920,80);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('WebForge3D - TEKNIK RESIM & URETIM RAPORU', 40, 52);
        ctx.font = '20px Arial'; ctx.fillText(new Date().toLocaleString(), 1650, 48);

        function loadImg(src) {
            return new Promise(function(resolve) {
                var img = new Image();
                img.onload = function() { resolve(img); };
                img.src = src;
            });
        }

        var iTopS = await loadImg(imgTopSil), iTopM = await loadImg(imgTopMain);
        var iFrontS = await loadImg(imgFrontSil), iFrontM = await loadImg(imgFrontMain);
        var iIsoS = await loadImg(imgIsoSil), iIsoM = await loadImg(imgIsoMain);

        function drawThickView(silImg, mainImg, x, y, w) {
            var out = 2.5; 
            ctx.drawImage(silImg, x - out, y, w, w); ctx.drawImage(silImg, x + out, y, w, w);
            ctx.drawImage(silImg, x, y - out, w, w); ctx.drawImage(silImg, x, y + out, w, w);
            var inn = 0.5; 
            ctx.drawImage(mainImg, x - inn, y, w, w); ctx.drawImage(mainImg, x + inn, y, w, w);
            ctx.drawImage(mainImg, x, y - inn, w, w); ctx.drawImage(mainImg, x, y + inn, w, w);
            ctx.drawImage(mainImg, x, y, w, w); 
        }

        // --- KOORDİNATLAR BURADA TANIMLANIYOR (HATANIN ÇÖZÜLDÜĞÜ YER) ---
        var tX = 50, tY = 120, imgW = 450;
        var fX = 50, fY = 600; // EKSİK OLAN fX BURAYA EKLENDİ
        var iX = 550, iY = 120, isoW = 930;

        drawThickView(iTopS, iTopM, tX, tY, imgW); ctx.strokeRect(tX, tY, imgW, imgW); 
        drawThickView(iFrontS, iFrontM, fX, fY, imgW); ctx.strokeRect(fX, fY, imgW, imgW);
        drawThickView(iIsoS, iIsoM, iX, iY, isoW); ctx.strokeRect(iX, iY, isoW, isoW);

        ctx.fillStyle = '#000000'; ctx.font = 'bold 22px Arial'; ctx.textAlign = 'center';
        ctx.fillText('UST GORUNUS (TOP)', 275, 555);
        ctx.fillText('ON GORUNUS (FRONT)', 275, 1035);
        ctx.fillText('IZOMETRIK GORUNUS', 1015, 1030);

        // =======================================================
        // DIŞ SINIR ÖLÇÜLENDİRMESİ
        // =======================================================
        function drawDim(x1, y1, x2, y2, extX1, extY1, extX2, extY2, text, isVert) {
            ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5; 
            ctx.beginPath(); ctx.moveTo(extX1, extY1); ctx.lineTo(x1, y1); ctx.moveTo(extX2, extY2); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            var aSize = 12; var angle = Math.atan2(y2 - y1, x2 - x1);
            ctx.fillStyle = '#000000';
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + aSize*Math.cos(angle+0.3), y1 + aSize*Math.sin(angle+0.3)); ctx.lineTo(x1 + aSize*Math.cos(angle-0.3), y1 + aSize*Math.sin(angle-0.3)); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - aSize*Math.cos(angle+0.3), y2 - aSize*Math.sin(angle+0.3)); ctx.lineTo(x2 - aSize*Math.cos(angle-0.3), y2 - aSize*Math.sin(angle-0.3)); ctx.fill();
            ctx.font = 'bold 18px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            var mx = (x1 + x2) / 2; var my = (y1 + y2) / 2;
            ctx.save(); ctx.translate(mx, my); if(isVert) ctx.rotate(-Math.PI/2);
            var tw = ctx.measureText(text).width;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(-tw/2-5, -12, tw+10, 24);
            ctx.fillStyle = '#0f172a'; ctx.fillText(text, 0, 0); ctx.restore(); 
        }

        var scalePx = imgW / viewSize;
        var pxW = size.x * scalePx, pxH = size.y * scalePx, pxD = size.z * scalePx;
        var gap = 40; 

        var tCx = tX + imgW/2, tCy = tY + imgW/2;
        drawDim(tCx - pxW/2, tCy - pxD/2 - gap, tCx + pxW/2, tCy - pxD/2 - gap, tCx - pxW/2, tCy - pxD/2, tCx + pxW/2, tCy - pxD/2, "Genislik: " + size.x.toFixed(1), false);
        drawDim(tCx + pxW/2 + gap, tCy - pxD/2, tCx + pxW/2 + gap, tCy + pxD/2, tCx + pxW/2, tCy - pxD/2, tCx + pxW/2, tCy + pxD/2, "Derinlik: " + size.z.toFixed(1), true);

        var fCx = fX + imgW/2, fCy = fY + imgW/2;
        drawDim(fCx - pxW/2 - gap, fCy - pxH/2, fCx - pxW/2 - gap, fCy + pxH/2, fCx - pxW/2, fCy - pxH/2, fCx - pxW/2, fCy + pxH/2, "Yukseklik: " + size.y.toFixed(1), true);

        // =======================================================
        // AKILLI UNSUR (FEATURE) İÇ ÖLÇÜLENDİRMESİ
        // =======================================================
        function drawLeader(x, y, textLines, angleDeg) {
            var rad = angleDeg * Math.PI / 180;
            var lineLen = 65; 
            var endX = x + Math.cos(rad) * lineLen;
            var endY = y - Math.sin(rad) * lineLen;
            var landLen = 50; 
            var landX = (Math.cos(rad) > 0) ? endX + landLen : endX - landLen;

            ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2;
            ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.lineTo(landX, endY); ctx.stroke();

            ctx.fillStyle = '#dc2626'; ctx.font = 'bold 16px Arial';
            ctx.textAlign = (Math.cos(rad) > 0) ? 'left' : 'right'; ctx.textBaseline = 'bottom';
            var lines = textLines.split('\n');
            for(var i=0; i<lines.length; i++) {
                ctx.fillText(lines[i], (Math.cos(rad) > 0) ? landX + 5 : landX - 5, endY - 2 - (lines.length - 1 - i)*18);
            }
        }

        var anglesTop = [45, 135, 225, 315, 60, 150];
        var anglesFront = [45, 135, 20, 160];
        var lTop = 0, lFront = 0;

        validObjects.forEach(function(obj) {
            var p = obj.userData.geoParams || {};
            var lastFeat = obj.userData.lastFeature;
            var uType = obj.userData.type || "";

            var objPos = new THREE.Vector3();
            obj.getWorldPosition(objPos);
            var relX = (objPos.x - center.x) * scalePx;
            var relY = (objPos.y - center.y) * scalePx;
            var relZ = (objPos.z - center.z) * scalePx;

            var topPtX = tX + imgW/2 + relX;
            var topPtY = tY + imgW/2 + relZ;
            var frontPtX = fX + imgW/2 + relX;
            var frontPtY = fY + imgW/2 - relY;

            var sx = obj.scale.x, sy = obj.scale.y, sz = obj.scale.z;

            if (p.shape === 'polygon') {
                var sw = (p.sw * sx).toFixed(1);
                var k = (p.h * sy).toFixed(1);
                drawLeader(topPtX, topPtY, "SW (Anahtar): " + sw, anglesTop[lTop % anglesTop.length]); lTop++;
                drawLeader(frontPtX, frontPtY, "Somun Kalinlik: " + k, anglesFront[lFront % anglesFront.length]); lFront++;
            }
            else if (p.shape === 'helix_gen') {
                var d = (p.dia * sx).toFixed(1);
                var pb = (p.height * sy).toFixed(1);
                var pt = (p.pitch).toFixed(2);
                var isT = p.isThread ? "Civata Disi" : "Yay";
                drawLeader(frontPtX, frontPtY, isT + "\nCap: M" + Math.round(d) + "\nPaso Boyu: " + pb + "\nHatve: " + pt, anglesFront[lFront % anglesFront.length]); lFront++;
            }
            else if (p.shape === 'cylinder') {
                var cap = (p.r * 2 * sx).toFixed(1);
                var boy = (p.h * sy).toFixed(1);
                drawLeader(topPtX, topPtY, "\u00D8" + cap + " (Cap)", anglesTop[lTop % anglesTop.length]); lTop++;
                drawLeader(frontPtX, frontPtY, "Mil Boyu: " + boy, anglesFront[lFront % anglesFront.length]); lFront++;
            }
            else if (p.shape === 'torus' || p.shape === 'torus_custom' || p.shape === 'flat_ring') {
                var od = (p.od ? p.od * sx : p.radius * 2 * sx).toFixed(1);
                var id = (p.id ? p.id * sx : (p.radius - p.tube) * 2 * sx).toFixed(1);
                drawLeader(topPtX, topPtY, "Dis \u00D8" + od + "\nIc \u00D8" + id, anglesTop[lTop % anglesTop.length]); lTop++;
            }

            if (p.diameter && uType.includes("HOLE")) {
                drawLeader(topPtX, topPtY, "Delik: \u00D8" + (p.diameter*sx).toFixed(1), anglesTop[lTop % anglesTop.length]); lTop++;
            } else if (p.diameter && uType.includes("BOSS")) {
                drawLeader(topPtX, topPtY, "Cikinti: \u00D8" + (p.diameter*sx).toFixed(1), anglesTop[lTop % anglesTop.length]); lTop++;
            }

            if (lastFeat) {
                if (lastFeat.type === 'hole') {
                    var hd = (lastFeat.params.diameter * sx).toFixed(1);
                    drawLeader(topPtX, topPtY, "Ic Delik: \u00D8" + hd, anglesTop[lTop % anglesTop.length]); lTop++;
                } else if (lastFeat.type === 'boss') {
                    var bd = (lastFeat.params.diameter * sx).toFixed(1);
                    drawLeader(topPtX, topPtY, "Ek Cikinti: \u00D8" + bd, anglesTop[lTop % anglesTop.length]); lTop++;
                }
            }
        });

        // =======================================================
        // 8. SAĞ BİLGİ TABLOSU
        // =======================================================
        var tblX = 1520, tblY = 120, tblW = 360;
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(tblX, tblY, tblW, 930); ctx.strokeRect(tblX, tblY, tblW, 930);
        ctx.fillStyle = '#2563eb'; ctx.fillRect(tblX, tblY, tblW, 60);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'left';
        ctx.fillText('IMALAT BILGILERI', tblX + 70, tblY + 38);

        var totVol = 0, totArea = 0;
        validObjects.forEach(function(o) {
            totVol += (o.userData.volume||0) * o.scale.x * o.scale.y * o.scale.z;
            if(typeof getSurfaceArea === 'function') totArea += getSurfaceArea(o);
        });
        var weight = totVol * 0.00785; 

        ctx.fillStyle = '#000000';
        function addRow(label, value, yOffset, isRed) {
            ctx.textAlign = 'left';
            ctx.font = 'bold 22px Arial';
            ctx.fillStyle = isRed ? '#dc2626' : '#000000';
            ctx.fillText(label, tblX + 20, tblY + yOffset);
            ctx.font = '22px Arial';
            ctx.fillText(value, tblX + 20, tblY + yOffset + 35);
            ctx.beginPath(); ctx.moveTo(tblX, tblY + yOffset + 55); ctx.lineTo(tblX + tblW, tblY + yOffset + 55); ctx.stroke();
        }

        addRow('Parca Sayisi:', validObjects.length + " Adet Unsur", 100);
        addRow('Malzeme Tipi:', "Celik (S235JR)", 190);
        addRow('Max Genislik (X):', size.x.toFixed(2) + " mm", 280);
        addRow('Max Yukseklik (Y):', size.y.toFixed(2) + " mm", 370);
        addRow('Max Derinlik (Z):', size.z.toFixed(2) + " mm", 460);
        addRow('Toplam Hacim:', totVol.toFixed(0) + " mm3", 550);
        addRow('Yuzey Alani:', totArea.toFixed(0) + " mm2", 640);
        addRow('TAHMINI AGIRLIK:', weight.toFixed(2) + " Gram", 750, true); 

        // =======================================================
        // 9. DOĞRUDAN PDF OLARAK İNDİRME
        // =======================================================
        var imgData = canvas.toDataURL('image/jpeg', 1.0);
        
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            var doc = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                format: [1920, 1080]
            });
            
            doc.addImage(imgData, 'JPEG', 0, 0, 1920, 1080);
            doc.save('Imalat_Teknik_Resmi_' + Date.now() + '.pdf');
            if(typeof showNotification === 'function') showNotification("Efsane PDF Başarıyla İndirildi!", "success");
        } else {
            var link = document.createElement('a');
            link.download = 'Imalat_Teknik_Resmi_' + Date.now() + '.png';
            link.href = canvas.toDataURL('image/png', 1.0);
            link.click();
            if(typeof showNotification === 'function') showNotification("PDF motoru bulunamadı, PNG olarak indirildi.", "warning");
        }

    } catch(e) {
        alert("Teknik Resim Hatasi: " + e.message);
        console.error(e);
    }
};
//**********************************************************************************


// =============================================================================
// ULTIMATE 2D DRAFTING STÜDYOSU [TÜRETME (PROJECT) HATASI GİDERİLDİ + 1. AÇI İZDÜŞÜMÜ]
// =============================================================================

// ── DRAFT STUDIO v2 ──────────────────────────────────────────
(function() {
'use strict';
/* ══════════════════════════════════════════════════════
   DRAFT STUDIO v3.1
   - Proper silhouette + feature-edge projection (no mesh fill)
   - Visible 0.4 / Hidden 0.3 dashed / Center 0.2 chain
   - Auto cylinder center-line detection
   - SVG group transform (zoom/pan on group, not elements)
   - Working export: SVG download + PDF via blob
   ══════════════════════════════════════════════════════ */

var DS={
  open:false,paper:'A4',orient:'P',mode:'tech',tool:'select',
  views:[],entities:[],dims:[],selected:null,
  zoom:1,panX:0,panY:0,
  dragging:null,dragOffset:{x:0,y:0},
  _p1:null,_p2:null,_secPt:null,
  _panning:false,_panStart:{x:0,y:0},
  history:[],viewImages:{},viewEdges:{},snapPts:[],
  meshSize:null,meshCenter:null,
  tb:{title:'PART DRAWING',drawn:'',checked:'',material:'',
      company:'3D STUDIO PRO',proj:'FIRST ANGLE',
      sheet:'1/1',date:new Date().toLocaleDateString('tr-TR')}
};
window.DS=DS;

var PAPER={A4:{w:297,h:210},A3:{w:420,h:297},A2:{w:594,h:420},A1:{w:841,h:594}};
// ISO line weights in mm (SVG user units = mm inside paper group)
var LW={vis:1.5, hid:0.9, cen:0.7, hatch:0.8, dim:0.8, thin:0.6};
// Feature edge threshold: cos(angle). cos(30°)≈0.866  cos(20°)≈0.94
var FEATURE_COS = 0.866;

/* ── OPEN / CLOSE ─────────────────────────────────── */
window.openDraftStudio = function(){
  buildUI();
  var el=document.getElementById('dstR');
  if(el){ el.style.display='flex'; el.style.pointerEvents='auto'; el.classList.remove('hidden'); }
  DS.open=true;
  setTimeout(function(){
    initCanvas();
    // Recalc after full paint
    setTimeout(function(){ DS_setPaper(); captureAll(); }, 400);
  }, 80);
};
window.closeDraftStudio = function(){
  DS.open=false;
  var el=document.getElementById('dstR');
  if(el){ el.style.display='none'; el.style.pointerEvents='none'; }
  if(window.scene && window.THREE) window.scene.background = window._sceneBgColor || new window.THREE.Color(0x1e2028);
  if(window.renderer && window.camera && window.scene) window.renderer.render(window.scene, window.camera);
};
window.openInteractiveDraftStudio = window.openDraftStudio;

/* ── BUILD UI ─────────────────────────────────────── */
function buildUI(){
  if(document.getElementById('dstR')) return;

  /* --- CSS --- */
 

 var sty=document.createElement('style');
  sty.textContent=[
    '#dstR *{box-sizing:border-box;}',
    '.dsBtn{background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.4);color:#c7d2fe;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;transition:.1s;}',
    '.dsBtn:hover{background:rgba(99,102,241,.5);color:#fff;}',
    '.dsBtn.act{background:#4f46e5;color:#fff;border-color:#818cf8;}',
    '.dsSel{background:#0f172a;color:#fff;border:1px solid #334155;border-radius:4px;padding:2px 5px;font-size:11px;font-weight:700;}',
    '.dsVBtn{background:rgba(30,58,138,.4);border:1px solid #1e40af;color:#93c5fd;border-radius:4px;padding:5px 3px;font-size:10px;font-weight:700;cursor:pointer;transition:.1s;text-align:center;}',
    '.dsVBtn:hover{background:#1e40af;color:#fff;}',
    '.dsInp{width:100%;background:#0f172a;border:1px solid #334155;color:#fff;border-radius:4px;padding:2px 5px;font-size:11px;margin-bottom:3px;}',
    '.dsLbl{color:#60a5fa;font-size:10px;font-weight:900;letter-spacing:1px;margin-bottom:3px;}',
    '.dsLL{color:#64748b;font-size:9px;display:block;}'
  +'#dstWrap.snap-end{cursor:cell !important;}'
  +'#dstWrap.snap-mid{cursor:cell !important;}'
  +'#dstWrap.snap-cen{cursor:cell !important;}'
  +'#dstWrap.snap-qua{cursor:crosshair !important;}'
  +'#dstWrap.snap-tan{cursor:crosshair !important;}'
  +'#dstWrap.snap-int{cursor:crosshair !important;}',
    '.dsCk{display:flex;align-items:center;gap:4px;color:#94a3b8;font-size:10px;cursor:pointer;margin-bottom:2px;}',
    '.dsSep{width:1px;height:20px;background:#334155;margin:0 3px;flex-shrink:0;}',
  ].join('');
  document.head.appendChild(sty);

  /* --- HTML --- */
  var d=document.createElement('div');
  d.id='dstR';
  d.className='hidden';
  d.style.cssText='position:fixed;top:56px;left:0;right:0;bottom:0;z-index:29000;display:none;flex-direction:column;background:#cfc5a8;font-family:Segoe UI,system-ui,sans-serif;pointer-events:auto;';

  d.innerHTML=
  /* TOP BAR */
  '<div id="dstBar" style="background:#1a2e4a;border-bottom:2px solid #2563eb;padding:3px 8px;display:flex;align-items:center;gap:4px;flex-shrink:0;min-height:38px;flex-wrap:wrap;">'
  +'<i class="fas fa-drafting-compass" style="color:#60a5fa;font-size:13px;"></i>'
  +'<span style="color:#fff;font-weight:900;font-size:13px;letter-spacing:1px;margin-right:4px;">DRAFT STUDIO</span>'
  +'<select id="dstPaper" onchange="DS_setPaper()" class="dsSel"><option selected>A4</option><option>A3</option><option>A2</option><option>A1</option></select>'
  +'<select id="dstOrient" onchange="DS_setPaper()" class="dsSel"><option value="P" selected>Portrait</option><option value="L">Landscape</option></select>'
  +'<select id="dstScale" class="dsSel" onchange="redrawDims()"><option>1:1</option><option>1:2</option><option>1:5</option><option>1:10</option><option>2:1</option><option>5:1</option></select>'
  +'<div class="dsSep"></div>'
  +'<button id="dstModeTech" onclick="DS_setMode(\'tech\')" class="dsBtn act"><i class="fas fa-pen-nib"></i> TECHNICAL</button>'
  +'<button id="dstModeRend" onclick="DS_setMode(\'render\')" class="dsBtn"><i class="fas fa-image"></i> RENDER</button>'
  +'<div class="dsSep"></div>'
  +dsBtn('select','&#x2b61; SELECT')
  +dsBtn('dim_lin','&#x2194; LINEAR')
  +dsBtn('dim_hor','&#x2192; HORIZ')
  +dsBtn('dim_ver','&#x2195; VERT')
  +dsBtn('dim_rad','R RADIUS')
  +dsBtn('dim_dia','&#x00D8; DIA')
  +dsBtn('line','/ LINE')
  +dsBtn('centerline','&#x2295; CL')
  +dsBtn('hatch','&#x27CB; HATCH')
  +dsBtn('balloon','&#x2460; BALLOON')
  +dsBtn('text','T TEXT')
  +'<button onclick="DS_addSection()" class="dsBtn" style="color:#fbbf24;">&#x2702; SECTION</button>'
  +'<div style="flex:1;"></div>'
  +'<button onclick="DS_captureAll()" style="background:#0e7490;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:11px;font-weight:900;cursor:pointer;"><i class="fas fa-sync"></i> UPDATE</button>'
  +'<button onclick="DS_undo()" class="dsBtn" style="margin-left:4px;" title="Ctrl+Z"><i class="fas fa-undo"></i></button>'
  +'<button onclick="DS_exportSVG()" style="background:#2563eb;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:11px;font-weight:900;cursor:pointer;margin-left:4px;"><i class="fas fa-download"></i> SVG</button>'
  +'<button onclick="DS_exportPDF()" style="background:#16a34a;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:11px;font-weight:900;cursor:pointer;margin-left:3px;"><i class="fas fa-file-pdf"></i> PDF</button>'
  +'<button id="dstBtnPrintArea" onclick="DS_startPrintArea()" style="background:#7c3aed;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:11px;font-weight:900;cursor:pointer;margin-left:3px;"><i class="fas fa-crop-alt"></i> PRINT AREA</button>'
  +'<button onclick="window.closeDraftStudio()" style="background:#dc2626;color:#fff;border:none;border-radius:4px;padding:2px 10px;font-size:11px;font-weight:900;cursor:pointer;margin-left:4px;"><i class="fas fa-times"></i></button>'
  +'</div>'
  /* MAIN */
  +'<div style="display:flex;flex:1;overflow:hidden;">'
  /* LEFT */
  +'<div style="width:188px;flex-shrink:0;background:#1e293b;border-right:1px solid #334155;overflow-y:auto;padding:7px;display:flex;flex-direction:column;gap:5px;">'
  +'<div class="dsLbl">&#x1F4D0; ADD VIEW</div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">'
  +'<button onclick="DS_addView(\'front\')"  class="dsVBtn">FRONT</button>'
  +'<button onclick="DS_addView(\'top\')"    class="dsVBtn">TOP</button>'
  +'<button onclick="DS_addView(\'right\')"  class="dsVBtn">RIGHT</button>'
  +'<button onclick="DS_addView(\'left\')"   class="dsVBtn">LEFT</button>'
  +'<button onclick="DS_addView(\'bottom\')" class="dsVBtn">BOTTOM</button>'
  +'<button onclick="DS_addView(\'back\')"   class="dsVBtn">BACK</button>'
  +'<button onclick="DS_addView(\'iso\')" class="dsVBtn" style="grid-column:span 2;background:rgba(99,102,241,.4);">ISOMETRIC</button>'
  +'</div>'
  +'<div style="font-size:9px;color:#475569;line-height:1.4;">Drag views to reposition.<br>Click to select, Del to delete.</div>'
  /* dim settings */
  +'<div style="border-top:1px solid #334155;padding-top:5px;">'
  +'<div class="dsLbl" style="color:#f59e0b;">&#x1F4CF; DIMENSION</div>'
  +'<label class="dsLL">Text size (mm)</label><input id="dstDimSz" type="number" value="3.5" step="0.5" class="dsInp">'
  +'<label class="dsLL">Offset (mm)</label><input id="dstDimOff" type="number" value="8" step="1" class="dsInp">'
  +'<label class="dsLL">Tolerance</label><input id="dstDimTol" type="text" value="" placeholder="±0.05" class="dsInp">'
  +'<label class="dsLL">Prefix</label><input id="dstDimPre" type="text" value="" class="dsInp">'
  +'</div>'
  /* hatch settings */
  +'<div style="border-top:1px solid #334155;padding-top:5px;">'
  +'<div class="dsLbl" style="color:#34d399;">&#x27CB; HATCH</div>'
  +'<label class="dsLL">Angle °</label><input id="dstHatchAng" type="number" value="45" class="dsInp">'
  +'<label class="dsLL">Spacing mm</label><input id="dstHatchSp" type="number" value="3" step="0.5" class="dsInp">'
  +'</div>'
  /* title block */
  +'<div style="border-top:1px solid #334155;padding-top:5px;">'
  +'<div class="dsLbl" style="color:#a78bfa;">&#x1F4CB; TITLE BLOCK</div>'
  +'<label class="dsLL">Part Name</label><input id="dstTBtitle" type="text" value="PART DRAWING" class="dsInp" oninput="DS_updateTB()">'
  +'<label class="dsLL">Material</label><input id="dstTBmat" type="text" value="" placeholder="St37…" class="dsInp" oninput="DS_updateTB()">'
  +'<label class="dsLL">Drawn by</label><input id="dstTBdrawn" type="text" value="" class="dsInp" oninput="DS_updateTB()">'
  +'<label class="dsLL">Company</label><input id="dstTBco" type="text" value="3D STUDIO PRO" class="dsInp" oninput="DS_updateTB()">'
  +'<select id="dstTBproj" onchange="DS_updateTB()" class="dsInp" style="margin-bottom:3px;">'
  +'<option value="FIRST ANGLE">1st Angle (E)</option><option value="THIRD ANGLE">3rd Angle (A)</option>'
  +'</select>'
  +'<button onclick="DS_redrawTB()" style="width:100%;background:#4f46e5;color:#fff;border:none;border-radius:4px;padding:4px;font-size:10px;font-weight:900;cursor:pointer;">APPLY</button>'
  +'</div>'
  /* snap */
  +'<div style="border-top:1px solid #334155;padding-top:5px;">'
  +'<div class="dsLbl">&#x1F3AF; SNAP</div>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapGrid" checked> Grid (5mm)</label>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapEnd" checked> Endpoint</label>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapMid" checked> Midpoint</label>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapCen" checked> Center</label>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapQua" checked> Quadrant</label>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapTan" checked> Tangent</label>'
  +'<label class="dsCk"><input type="checkbox" id="dstSnapInt" checked> Intersection</label>'
  +'</div>'
  +'</div>'
  /* CANVAS */
  +'<div id="dstWrap" style="flex:1;overflow:hidden;position:relative;cursor:default;"'
  +' onmousedown="DS_down(event)" onmousemove="DS_move(event)"'
  +' onmouseup="DS_up(event)" ondblclick="DS_dbl(event)" onwheel="DS_wheel(event)">'
  +'<svg id="dstSVG" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0;width:100%;height:100%;display:block;">'
  +'<defs>'
  +'<marker id="dstArr" markerWidth="5" markerHeight="5" refX="5" refY="2.5" orient="auto"><polygon points="0,0 0,5 5,2.5" fill="#1a2e4a"/></marker>'
  +'<marker id="dstArrR" markerWidth="5" markerHeight="5" refX="0" refY="2.5" orient="auto"><polygon points="5,0 5,5 0,2.5" fill="#1a2e4a"/></marker>'
  +'</defs>'
  /* canvas bg */
  +'<rect id="dstBg" fill="white" x="0" y="0" width="100%" height="100%"/>'
  /* paper group — all children in mm */
  +'<g id="dstPG">'
  +'<rect id="dstPaper" x="0" y="0" fill="white" stroke="#94a3b8" stroke-width="0.3"/>'
  +'<rect id="dstFrame" fill="none" stroke="#1a2e4a" stroke-width="0.5"/>'
  +'<g id="dstVG"></g>'  /* views */
  +'<g id="dstDG"></g>'  /* dims */
  +'<g id="dstAG"></g>'  /* annotations */
  +'<g id="dstTBG"></g>' /* title block */
  +'</g>'
  +'<g id="dstPrev"></g>'     /* preview, also in paper coords */
  +'<g id="dstSnapG" pointer-events="none"></g>'  /* snap indicators in screen coords */
  +'</svg>'
  +'<div id="dstCoords" style="position:absolute;bottom:7px;left:7px;background:rgba(15,23,42,.85);color:#60a5fa;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;pointer-events:none;"></div>'
  +'<div id="dstHint" style="position:absolute;bottom:32px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,.9);color:#e2e8f0;font-size:11px;font-weight:700;padding:3px 14px;border-radius:6px;pointer-events:none;display:none;white-space:nowrap;"></div>'
  +'<div id="dstSnapLbl" style="position:absolute;display:none;background:#f59e0b;color:#000;font-size:9px;font-weight:900;padding:1px 5px;border-radius:3px;pointer-events:none;"></div>'
  +'</div>'
  +'</div>';

  document.body.appendChild(d);
  document.addEventListener('keydown', DS_key);

  /* ── DOCUMENT-LEVEL handlers for viewProj drag (works outside wrap) ── */
  document.addEventListener('mousemove', function(e){
    if(!DS.open) return;
    if(!DS.dragging||DS.dragging.type!=='viewProj') return;
    var wrap=document.getElementById('dstWrap'); if(!wrap) return;
    var r=wrap.getBoundingClientRect();
    var mx=(e.clientX-r.left-DS.panX)/DS.zoom;
    var my=(e.clientY-r.top-DS.panY)/DS.zoom;
    var pv=document.getElementById('dstPrev'); if(!pv) return;
    pv.innerHTML='';
    /* ghost rectangle */
    var pr=svgE('rect');
    sa(pr,{x:mx-20,y:my-13,width:40,height:26,
      fill:'rgba(59,130,246,.12)',stroke:'#3b82f6',
      'stroke-width':0.6,'stroke-dasharray':'4,2','rx':1});
    pv.appendChild(pr);
    /* label */
    var ptxt=svgE('text');
    sa(ptxt,{x:mx,y:my+1.5,'text-anchor':'middle','font-size':3.5,
      'font-weight':'bold','font-family':'Arial',fill:'#3b82f6'});
    ptxt.textContent=(DS.dragging.newView||'').toUpperCase();
    pv.appendChild(ptxt);
    /* crosshair */
    ['h','v'].forEach(function(dir){
      var cl=svgE('line');
      sa(cl,dir==='h'?{x1:mx-4,y1:my,x2:mx+4,y2:my}:{x1:mx,y1:my-4,x2:mx,y2:my+4});
      sa(cl,{stroke:'#3b82f6','stroke-width':0.5});
      pv.appendChild(cl);
    });
  });

  document.addEventListener('mouseup', function(e){
    if(!DS.open) return;
    if(!DS.dragging||DS.dragging.type!=='viewProj') return;
    e.stopPropagation(); /* prevent DS_up from clearing dragging */
    var newName=DS.dragging.newView;
    var wrap=document.getElementById('dstWrap'); if(!wrap) return;
    var r=wrap.getBoundingClientRect();
    /* only place if drop is inside the draw area */
    if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){
      DS.dragging=null;
      var pv=document.getElementById('dstPrev'); if(pv) pv.innerHTML='';
      return;
    }
    var mx=(e.clientX-r.left-DS.panX)/DS.zoom;
    var my=(e.clientY-r.top-DS.panY)/DS.zoom;
    var srcV=DS.views.find(function(v){return v.id===DS.dragging.srcId;});
    if(srcV&&newName){
      pushH();
      /* Estimate new view dimensions from source */
      var sz=DS.meshSize||{x:60,y:40,z:30};
      var sc=parseScale();
      var DIM={
        front:[sz.x*sc,sz.y*sc],back:[sz.x*sc,sz.y*sc],
        top:[sz.x*sc,sz.z*sc],bottom:[sz.x*sc,sz.z*sc],
        right:[sz.z*sc,sz.y*sc],left:[sz.z*sc,sz.y*sc],
        iso:[sz.x*sc*1.4,sz.y*sc*1.4]
      };
      var dm=DIM[newName]||[srcV.w,srcV.h];
      var nvw=Math.max(dm[0],15), nvh=Math.max(dm[1],15);
      var id2='v_'+Date.now()+'_n';
      var nv={id:id2,name:newName,x:mx-nvw/2,y:my-nvh/2,w:nvw,h:nvh,scStr:srcV.scStr||'1:1'};
      DS.views.push(nv);
      /* Ensure edges are captured */
     if(!DS.viewEdges[newName]){
        /* run projectEdges inline if meshes available */
        if(window.THREE&&window.scene&&DS.meshCenter){
          var VDEFS_MAP={
            front:{eye:[0,0,1],up:[0,1,0]},back:{eye:[0,0,-1],up:[0,1,0]},
            top:{eye:[0,1,0],up:[0,0,-1]},bottom:{eye:[0,-1,0],up:[0,0,1]},
            right:{eye:[1,0,0],up:[0,1,0]},left:{eye:[-1,0,0],up:[0,1,0]}
          };
          var vd=VDEFS_MAP[newName];
          if(vd){
            var meshes=(window.objects||[]).filter(function(o){return o&&o.isMesh&&!o.userData.isPMI;});
            DS.viewEdges[newName]=projectEdges(meshes,DS.meshCenter,DS.meshSize,vd.eye,vd.up,
              Math.max(DS.meshSize.x,DS.meshSize.y,DS.meshSize.z,1));
          }
        }
      }
      drawView(nv);
      rebuildSnap();
    }
    DS.dragging=null;
    document.body.style.userSelect='';
    var pv=document.getElementById('dstPrev'); if(pv) pv.innerHTML='';
    hint('');
  });
}
function dsBtn(tool,lbl){return '<button class="dsBtn" data-dstool="'+tool+'" onclick="DS_tool(this)" title="'+lbl+'">'+lbl+'</button>';}

/* ── CANVAS INIT ──────────────────────────────────── */
function initCanvas(){
  var w=document.getElementById('dstWrap'), s=document.getElementById('dstSVG');
  if(!w||!s) return;
  var W=w.clientWidth||w.offsetWidth||900;
  var H=w.clientHeight||w.offsetHeight||600;
  if(W<100) W=900; if(H<100) H=600;
  s.setAttribute('width',W); s.setAttribute('height',H);
  s.style.width=W+'px'; s.style.height=H+'px';
  var bg=document.getElementById('dstBg');
  if(bg){bg.setAttribute('width',W);bg.setAttribute('height',H);}
  DS_setPaper();
}

window.DS_setPaper=function(){
  var p=gv('dstPaper')||'A3', o=gv('dstOrient')||'L';
  DS.paper=p; DS.orient=o;
  var sz=PAPER[p]||PAPER.A3;
  DS.paperW=o==='L'?sz.w:sz.h; DS.paperH=o==='L'?sz.h:sz.w;
  var w=document.getElementById('dstWrap');
  var W=w?(w.clientWidth||w.offsetWidth||900):900;
  var H=w?(w.clientHeight||w.offsetHeight||600):600;
  if(W<100) W=window.innerWidth-200||900;
  if(H<100) H=window.innerHeight-60||600;
  DS.zoom=Math.min((W-80)/DS.paperW,(H-80)/DS.paperH);
  DS.panX=(W-DS.paperW*DS.zoom)/2; DS.panY=(H-DS.paperH*DS.zoom)/2;
  applyTr(); DS_redrawTB();
};

function applyTr(){
  var g=document.getElementById('dstPG'), pv=document.getElementById('dstPrev');
  if(!g) return;
  var tr='translate('+DS.panX+','+DS.panY+') scale('+DS.zoom+')';
  g.setAttribute('transform',tr);
  if(pv) pv.setAttribute('transform',tr);
  var pr=document.getElementById('dstPaper'), fr=document.getElementById('dstFrame');
  if(pr){pr.setAttribute('width',DS.paperW);pr.setAttribute('height',DS.paperH);}
  if(fr){fr.setAttribute('x',10);fr.setAttribute('y',10);fr.setAttribute('width',DS.paperW-20);fr.setAttribute('height',DS.paperH-20);}
  /* outer thin border 1mm inside paper edge */
  var ob=document.getElementById('dstOuterBorder');
  if(!ob){ob=svgE('rect');ob.id='dstOuterBorder';ob.style.pointerEvents='none';
    var pg2=document.getElementById('dstPG');if(pg2)pg2.insertBefore(ob,pg2.firstChild.nextSibling);}
  sa(ob,{x:1,y:1,width:DS.paperW-2,height:DS.paperH-2,fill:'none',stroke:'#94a3b8','stroke-width':'0.3'});
}

function svgE(t){return document.createElementNS('http://www.w3.org/2000/svg',t);}
function sa(el,a){for(var k in a)el.setAttribute(k,a[k]);}
function gv(id){var e=document.getElementById(id);return e?e.value:null;}
function ev2mm(e){var w=document.getElementById('dstWrap'),r=w.getBoundingClientRect();return{x:(e.clientX-r.left-DS.panX)/DS.zoom,y:(e.clientY-r.top-DS.panY)/DS.zoom};}

/* ── SNAP ─────────────────────────────────────────── */
var SNAP_R=13; // px
function doSnap(mx,my){
  var cands=[];
  var ckG  =document.getElementById('dstSnapGrid');
  var ckE  =document.getElementById('dstSnapEnd');
  var ckM  =document.getElementById('dstSnapMid');
  var ckC  =document.getElementById('dstSnapCen');
  var ckQ  =document.getElementById('dstSnapQua');
  var ckT  =document.getElementById('dstSnapTan');
  var ckI  =document.getElementById('dstSnapInt');

  // ── GRID ──────────────────────────────────────────
  if(!ckG||ckG.checked){
    var g=5;
    cands.push({x:Math.round(mx/g)*g, y:Math.round(my/g)*g, type:'GRID'});
  }

  // ── GEOMETRY SNAP POINTS (from projected edges) ───
  DS.snapPts.forEach(function(p){
    if(p.type==='END' &&(!ckE||ckE.checked)) cands.push(p);
    if(p.type==='MID' &&(!ckM||ckM.checked)) cands.push(p);
    if(p.type==='CEN' &&(!ckC||ckC.checked)) cands.push(p);
    if(p.type==='QUA' &&(!ckQ||ckQ.checked)) cands.push(p);
  });

  // ── DRAWN ENTITY SNAPS ────────────────────────────
  DS.entities.forEach(function(e){
    if(e.type==='line'){
      if(!ckE||ckE.checked){
        cands.push({x:e.x1,y:e.y1,type:'END'});
        cands.push({x:e.x2,y:e.y2,type:'END'});
      }
      if(!ckM||ckM.checked)
        cands.push({x:(e.x1+e.x2)/2, y:(e.y1+e.y2)/2, type:'MID'});
    }
    if(e.type==='circle_annot'){
      if(!ckC||ckC.checked)
        cands.push({x:e.cx, y:e.cy, type:'CEN'});
      if(!ckQ||ckQ.checked){
        cands.push({x:e.cx+e.r, y:e.cy,   type:'QUA'});
        cands.push({x:e.cx-e.r, y:e.cy,   type:'QUA'});
        cands.push({x:e.cx,     y:e.cy+e.r,type:'QUA'});
        cands.push({x:e.cx,     y:e.cy-e.r,type:'QUA'});
      }
    }
  });

  DS.dims.forEach(function(d){
    if(!ckE||ckE.checked){
      cands.push({x:d.x1,y:d.y1,type:'END'});
      cands.push({x:d.x2,y:d.y2,type:'END'});
    }
  });

  // ── QUADRANT — from projected circle edges in viewEdges ──
  if(!ckQ||ckQ.checked){
    DS.views.forEach(function(vobj){
      var ed=DS.viewEdges[vobj.name]; if(!ed) return;
      var sc=parseScale();
      var gW=(ed.maxX-ed.minX)*sc, gH=(ed.maxY-ed.minY)*sc;
      var ox=vobj.x+(vobj.w-gW)/2-ed.minX*sc;
      var oy=vobj.y+(vobj.h-gH)/2-ed.minY*sc;
      (ed.cen||[]).forEach(function(ce){
        // center lines end-points = quadrant candidates
        var x1=ox+ce.x1*sc, y1=oy+ce.y1*sc;
        var x2=ox+ce.x2*sc, y2=oy+ce.y2*sc;
        cands.push({x:x1,y:y1,type:'QUA'});
        cands.push({x:x2,y:y2,type:'QUA'});
        cands.push({x:(x1+x2)/2,y:(y1+y2)/2,type:'CEN'});
      });
    });
  }

  // ── TANGENT — on visible arc edges near cursor ────
  if(!ckT||ckT.checked){
    DS.entities.forEach(function(e){
      if(e.type==='circle_annot'){
        // Tangent from current cursor to circle:
        // Project cursor onto circle circumference (nearest point on circle)
        var dx=mx-e.cx, dy=my-e.cy, dist=Math.sqrt(dx*dx+dy*dy)||1;
        var tx=e.cx+dx/dist*e.r, ty=e.cy+dy/dist*e.r;
        cands.push({x:tx,y:ty,type:'TAN'});
      }
    });
  }

  // ── INTERSECTION — all pairs of lines + dim lines ─
  if(!ckI||ckI.checked){
    var lines=[];
    DS.entities.forEach(function(e){
      if(e.type==='line') lines.push([e.x1,e.y1,e.x2,e.y2]);
    });
    DS.dims.forEach(function(d){
      if(d.type&&d.x1!==undefined) lines.push([d.x1,d.y1,d.x2,d.y2]);
    });
    // Also add projected vis edges near cursor (limit for performance)
    DS.views.forEach(function(vobj){
      var ed=DS.viewEdges[vobj.name]; if(!ed) return;
      var sc=parseScale();
      var gW=(ed.maxX-ed.minX)*sc, gH=(ed.maxY-ed.minY)*sc;
      var ox=vobj.x+(vobj.w-gW)/2-ed.minX*sc;
      var oy=vobj.y+(vobj.h-gH)/2-ed.minY*sc;
      (ed.vis||[]).forEach(function(ve){
        var x1=ox+ve.x1*sc, y1=oy+ve.y1*sc;
        var x2=ox+ve.x2*sc, y2=oy+ve.y2*sc;
        // Only include edges near cursor (perf guard: 50mm radius)
        var ex=(x1+x2)/2,ey=(y1+y2)/2,dd=Math.abs(ex-mx)+Math.abs(ey-my);
        if(dd<50) lines.push([x1,y1,x2,y2]);
      });
    });
    for(var i=0;i<lines.length-1;i++){
      for(var j=i+1;j<lines.length;j++){
        var pt=lineIntersect(lines[i],lines[j]);
        if(pt) cands.push({x:pt.x,y:pt.y,type:'INT'});
      }
    }
  }

  // ── PICK NEAREST ──────────────────────────────────
  var best=null, bestD=Infinity;
  cands.forEach(function(c){
    var dx=(c.x-mx)*DS.zoom, dy=(c.y-my)*DS.zoom;
    var d=Math.sqrt(dx*dx+dy*dy);
    if(d<SNAP_R&&d<bestD){bestD=d;best=c;}
  });
  return best||{x:mx,y:my,type:null};
}

/* Line-line intersection (2D, segments, returns null if parallel/no hit) */
function lineIntersect(l1,l2){
  var x1=l1[0],y1=l1[1],x2=l1[2],y2=l1[3];
  var x3=l2[0],y3=l2[1],x4=l2[2],y4=l2[3];
  var d=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
  if(Math.abs(d)<1e-9) return null;
  var t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/d;
  var u=-((x1-x2)*(y1-y3)-(y1-y2)*(x1-x3))/d;
  if(t>=-0.05&&t<=1.05&&u>=-0.05&&u<=1.05){
    return{x:x1+t*(x2-x1), y:y1+t*(y2-y1)};
  }
  return null;
}

function showSnapMark(snap,sx,sy){
  var g=document.getElementById('dstSnapG'), lbl=document.getElementById('dstSnapLbl');
  var wr=document.getElementById('dstWrap');
  if(wr) wr.className=wr.className.replace(/\s*snap-\w+/g,'');
  if(!g) return; g.innerHTML='';
  if(!snap.type||snap.type==='GRID'){if(lbl)lbl.style.display='none';return;}
  if(wr&&snap.type) wr.classList.add('snap-'+snap.type.toLowerCase());
  var x=snap.x*DS.zoom+DS.panX, y=snap.y*DS.zoom+DS.panY, sz=9;
  var col={END:'#f59e0b',MID:'#34d399',CEN:'#60a5fa',QUA:'#e879f9',TAN:'#fb923c',INT:'#f87171'}[snap.type]||'#fff';

  if(snap.type==='END'){
    var r=svgE('rect');sa(r,{x:x-sz/2,y:y-sz/2,width:sz,height:sz,fill:'none',stroke:col,'stroke-width':1.5});
    g.appendChild(r);
  } else if(snap.type==='MID'){
    var tri=svgE('polygon');
    tri.setAttribute('points',(x-sz/2)+','+(y+sz/2)+' '+(x+sz/2)+','+(y+sz/2)+' '+x+','+(y-sz/2));
    sa(tri,{fill:'none',stroke:col,'stroke-width':1.5});g.appendChild(tri);
  } else if(snap.type==='CEN'){
    var ci=svgE('circle');sa(ci,{cx:x,cy:y,r:sz/2,fill:'none',stroke:col,'stroke-width':1.5});g.appendChild(ci);
    ['h','v'].forEach(function(dir){
      var l=svgE('line');
      sa(l,dir==='h'?{x1:x-sz,y1:y,x2:x+sz,y2:y}:{x1:x,y1:y-sz,x2:x,y2:y+sz});
      sa(l,{stroke:col,'stroke-width':1});g.appendChild(l);
    });
  } else if(snap.type==='QUA'){
    // Diamond shape
    var dia=svgE('polygon');
    dia.setAttribute('points',x+','+(y-sz)+' '+(x+sz)+','+y+' '+x+','+(y+sz)+' '+(x-sz)+','+y);
    sa(dia,{fill:'none',stroke:col,'stroke-width':1.5});g.appendChild(dia);
  } else if(snap.type==='TAN'){
    // Circle with tangent line
    var tc=svgE('circle');sa(tc,{cx:x,cy:y,r:sz/2,fill:'none',stroke:col,'stroke-width':1.5});g.appendChild(tc);
    var tl=svgE('line');sa(tl,{x1:x-sz,y1:y,x2:x+sz,y2:y,stroke:col,'stroke-width':1.5});g.appendChild(tl);
  } else if(snap.type==='INT'){
    // X crosshair
    var i1=svgE('line');sa(i1,{x1:x-sz/2,y1:y-sz/2,x2:x+sz/2,y2:y+sz/2,stroke:col,'stroke-width':1.8});g.appendChild(i1);
    var i2=svgE('line');sa(i2,{x1:x+sz/2,y1:y-sz/2,x2:x-sz/2,y2:y+sz/2,stroke:col,'stroke-width':1.8});g.appendChild(i2);
  }

  if(lbl){
    lbl.style.display='block';
    lbl.style.left=(sx+13)+'px';
    lbl.style.top=(sy-18)+'px';
    lbl.textContent=snap.type;
    lbl.style.background=col;
    lbl.style.color=(snap.type==='END'||snap.type==='INT')?'#000':'#000';
  }
}

/* ── CAPTURE ALL VIEWS ────────────────────────────── */
window.DS_captureAll=function(){DS.viewImages={};DS.viewEdges={};captureAll();setTimeout(function(){DS.views.forEach(drawView);},100);};
function captureAll(){
  if(!window.THREE||!window.scene){hint('3D scene not found');return;}
  var allObjs=window.objects||[];
  if(!allObjs.length){allObjs=[];window.scene.traverse(function(obj){if(obj.isMesh&&!obj.userData.isPMI&&!obj.userData.isDecal)allObjs.push(obj);});}
  var meshes=allObjs.filter(function(o){return o&&o.isMesh&&!o.userData.isPMI&&!o.userData.isDecal;});
  if(!meshes.length){hint('No 3D objects found');return;}
  var T=window.THREE;
  var box=new T.Box3();
  meshes.forEach(function(m){box.expandByObject(m);});
  var center=new T.Vector3(); box.getCenter(center);
  var size=new T.Vector3();   box.getSize(size);
  DS.meshSize=size; DS.meshCenter=center;
  var maxD=Math.max(size.x,size.y,size.z,1);
  var VDEFS=[
    {name:'front', eye:[0,0,1], up:[0,1,0]},
    {name:'back',  eye:[0,0,-1],up:[0,1,0]},
    {name:'top',   eye:[0,1,0], up:[0,0,-1]},
    {name:'bottom',eye:[0,-1,0],up:[0,0,1]},
    {name:'right', eye:[1,0,0], up:[0,1,0]},
    {name:'left',  eye:[-1,0,0],up:[0,1,0]},
    {name:'iso',   eye:[1,0.8,1],up:[0,1,0]}
  ];
  VDEFS.forEach(function(vd){
   
    DS.viewEdges[vd.name]=projectEdges(meshes,center,size,vd.eye,vd.up,maxD);
  });
  rebuildSnap();
  hint('Ready — add views from left panel');
}

/* ══════════════════════════════════════════════════
   EDGE PROJECTION ENGINE
   ── Only silhouette edges + sharp feature edges ──
   ══════════════════════════════════════════════════ */
function projectEdges(meshes,center,size,eyeDir,upDir,maxD){
  var T=window.THREE;
  var eyeV=new T.Vector3(eyeDir[0],eyeDir[1],eyeDir[2]).normalize();
  var upV =new T.Vector3(upDir[0],upDir[1],upDir[2]).normalize();
  var rightV=new T.Vector3().crossVectors(eyeV,upV).normalize();
  upV.crossVectors(rightV,eyeV).normalize();

  function proj(wp){var v=new T.Vector3().copy(wp).sub(center);return{x:v.dot(rightV),y:-v.dot(upV)};}

  var vis=[], hid=[], cen=[];
  var cylX=[], cylY=[], cylZ=[];

  /* PRECISION for position-based vertex merging (CSG HATA DÜZELTMESİ) */
      var PREC = 1e3; // Tolerans 0.001 mm'ye düşürüldü: CSG birleşmelerindeki mikro yırtıkları engeller
      function posKey(v){
        return Math.round(v.x*PREC)+'|'+Math.round(v.y*PREC)+'|'+Math.round(v.z*PREC);
      }

      meshes.forEach(function(mesh){
        var geom=mesh.geometry;
        if(!geom||!geom.attributes||!geom.attributes.position) return;
        var pos=geom.attributes.position, idx=geom.index, mw=mesh.matrixWorld;

        // KORUMA 1: CSG işlemlerinden gelen bozuk (NaN) vertexleri filtrele
        function wv(i){
          var x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
          if(isNaN(x) || isNaN(y) || isNaN(z)) return null; 
          var v=new T.Vector3(x,y,z);
          v.applyMatrix4(mw);
          return v;
        }

        var triCount=idx?idx.count/3:pos.count/3;

        var posToMerged={}, mergedVerts=[], mergedCount=0;
        // WPOS parametresi dışarıdan alınır, wv() fonksiyonu iki kez çağrılmaz
        function getMergedIdx(wpos){
          var k=posKey(wpos);
          if(posToMerged[k]===undefined){posToMerged[k]=mergedCount;mergedVerts.push(wpos);mergedCount++;}
          return posToMerged[k];
        }

        var faces=[];
        for(var fi=0;fi<triCount;fi++){
          var ri_a=idx?idx.getX(fi*3):fi*3;
          var ri_b=idx?idx.getX(fi*3+1):fi*3+1;
          var ri_c=idx?idx.getX(fi*3+2):fi*3+2;
          
          var va=wv(ri_a), vb=wv(ri_b), vc=wv(ri_c);
          
          // KORUMA 2: Eğer vertexlerden biri NaN yüzünden null döndüyse bu bozuk yüzeyi atla (Crash önleyici)
          if(!va || !vb || !vc) continue; 

          var ab=new T.Vector3().subVectors(vb,va), ac=new T.Vector3().subVectors(vc,va);
          var wN=new T.Vector3().crossVectors(ab,ac);
          
          // KORUMA 3: İğne yapraklı (alanı sıfıra yakın) CSG kalıntılarını atla (1e-8 tolerans)
          if(wN.lengthSq()<1e-8) continue; 
          wN.normalize();
          
          var ma=getMergedIdx(va), mb=getMergedIdx(vb), mc=getMergedIdx(vc);
          if(ma===mb||mb===mc||ma===mc) continue; /* degenerate after merge */
          faces.push({ma:ma,mb:mb,mc:mc,n:wN,f:wN.dot(eyeV)});
        }

    /* Build edge→faces map using merged indices */
    var edgeMap={};
    function ek(a,b){return Math.min(a,b)+'_'+Math.max(a,b);}
    faces.forEach(function(fc){
      [[fc.ma,fc.mb],[fc.mb,fc.mc],[fc.mc,fc.ma]].forEach(function(e){
        var k=ek(e[0],e[1]);
        if(!edgeMap[k]) edgeMap[k]={a:e[0],b:e[1],faces:[]};
        edgeMap[k].faces.push(fc);
      });
    });

    /* Classify edges */
    Object.keys(edgeMap).forEach(function(k){
      var ed=edgeMap[k];
      var wa=mergedVerts[ed.a], wb=mergedVerts[ed.b];
      var pa=proj(wa), pb=proj(wb);
      var pdx=pb.x-pa.x, pdy=pb.y-pa.y;
      if(pdx*pdx+pdy*pdy < 1e-8) return;

      var fs=ed.faces;
      if(fs.length===1){
        vis.push({x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y}); return;
      }
      var hasFront=false,hasBack=false,isFeature=false,isSilhouette=false;
      for(var fi=0;fi<fs.length;fi++){
        if(fs[fi].f>0) hasFront=true; else hasBack=true;
        for(var fj=fi+1;fj<fs.length;fj++){
          if(fs[fi].n.dot(fs[fj].n)<FEATURE_COS) isFeature=true;
          if(fs[fi].f>0!==fs[fj].f>0) isSilhouette=true;
        }
      }
      if(isSilhouette) vis.push({x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y});
      else if(isFeature){
        if(hasFront&&!hasBack) vis.push({x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y});
        else hid.push({x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y});
      }
    });

    /* Cylinder detection for auto center-lines */
    faces.forEach(function(fc){
      var ax=Math.abs(fc.n.x), ay=Math.abs(fc.n.y), az=Math.abs(fc.n.z);
      if(ax<0.12&&az<0.12) cylY.push(fc);
      else if(ax<0.12&&ay<0.12) cylZ.push(fc);
      else if(ay<0.12&&az<0.12) cylX.push(fc);
    });
  });
  /* Generate center-lines from cylinder face groups */
  function cylCL(faces, axis){
    if(faces.length<6) return;
    var pts=[];
    meshes.forEach(function(mesh){
      var pos=mesh.geometry.attributes.position; if(!pos) return;
      for(var i=0;i<pos.count;i++){
        var v=new T.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        pts.push(proj(v));
      }
    });
    if(!pts.length) return;
    var xVals=pts.map(function(p){return p.x;}), yVals=pts.map(function(p){return p.y;});
    var mnX=Math.min.apply(null,xVals), mxX=Math.max.apply(null,xVals);
    var mnY=Math.min.apply(null,yVals), mxY=Math.max.apply(null,yVals);
    var cx=(mnX+mxX)/2, cy=(mnY+mxY)/2, ext=4;
    if(axis==='Y') cen.push({x1:cx,y1:mnY-ext,x2:cx,y2:mxY+ext,kind:'axisY'});
    else if(axis==='X') cen.push({x1:mnX-ext,y1:cy,x2:mxX+ext,y2:cy,kind:'axisX'});
    else cen.push({x1:mnX-ext,y1:cy,x2:mxX+ext,y2:cy,kind:'axisZ'});
  }
  if(cylX.length>8) cylCL(cylX,'X');
  if(cylY.length>8) cylCL(cylY,'Y');
  if(cylZ.length>8) cylCL(cylZ,'Z');

  /* Bounding box of projected geometry */
  var allPts=vis.concat(hid);
  if(!allPts.length) allPts=[{x1:0,y1:0,x2:10,y2:10}];
  var xA=allPts.map(function(e){return Math.min(e.x1,e.x2);}),
      xB=allPts.map(function(e){return Math.max(e.x1,e.x2);}),
      yA=allPts.map(function(e){return Math.min(e.y1,e.y2);}),
      yB=allPts.map(function(e){return Math.max(e.y1,e.y2);});
  return{
    vis:vis, hid:hid, cen:cen,
    minX:Math.min.apply(null,xA), maxX:Math.max.apply(null,xB),
    minY:Math.min.apply(null,yA), maxY:Math.max.apply(null,yB)
  };
}

/* ── REBUILD SNAP POINTS ──────────────────────────── */
function rebuildSnap(){
  DS.snapPts=[];
  DS.views.forEach(function(vobj){
    var ed=DS.viewEdges[vobj.name]; if(!ed) return;
    var sc=parseScale(), gW=(ed.maxX-ed.minX)*sc, gH=(ed.maxY-ed.minY)*sc;
    var ox=vobj.x+(vobj.w-gW)/2-ed.minX*sc, oy=vobj.y+(vobj.h-gH)/2-ed.minY*sc;
    function tp(x,y){return{x:ox+x*sc,y:oy+y*sc};}
    ed.vis.forEach(function(e){
      var a=tp(e.x1,e.y1), b=tp(e.x2,e.y2);
      DS.snapPts.push({x:a.x,y:a.y,type:'END'});
      DS.snapPts.push({x:b.x,y:b.y,type:'END'});
      DS.snapPts.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,type:'MID'});
    });
    ed.cen.forEach(function(e){
      var a=tp(e.x1,e.y1), b=tp(e.x2,e.y2);
      DS.snapPts.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,type:'CEN'});
    });
  });
}
function parseScale(){var s=gv('dstScale')||'1:1',p=s.split(':').map(Number);return(p.length===2&&p[1])?p[0]/p[1]:1;}

/* ── ADD VIEW ─────────────────────────────────────── */
window.DS_addView=function(name){
  if(!DS.viewImages[name]&&!DS.viewEdges[name]){
    captureAll(); setTimeout(function(){DS_addView(name);},900); return;
  }
  pushH();
  var sz=DS.meshSize||{x:60,y:40,z:30}, sc=parseScale();
  var dm={front:[sz.x*sc,sz.y*sc],back:[sz.x*sc,sz.y*sc],
          top:[sz.x*sc,sz.z*sc],bottom:[sz.x*sc,sz.z*sc],
          right:[sz.z*sc,sz.y*sc],left:[sz.z*sc,sz.y*sc],
          iso:[sz.x*sc*1.4,sz.y*sc*1.4]};
  
var d=dm[name]||[60,50];
  // Sınırlarda çizgilerin ezilmemesi için her görünüme 15mm boşluk (padding) ekliyoruz
  var vw=Math.max(d[0],20) + 15; 
  var vh=Math.max(d[1],20) + 15;

  var pl={
    front:{x:20,y:20}, top:{x:20,y:20+vh+28}, right:{x:20+vw+28,y:20},
    left:{x:20+vw*2+56,y:20}, bottom:{x:20,y:20+vh*2+56},
    back:{x:20+vw*2+56,y:20+vh+28}, iso:{x:DS.paperW-20-vw,y:DS.paperH-70-vh}
  };
  var p=pl[name]||{x:25,y:25};
  var id='v_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
  var vobj={id:id,name:name,x:p.x,y:p.y,w:vw,h:vh,scStr:gv('dstScale')||'1:1'};
  DS.views.push(vobj); drawView(vobj); rebuildSnap();
};

/* ── DRAW VIEW ────────────────────────────────────── */
function drawView(vobj){
  var g=document.getElementById('dstVG'); if(!g) return;
  var old=document.getElementById(vobj.id); if(old) old.remove();
  var grp=svgE('g'); grp.id=vobj.id;

  if(DS.mode==='render') drawViewRender(grp,vobj);
  else drawViewTech(grp,vobj);

  var PROJ_MAP={
    front:{right:'right',left:'left',top:'top',bottom:'bottom'},
    top:{right:'right',left:'left',top:'back',bottom:'front'},
    right:{right:'back',left:'front',top:'top',bottom:'bottom'},
    left:{right:'front',left:'back',top:'top',bottom:'bottom'},
    bottom:{right:'right',left:'left',top:'front',bottom:'back'},
    back:{right:'left',left:'right',top:'top',bottom:'bottom'},
    iso:{}
  };
  var sides=PROJ_MAP[vobj.name]||{};
  var CX=vobj.x+vobj.w/2, CY=vobj.y+vobj.h/2;

  /* ── Rotate handle (arc icon, top-right corner) ── */
  var rot_cx=vobj.x+vobj.w+5, rot_cy=vobj.y-5;
  var rh=svgE('circle');
  sa(rh,{cx:rot_cx,cy:rot_cy,r:3,fill:'#f59e0b',stroke:'white','stroke-width':0.5,cursor:'ew-resize'});
  var rht=svgE('text');
  sa(rht,{x:rot_cx,y:rot_cy+1.1,'text-anchor':'middle','dominant-baseline':'middle',
    'font-size':2.8,'font-family':'Arial',fill:'white','pointer-events':'none'});
  rht.textContent='↻';
  var rhtt=svgE('title'); rhtt.textContent='Drag to rotate view'; rh.appendChild(rhtt);
  (function(vo){
    rh.addEventListener('mousedown',function(ev){
      ev.stopPropagation(); ev.preventDefault();
      var cx=vo.x+vo.w/2, cy=vo.y+vo.h/2;
      var startAngle=Math.atan2(ev.clientY-0,ev.clientX-0); /* will compute in move */
      DS.dragging={type:'viewRot',id:vo.id,
        cx:cx,cy:cy,startRot:vo.rot||0,
        startMX:ev.clientX,startMY:ev.clientY};
      document.body.style.userSelect='none';
    });
  })(vobj);
  rh.addEventListener('dblclick',function(ev){
    ev.stopPropagation();
    vobj.rot=0; drawView(vobj);
  });
  grp.appendChild(rh);
  grp.appendChild(rht);

  Object.keys(sides).forEach(function(side){
    var newView=sides[side];
    var hx,hy,lx1,ly1,lx2,ly2;
    var GAP=4, HSZ=2;
    if(side==='top')   {hx=CX;hy=vobj.y-GAP-HSZ; lx1=CX-8;ly1=vobj.y-GAP;lx2=CX+8;ly2=vobj.y-GAP;}
    if(side==='bottom'){hx=CX;hy=vobj.y+vobj.h+GAP+HSZ; lx1=CX-8;ly1=vobj.y+vobj.h+GAP;lx2=CX+8;ly2=vobj.y+vobj.h+GAP;}
    if(side==='right') {hx=vobj.x+vobj.w+GAP+HSZ;hy=CY; lx1=vobj.x+vobj.w+GAP;ly1=CY-8;lx2=vobj.x+vobj.w+GAP;ly2=CY+8;}
    if(side==='left')  {hx=vobj.x-GAP-HSZ;hy=CY; lx1=vobj.x-GAP;ly1=CY-8;lx2=vobj.x-GAP;ly2=CY+8;}

    /* small dotted guide line */
    var gl=svgE('line');
    sa(gl,{x1:lx1,y1:ly1,x2:lx2,y2:ly2,stroke:'#818cf8','stroke-width':0.25,'stroke-dasharray':'2,2','pointer-events':'none'});
    grp.appendChild(gl);

    /* handle button */
    var hc=svgE('circle');
    sa(hc,{cx:hx,cy:hy,r:HSZ,fill:'#3b82f6',stroke:'white','stroke-width':0.5,cursor:'crosshair'});
    var ht=svgE('text');
    sa(ht,{x:hx,y:hy+0.6,'text-anchor':'middle','dominant-baseline':'middle',
      'font-size':2,'font-weight':'bold','font-family':'Arial',fill:'white','pointer-events':'none'});
    ht.textContent={top:'▲',bottom:'▼',right:'▶',left:'◀'}[side]||'+';

    /* tooltip */
    var tt=svgE('title'); tt.textContent='Drag → '+newView.toUpperCase()+' view';
    hc.appendChild(tt);

    (function(sn){
      hc.addEventListener('mousedown',function(ev){
        ev.stopPropagation();
        ev.preventDefault();
        DS.dragging={type:'viewProj',srcId:vobj.id,newView:sn};
        document.body.style.userSelect='none';
        hint('Drag & drop to place '+sn.toUpperCase()+' view');
      });
    })(newView);

    grp.appendChild(hc);
    grp.appendChild(ht);
  });

  /* click to select & drag to move */
  grp.style.cursor='move';
  grp.addEventListener('mousedown',function(e){
    if(DS.tool!=='select') return;
    if(e.target===g||e.target.getAttribute('cursor')==='crosshair') return;
    e.stopPropagation();
    DS.selected=vobj.id;
    hlView(vobj.id);
    var mm=ev2mm(e);
    DS.dragging={type:'view',id:vobj.id};
    DS.dragOffset={x:mm.x-vobj.x,y:mm.y-vobj.y};
    redrawDims();
  });
  g.appendChild(grp);
}

function drawViewTech(grp,vobj){
  /* rotation wrapper */
  if(vobj.rot){
    var cx=vobj.x+vobj.w/2, cy=vobj.y+vobj.h/2;
    grp.setAttribute('transform','rotate('+vobj.rot+','+cx+','+cy+')');
  }
  /* white background */
  var bg=svgE('rect');
  sa(bg,{x:vobj.x,y:vobj.y,width:vobj.w,height:vobj.h,fill:'white',stroke:'none'});
  grp.appendChild(bg);

  var ed=DS.viewEdges[vobj.name];
  if(ed&&(ed.vis.length>0||ed.hid.length>0||ed.cen.length>0)){
    var sc=parseScale();
    var gW=(ed.maxX-ed.minX)*sc, gH=(ed.maxY-ed.minY)*sc;
    /* center the projected geometry inside the view box */
    var ox=vobj.x+(vobj.w-gW)/2 - ed.minX*sc;
    var oy=vobj.y+(vobj.h-gH)/2 - ed.minY*sc;
    function tp(x,y){return{x:ox+x*sc,y:oy+y*sc};}

    /* Clip to view rect — on sub-group only, NOT on grp (handles must show outside) */
    var clipId='cp_'+vobj.id;
    var defs=document.querySelector('#dstSVG defs');
    var oc=defs?defs.querySelector('#'+clipId):null; if(oc) oc.remove();
    var cp=svgE('clipPath'); cp.id=clipId;
    var cr=svgE('rect'); sa(cr,{x:vobj.x+LW.vis/2,y:vobj.y+LW.vis/2,width:vobj.w-LW.vis,height:vobj.h-LW.vis});
    cp.appendChild(cr); if(defs) defs.appendChild(cp);
    /* sub-group carries the clip — handles added to grp later won't be clipped */
    var edgeSub=svgE('g');
    // Kırpma maskesini iptal ediyoruz ki kalın dış çizgiler kesilmesin:
    // edgeSub.setAttribute('clip-path','url(#'+clipId+')'); 
    grp.appendChild(edgeSub);

    /* Visible edges — black, 0.4 */
    ed.vis.forEach(function(e){
      var a=tp(e.x1,e.y1), b=tp(e.x2,e.y2);
      var l=svgE('line');
      sa(l,{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#111','stroke-width':LW.vis,'stroke-linecap':'round','vector-effect':'non-scaling-stroke'});
      edgeSub.appendChild(l);
    });

  /* Hidden edges — Kesik çizgiler (Daha belirgin ve ince) */
    var dashLen = '3, 3'; // Çizgi boyu 3 birim, Boşluk 3 birim (Boşluğu artırdık ki kaynamasın)
    ed.hid.forEach(function(e){
      var a=tp(e.x1,e.y1), b=tp(e.x2,e.y2);
      var l=svgE('line');
      sa(l,{
          x1:a.x, y1:a.y, x2:b.x, y2:b.y, 
          stroke: '#444',
          'stroke-width': 0.7,
          'stroke-dasharray': '4,3',
          'stroke-linecap': 'butt',
          'vector-effect': 'non-scaling-stroke',
          opacity: '0.85'
      });
      edgeSub.appendChild(l);
    });

   /* Center lines — Eksen Çizgileri (Noktalı Kesik) */
    ed.cen.forEach(function(e){
      var a=tp(e.x1,e.y1), b=tp(e.x2,e.y2);
      var l=svgE('line');
      sa(l,{
          x1:a.x, y1:a.y, x2:b.x, y2:b.y, 
          stroke: '#00a', 
          'stroke-width': 0.3, // LW.cen (0.7) çok kalındı, 0.3 ile hassaslaştırdık
          'stroke-dasharray': '12, 3, 2, 3', // Boşlukları biraz daha rahatlattık
          'stroke-linecap': 'butt',
          'vector-effect': 'non-scaling-stroke'
      });
      edgeSub.appendChild(l);
    });

  } else if(DS.viewImages[vobj.name]){
    /* No edge data yet → show render image in grayscale as placeholder */
    var img=svgE('image'); img.setAttribute('href',DS.viewImages[vobj.name]);
    sa(img,{x:vobj.x,y:vobj.y,width:vobj.w,height:vobj.h,preserveAspectRatio:'xMidYMid meet',opacity:'0.4'});
    grp.appendChild(img);
    var noteTxt=svgE('text');
    sa(noteTxt,{x:vobj.x+vobj.w/2,y:vobj.y+vobj.h/2,'text-anchor':'middle','font-size':3,'font-family':'Arial',fill:'#94a3b8'});
    noteTxt.textContent='Press UPDATE'; grp.appendChild(noteTxt);
  }

  addVLabel(grp,vobj);
}

function drawViewRender(grp,vobj){
  if(vobj.rot){
    var cx=vobj.x+vobj.w/2, cy=vobj.y+vobj.h/2;
    grp.setAttribute('transform','rotate('+vobj.rot+','+cx+','+cy+')');
  }
  if(DS.viewImages[vobj.name]){
    var img=svgE('image'); img.setAttribute('href',DS.viewImages[vobj.name]);
    sa(img,{x:vobj.x,y:vobj.y,width:vobj.w,height:vobj.h,preserveAspectRatio:'xMidYMid meet'});
    grp.appendChild(img);
  }
  var border=svgE('rect');
  sa(border,{x:vobj.x,y:vobj.y,width:vobj.w,height:vobj.h,fill:'none',stroke:'#000','stroke-width':LW.vis});
  grp.appendChild(border);
  addVLabel(grp,vobj);
  /* handles appended by drawView after this call */
}

function addVLabel(grp,vobj){
  var nm={front:'FRONT',top:'TOP',right:'RIGHT',left:'LEFT',bottom:'BOTTOM',back:'BACK',iso:'ISO'};
  var t=svgE('text');
  sa(t,{x:vobj.x+vobj.w/2,y:vobj.y+vobj.h+4.5,'text-anchor':'middle','font-size':3,'font-weight':'bold','font-family':'Arial,sans-serif',fill:'#1a2e4a'});
  t.textContent=(nm[vobj.name]||vobj.name.toUpperCase())+' '+vobj.scStr;
  grp.appendChild(t);
}

function hlView(id){
  document.querySelectorAll('#dstVG>g>rect:first-child').forEach(function(r){r.setAttribute('stroke','none');r.setAttribute('stroke-width','0');});
  var g=document.getElementById(id); if(!g) return;
  var r=g.querySelector('rect'); if(r){r.setAttribute('stroke','#f59e0b');r.setAttribute('stroke-width',1);}
  DS.selected=id;
}

/* ── MODE ─────────────────────────────────────────── */
window.DS_setMode=function(m){
  DS.mode=m;
  document.getElementById('dstModeTech').classList.toggle('act',m==='tech');
  document.getElementById('dstModeRend').classList.toggle('act',m==='render');
  DS.views.forEach(drawView);
};

/* ── DIMENSIONS ───────────────────────────────────── */
function drawDim(d){
  var g=document.getElementById('dstDG'); if(!g) return;
  var old=document.getElementById(d.id); if(old) old.remove();
  var grp=svgE('g'); grp.id=d.id;
  var ts=parseFloat(gv('dstDimSz')||'3.5');
  if(d.off===undefined) d.off=parseFloat(gv('dstDimOff')||'8');
  var off=d.off;
  var tol=(gv('dstDimTol')||'').trim(), pre=(gv('dstDimPre')||'').trim();
  var isSel=(DS.selected===d.id);
  var col=isSel?'#2563eb':'#000';
  var DLW=0.2; /* dimension line weight — continuous */

  /* invisible hit-area */
  var hit=svgE('rect'); sa(hit,{x:Math.min(d.x1,d.x2)-10,y:Math.min(d.y1,d.y2)-10,
    width:Math.abs(d.x2-d.x1)+20,height:Math.abs(d.y2-d.y1)+20,
    fill:'transparent',stroke:'none','pointer-events':'all'});
  grp.appendChild(hit);

  function dimL(x1,y1,x2,y2){
    var l=svgE('line');sa(l,{x1:x1,y1:y1,x2:x2,y2:y2,stroke:col,'stroke-width':DLW,'stroke-linecap':'round'});grp.appendChild(l);
  }
  
function dimA(x,y,dx,dy){
    var sz=3.5; // ISO Standart ok uzunluğu
    var hw=0.9; // Zarif ve sivri görünüm için yarım genişlik
    var nx=-dy*hw, ny=dx*hw;
    var p=svgE('polygon');
    // Uç noktası tam çizgiye değer, tabanı geriye doğru açılır
    p.setAttribute('points', x+','+y + ' ' + (x-dx*sz+nx)+','+(y-dy*sz+ny) + ' ' + (x-dx*sz-nx)+','+(y-dy*sz-ny));
    sa(p,{fill:col});
    grp.appendChild(p);
  }



  function grip(x,y,gid){
    var c=svgE('circle');sa(c,{cx:x,cy:y,r:2,fill:'#2563eb',stroke:'white','stroke-width':0.5,
      'pointer-events':'all',cursor:'grab',opacity:isSel?'1':'0','id':gid});
    c.addEventListener('mousedown',function(ev){
      ev.stopPropagation();
      DS.dragging={type:'dimGrip',id:d.id,gid:gid};
    });
    grp.appendChild(c);
  }

  if(d.type==='dim_lin'||d.type==='dim_hor'||d.type==='dim_ver'){
    var x1=d.x1,y1=d.y1,x2=d.x2,y2=d.y2;
    if(d.type==='dim_hor'){y2=y1;}
    if(d.type==='dim_ver'){x2=x1;}
    var dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||0.001;
    var nx=-dy/len, ny=dx/len;
    /* offset side: use d.side (+1 or -1) */
    if(d.side===undefined) d.side=1;
    var soff=off*d.side;
    var ax=x1+nx*soff, ay=y1+ny*soff;
    var bx=x2+nx*soff, by=y2+ny*soff;
    /* extension lines — from measurement point to dim line (+1mm overshoot) */
    var overshoot=1;
    dimL(x1,y1, ax+nx*overshoot, ay+ny*overshoot);
    dimL(x2,y2, bx+nx*overshoot, by+ny*overshoot);
    /* dim line */
    dimL(ax,ay,bx,by);
    /* arrows - Akıllı Yönlendirme (Smart Flip) */
    // Normalde oklar içeride durur, mesafe 8mm'den darsa otomatik dışarı çıkar.
    var arrDir = (len < 8.0) ? 1 : -1; 
    dimA(ax, ay, arrDir * dx/len, arrDir * dy/len);
    dimA(bx, by, -arrDir * dx/len, -arrDir * dy/len);
    /* value */
    var _sc=parseScale();
    var _rawVal=d.value!==undefined?d.value:parseFloat(len.toFixed(2));
    var _realVal=parseFloat((_rawVal/_sc).toFixed(3));
    /* strip trailing zeros */
    _realVal=parseFloat(_realVal.toPrecision(6));
    var val=d.override!==undefined?d.override:_realVal;
    var mx=(ax+bx)/2, my=(ay+by)/2;
    var ang=Math.atan2(by-ay,bx-ax)*180/Math.PI;
    
    /* CAD Standardı: Yazı baş aşağı ise 180 derece çevir */
    var textAng = ang;
    if (textAng > 90) textAng -= 180;
    else if (textAng < -90) textAng += 180;
    if (Math.abs(textAng - 90) < 0.1) textAng = -90; // Dikey yazılar her zaman sağdan okunur

    /* white bg behind text */
    var tw=val.toString().length*ts*0.62+2;
    var tbg=svgE('rect');
    sa(tbg,{x:mx-tw/2,y:my-ts*0.75,width:tw,height:ts,fill:'white',transform:'rotate('+textAng+','+mx+','+my+')'});
    grp.appendChild(tbg);
    var tt=svgE('text');
    sa(tt,{x:mx,y:my+ts*0.32,'text-anchor':'middle','font-size':ts,'font-weight':'bold',
      'font-family':'Arial,sans-serif',fill:col,transform:'rotate('+textAng+','+mx+','+my+')'});
    tt.textContent=pre+val+(tol?' '+tol:'');

    grp.appendChild(tt);
    /* grips */
    grip(x1,y1,'g1_'+d.id);
    grip(x2,y2,'g2_'+d.id);
    grip(ax,ay,'gOff_'+d.id);

  } else if(d.type==='dim_rad'){
    var ang2=d.ang||0, ex=d.cx+Math.cos(ang2)*d.r, ey=d.cy+Math.sin(ang2)*d.r;
    dimL(d.cx,d.cy,ex,ey); dimA(ex,ey,Math.cos(ang2),Math.sin(ang2));
    var t2=svgE('text');sa(t2,{x:(d.cx+ex)/2,y:(d.cy+ey)/2-1,'text-anchor':'middle',
      'font-size':ts,'font-weight':'bold','font-family':'Arial,sans-serif',fill:col});
    var _scR=parseScale();
    t2.textContent='R'+(d.override!==undefined?d.override:parseFloat((d.r/_scR).toFixed(3))); grp.appendChild(t2);

  } else if(d.type==='dim_dia'){
    var x1d=d.cx-d.r, x2d=d.cx+d.r;
    dimL(x1d,d.cy,x2d,d.cy);
    dimA(x1d,d.cy,-1,0); dimA(x2d,d.cy,1,0);
    var t3=svgE('text');sa(t3,{x:d.cx,y:d.cy-ts,'text-anchor':'middle',
      'font-size':ts,'font-weight':'bold','font-family':'Arial,sans-serif',fill:col});
    var _scD=parseScale();
    t3.textContent='Ø'+(d.override!==undefined?d.override:parseFloat((d.r*2/_scD).toFixed(3)))+(tol?' '+tol:''); grp.appendChild(t3);
  }

  /* Click → select; Dbl-click → edit value */
  grp.addEventListener('mousedown',function(ev){
    if(DS.tool!=='select') return;
    ev.stopPropagation();
    DS.selected=d.id; redrawDims();
  });
  grp.addEventListener('dblclick',function(ev){
    ev.stopPropagation();
    var cur=d.override!==undefined?d.override:(d.value||'');
    var nv=prompt('Edit dimension value (leave blank = measured):', cur);
    if(nv===null) return;
    if(nv.trim()==='') delete d.override; else d.override=nv.trim();
    drawDim(d);
  });
  g.appendChild(grp);
}
function redrawDims(){DS.dims.forEach(function(d){drawDim(d);});}
function dimLine(g,x1,y1,x2,y2,col){var l=svgE('line');sa(l,{x1:x1,y1:y1,x2:x2,y2:y2,stroke:col||'#000','stroke-width':LW.dim,'stroke-linecap':'round'});g.appendChild(l);}
function dimArrow(g,x,y,dx,dy,col){var sz=3.5,hw=0.9,nx=-dy*hw,ny=dx*hw;var p=svgE('polygon');p.setAttribute('points',x+','+y+' '+(x-dx*sz+nx)+','+(y-dy*sz+ny)+' '+(x-dx*sz-nx)+','+(y-dy*sz-ny));sa(p,{fill:col||'#000'});g.appendChild(p);}

/* ── HATCH ────────────────────────────────────────── */
function drawHatch(ent){
  var g=document.getElementById('dstAG'); if(!g) return;
  var old=document.getElementById(ent.id); if(old) old.remove();
  var grp=svgE('g'); grp.id=ent.id;
  var ang=parseFloat(gv('dstHatchAng')||'45'), sp=parseFloat(gv('dstHatchSp')||'3');
  var defs=document.querySelector('#dstSVG defs');
  if(!defs){defs=svgE('defs');document.getElementById('dstSVG').prepend(defs);}
  var pid='hp_'+ent.id; var oe=defs.querySelector('#'+pid); if(oe) oe.remove();
  var pat=svgE('pattern'); sa(pat,{id:pid,width:sp,height:sp,patternUnits:'userSpaceOnUse',patternTransform:'rotate('+ang+')'});
  var ln=svgE('line'); sa(ln,{x1:0,y1:0,x2:0,y2:sp,stroke:'#000','stroke-width':LW.hatch}); pat.appendChild(ln); defs.appendChild(pat);
  var r=svgE('rect'); sa(r,{x:ent.x,y:ent.y,width:ent.w,height:ent.h,fill:'url(#'+pid+')',stroke:'none'}); grp.appendChild(r);
  g.appendChild(grp);
}

/* ── SECTION ──────────────────────────────────────── */
window.DS_addSection=function(){DS.tool='section';updTbtn();hint('Section: click 1st point');};
function drawSection(x1,y1,x2,y2,lbl){
  var g=document.getElementById('dstAG'); if(!g) return;
  var grp=svgE('g'); grp.id='sec_'+Date.now();
  var dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy)||1;
  var l=svgE('line'); sa(l,{x1:x1,y1:y1,x2:x2,y2:y2,stroke:'#000','stroke-width':0.6,'stroke-dasharray':'5,1.5,1.5,1.5'}); grp.appendChild(l);
  dimArrow(grp,x1,y1,dx/len,dy/len,'#000'); dimArrow(grp,x2,y2,-dx/len,-dy/len,'#000');
  var t1=svgE('text'); sa(t1,{x:x1-5,y:y1,'font-size':5,'font-weight':'bold','font-family':'Arial',fill:'#000'}); t1.textContent=lbl||'A'; grp.appendChild(t1);
  var t2=svgE('text'); sa(t2,{x:x2+2,y:y2,'font-size':5,'font-weight':'bold','font-family':'Arial',fill:'#000'}); t2.textContent=lbl||'A'; grp.appendChild(t2);
  g.appendChild(grp);
  DS.entities.push({id:grp.id,type:'section',x1:x1,y1:y1,x2:x2,y2:y2,lbl:lbl||'A'});
}
function drawCL(x1,y1,x2,y2){
  var g=document.getElementById('dstAG'); if(!g) return;
  var grp=svgE('g'); grp.id='cl_'+Date.now();
  var l=svgE('line'); sa(l,{x1:x1,y1:y1,x2:x2,y2:y2,stroke:'#000','stroke-width':LW.cen,'stroke-dasharray':'7,1.5,1.5,1.5'}); grp.appendChild(l);
  g.appendChild(grp);
  DS.entities.push({id:grp.id,type:'centerline',x1:x1,y1:y1,x2:x2,y2:y2});
}
function drawBalloon(cx,cy,num){
  var g=document.getElementById('dstAG'); if(!g) return;
  var grp=svgE('g'); grp.id='bal_'+Date.now();
  var c=svgE('circle'); sa(c,{cx:cx,cy:cy,r:5,fill:'white',stroke:'#000','stroke-width':LW.dim}); grp.appendChild(c);
  var t=svgE('text'); sa(t,{x:cx,y:cy+1.5,'text-anchor':'middle','font-size':4,'font-weight':'bold','font-family':'Arial',fill:'#000'}); t.textContent=num||'1'; grp.appendChild(t);
  g.appendChild(grp);
  DS.entities.push({id:grp.id,type:'balloon',cx:cx,cy:cy,num:num||1});
}
function drawAnnotLine(x1,y1,x2,y2){
  var g=document.getElementById('dstAG'); if(!g) return;
  var grp=svgE('g'); grp.id='l_'+Date.now();
  var l=svgE('line'); sa(l,{x1:x1,y1:y1,x2:x2,y2:y2,stroke:'#000','stroke-width':LW.thin,'stroke-linecap':'round'}); grp.appendChild(l);
  g.appendChild(grp);
  DS.entities.push({id:grp.id,type:'line',x1:x1,y1:y1,x2:x2,y2:y2});
}
function drawAnnotTxt(x,y,txt){
  var g=document.getElementById('dstAG'); if(!g) return;
  var grp=svgE('g'); grp.id='tx_'+Date.now();
  var t=svgE('text'); sa(t,{x:x,y:y,'font-size':3.5,'font-family':'Arial',fill:'#000','font-weight':'bold'}); t.textContent=txt; grp.appendChild(t);
  g.appendChild(grp);
  DS.entities.push({id:grp.id,type:'text_annot',x:x,y:y,text:txt});
}

/* ── TITLE BLOCK ──────────────────────────────────── */
window.DS_updateTB=function(){
  var m={'dstTBtitle':'title','dstTBmat':'material','dstTBdrawn':'drawn','dstTBco':'company'};
  Object.keys(m).forEach(function(id){var e=document.getElementById(id);if(e)DS.tb[m[id]]=e.value;});
  var pr=document.getElementById('dstTBproj'); if(pr) DS.tb.proj=pr.value;
};
window.DS_redrawTB=function(){
  DS_updateTB();
  var g=document.getElementById('dstTBG'); if(!g||!DS.paperW) return; g.innerHTML='';
  var sc=gv('dstScale')||'1:1', tb=DS.tb;
  var tbW=180,tbH=40,tbX=DS.paperW-10-tbW,tbY=DS.paperH-10-tbH,fs=3.5,fss=2.5;
  function R(x,y,w,h){var r=svgE('rect');sa(r,{x:tbX+x,y:tbY+y,width:w,height:h,fill:'none',stroke:'#000','stroke-width':LW.thin});g.appendChild(r);}
  function T(x,y,txt,b,sz){var t=svgE('text');sa(t,{x:tbX+x,y:tbY+y,'font-size':sz||fss,'font-family':'Arial,sans-serif','font-weight':b?'bold':'normal',fill:'#000'});t.textContent=txt;g.appendChild(t);}
  R(0,0,tbW,tbH);R(0,0,70,12);R(70,0,110,12);
  R(0,12,25,9);R(25,12,25,9);R(50,12,60,9);R(110,12,35,9);R(145,12,35,9);
  R(0,21,90,9);R(90,21,50,9);R(140,21,40,9);R(0,30,tbW,10);
  T(1,8,'PART NAME',false,fss);T(72,8,tb.title,true,fs);
  T(1,18,'DRAWN',false,fss);T(2,24,tb.drawn||'',true,fss);
  T(26,18,'CHECKED',false,fss);T(27,24,tb.checked||'',true,fss);
  T(51,18,'MATERIAL',false,fss);T(52,24,tb.material||'',true,fss);
  T(111,18,'DATE',false,fss);T(112,24,tb.date,true,fss);
  T(146,18,'SHEET',false,fss);T(147,24,tb.sheet,true,fss);
  T(2,27,tb.company,true,fs);
  T(91,27,'PROJECTION',false,fss);T(92,34,tb.proj==='FIRST ANGLE'?'1st Angle':'3rd Angle',true,fss);
  T(141,27,'SCALE',false,fss);T(142,34,sc,true,fs);
  T(2,36,'NOTES:',false,fss);
};

/* ── MOUSE EVENTS ─────────────────────────────────── */
window.DS_down=function(e){
  if(e.button===1||e.altKey){DS._panning=true;DS._panStart={x:e.clientX-DS.panX,y:e.clientY-DS.panY};return;}
  if(e.button!==0) return;
  /* Do not interfere with handle drags already started */
  if(DS.dragging&&DS.dragging.type==='viewProj') return;
  var mm=ev2mm(e), s=doSnap(mm.x,mm.y);

  /* Print area selection mode */
  if(DS._printAreaMode){
    if(!DS._printAreaP1){
      DS._printAreaP1={x:mm.x,y:mm.y};
    } else {
      DS_printSelectedArea(DS._printAreaP1.x,DS._printAreaP1.y,mm.x,mm.y);
    }
    return;
  }

  /* Deselect on empty canvas click in select mode */
  if(DS.tool==='select'&&e.target.id==='dstBg'){
    DS.selected=null; redrawDims();
    document.querySelectorAll('#dstVG rect:first-child').forEach(function(r){
      r.setAttribute('stroke','none'); r.setAttribute('stroke-width','0.4');
    });
  }

  if(DS.tool==='section'){
    if(!DS._secPt){DS._secPt={x:s.x,y:s.y};hint('Click 2nd point');}
    else{pushH();drawSection(DS._secPt.x,DS._secPt.y,s.x,s.y,'A');DS._secPt=null;DS.tool='select';updTbtn();}
    return;
  }
  if(DS.tool==='line'){
    if(!DS._p1){DS._p1={x:s.x,y:s.y};hint('Click 2nd point');}
    else{pushH();drawAnnotLine(DS._p1.x,DS._p1.y,s.x,s.y);DS._p1=null;}
    return;
  }
  if(DS.tool==='centerline'){
    if(!DS._p1){DS._p1={x:s.x,y:s.y};hint('Click 2nd point');}
    else{pushH();drawCL(DS._p1.x,DS._p1.y,s.x,s.y);DS._p1=null;}
    return;
  }
  if(DS.tool==='hatch'){
    if(!DS._p1){DS._p1={x:s.x,y:s.y};hint('Click opposite corner');}
    else{pushH();var ent={id:'h_'+Date.now(),type:'hatch',x:Math.min(DS._p1.x,s.x),y:Math.min(DS._p1.y,s.y),w:Math.abs(s.x-DS._p1.x),h:Math.abs(s.y-DS._p1.y)};DS.entities.push(ent);drawHatch(ent);DS._p1=null;DS.tool='select';updTbtn();}
    return;
  }
  if(DS.tool==='balloon'){pushH();drawBalloon(s.x,s.y,DS.entities.filter(function(x){return x.type==='balloon';}).length+1);return;}
  if(DS.tool==='text'){var tx=prompt('Text:');if(tx){pushH();drawAnnotTxt(s.x,s.y,tx);}return;}
  if(DS.tool.startsWith('dim_')){
    if(!DS._p1){
      DS._p1={x:s.x,y:s.y}; DS._dimP2=null; hint('Click 2nd measurement point');
    } else if(!DS._dimP2){
      var sx2=s.x, sy2=s.y;
      if(DS.tool==='dim_hor') sy2=DS._p1.y;
      if(DS.tool==='dim_ver') sx2=DS._p1.x;
      DS._dimP2={x:sx2, y:sy2};
      hint('Click to place dimension line (3rd point)');
    } else {
      // 3rd click: compute offset and side from placement point
     
pushH();
      var x1d=DS._p1.x, y1d=DS._p1.y, x2d=DS._dimP2.x, y2d=DS._dimP2.y;
      if(DS.tool==='dim_hor') y2d=y1d;
      if(DS.tool==='dim_ver') x2d=x1d;
      var dxd=x2d-x1d, dyd=y2d-y1d, lend=Math.sqrt(dxd*dxd+dyd*dyd)||0.001;
      var nxd=-dyd/lend, nyd=dxd/lend;
      var pmx=(x1d+x2d)/2, pmy=(y1d+y2d)/2;
      var proj3=(s.x-pmx)*nxd+(s.y-pmy)*nyd;
      var dimSide=proj3>=0?1:-1;
      var dimOff=Math.abs(proj3)||8;
      var d={id:'d_'+Date.now(),type:DS.tool,
             x1:x1d,y1:y1d,x2:x2d,y2:y2d,off:dimOff,side:dimSide};
      if(DS.tool==='dim_hor'){
        d.value=Math.abs(d.x2-d.x1);
      } else if(DS.tool==='dim_ver'){
        d.value=Math.abs(d.y2-d.y1);
      } else {
        d.value=Math.sqrt((d.x2-d.x1)*(d.x2-d.x1)+(d.y2-d.y1)*(d.y2-d.y1));
      }
      d.value=parseFloat(d.value.toFixed(2));

      DS.dims.push(d); drawDim(d);
      DS._p1=null; DS._dimP2=null;
    }
    return;
  }
};

window._dsMoveRaf=false;
window.DS_move=function(e){
  if(DS._panning){DS.panX=e.clientX-DS._panStart.x;DS.panY=e.clientY-DS._panStart.y;applyTr();return;}
  if(DS.dragging&&DS.dragging.type==='viewProj') return;
  
if(DS.dragging&&DS.dragging.type==='view'){
    var mm=ev2mm(e), vobj=DS.views.find(function(v){return v.id===DS.dragging.id;});
    if(vobj){
      var oldX = vobj.x, oldY = vobj.y;
      vobj.x = mm.x - DS.dragOffset.x;
      vobj.y = mm.y - DS.dragOffset.y;
      var dx = vobj.x - oldX, dy = vobj.y - oldY;

      // Parçanın eski sınırlarını al (Dışarı taşan ölçüleri yakalamak için 20mm geniş tolerans)
      var inView = function(px, py) {
         return (px >= oldX - 20 && px <= oldX + vobj.w + 20 && py >= oldY - 20 && py <= oldY + vobj.h + 20);
      };

      // 1. ÖLÇÜLERİ KAYDIR (Dimensions)
      DS.dims.forEach(function(d) {
         // Ölçünün başlangıç noktası veya merkezi bu görünümün alanındaysa
         if ((d.x1 !== undefined && inView(d.x1, d.y1)) || 
             (d.cx !== undefined && inView(d.cx, d.cy))) {
            
            // Veritabanındaki koordinatlarını güncelle
            if(d.x1 !== undefined) { d.x1 += dx; d.x2 += dx; }
            if(d.y1 !== undefined) { d.y1 += dy; d.y2 += dy; }
            if(d.cx !== undefined) { d.cx += dx; }
            if(d.cy !== undefined) { d.cy += dy; }
            
            // Çizimi anında yenile
            drawDim(d); 
         }
      });

      // 2. ÇİZİM VE NOTLARI KAYDIR (Balloon, Text, Hatch, Eksen Çizgileri)
      DS.entities.forEach(function(ent) {
         var px = ent.cx !== undefined ? ent.cx : (ent.x1 !== undefined ? ent.x1 : ent.x);
         var py = ent.cy !== undefined ? ent.cy : (ent.y1 !== undefined ? ent.y1 : ent.y);
         
         if (px !== undefined && py !== undefined && inView(px, py)) {
            // Veritabanındaki koordinatlarını güncelle
            if(ent.x !== undefined) ent.x += dx;
            if(ent.y !== undefined) ent.y += dy;
            if(ent.x1 !== undefined) { ent.x1 += dx; ent.x2 += dx; }
            if(ent.y1 !== undefined) { ent.y1 += dy; ent.y2 += dy; }
            if(ent.cx !== undefined) ent.cx += dx;
            if(ent.cy !== undefined) ent.cy += dy;
            
            // SVG Elementini (DOM) görsel olarak anında kaydır (Performans korumalı)
            var el = document.getElementById(ent.id);
            if (el) {
                if (ent.type === 'line' || ent.type === 'centerline' || ent.type === 'section') {
                    el.querySelectorAll('line').forEach(function(l) {
                        l.setAttribute('x1', parseFloat(l.getAttribute('x1')||0) + dx);
                        l.setAttribute('y1', parseFloat(l.getAttribute('y1')||0) + dy);
                        l.setAttribute('x2', parseFloat(l.getAttribute('x2')||0) + dx);
                        l.setAttribute('y2', parseFloat(l.getAttribute('y2')||0) + dy);
                    });
                    el.querySelectorAll('polygon').forEach(function(p) {
                        var pts = p.getAttribute('points').split(' ').map(function(pt) {
                            var coords = pt.split(',');
                            return (parseFloat(coords[0]) + dx) + ',' + (parseFloat(coords[1]) + dy);
                        });
                        p.setAttribute('points', pts.join(' '));
                    });
                    el.querySelectorAll('text').forEach(function(t) {
                        t.setAttribute('x', parseFloat(t.getAttribute('x')||0) + dx);
                        t.setAttribute('y', parseFloat(t.getAttribute('y')||0) + dy);
                    });
                }
                else if (ent.type === 'balloon') {
                    var circ = el.querySelector('circle'), txt = el.querySelector('text');
                    if (circ) { circ.setAttribute('cx', parseFloat(circ.getAttribute('cx')||0) + dx); circ.setAttribute('cy', parseFloat(circ.getAttribute('cy')||0) + dy); }
                    if (txt) { txt.setAttribute('x', parseFloat(txt.getAttribute('x')||0) + dx); txt.setAttribute('y', parseFloat(txt.getAttribute('y')||0) + dy); }
                }
                else if (ent.type === 'hatch') {
                    var rect = el.querySelector('rect');
                    if (rect) { rect.setAttribute('x', parseFloat(rect.getAttribute('x')||0) + dx); rect.setAttribute('y', parseFloat(rect.getAttribute('y')||0) + dy); }
                }
                else if (ent.type === 'text_annot') {
                    var ta = el.querySelector('text');
                    if (ta) { ta.setAttribute('x', parseFloat(ta.getAttribute('x')||0) + dx); ta.setAttribute('y', parseFloat(ta.getAttribute('y')||0) + dy); }
                }
            }
         }
      });

      // Görünüşün (View) kendisini de taşı
      drawView(vobj);
    }
    return;
  }



  if(DS.dragging&&DS.dragging.type==='viewRot'){
    var dr=DS.dragging;
    /* find view center in screen coords */
    var wrap=document.getElementById('dstWrap'); if(!wrap) return;
    var wr=wrap.getBoundingClientRect();
    var scx=dr.cx*DS.zoom+DS.panX+wr.left;
    var scy=dr.cy*DS.zoom+DS.panY+wr.top;
    var startAng=Math.atan2(dr.startMY-scy, dr.startMX-scx);
    var nowAng=Math.atan2(e.clientY-scy, e.clientX-scx);
    var delta=(nowAng-startAng)*180/Math.PI;
    var vobj=DS.views.find(function(v){return v.id===dr.id;});
    if(vobj){
      vobj.rot=dr.startRot+delta;
      drawView(vobj);
    }
    return;
  }
  if(DS.dragging&&DS.dragging.type==='dimGrip'){
    var mm2=ev2mm(e);
    var d=DS.dims.find(function(x){return x.id===DS.dragging.id;});
    if(d){
      var gid=DS.dragging.gid||'';
      if(gid.indexOf('gOff')>=0){
        var x1d=d.x1,y1d=d.y1,x2d=d.x2,y2d=d.y2;
        if(d.type==='dim_hor')y2d=y1d; if(d.type==='dim_ver')x2d=x1d;
        var dxd=x2d-x1d,dyd=y2d-y1d,ld=Math.sqrt(dxd*dxd+dyd*dyd)||0.001;
        var nxd=-dyd/ld,nyd=dxd/ld;
        var pmx=(x1d+x2d)/2,pmy=(y1d+y2d)/2;
        
var proj=(mm2.x-pmx)*nxd+(mm2.y-pmy)*nyd;
        d.side=proj>=0?1:-1; d.off=Math.max(1,Math.abs(proj));
      } else if(gid==='g1_'+d.id){


        d.x1=mm2.x; d.y1=mm2.y;
        if(d.type==='dim_hor')d.y2=d.y1; if(d.type==='dim_ver')d.x2=d.x1;
        d.value=parseFloat(Math.sqrt((d.x2-d.x1)*(d.x2-d.x1)+(d.y2-d.y1)*(d.y2-d.y1)).toFixed(2));
      } else if(gid==='g2_'+d.id){
        d.x2=mm2.x; d.y2=mm2.y;
        if(d.type==='dim_hor')d.y2=d.y1; if(d.type==='dim_ver')d.x2=d.x1;
        d.value=parseFloat(Math.sqrt((d.x2-d.x1)*(d.x2-d.x1)+(d.y2-d.y1)*(d.y2-d.y1)).toFixed(2));
      }
      drawDim(d);
    }
    return;
  }

  /* ── throttled: snap + preview ─────────────────────── */
  if(window._dsMoveRaf) return;
  window._dsMoveRaf=true;
  var _ex=e.clientX,_ey=e.clientY,_lx=e.layerX||0,_ly=e.layerY||0;
  requestAnimationFrame(function(){
    window._dsMoveRaf=false;
    var _w=document.getElementById('dstWrap'); if(!_w) return;
    var _r=_w.getBoundingClientRect();
    var mx=(_ex-_r.left-DS.panX)/DS.zoom, my=(_ey-_r.top-DS.panY)/DS.zoom;

    /* Print area rubber band */
    if(DS._printAreaMode&&DS._printAreaP1){
      var pg2=document.getElementById('dstPrev'); if(pg2) pg2.innerHTML='';
      var p1=DS._printAreaP1;
      var rx=Math.min(p1.x,mx),ry=Math.min(p1.y,my);
      var rw=Math.abs(mx-p1.x),rh=Math.abs(my-p1.y);
      var pr2=svgE('rect');
      sa(pr2,{x:rx,y:ry,width:rw,height:rh,
        fill:'rgba(124,58,237,.08)',stroke:'#7c3aed',
        'stroke-width':0.6,'stroke-dasharray':'4,2'});
      if(pg2) pg2.appendChild(pr2);
      /* corner labels */
      ['tl','br'].forEach(function(corn){
        var tx=corn==='tl'?rx:rx+rw, ty=corn==='tl'?ry:ry+rh;
        var dot=svgE('circle');sa(dot,{cx:tx,cy:ty,r:1,fill:'#7c3aed'});if(pg2)pg2.appendChild(dot);
      });
      /* size label */
      var sl=svgE('text');
      sa(sl,{x:rx+rw/2,y:ry-1.5,'text-anchor':'middle','font-size':3,
        'font-weight':'bold','font-family':'Arial',fill:'#7c3aed'});
      sl.textContent=rw.toFixed(1)+'×'+rh.toFixed(1)+' mm';
      if(pg2) pg2.appendChild(sl);
      return; /* skip normal snap preview */
    }

    var s=doSnap(mx,my);
    var co=document.getElementById('dstCoords');
    if(co) co.textContent=s.x.toFixed(1)+', '+s.y.toFixed(1)+' mm';
    showSnapMark(s,_lx,_ly);
    var pg=document.getElementById('dstPrev'); if(!pg) return; pg.innerHTML='';

    /* DIM live preview — 3rd click placement */
    if(DS.tool.startsWith('dim_')&&DS._p1&&DS._dimP2){
      var px1=DS._p1.x,py1=DS._p1.y,px2=DS._dimP2.x,py2=DS._dimP2.y;
      if(DS.tool==='dim_hor') py2=py1;
      if(DS.tool==='dim_ver') px2=px1;
      var pdx=px2-px1,pdy=py2-py1,plen=Math.sqrt(pdx*pdx+pdy*pdy)||0.001;
      var pnx=-pdy/plen,pny=pdx/plen;
      var pOff,pSide;
      var pmx=(px1+px2)/2, pmy=(py1+py2)/2;
      var pr2=(s.x-pmx)*pnx+(s.y-pmy)*pny;
      var pSide=pr2>=0?1:-1;
      var pOff=Math.abs(pr2)||8;
      var ax=px1+pnx*pOff*pSide,ay=py1+pny*pOff*pSide;
      var bx=px2+pnx*pOff*pSide,by=py2+pny*pOff*pSide;
      var ovr=1; /* overshoot */
      [
        {x1:px1,y1:py1,x2:ax+pnx*ovr,y2:ay+pny*ovr},
        {x1:px2,y1:py2,x2:bx+pnx*ovr,y2:by+pny*ovr},
        {x1:ax,y1:ay,x2:bx,y2:by}
      ].forEach(function(ln){
        var pl=svgE('line');sa(pl,{x1:ln.x1,y1:ln.y1,x2:ln.x2,y2:ln.y2,
          stroke:'rgba(99,102,241,.7)','stroke-width':0.35});pg.appendChild(pl);
      });
      var ts=parseFloat(gv('dstDimSz')||'3.5');
      var pval=DS.tool==='dim_hor'?Math.abs(px2-px1).toFixed(2):
               DS.tool==='dim_ver'?Math.abs(py2-py1).toFixed(2):plen.toFixed(2);
      var pt=svgE('text');sa(pt,{x:(ax+bx)/2,y:(ay+by)/2-1,'text-anchor':'middle',
        'font-size':ts,'font-weight':'bold','font-family':'Arial',fill:'#6366f1'});
      var _psc=parseScale();
      pt.textContent=parseFloat((parseFloat(pval)/_psc).toFixed(3))+' mm'; pg.appendChild(pt);
      return;
    }

    /* DIM p1→p2 preview */
    if(DS.tool.startsWith('dim_')&&DS._p1&&!DS._dimP2){
      var sx2=s.x,sy2=s.y;
      if(DS.tool==='dim_hor')sy2=DS._p1.y;
      if(DS.tool==='dim_ver')sx2=DS._p1.x;
      var pl=svgE('line');sa(pl,{x1:DS._p1.x,y1:DS._p1.y,x2:sx2,y2:sy2,
        stroke:'rgba(99,102,241,.7)','stroke-width':0.35,'stroke-dasharray':'4,2'});pg.appendChild(pl);
      var ld=DS.tool==='dim_hor'?Math.abs(sx2-DS._p1.x):
             DS.tool==='dim_ver'?Math.abs(sy2-DS._p1.y):
             Math.sqrt((sx2-DS._p1.x)*(sx2-DS._p1.x)+(sy2-DS._p1.y)*(sy2-DS._p1.y));
      var ts2=parseFloat(gv('dstDimSz')||'3.5');
      var pt2=svgE('text');sa(pt2,{x:(DS._p1.x+sx2)/2,y:(DS._p1.y+sy2)/2-2,
        'text-anchor':'middle','font-size':ts2*0.85,'font-family':'Arial',fill:'rgba(99,102,241,.9)'});
      var _psc2=parseScale();
      pt2.textContent=parseFloat((ld/_psc2).toFixed(3))+' mm'; pg.appendChild(pt2);
      var pd=svgE('circle');sa(pd,{cx:sx2,cy:sy2,r:0.8,fill:'#f59e0b'});pg.appendChild(pd);
      return;
    }

    /* Generic line preview */
    var p1=DS._p1||DS._secPt;
    if(p1){
      var pl2=svgE('line');sa(pl2,{x1:p1.x,y1:p1.y,x2:s.x,y2:s.y,
        stroke:'rgba(99,102,241,.7)','stroke-width':0.35,'stroke-dasharray':'4,2'});pg.appendChild(pl2);
      var pd2=svgE('circle');sa(pd2,{cx:s.x,cy:s.y,r:0.8,fill:'#f59e0b'});pg.appendChild(pd2);
    }
  }); /* end rAF */
};

window.DS_up=function(e){
  if(DS._panning){DS._panning=false;return;}
  if(DS.dragging&&DS.dragging.type==='dimGrip'){
    var d=DS.dims.find(function(x){return x.id===DS.dragging.id;});
    if(d) drawDim(d);
    DS.dragging=null; return;
  }
  /* viewProj: document-level mouseup owns it — don't clear here */
  if(DS.dragging&&DS.dragging.type==='viewProj') return;
  if(DS.dragging&&DS.dragging.type==='viewRot'){
    document.body.style.userSelect='';
    DS.dragging=null; return;
  }
  DS.dragging=null;
};
window.DS_dbl=function(e){if(e.target.closest('#dstDG')) return; DS._p1=null;DS._dimP2=null;DS._secPt=null;var pg=document.getElementById('dstPrev');if(pg)pg.innerHTML='';};
window.DS_wheel=function(e){
  e.preventDefault();
  var w=document.getElementById('dstWrap'), r=w.getBoundingClientRect();
  var sx=e.clientX-r.left, sy=e.clientY-r.top, f=e.deltaY>0?0.88:1.14;
  var wx=sx-DS.panX, wy=sy-DS.panY;
  DS.zoom=Math.max(0.04,Math.min(40,DS.zoom*f));
  DS.panX=sx-wx*f; DS.panY=sy-wy*f; applyTr();
};
window.DS_key=function(e){
  var el=document.getElementById('dstR'); if(!el||el.classList.contains('hidden')) return;
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  if(e.key==='Escape'){if(DS._printAreaMode){DS_cancelPrintArea();return;}DS._p1=null;DS._dimP2=null;DS._secPt=null;DS.tool='select';updTbtn();hint('');}
  if(e.key==='Delete'||e.key==='Backspace') delSel();
  if(e.ctrlKey&&e.key==='z') DS_undo();
};
window.DS_tool=function(btn){DS.tool=btn.getAttribute('data-dstool');DS._p1=null;DS._dimP2=null;DS._secPt=null;var pg=document.getElementById('dstPrev');if(pg)pg.innerHTML='';updTbtn();};
function updTbtn(){document.querySelectorAll('.dsBtn[data-dstool]').forEach(function(b){b.classList.toggle('act',b.getAttribute('data-dstool')===DS.tool);});}

/* ── HISTORY ──────────────────────────────────────── */
function pushH(){
  DS.history.push({
    entities:JSON.parse(JSON.stringify(DS.entities)),
    dims:JSON.parse(JSON.stringify(DS.dims)),
    views:DS.views.map(function(v){return{id:v.id,x:v.x,y:v.y,w:v.w,h:v.h,rot:v.rot||0};})
  });
  if(DS.history.length>25) DS.history.shift();
}
window.DS_undo=function(){
  if(!DS.history.length) return;
  var h=DS.history.pop();
  DS.entities=h.entities; DS.dims=h.dims;
  h.views.forEach(function(vp){var vobj=DS.views.find(function(v){return v.id===vp.id;});if(vobj){vobj.x=vp.x;vobj.y=vp.y;vobj.rot=vp.rot||0;}});
  redrawAll();
};
function delSel(){
  if(!DS.selected) return; pushH();
  var el=document.getElementById(DS.selected); if(el) el.remove();
  DS.entities=DS.entities.filter(function(e){return e.id!==DS.selected;});
  DS.dims=DS.dims.filter(function(d){return d.id!==DS.selected;});
  DS.views=DS.views.filter(function(v){return v.id!==DS.selected;});
  DS.selected=null;
  redrawDims();
}
function redrawAll(){
  var dg=document.getElementById('dstDG'), ag=document.getElementById('dstAG');
  if(dg) dg.innerHTML=''; if(ag) ag.innerHTML='';
  DS.dims.forEach(drawDim);
  DS.entities.forEach(function(e){
    if(e.type==='section') drawSection(e.x1,e.y1,e.x2,e.y2,e.lbl);
    else if(e.type==='hatch') drawHatch(e);
    else if(e.type==='centerline') drawCL(e.x1,e.y1,e.x2,e.y2);
    else if(e.type==='balloon') drawBalloon(e.cx,e.cy,e.num);
    else if(e.type==='text_annot') drawAnnotTxt(e.x,e.y,e.text);
    else if(e.type==='line') drawAnnotLine(e.x1,e.y1,e.x2,e.y2);
  });
  DS.views.forEach(drawView); DS_redrawTB();
}

/* ── EXPORT ───────────────────────────────────────── */
function buildExportSVG(vbX,vbY,vbW,vbH){
  /* vbX/vbY/vbW/vbH optional — defaults to full paper */
  var svg=document.getElementById('dstSVG'); if(!svg) return null;
  var clone=svg.cloneNode(true);

  /* Set mm-based dimensions — 1 SVG unit = 1 mm */
  if(vbX===undefined){vbX=0;vbY=0;vbW=DS.paperW;vbH=DS.paperH;}
  clone.setAttribute('viewBox', vbX+' '+vbY+' '+vbW+' '+vbH);
  clone.setAttribute('width',  vbW+'mm');
  clone.setAttribute('height', vbH+'mm');
  clone.removeAttribute('style'); /* strip pixel width/height style */

  /* Remove screen-only layers */
  ['#dstBg','#dstPrev','#dstSnapG'].forEach(function(sel){
    var e=clone.querySelector(sel); if(e) e.remove();
  });
  /* Remove projection handles (circles with cursor=crosshair) */
  clone.querySelectorAll('circle[cursor="crosshair"]').forEach(function(el){el.remove();});
  /* Remove rotate handle (cursor=ew-resize) */
  clone.querySelectorAll('circle[cursor="ew-resize"]').forEach(function(el){el.remove();});
  /* Remove handle arrow texts (▲▼▶◀↻) */
  clone.querySelectorAll('text').forEach(function(el){
    var ch=el.textContent.trim();
    if('▲▼▶◀↻'.indexOf(ch)>=0) el.remove();
  });
  /* Remove handle guide dashes */
  clone.querySelectorAll('line[stroke-dasharray="2,2"]').forEach(function(el){el.remove();});
  /* Remove view border strokes (keep white bg, hide border) */
  clone.querySelectorAll('#dstVG > g > rect').forEach(function(r){
    if(r.getAttribute('fill')==='white') r.setAttribute('stroke','none');
  });
  /* Reset paper group transform — children are already in mm coords */
  var pg=clone.querySelector('#dstPG'); if(pg) pg.removeAttribute('transform');

  return new XMLSerializer().serializeToString(clone);
}

function buildPrintHTML(svgData, pgW, pgH){
  /* @page exactly matches the SVG, SVG fills the page edge-to-edge */
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<title>Draft Print</title>',
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box;}',
    '@page{size:'+pgW.toFixed(2)+'mm '+pgH.toFixed(2)+'mm;margin:0;}',
    'html,body{width:'+pgW.toFixed(2)+'mm;height:'+pgH.toFixed(2)+'mm;background:white;overflow:hidden;}',
    'svg{display:block;width:'+pgW.toFixed(2)+'mm !important;height:'+pgH.toFixed(2)+'mm !important;}',
    '</style></head><body>',
    svgData,
    '<script>',
    'window.addEventListener("load",function(){',
    '  setTimeout(function(){window.print();},600);',
    '});<\/script>',
    '</body></html>'
  ].join('');
}

function openPrint(html){
  var blob=new Blob([html],{type:'text/html'});
  var url=URL.createObjectURL(blob);
  var win=window.open(url,'_blank');
  if(!win){var a=document.createElement('a');a.href=url;a.target='_blank';a.click();}
  setTimeout(function(){URL.revokeObjectURL(url);},15000);
}

window.DS_exportSVG=function(){
  var data=buildExportSVG(); if(!data) return;
  var blob=new Blob([data],{type:'image/svg+xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url; a.download='drawing_'+DS.paper+'.svg'; a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},3000);
};

window.DS_exportPDF=function(){
  /* Full paper export — views are placed on paper in mm coords */
  var data=buildExportSVG(0,0,DS.paperW,DS.paperH); if(!data) return;
  openPrint(buildPrintHTML(data, DS.paperW, DS.paperH));
};


window.DS_printSelectedArea=function(x1,y1,x2,y2){
  var mnX=Math.min(x1,x2), mnY=Math.min(y1,y2);
  var mxX=Math.max(x1,x2), mxY=Math.max(y1,y2);
  var w=mxX-mnX, h=mxY-mnY;
  if(w<5||h<5){hint('Area too small');return;}
  var PAD=5;
  var pgW=w+PAD*2, pgH=h+PAD*2;
  /* Crop SVG viewBox to selected area + padding */
  var data=buildExportSVG(mnX-PAD,mnY-PAD,pgW,pgH); if(!data) return;
  openPrint(buildPrintHTML(data, pgW, pgH));
  DS_cancelPrintArea();
};

window.DS_exportSVG=function(){
  var data=buildExportSVG(); if(!data) return;
  var blob=new Blob([data],{type:'image/svg+xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download='drawing_'+DS.paper+'.svg'; a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},2000);
};

window.DS_exportPDF=function(){
  var data=buildExportSVG(); if(!data) return;
  /* Compute actual drawing bounds for centering */
  var allX=[], allY=[];
  DS.views.forEach(function(v){allX.push(v.x,v.x+v.w);allY.push(v.y,v.y+v.h);});
  DS.dims.forEach(function(d){allX.push(d.x1,d.x2);allY.push(d.y1,d.y2);});
  var mnX=allX.length?Math.min.apply(null,allX):0;
  var mxX=allX.length?Math.max.apply(null,allX):DS.paperW;
  var mnY=allY.length?Math.min.apply(null,allY):0;
  var mxY=allY.length?Math.max.apply(null,allY):DS.paperH;
  var PAD=10; /* mm padding */
  mnX=Math.max(0,mnX-PAD); mnY=Math.max(0,mnY-PAD);
  mxX=Math.min(DS.paperW,mxX+PAD); mxY=Math.min(DS.paperH,mxY+PAD);
  /* Build centered SVG with viewBox cropped to drawing area */
  var vbW=mxX-mnX, vbH=mxY-mnY;
  var centeredData=data.replace(
    /viewBox="[^"]*"/,
    'viewBox="'+mnX+' '+mnY+' '+vbW+' '+vbH+'"'
  );
  var html=[
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<title>Technical Drawing</title>',
    '<style>',
    '@page{size:'+DS.paperW+'mm '+DS.paperH+'mm;margin:0;}',
    'html,body{margin:0;padding:0;background:white;}',
    'body{display:flex;align-items:center;justify-content:center;',
    'width:'+DS.paperW+'mm;height:'+DS.paperH+'mm;}',
    'svg{display:block;max-width:'+DS.paperW+'mm;max-height:'+DS.paperH+'mm;',
    'width:'+vbW+'mm;height:'+vbH+'mm;}',
    '</style></head><body>',
    centeredData,
    '<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},500);});<\/script>',
    '</body></html>'
  ].join('');
  var blob=new Blob([html],{type:'text/html'});
  var url=URL.createObjectURL(blob);
  var win=window.open(url,'_blank');
  /* Fallback if popup blocked */
  if(!win){
    var a=document.createElement('a'); a.href=url; a.target='_blank'; a.click();
  }
  setTimeout(function(){URL.revokeObjectURL(url);},10000);
};

/* ── HELPER ───────────────────────────────────────── */
function hint(msg){
  var e=document.getElementById('dstHint'); if(!e) return;
  if(!msg){e.style.display='none';return;}
  e.textContent=msg; e.style.display='block';
  clearTimeout(e._t); e._t=setTimeout(function(){e.style.display='none';},3000);
}

})();


//**********************************************************************************
// =============================================================================
// 3D EKRAN: SAĞ TUŞ (PAN) ÖZGÜRLÜĞÜ VE KESİN ÇÖZÜM YAMASI
// =============================================================================

// 1. Mevcut fare kontrollerindeki kısıtlamaları kaldırıyoruz
if (typeof controls !== 'undefined') {
    // Farenin hareket yönüyle kameranın hareket yönünü %100 eşitler (Çok Rahatlatır)
    controls.screenSpacePanning = true; 
    // Sağ tuş kaydırma ağırlığını hafifletir, daha hızlı ve serbest yapar
    controls.panSpeed = 1.5; 
}

// 2. Küpe tıklandığında (Odaklanma sonrasında) hızın tekrar ölmesini engelliyoruz
window.setView = function(viewName) {
    var box = new THREE.Box3();
    var hasObjects = false;
    
    if (typeof objects !== 'undefined') {
        objects.forEach(function(obj) {
            if (obj && obj.isMesh && obj.visible && obj.name !== "GridHelper" && !obj.name.includes("Axes")) {
                if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
                var b = obj.geometry.boundingBox.clone();
                b.applyMatrix4(obj.matrixWorld);
                box.union(b);
                hasObjects = true;
            }
        });
    }

    var center = new THREE.Vector3();
    var size   = new THREE.Vector3();
    var maxDim = 10;

    if (hasObjects) {
        box.getCenter(center);
        box.getSize(size);
        maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim === 0) maxDim = 10;
    }

    var fov = camera.fov * (Math.PI / 180);
    var dist = Math.abs(maxDim / Math.sin(fov / 2)) * 0.7; 
    
    camera.up.set(0, 1, 0);
    viewName = viewName.toLowerCase();
    if (viewName === 'side') viewName = 'right'; // alias

    if (viewName === 'front') camera.position.set(center.x, center.y, center.z + dist);
    else if (viewName === 'back') camera.position.set(center.x, center.y, center.z - dist);
    else if (viewName === 'right') camera.position.set(center.x + dist, center.y, center.z);
    else if (viewName === 'left') camera.position.set(center.x - dist, center.y, center.z);
    else if (viewName === 'top') { camera.position.set(center.x, center.y + dist, center.z); camera.up.set(0, 0, -1); } 
    else if (viewName === 'bottom') { camera.position.set(center.x, center.y - dist, center.z); camera.up.set(0, 0, 1); } 
    else if (viewName === 'iso'    || viewName === 'iso-ne') { camera.position.set(center.x+dist*0.8, center.y+dist*0.7, center.z+dist*0.8); }
    else if (viewName === 'iso-sw') { camera.position.set(center.x-dist*0.8, center.y+dist*0.7, center.z-dist*0.8); }
    else if (viewName === 'iso-nw') { camera.position.set(center.x-dist*0.8, center.y+dist*0.7, center.z+dist*0.8); }
    else if (viewName === 'iso-se') { camera.position.set(center.x+dist*0.8, center.y+dist*0.7, center.z-dist*0.8); }

    camera.lookAt(center);
    
    if (typeof controls !== 'undefined') {
        controls.target.copy(center);
        
        // EFSANE DÜZELTME: Küpe tıkladıktan sonra sağ tuş kitlenmesin!
        controls.screenSpacePanning = true; 
        controls.panSpeed = 1.5; // Hız standardını koru
        controls.update();
    }
    
    if(typeof showNotification === 'function') {
        showNotification("Görünüm: " + viewName.toUpperCase(), "success");
    }
};

window.changeView = window.setView;
window.setCameraView = window.setView;
window.lookAtView = window.setView;
window.updateView = window.setView;

document.addEventListener('DOMContentLoaded', function() {
    var viewBtns = document.querySelectorAll('.view-cube-face, .view-btn, button');
    viewBtns.forEach(function(btn) {
        var t = btn.innerText.toLowerCase();
        if(t.includes('front') || t.includes('right') || t.includes('left') || t.includes('top') || t.includes('iso')) {
            btn.addEventListener('click', function(e) {
                var view = t.replace(/[^a-z]/g, '');
                if(['front','back','right','left','top','bottom','iso'].includes(view)) {
                    window.setView(view);
                }
            });
        }
    });
});
