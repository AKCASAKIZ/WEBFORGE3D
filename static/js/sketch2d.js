/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  Sketch2D  —  Professional 2D Sketcher for WebForge3D PRO          ║
 * ║  CATIA / Fusion 360 tarzı yüzey-bazlı 2D → 3D iş akışı            ║
 * ║  v2 — r108 uyumlu (applyMatrix / window.objects / ThreeBSP fix)    ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
(function (global) {
  'use strict';

  // ─── CONSTANTS ────────────────────────────────────────────────────────────
  var GRID_MAJOR = 1.0;
  var GRID_SUB   = 5;
  var SNAP_PX    = 14;

  // ─── STATE ────────────────────────────────────────────────────────────────
  var _state    = 'idle';        // idle | face-pick | drawing
  var _tool     = 'rect';
  var _plane    = null;
  var _shapes   = [];
  var _curPts   = [];
  var _drag     = null;
  var _svgEl    = null;
  var _panelEl  = null;
  var _dimEl    = null;
  var _savedCam = null;
  var _hintEl   = null;
  var _camLockId = null;   // Kamera kilit döngüsü
  var _camTarget = null;   // Kilitli kamera hedef noktası
  var _camDist   = 20;     // Kilitli kamera mesafesi

  // ─── THREE.JS ERIŞIM ──────────────────────────────────────────────────────
  function S()   { return global.scene; }
  function CAM() { return global.camera; }
  function REN() { return global.renderer; }

  // ─── KOORDINAT DÖNÜŞÜM ───────────────────────────────────────────────────

  function screenToSketch(cx, cy) {
    if (!_plane) return null;
    var dom  = REN().domElement;
    var rect = dom.getBoundingClientRect();
    var ndc  = {
      x:  ((cx - rect.left) / rect.width)  * 2 - 1,
      y: -((cy - rect.top)  / rect.height) * 2 + 1
    };
    var rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, CAM());
    var pl  = new THREE.Plane().setFromNormalAndCoplanarPoint(_plane.normal, _plane.origin);
    var hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(pl, hit)) return null;
    var lc = hit.clone().sub(_plane.origin);
    return { x: lc.dot(_plane.xAxis), y: lc.dot(_plane.yAxis) };
  }

  function sketchToWorld(sx, sy) {
    return _plane.origin.clone()
      .addScaledVector(_plane.xAxis, sx)
      .addScaledVector(_plane.yAxis, sy);
  }

  function worldToScreen(v3) {
    var dom  = REN().domElement;
    var p    = v3.clone().project(CAM());
    return { x: (p.x + 1) * 0.5 * dom.clientWidth, y: (-p.y + 1) * 0.5 * dom.clientHeight };
  }

  function sk2sc(sx, sy) { return worldToScreen(sketchToWorld(sx, sy)); }

  function snapGrid(pt) {
    if (!pt) return pt;
    var step = GRID_MAJOR / GRID_SUB;
    return { x: Math.round(pt.x / step) * step, y: Math.round(pt.y / step) * step };
  }

  function snapFull(pt, scx, scy) {
    if (!pt) return pt;
    // Tamamlanan şekillerin noktalarına snap
    for (var i = 0; i < _shapes.length; i++) {
      var pts = _shapes[i]._pts;
      if (!pts) continue;
      for (var j = 0; j < pts.length; j++) {
        var s = sk2sc(pts[j].x, pts[j].y);
        if (Math.hypot(s.x - scx, s.y - scy) < SNAP_PX)
          return { x: pts[j].x, y: pts[j].y, snapped: true };
      }
    }
    // Polygon kapanma snap
    if (_curPts.length >= 2) {
      var fp = _curPts[0];
      var fs = sk2sc(fp.x, fp.y);
      if (Math.hypot(fs.x - scx, fs.y - scy) < SNAP_PX)
        return { x: fp.x, y: fp.y, snapped: true, closing: true };
    }
    var g = snapGrid(pt);
    g.snapped = false;
    return g;
  }

  // ─── SVG YARDIMCILARI ────────────────────────────────────────────────────

  function svgMk(tag, attrs, parent) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.keys(attrs).forEach(function(k) { el.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(el);
    return el;
  }

  function svgClear(cls) {
    if (_svgEl) _svgEl.querySelectorAll('.' + cls).forEach(function(e) { e.remove(); });
  }

  // ─── GRID ────────────────────────────────────────────────────────────────

  function renderGrid() {
    svgClear('sk2d-grid');
    if (!_svgEl || !_plane) return;
    var dom = REN().domElement;
    var W = dom.clientWidth, H = dom.clientHeight;
    var corners = [
      screenToSketch(0,0), screenToSketch(W,0),
      screenToSketch(0,H), screenToSketch(W,H)
    ].filter(Boolean);
    if (corners.length < 4) return;

    var pad  = GRID_MAJOR * 2;
    var minX = Math.min.apply(null, corners.map(function(c){return c.x;})) - pad;
    var maxX = Math.max.apply(null, corners.map(function(c){return c.x;})) + pad;
    var minY = Math.min.apply(null, corners.map(function(c){return c.y;})) - pad;
    var maxY = Math.max.apply(null, corners.map(function(c){return c.y;})) + pad;

    var g    = svgMk('g', null, null);
    g.classList.add('sk2d-grid');
    var step = GRID_MAJOR / GRID_SUB;

    function dl(x0,y0,x1,y1,major) {
      var a = sk2sc(x0,y0), b = sk2sc(x1,y1);
      svgMk('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,
        stroke: major ? '#252b48' : '#181c30',
        'stroke-width': major ? '0.7' : '0.3'}, g);
    }
    for (var x = Math.floor(minX/step)*step; x <= maxX; x += step)
      dl(x, minY, x, maxY, Math.abs(Math.round(x/GRID_MAJOR)*GRID_MAJOR - x) < step*0.05);
    for (var y = Math.floor(minY/step)*step; y <= maxY; y += step)
      dl(minX, y, maxX, y, Math.abs(Math.round(y/GRID_MAJOR)*GRID_MAJOR - y) < step*0.05);

    // Eksenler
    var o1=sk2sc(0,minY),o2=sk2sc(0,maxY),p1=sk2sc(minX,0),p2=sk2sc(maxX,0);
    svgMk('line',{x1:o1.x,y1:o1.y,x2:o2.x,y2:o2.y,stroke:'#7a2020','stroke-width':'1.2',opacity:'0.7'}, g);
    svgMk('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:'#206040','stroke-width':'1.2',opacity:'0.7'}, g);
    var oc=sk2sc(0,0);
    svgMk('circle',{cx:oc.x,cy:oc.y,r:'4',fill:'#3a4060'}, g);
    _svgEl.insertBefore(g, _svgEl.firstChild);
  }

  // ─── ŞEKİL ÇİZİMİ ────────────────────────────────────────────────────────

  function renderShapes() {
    svgClear('sk2d-shape');
    if (!_svgEl) return;
    _shapes.forEach(function(sh) {
      var g = svgMk('g', null, _svgEl);
      g.classList.add('sk2d-shape');
      if (sh._isCircle) {
        var c  = sk2sc(sh._cx, sh._cy);
        var ep = sk2sc(sh._cx + sh._r, sh._cy);
        var r  = Math.hypot(ep.x-c.x, ep.y-c.y);
        svgMk('circle',{cx:c.x,cy:c.y,r:r,fill:'rgba(56,160,250,.09)',stroke:'#38a0fa','stroke-width':'1.8'},g);
        svgMk('line',{x1:c.x-8,y1:c.y,x2:c.x+8,y2:c.y,stroke:'#38a0fa','stroke-width':'0.9'},g);
        svgMk('line',{x1:c.x,y1:c.y-8,x2:c.x,y2:c.y+8,stroke:'#38a0fa','stroke-width':'0.9'},g);
      } else {
        var pts  = sh._pts;
        if (!pts || pts.length < 2) return;
        var spts = pts.map(function(p){ return sk2sc(p.x, p.y); });
        var d    = spts.map(function(p,i){ return (i?'L':'M')+p.x.toFixed(1)+','+p.y.toFixed(1); }).join(' ')+' Z';
        svgMk('path',{d:d,fill:'rgba(56,160,250,.08)',stroke:'#38a0fa','stroke-width':'1.8','stroke-linejoin':'round'},g);
        spts.forEach(function(sp){ svgMk('circle',{cx:sp.x,cy:sp.y,r:'3',fill:'#38a0fa'},g); });
      }
    });
  }

  // ─── ÖNZLEME ─────────────────────────────────────────────────────────────

  function renderPreview(pt) {
    svgClear('sk2d-prev');
    if (!pt || !_svgEl) return;
    var g   = svgMk('g', null, _svgEl);
    g.classList.add('sk2d-prev');
    var COL  = '#38a0fa';
    var DASH = '5,3';

    if ((_tool === 'line' || _tool === 'polygon') && _curPts.length > 0) {
      var all = _curPts.concat([pt]);
      for (var i = 0; i < all.length-1; i++) {
        var a=sk2sc(all[i].x,all[i].y), b=sk2sc(all[i+1].x,all[i+1].y);
        svgMk('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:COL,'stroke-width':'1.6','stroke-dasharray':DASH},g);
      }
      if (_tool==='polygon' && _curPts.length >= 2) {
        var lp=sk2sc(pt.x,pt.y), fp=sk2sc(_curPts[0].x,_curPts[0].y);
        svgMk('line',{x1:lp.x,y1:lp.y,x2:fp.x,y2:fp.y,stroke:COL+'44','stroke-width':'1','stroke-dasharray':'3,3'},g);
      }
    } else if (_tool === 'rect' && _drag) {
      var sa=sk2sc(_drag.start.x,_drag.start.y), sb=sk2sc(pt.x,pt.y);
      svgMk('rect',{
        x:Math.min(sa.x,sb.x),y:Math.min(sa.y,sb.y),
        width:Math.abs(sb.x-sa.x),height:Math.abs(sb.y-sa.y),
        fill:'rgba(56,160,250,.08)',stroke:COL,'stroke-width':'1.6','stroke-dasharray':DASH
      },g);
    } else if (_tool === 'circle' && _drag) {
      var cc=sk2sc(_drag.start.x,_drag.start.y);
      var cep=sk2sc(pt.x,pt.y);
      var cr=Math.hypot(cep.x-cc.x,cep.y-cc.y);
      svgMk('circle',{cx:cc.x,cy:cc.y,r:cr,fill:'rgba(56,160,250,.08)',stroke:COL,'stroke-width':'1.6','stroke-dasharray':DASH},g);
      svgMk('line',{x1:cc.x,y1:cc.y,x2:cep.x,y2:cep.y,stroke:COL,'stroke-width':'0.8','stroke-dasharray':'3,2'},g);
    }

    var sc=sk2sc(pt.x,pt.y);
    svgMk('circle',{cx:sc.x,cy:sc.y,r:'5',fill:'none',stroke:COL,'stroke-width':'1.5'},g);
    svgMk('circle',{cx:sc.x,cy:sc.y,r:'1.5',fill:COL},g);
    if (pt.snapped)
      svgMk('circle',{cx:sc.x,cy:sc.y,r:'9',fill:'none',stroke:'#38fa88','stroke-width':'1.5'},g);
  }

  // ─── FARE OLAYLARI ────────────────────────────────────────────────────────

  function getPt(e) {
    var raw = screenToSketch(e.clientX, e.clientY);
    return raw ? snapFull(raw, e.clientX, e.clientY) : null;
  }

  function onPtrMove(e) {
    var pt = getPt(e);
    renderPreview(pt);
    updateDim(pt);
  }

  function onPtrDown(e) {
    if (e.button !== 0) return;
    var pt = getPt(e);
    if (!pt) return;
    if (_tool === 'rect' || _tool === 'circle') {
      _drag = { start: { x: pt.x, y: pt.y } };
    } else {
      if (pt.closing && _curPts.length >= 2) { commitPoly(); return; }
      _curPts.push({ x: pt.x, y: pt.y });
    }
  }

  function onPtrUp(e) {
    if (e.button !== 0 || !_drag) return;
    var pt = getPt(e);
    if (!pt) { _drag = null; return; }

    if (_tool === 'rect') {
      var x0=_drag.start.x, y0=_drag.start.y, x1=pt.x, y1=pt.y;
      if (Math.abs(x1-x0) > 1e-4 && Math.abs(y1-y0) > 1e-4) {
        var sh = new THREE.Shape();
        sh.moveTo(x0,y0); sh.lineTo(x1,y0); sh.lineTo(x1,y1); sh.lineTo(x0,y1); sh.closePath();
        sh._pts = [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
        _shapes.push(sh);
        renderShapes();
        setBadge('▭ '+Math.abs(x1-x0).toFixed(2)+' × '+Math.abs(y1-y0).toFixed(2));
      }
    } else if (_tool === 'circle') {
      var cx=_drag.start.x, cy=_drag.start.y;
      var r=Math.hypot(pt.x-cx, pt.y-cy);
      if (r > 1e-4) {
        var cs = new THREE.Shape();
        cs.absarc(cx, cy, r, 0, Math.PI*2, false);
        cs._isCircle=true; cs._cx=cx; cs._cy=cy; cs._r=r;
        cs._pts=[];
        for (var i=0;i<64;i++){var a=(i/64)*Math.PI*2; cs._pts.push({x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r});}
        _shapes.push(cs);
        renderShapes();
        setBadge('○ r = '+r.toFixed(3));
      }
    }
    _drag = null;
  }

  function onDbl(e) {
    if (_tool==='line'    && _curPts.length>=2) commitPoly();
    if (_tool==='polygon' && _curPts.length>=3) commitPoly();
  }

  function onCtx(e) {
    e.preventDefault();
    if (_curPts.length >= (_tool==='line'?2:3)) commitPoly();
    else { _curPts=[]; _drag=null; svgClear('sk2d-prev'); }
  }

  function onKey(e) {
    if (_state !== 'drawing') return;
    if (e.key === 'Escape') { _curPts=[]; _drag=null; svgClear('sk2d-prev'); return; }
    if (e.key === 'Enter') {
      if (_tool==='line'    && _curPts.length>=2) commitPoly();
      if (_tool==='polygon' && _curPts.length>=3) commitPoly();
      return;
    }
    if ((e.ctrlKey||e.metaKey) && e.key==='z') {
      e.preventDefault();
      if (_shapes.length) { _shapes.pop(); renderShapes(); }
      return;
    }
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      var m={r:'rect',c:'circle',l:'line',p:'polygon'};
      if (m[e.key.toLowerCase()]) API.setTool(m[e.key.toLowerCase()]);
    }
  }

  function commitPoly() {
    if (_curPts.length < 2) return;
    var sh = new THREE.Shape();
    sh.moveTo(_curPts[0].x, _curPts[0].y);
    for (var i=1; i<_curPts.length; i++) sh.lineTo(_curPts[i].x, _curPts[i].y);
    sh.closePath();
    sh._pts = _curPts.slice();
    _shapes.push(sh);
    _curPts = [];
    svgClear('sk2d-prev');
    renderShapes();
    setBadge('Profil kapatıldı ('+sh._pts.length+' nokta)');
  }

  // ─── BOYUT GÖSTERGE ───────────────────────────────────────────────────────

  function updateDim(pt) {
    if (!_dimEl || !pt) return;
    var txt = '';
    if (_drag) {
      txt = _tool==='circle'
        ? 'r = '+Math.hypot(pt.x-_drag.start.x, pt.y-_drag.start.y).toFixed(3)
        : Math.abs(pt.x-_drag.start.x).toFixed(3)+' × '+Math.abs(pt.y-_drag.start.y).toFixed(3);
    } else if (_curPts.length > 0) {
      var lp=_curPts[_curPts.length-1];
      txt = 'L = '+Math.hypot(pt.x-lp.x, pt.y-lp.y).toFixed(3);
    } else {
      txt = pt.x.toFixed(3)+',  '+pt.y.toFixed(3);
    }
    _dimEl.textContent = txt;
  }

  // ─── YÜZEY SEÇİM MODU ────────────────────────────────────────────────────

  function enterFacePick() {
    _state = 'face-pick';
    updatePanel();
    showHint('Sketch düzlemi için bir <b>yüzeye tıklayın</b> &nbsp;|&nbsp; ESC: iptal', '#38a0fa');
    REN().domElement.addEventListener('pointerdown', onFacePick);
    document.addEventListener('keydown', onFaceEsc);
  }

  function onFaceEsc(e) { if (e.key==='Escape') abortFacePick(); }

  function abortFacePick() {
    _state = 'idle';
    REN().domElement.removeEventListener('pointerdown', onFacePick);
    document.removeEventListener('keydown', onFaceEsc);
    hideHint();
    updatePanel();
  }

  function onFacePick(e) {
    if (e.button !== 0) return;
    var dom  = REN().domElement;
    var rect = dom.getBoundingClientRect();
    var ndc  = {
      x:  ((e.clientX-rect.left)/rect.width)  *2-1,
      y: -((e.clientY-rect.top) /rect.height) *2+1
    };
    var rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, CAM());
    var meshes = [];
    S().traverse(function(obj){ if (obj.isMesh && obj.visible) meshes.push(obj); });
    var hits = rc.intersectObjects(meshes, false);
    if (!hits.length) return;

    var hit  = hits[0];
    var norm = hit.face.normal.clone()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .normalize();

    var up   = Math.abs(norm.y)<0.85 ? new THREE.Vector3(0,1,0) : new THREE.Vector3(1,0,0);
    var xAx  = new THREE.Vector3().crossVectors(up, norm).normalize();
    var yAx  = new THREE.Vector3().crossVectors(norm, xAx).normalize();

    _plane = {
      origin:     hit.point.clone(),
      normal:     norm,
      xAxis:      xAx,
      yAxis:      yAx,
      targetMesh: hit.object
    };

    REN().domElement.removeEventListener('pointerdown', onFacePick);
    document.removeEventListener('keydown', onFaceEsc);
    enterDraw();
  }

  // ─── ÇİZİM MODU ──────────────────────────────────────────────────────────

  function enterDraw() {
    _state  = 'drawing';
    _shapes = [];
    _curPts = [];
    _drag   = null;

    // Kamerayı kaydet
    var cam = CAM();
    _savedCam = { pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone() };

    // Kamerayı yüzey normeline hizala (sabit mesafe)
    var n = _plane.normal.clone();
    var o = _plane.origin.clone();
    _camTarget = o.clone();
    _camDist   = 20;   // sabit, OrbitControls mesafesinden bağımsız

    setCamToSketch();  // ilk yerleşim
    startCamLock();    // her frame kilitle

    buildSVG();
    renderGrid();
    renderShapes();
    updatePanel();
    showHint('R=Dikdörtgen &nbsp; C=Çember &nbsp; L=Çizgi &nbsp; P=Polygon &nbsp;|&nbsp; Enter / Çift tık: kapat &nbsp;|&nbsp; Ctrl+Z: geri al', '#506080');
  }

  // Kamerayı sketch düzlemine dik kilitle
  function setCamToSketch() {
    var cam = CAM();
    var n   = _plane.normal.clone();
    cam.position.copy(_camTarget.clone().addScaledVector(n, _camDist));
    cam.up.copy(_plane.yAxis);
    cam.lookAt(_camTarget);
    cam.updateMatrixWorld(true);
    if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
  }

  function startCamLock() {
    if (_camLockId) return;
    (function loop() {
      if (_state !== 'drawing') { _camLockId = null; return; }
      setCamToSketch();
      renderGrid();      // grid ekran değişince güncelle
      _camLockId = requestAnimationFrame(loop);
    })();
  }

  function stopCamLock() {
    if (_camLockId) { cancelAnimationFrame(_camLockId); _camLockId = null; }
  }

  function buildSVG() {
    if (_svgEl) _svgEl.remove();
    var dom = REN().domElement;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'sketch2d-svg';
    svg.style.cssText = 'position:fixed;left:0;top:0;width:'+dom.clientWidth+'px;height:'+dom.clientHeight+'px;z-index:300;pointer-events:all;cursor:crosshair;touch-action:none;';
    svg.addEventListener('pointermove',  onPtrMove);
    svg.addEventListener('pointerdown',  onPtrDown);
    svg.addEventListener('pointerup',    onPtrUp);
    svg.addEventListener('dblclick',     onDbl);
    svg.addEventListener('contextmenu',  onCtx);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(svg);
    _svgEl = svg;
  }

  // ─── 3D DÖNÜŞÜM ──────────────────────────────────────────────────────────
  // ÖNEMLİ: Three.js r108'de ExtrudeGeometry → THREE.Geometry döner.
  // .applyMatrix4() değil .applyMatrix() kullanılmalı!

  function makePlaneMatrix4() {
    // Sketch XY düzlemini dünya uzayına çeviren matris
    // Sütunlar: [xAxis | yAxis | normal | origin]
    var xa=_plane.xAxis, ya=_plane.yAxis, n=_plane.normal, o=_plane.origin;
    // THREE.Matrix4.set() satır-satır alır → doğru sütun yerleşimi:
    return new THREE.Matrix4().set(
      xa.x, ya.x, n.x, o.x,
      xa.y, ya.y, n.y, o.y,
      xa.z, ya.z, n.z, o.z,
         0,    0,   0,   1
    );
  }

  function applyOp(depth, mode) {
    if (!_shapes.length) { notify('Önce bir şekil çizin!','error'); return; }
    if (depth <= 0)       { notify('Derinlik 0\'dan büyük olmalı!','error'); return; }

    var pm  = makePlaneMatrix4();
    var mat = new THREE.MeshStandardMaterial({
      color:     mode==='cut' ? 0xe05a2b : 0x4a8fd0,
      metalness: 0.2, roughness: 0.55
    });

    var ok = 0;
    _shapes.forEach(function(shape) {
      try {
        var geo = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, steps: 1 });

        // CUT: aracı yüzeyin biraz gerisine kaydır → solid içinden başlasın
        if (mode === 'cut') {
          geo.translate(0, 0, -depth * 0.05);  // Z yönünde (normal yönü) geri kaydır
        }

        // ── r108 FIX: ExtrudeGeometry → THREE.Geometry → .applyMatrix() ──
        geo.applyMatrix(pm);
        geo.computeFaceNormals();
        geo.computeVertexNormals();

        if (mode === 'cut') {
          doCut(geo, mat.clone());
        } else {
          addMesh(geo, mat.clone(), 'Extrude_'+Date.now());
        }
        ok++;
      } catch(err) {
        console.error('[Sketch2D] Dönüşüm hatası:', err);
        notify('Hata: '+err.message, 'error');
      }
    });

    if (ok > 0) {
      try { if (typeof global.updateSceneTotals === 'function') global.updateSceneTotals(); } catch(e){}
      finish();
    }
  }

  function doCut(cutGeo, mat) {
    var target = _plane.targetMesh;
    var BSP    = global.ThreeBSP;

    if (!BSP || !target) {
      // ThreeBSP yoksa bağımsız mesh olarak ekle
      addMesh(cutGeo, mat, 'CutTool_'+Date.now());
      notify('ThreeBSP yok — kesme aracı bağımsız eklendi', 'warning');
      return;
    }

    try {
      // target matrisini geometriye uygula (BSP dünya uzayında çalışır)
      var tGeo = target.geometry.clone();
      // target BufferGeometry olabilir (r108 bazı nesneleri buffer olarak saklar)
      if (tGeo.isBufferGeometry) {
        tGeo = new THREE.Geometry().fromBufferGeometry(tGeo);
      }
      tGeo.applyMatrix(target.matrixWorld);

      var tMat  = Array.isArray(target.material) ? target.material[0].clone() : target.material.clone();
      var tMesh = new THREE.Mesh(tGeo, tMat);
      tMesh.name = target.name;

      var cutMesh = new THREE.Mesh(cutGeo, mat);

      var bspA   = new BSP(tMesh);
      var bspB   = new BSP(cutMesh);
      var result = bspA.subtract(bspB).toMesh(tMat);
      result.geometry.computeFaceNormals();
      result.geometry.computeVertexNormals();
      result.name          = (target.name||'Part')+'_cut';
      result.castShadow    = result.receiveShadow = true;

      S().remove(target);
      // window.objects'tan da çıkar
      if (global.objects) {
        var idx = global.objects.indexOf(target);
        if (idx !== -1) global.objects.splice(idx, 1);
      }

      addMesh(result.geometry, result.material, result.name);
    } catch(err) {
      console.warn('[Sketch2D] CSG başarısız, bağımsız mesh:', err);
      addMesh(cutGeo, mat, 'CutTool_'+Date.now());
    }
  }

  function addMesh(geo, mat, name) {
    var mesh         = new THREE.Mesh(geo, mat);
    mesh.name        = name;
    mesh.castShadow  = mesh.receiveShadow = true;
    S().add(mesh);

    // window.objects dizisine ekle — model ağacı için
    if (global.objects) global.objects.push(mesh);

    // Model ağacını güncelle (eğer fonksiyon global scope'ta erişilebilirse)
    try { if (typeof updateModelTree    === 'function') updateModelTree(); }       catch(e){}
    try { if (typeof addMeshToTree      === 'function') addMeshToTree(mesh); }     catch(e){}
    try { if (typeof updateSceneTotals  === 'function') updateSceneTotals(); }     catch(e){}
    try { if (typeof global.updateSceneTotals === 'function') global.updateSceneTotals(); } catch(e){}
  }

  // ─── BİTİR / İPTAL ────────────────────────────────────────────────────────

  function finish() { cleanup(); notify('Sketch tamamlandı ✓','success'); }
  function cancel() { cleanup(); }

  function cleanup() {
    stopCamLock();
    _state  = 'idle'; _shapes=[]; _curPts=[]; _drag=null; _plane=null;
    if (_svgEl) { _svgEl.remove(); _svgEl=null; }
    document.removeEventListener('keydown', onKey);
    if (_savedCam) {
      var cam=CAM();
      cam.position.copy(_savedCam.pos);
      cam.quaternion.copy(_savedCam.quat);
      cam.up.copy(_savedCam.up);
      if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
      _savedCam=null;
    }
    updatePanel(); hideHint();
  }

  // ─── PANEL UI ─────────────────────────────────────────────────────────────

  function buildUI() {
    if (!document.getElementById('sk2d-panel')) {
      injectCSS();
      var div = document.createElement('div');
      div.id  = 'sk2d-panel';
      div.innerHTML = PANEL_HTML;
      document.body.appendChild(div);
    }
    _panelEl = document.getElementById('sk2d-panel');
    _dimEl   = document.getElementById('sk2d-dim');
  }

  function updatePanel() {
    if (!_panelEl) return;
    var badge = document.getElementById('sk2d-badge');
    if (badge) badge.textContent = {idle:'Hazır','face-pick':'Seçim',drawing:'Çizim'}[_state]||_state;
    function show(id,v){ var e=document.getElementById(id); if(e) e.style.display=v?'':'none'; }
    show('sk2d-sec-activate',  _state==='idle');
    show('sk2d-sec-tools',     _state==='drawing');
    show('sk2d-sec-ops',       _state==='drawing');
    show('sk2d-sec-cancel',    _state!=='idle');
  }

  function setBadge(msg) {
    var el=document.getElementById('sk2d-badge'); if(el) el.textContent=msg;
  }

  // ─── HİNT ÇUBUĞU ─────────────────────────────────────────────────────────

  function showHint(msg, color) {
    if (!_hintEl) {
      _hintEl = document.createElement('div');
      _hintEl.id = 'sk2d-hint';
      document.body.appendChild(_hintEl);
    }
    _hintEl.innerHTML = msg;
    _hintEl.style.color   = color||'#888';
    _hintEl.style.opacity = '1';
  }

  function hideHint() { if(_hintEl) _hintEl.style.opacity='0'; }

  function notify(msg, type) {
    try { if (typeof showNotification==='function') { showNotification(msg, type); return; } } catch(e){}
    showHint(msg, type==='success'?'#38fa80':type==='error'?'#e05a2b':'#aaa');
    setTimeout(hideHint, 2500);
  }

  // ─── PANEL HTML ───────────────────────────────────────────────────────────

  var PANEL_HTML =
    '<div class="sk2d-head">'+
      '<span class="sk2d-title">✏ SKETCH</span>'+
      '<span id="sk2d-badge" class="sk2d-badge">Hazır</span>'+
    '</div>'+
    '<div class="sk2d-sec" id="sk2d-sec-activate">'+
      '<button class="sk2d-btn sk2d-blue" onclick="Sketch2D.activate()">'+
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'+
        ' YÜZEY SEÇ</button>'+
      '<div class="sk2d-hint-sm">Bir yüzeye tıkla → sketch düzlemi oluştur</div>'+
    '</div>'+
    '<div class="sk2d-sec" id="sk2d-sec-tools" style="display:none">'+
      '<div class="sk2d-lbl">ÇİZİM ARAÇLARI</div>'+
      '<div class="sk2d-toolrow">'+
        '<button class="sk2d-tool active" data-tool="rect"    onclick="Sketch2D.setTool(\'rect\')"    title="Dikdörtgen [R]">▭</button>'+
        '<button class="sk2d-tool"        data-tool="circle"  onclick="Sketch2D.setTool(\'circle\')"  title="Çember [C]">◯</button>'+
        '<button class="sk2d-tool"        data-tool="line"    onclick="Sketch2D.setTool(\'line\')"    title="Çizgi [L]">╱</button>'+
        '<button class="sk2d-tool"        data-tool="polygon" onclick="Sketch2D.setTool(\'polygon\')" title="Polygon [P]">⬠</button>'+
      '</div>'+
      '<div id="sk2d-dim" class="sk2d-dim">0.000,  0.000</div>'+
      '<div class="sk2d-shortcut">Çift tık / Enter → kapat &nbsp;│&nbsp; Ctrl+Z → geri al<br>Sağ tık → iptal / kapat</div>'+
    '</div>'+
    '<div class="sk2d-sec" id="sk2d-sec-ops" style="display:none">'+
      '<div class="sk2d-lbl">3D DÖNÜŞÜM</div>'+
      '<div class="sk2d-field">'+
        '<label>DERİNLİK</label>'+
        '<div style="display:flex;align-items:center;gap:6px">'+
          '<input type="number" id="sk2d-depth" value="5" min="0.001" step="0.5" class="sk2d-input">'+
          '<span style="font-size:9px;color:#404570;">birim</span>'+
        '</div>'+
      '</div>'+
      '<div class="sk2d-oprow">'+
        '<button class="sk2d-btn sk2d-blue" onclick="Sketch2D.extrude()">▲ EXTRUDE</button>'+
        '<button class="sk2d-btn sk2d-red"  onclick="Sketch2D.cut()">▼ CUT</button>'+
      '</div>'+
    '</div>'+
    '<div class="sk2d-sec" id="sk2d-sec-cancel" style="display:none">'+
      '<button class="sk2d-btn sk2d-ghost" onclick="Sketch2D.cancel()">✕ İptal / Kapat</button>'+
    '</div>';

  // ─── CSS ──────────────────────────────────────────────────────────────────

  function injectCSS() {
    if (document.getElementById('sk2d-css')) return;
    var s=document.createElement('style'); s.id='sk2d-css';
    s.textContent=
      '#sk2d-panel{position:fixed;left:12px;top:50%;transform:translateY(-50%);width:198px;background:#111425;border:1px solid #232845;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.7);z-index:500;font-family:"Inter",system-ui,sans-serif;overflow:hidden;user-select:none;}'+
      '.sk2d-head{display:flex;justify-content:space-between;align-items:center;padding:10px 13px 9px;background:#0d1020;border-bottom:1px solid #1c2038;}'+
      '.sk2d-title{font-size:10px;font-weight:800;letter-spacing:2px;color:#a0a8cc;}'+
      '.sk2d-badge{font-size:9px;font-weight:700;letter-spacing:.5px;color:#38a0fa;background:#091830;border:1px solid #143060;border-radius:20px;padding:2px 9px;text-transform:uppercase;}'+
      '.sk2d-sec{padding:10px 12px;border-bottom:1px solid #181c30;}.sk2d-sec:last-child{border:none;}'+
      '.sk2d-lbl{font-size:9px;letter-spacing:1.5px;color:#363a5a;font-weight:800;margin-bottom:8px;display:block;}'+
      '.sk2d-toolrow{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;}'+
      '.sk2d-tool{height:36px;display:flex;align-items:center;justify-content:center;background:#191e38;border:1px solid #262c48;border-radius:7px;color:#404870;cursor:pointer;font-size:16px;transition:all .13s;}'+
      '.sk2d-tool:hover{background:#222848;color:#7080a8;border-color:#3c4468;}'+
      '.sk2d-tool.active{background:#0a1e48;border-color:#38a0fa;color:#38a0fa;}'+
      '.sk2d-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px 8px;border-radius:7px;font-size:11px;font-weight:800;cursor:pointer;letter-spacing:.5px;transition:all .13s;box-sizing:border-box;}'+
      '.sk2d-blue{background:#09193e;border:1px solid #38a0fa;color:#38a0fa;}.sk2d-blue:hover{background:#38a0fa;color:#fff;}'+
      '.sk2d-red{background:#1e0a0a;border:1px solid #e05a2b;color:#e05a2b;}.sk2d-red:hover{background:#e05a2b;color:#fff;}'+
      '.sk2d-ghost{background:transparent;border:1px solid #262c48;color:#404060;}.sk2d-ghost:hover{border-color:#e05a2b;color:#e05a2b;}'+
      '.sk2d-oprow{display:flex;gap:5px;margin-top:6px;}.sk2d-oprow .sk2d-btn{flex:1;}'+
      '.sk2d-field{margin-bottom:5px;}.sk2d-field label{font-size:9px;color:#363a5a;display:block;margin-bottom:4px;letter-spacing:.5px;}'+
      '.sk2d-input{width:100%;padding:6px 8px;box-sizing:border-box;background:#181c38;border:1px solid #262c48;border-radius:6px;color:#b0b8d8;font-size:11px;font-family:monospace;}.sk2d-input:focus{outline:none;border-color:#38a0fa;}'+
      '.sk2d-dim{font-family:"Fira Mono","JetBrains Mono",monospace;font-size:10px;color:#38a0fa;text-align:center;background:#080c1e;border:1px solid #141830;border-radius:5px;padding:4px 8px;margin-bottom:6px;letter-spacing:.5px;}'+
      '.sk2d-shortcut{font-size:9px;color:#252848;text-align:center;line-height:1.6;}'+
      '.sk2d-hint-sm{font-size:9px;color:#303452;text-align:center;margin-top:6px;line-height:1.5;}'+
      '#sk2d-hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:rgba(8,10,22,.94);border:1px solid #1c2038;border-radius:24px;padding:7px 22px;font-size:11px;letter-spacing:.2px;z-index:600;pointer-events:none;transition:opacity .25s;backdrop-filter:blur(14px);font-family:system-ui,sans-serif;white-space:nowrap;}';
    document.head.appendChild(s);
  }

  // ─── GLOBAL API ───────────────────────────────────────────────────────────

  var API = {
    activate: function() {
      if (_state !== 'idle') return;
      buildUI();
      enterFacePick();
    },

    setTool: function(t) {
      _tool=t; _curPts=[]; _drag=null; svgClear('sk2d-prev');
      document.querySelectorAll('.sk2d-tool').forEach(function(b){
        b.classList.toggle('active', b.dataset.tool===t);
      });
    },

    extrude: function() {
      var d=parseFloat((document.getElementById('sk2d-depth')||{}).value||'5');
      applyOp(isNaN(d)?5:d, 'extrude');
    },

    cut: function() {
      var d=parseFloat((document.getElementById('sk2d-depth')||{}).value||'5');
      applyOp(isNaN(d)?5:d, 'cut');
    },

    cancel: function() {
      if (_state==='face-pick') abortFacePick();
      else if (_state==='drawing') cancel();
    },

    get state() { return _state; }
  };

  global.Sketch2D = API;
  console.log('[Sketch2D] v2 yüklendi — r108 uyumlu');

})(window);
