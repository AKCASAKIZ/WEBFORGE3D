/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  Sketch2D  —  Professional 2D Sketcher for WebForge3D PRO          ║
 * ║  CATIA / Fusion 360 tarzı yüzey-bazlı 2D → 3D iş akışı            ║
 * ║                                                                      ║
 * ║  Kullanım:                                                           ║
 * ║    Sketch2D.activate()  → yüzey seç moduna gir                      ║
 * ║    Sketch2D.setTool(t)  → 'rect' | 'circle' | 'line' | 'polygon'   ║
 * ║    Sketch2D.extrude()   → seçili şekli solid olarak uzat            ║
 * ║    Sketch2D.cut()       → seçili yüzeyden çıkar (CSG)              ║
 * ║    Sketch2D.cancel()    → sketch'i iptal et                         ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════

  var GRID_MAJOR = 1.0;     // Büyük grid aralığı (world unit)
  var GRID_SUB   = 5;       // Minor bölünme sayısı
  var SNAP_PX    = 12;      // Endpoint snap piksel yarıçapı

  // ═══════════════════════════════════════════════════════════════════
  // MODÜL STATE
  // ═══════════════════════════════════════════════════════════════════

  var _state   = 'idle';    // idle | face-pick | drawing
  var _tool    = 'rect';    // rect | circle | line | polygon
  var _plane   = null;      // Sketch düzlemi tanımlayıcısı
  var _shapes  = [];        // Tamamlanan THREE.Shape[]
  var _curPts  = [];        // Çizilmekte olan nokta dizisi [{x,y}]
  var _drag    = null;      // Sürükleme durumu { start:{x,y} }
  var _svgEl   = null;      // SVG overlay elementi
  var _panelEl = null;      // Yan panel elementi
  var _dimEl   = null;      // Boyut gösterge elementi
  var _savedCam = null;     // Kaydedilmiş kamera durumu

  // ═══════════════════════════════════════════════════════════════════
  // THREE.JS ERİŞİM YARDIMCILARI
  // ═══════════════════════════════════════════════════════════════════

  function getScene()    { return global.scene; }
  function getCamera()   { return global.camera; }
  function getRenderer() { return global.renderer; }

  // ═══════════════════════════════════════════════════════════════════
  // KOORDİNAT DÖNÜŞÜM
  // ═══════════════════════════════════════════════════════════════════

  /** Ekran pikseli → Sketch düzlemi 2D noktası */
  function screenToSketch(clientX, clientY) {
    if (!_plane) return null;
    var dom  = getRenderer().domElement;
    var rect = dom.getBoundingClientRect();
    var ndc  = {
      x:  ((clientX - rect.left) / rect.width)  * 2 - 1,
      y: -((clientY - rect.top)  / rect.height) * 2 + 1
    };
    var rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, getCamera());
    var plane3 = new THREE.Plane().setFromNormalAndCoplanarPoint(_plane.normal, _plane.origin);
    var hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(plane3, hit)) return null;
    var local = hit.clone().sub(_plane.origin);
    return { x: local.dot(_plane.xAxis), y: local.dot(_plane.yAxis) };
  }

  /** Sketch 2D → Dünya 3D */
  function sketchToWorld(sx, sy) {
    return _plane.origin.clone()
      .addScaledVector(_plane.xAxis, sx)
      .addScaledVector(_plane.yAxis, sy);
  }

  /** Dünya 3D → Ekran pikseli */
  function worldToScreen(v3) {
    var dom  = getRenderer().domElement;
    var proj = v3.clone().project(getCamera());
    return {
      x: ( proj.x + 1) * 0.5 * dom.clientWidth,
      y: (-proj.y + 1) * 0.5 * dom.clientHeight
    };
  }

  /** Sketch 2D → Ekran pikseli */
  function sketchToScreen(sx, sy) {
    return worldToScreen(sketchToWorld(sx, sy));
  }

  /** Grid snap */
  function snapGrid(pt) {
    if (!pt) return pt;
    var step = GRID_MAJOR / GRID_SUB;
    return { x: Math.round(pt.x / step) * step, y: Math.round(pt.y / step) * step };
  }

  /** Nokta snap (endpoint + closing snap) */
  function snapFull(pt, screenX, screenY) {
    if (!pt) return pt;

    // Tamamlanmış şekillerin uç noktalarına snap
    for (var i = 0; i < _shapes.length; i++) {
      var pts = _shapes[i]._pts;
      if (!pts) continue;
      for (var j = 0; j < pts.length; j++) {
        var s = sketchToScreen(pts[j].x, pts[j].y);
        if (Math.hypot(s.x - screenX, s.y - screenY) < SNAP_PX) {
          return { x: pts[j].x, y: pts[j].y, snapped: true };
        }
      }
    }

    // Aktif poligonun başlangıç noktasına kapanma snap'i
    if (_curPts.length >= 2) {
      var fp  = _curPts[0];
      var fs  = sketchToScreen(fp.x, fp.y);
      if (Math.hypot(fs.x - screenX, fs.y - screenY) < SNAP_PX) {
        return { x: fp.x, y: fp.y, snapped: true, closing: true };
      }
    }

    var snapped = snapGrid(pt);
    snapped.snapped = false;
    return snapped;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SVG YARDIMCILARI
  // ═══════════════════════════════════════════════════════════════════

  function svgMake(tag, attrs, parent) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }

  function svgClear(cls) {
    if (_svgEl) _svgEl.querySelectorAll('.' + cls).forEach(function(e) { e.remove(); });
  }

  // ═══════════════════════════════════════════════════════════════════
  // GRID ÇİZİMİ
  // ═══════════════════════════════════════════════════════════════════

  function renderGrid() {
    svgClear('sk2d-grid');
    if (!_svgEl || !_plane) return;

    var dom = getRenderer().domElement;
    var W = dom.clientWidth, H = dom.clientHeight;

    // Görünen alanın sketch koordinatlarını bul
    var corners = [
      screenToSketch(0, 0), screenToSketch(W, 0),
      screenToSketch(0, H), screenToSketch(W, H)
    ].filter(Boolean);
    if (corners.length < 4) return;

    var pad  = GRID_MAJOR * 2;
    var minX = Math.min.apply(null, corners.map(function(c) { return c.x; })) - pad;
    var maxX = Math.max.apply(null, corners.map(function(c) { return c.x; })) + pad;
    var minY = Math.min.apply(null, corners.map(function(c) { return c.y; })) - pad;
    var maxY = Math.max.apply(null, corners.map(function(c) { return c.y; })) + pad;

    var g = svgMake('g', null, null);
    g.classList.add('sk2d-grid');

    var step = GRID_MAJOR / GRID_SUB;

    function drawLine(x0, y0, x1, y1, major) {
      var a = sketchToScreen(x0, y0);
      var b = sketchToScreen(x1, y1);
      svgMake('line', {
        x1: a.x.toFixed(1), y1: a.y.toFixed(1),
        x2: b.x.toFixed(1), y2: b.y.toFixed(1),
        stroke: major ? '#2a304e' : '#1a1e34',
        'stroke-width': major ? '0.7' : '0.35'
      }, g);
    }

    var xs = Math.floor(minX / step) * step;
    for (var x = xs; x <= maxX; x += step) {
      var mx = Math.abs(Math.round(x / GRID_MAJOR) * GRID_MAJOR - x) < step * 0.05;
      drawLine(x, minY, x, maxY, mx);
    }
    var ys = Math.floor(minY / step) * step;
    for (var y = ys; y <= maxY; y += step) {
      var my = Math.abs(Math.round(y / GRID_MAJOR) * GRID_MAJOR - y) < step * 0.05;
      drawLine(minX, y, maxX, y, my);
    }

    // Orijin eksenleri (kırmızı = X, yeşil = Y)
    var o1 = sketchToScreen(0, minY), o2 = sketchToScreen(0, maxY);
    var p1 = sketchToScreen(minX, 0), p2 = sketchToScreen(maxX, 0);
    svgMake('line', { x1:o1.x, y1:o1.y, x2:o2.x, y2:o2.y, stroke:'#cc4422', 'stroke-width':'1.2', opacity:'0.65' }, g);
    svgMake('line', { x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, stroke:'#226644', 'stroke-width':'1.2', opacity:'0.65' }, g);

    // Orijin noktası
    var oc = sketchToScreen(0, 0);
    svgMake('circle', { cx: oc.x, cy: oc.y, r: '3', fill: '#4a6080' }, g);

    _svgEl.insertBefore(g, _svgEl.firstChild);
  }

  // ═══════════════════════════════════════════════════════════════════
  // TAMAMLANAN ŞEKİLLERİN ÇİZİMİ
  // ═══════════════════════════════════════════════════════════════════

  function renderShapes() {
    svgClear('sk2d-shape');
    if (!_svgEl) return;

    _shapes.forEach(function(sh) {
      var g = svgMake('g', null, _svgEl);
      g.classList.add('sk2d-shape');

      if (sh._isCircle) {
        var c  = sketchToScreen(sh._cx, sh._cy);
        var ep = sketchToScreen(sh._cx + sh._r, sh._cy);
        var r  = Math.hypot(ep.x - c.x, ep.y - c.y);
        svgMake('circle', {
          cx: c.x.toFixed(1), cy: c.y.toFixed(1), r: r.toFixed(1),
          fill: 'rgba(56,160,250,0.08)', stroke: '#38a0fa', 'stroke-width': '1.5'
        }, g);
        // Merkez artı işareti
        svgMake('line', { x1: c.x-7, y1: c.y, x2: c.x+7, y2: c.y, stroke: '#38a0fa', 'stroke-width': '0.9' }, g);
        svgMake('line', { x1: c.x, y1: c.y-7, x2: c.x, y2: c.y+7, stroke: '#38a0fa', 'stroke-width': '0.9' }, g);
      } else {
        var pts = sh._pts;
        if (!pts || pts.length < 2) return;
        var spts = pts.map(function(p) { return sketchToScreen(p.x, p.y); });
        var d    = spts.map(function(p, i) {
          return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1);
        }).join(' ') + ' Z';
        svgMake('path', {
          d: d, fill: 'rgba(56,160,250,0.07)',
          stroke: '#38a0fa', 'stroke-width': '1.5', 'stroke-linejoin': 'round'
        }, g);
        spts.forEach(function(sp) {
          svgMake('circle', { cx: sp.x.toFixed(1), cy: sp.y.toFixed(1), r: '3', fill: '#38a0fa' }, g);
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÖNZLEME ÇİZİMİ (Çizim sırasında anlık)
  // ═══════════════════════════════════════════════════════════════════

  function renderPreview(curPt) {
    svgClear('sk2d-prev');
    if (!curPt || !_svgEl) return;

    var g    = svgMake('g', null, _svgEl);
    g.classList.add('sk2d-prev');
    var DASH = '5,3';
    var COL  = '#38a0fa';

    if ((_tool === 'line' || _tool === 'polygon') && _curPts.length > 0) {
      var all = _curPts.concat([curPt]);
      for (var i = 0; i < all.length - 1; i++) {
        var a = sketchToScreen(all[i].x, all[i].y);
        var b = sketchToScreen(all[i+1].x, all[i+1].y);
        svgMake('line', { x1:a.x,y1:a.y,x2:b.x,y2:b.y, stroke:COL,'stroke-width':'1.5','stroke-dasharray':DASH }, g);
      }
      // Kapanma çizgisi
      if (_tool === 'polygon' && _curPts.length >= 2) {
        var lp = sketchToScreen(curPt.x, curPt.y);
        var fp = sketchToScreen(_curPts[0].x, _curPts[0].y);
        svgMake('line', { x1:lp.x,y1:lp.y,x2:fp.x,y2:fp.y, stroke:COL+'44','stroke-width':'1','stroke-dasharray':'3,3' }, g);
      }
    } else if (_tool === 'rect' && _drag) {
      var sa = sketchToScreen(_drag.start.x, _drag.start.y);
      var sb = sketchToScreen(curPt.x, curPt.y);
      svgMake('rect', {
        x: Math.min(sa.x,sb.x), y: Math.min(sa.y,sb.y),
        width: Math.abs(sb.x-sa.x), height: Math.abs(sb.y-sa.y),
        fill: 'rgba(56,160,250,0.07)', stroke: COL, 'stroke-width': '1.5', 'stroke-dasharray': DASH
      }, g);
    } else if (_tool === 'circle' && _drag) {
      var cc  = sketchToScreen(_drag.start.x, _drag.start.y);
      var cep = sketchToScreen(curPt.x, curPt.y);
      var cr  = Math.hypot(cep.x - cc.x, cep.y - cc.y);
      svgMake('circle', { cx:cc.x,cy:cc.y,r:cr.toFixed(1), fill:'rgba(56,160,250,0.07)',stroke:COL,'stroke-width':'1.5','stroke-dasharray':DASH }, g);
      svgMake('line',   { x1:cc.x,y1:cc.y,x2:cep.x,y2:cep.y, stroke:COL,'stroke-width':'0.8','stroke-dasharray':'3,2' }, g);
    }

    // İmleç göstergesi
    var sc = sketchToScreen(curPt.x, curPt.y);
    svgMake('circle', { cx:sc.x,cy:sc.y,r:'5', fill:'none', stroke:COL,'stroke-width':'1.5' }, g);
    svgMake('circle', { cx:sc.x,cy:sc.y,r:'1.5', fill:COL }, g);

    // Snap göstergesi (yeşil halka)
    if (curPt.snapped) {
      svgMake('circle', { cx:sc.x,cy:sc.y,r:'9', fill:'none', stroke:'#38fa80','stroke-width':'1.5' }, g);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FARE / KLAVYE OLAYI YÖNETİCİLERİ
  // ═══════════════════════════════════════════════════════════════════

  function getPt(e) {
    var raw = screenToSketch(e.clientX, e.clientY);
    return raw ? snapFull(raw, e.clientX, e.clientY) : null;
  }

  function onPointerMove(e) {
    var pt = getPt(e);
    renderPreview(pt);
    updateDim(pt);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    var pt = getPt(e);
    if (!pt) return;

    if (_tool === 'rect' || _tool === 'circle') {
      _drag = { start: { x: pt.x, y: pt.y } };
    } else if (_tool === 'line' || _tool === 'polygon') {
      if (pt.closing && _curPts.length >= 2) { commitPoly(); return; }
      _curPts.push({ x: pt.x, y: pt.y });
    }
  }

  function onPointerUp(e) {
    if (e.button !== 0 || !_drag) return;
    var pt = getPt(e);
    if (!pt) { _drag = null; return; }

    if (_tool === 'rect') {
      var x0 = _drag.start.x, y0 = _drag.start.y, x1 = pt.x, y1 = pt.y;
      if (Math.abs(x1-x0) > 0.001 && Math.abs(y1-y0) > 0.001) {
        var sh = new THREE.Shape();
        sh.moveTo(x0,y0); sh.lineTo(x1,y0); sh.lineTo(x1,y1); sh.lineTo(x0,y1); sh.closePath();
        sh._pts = [{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
        _shapes.push(sh);
        renderShapes();
        updateStatus('▭ ' + Math.abs(x1-x0).toFixed(2) + ' × ' + Math.abs(y1-y0).toFixed(2));
      }
    } else if (_tool === 'circle') {
      var cx = _drag.start.x, cy = _drag.start.y;
      var r  = Math.hypot(pt.x - cx, pt.y - cy);
      if (r > 0.001) {
        var cs = new THREE.Shape();
        cs.absarc(cx, cy, r, 0, Math.PI * 2, false);
        cs._isCircle = true; cs._cx = cx; cs._cy = cy; cs._r = r;
        cs._pts = [];
        for (var i = 0; i < 64; i++) {
          var a = (i / 64) * Math.PI * 2;
          cs._pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        _shapes.push(cs);
        renderShapes();
        updateStatus('○ r = ' + r.toFixed(3));
      }
    }
    _drag = null;
  }

  function onDblClick(e) {
    if (_tool === 'line'    && _curPts.length >= 2) commitPoly();
    if (_tool === 'polygon' && _curPts.length >= 3) commitPoly();
  }

  function onCtxMenu(e) {
    e.preventDefault();
    if (_curPts.length >= (_tool === 'line' ? 2 : 3)) commitPoly();
    else { _curPts = []; _drag = null; svgClear('sk2d-prev'); }
  }

  function onKeyDown(e) {
    if (_state !== 'drawing') return;

    if (e.key === 'Escape') {
      _curPts = []; _drag = null; svgClear('sk2d-prev');
    } else if (e.key === 'Enter') {
      if (_tool === 'line'    && _curPts.length >= 2) commitPoly();
      if (_tool === 'polygon' && _curPts.length >= 3) commitPoly();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (_shapes.length) { _shapes.pop(); renderShapes(); }
    }

    // Araç kısayolları
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      var map = { r:'rect', c:'circle', l:'line', p:'polygon' };
      if (map[e.key.toLowerCase()]) API.setTool(map[e.key.toLowerCase()]);
    }
  }

  function commitPoly() {
    if (_curPts.length < 2) return;
    var sh = new THREE.Shape();
    sh.moveTo(_curPts[0].x, _curPts[0].y);
    for (var i = 1; i < _curPts.length; i++) sh.lineTo(_curPts[i].x, _curPts[i].y);
    sh.closePath();
    sh._pts = _curPts.slice();
    _shapes.push(sh);
    _curPts = [];
    svgClear('sk2d-prev');
    renderShapes();
    updateStatus('Profil kapatıldı (' + sh._pts.length + ' nokta)');
  }

  // ═══════════════════════════════════════════════════════════════════
  // BOYUT GÖSTERGE
  // ═══════════════════════════════════════════════════════════════════

  function updateDim(pt) {
    if (!_dimEl || !pt) return;
    var txt = '';
    if (_drag) {
      if (_tool === 'circle') {
        txt = 'r = ' + Math.hypot(pt.x - _drag.start.x, pt.y - _drag.start.y).toFixed(3);
      } else {
        txt = Math.abs(pt.x - _drag.start.x).toFixed(3) + ' × ' + Math.abs(pt.y - _drag.start.y).toFixed(3);
      }
    } else if (_curPts.length > 0) {
      var lp = _curPts[_curPts.length - 1];
      txt = 'L = ' + Math.hypot(pt.x - lp.x, pt.y - lp.y).toFixed(3);
    } else {
      txt = pt.x.toFixed(3) + ',  ' + pt.y.toFixed(3);
    }
    _dimEl.textContent = txt;
  }

  // ═══════════════════════════════════════════════════════════════════
  // YÜZEY SEÇİM MODU
  // ═══════════════════════════════════════════════════════════════════

  function enterFacePickMode() {
    _state = 'face-pick';
    updatePanel();
    showHint('Sketch başlatmak için bir <b>yüzeye tıklayın</b> &nbsp;|&nbsp; ESC: iptal', '#38a0fa');
    getRenderer().domElement.addEventListener('pointerdown', onFacePick);
    document.addEventListener('keydown', onFacePickEsc);
  }

  function onFacePickEsc(e) { if (e.key === 'Escape') abortFacePick(); }

  function abortFacePick() {
    _state = 'idle';
    getRenderer().domElement.removeEventListener('pointerdown', onFacePick);
    document.removeEventListener('keydown', onFacePickEsc);
    hideHint();
    updatePanel();
  }

  function onFacePick(e) {
    if (e.button !== 0) return;
    var dom  = getRenderer().domElement;
    var rect = dom.getBoundingClientRect();
    var ndc  = {
      x:  ((e.clientX - rect.left) / rect.width)  * 2 - 1,
      y: -((e.clientY - rect.top)  / rect.height) * 2 + 1
    };
    var rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, getCamera());

    var meshes = [];
    getScene().traverse(function(obj) { if (obj.isMesh && obj.visible) meshes.push(obj); });
    var hits = rc.intersectObjects(meshes, false);
    if (!hits.length) return;

    var hit  = hits[0];
    var norm = hit.face.normal.clone()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      .normalize();

    // Ortogonal bazis oluştur
    var worldUp = Math.abs(norm.y) < 0.85
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    var xAxis = new THREE.Vector3().crossVectors(worldUp, norm).normalize();
    var yAxis = new THREE.Vector3().crossVectors(norm, xAxis).normalize();

    _plane = {
      origin:     hit.point.clone(),
      normal:     norm,
      xAxis:      xAxis,
      yAxis:      yAxis,
      targetMesh: hit.object
    };

    getRenderer().domElement.removeEventListener('pointerdown', onFacePick);
    document.removeEventListener('keydown', onFacePickEsc);
    enterDrawMode();
  }

  // ═══════════════════════════════════════════════════════════════════
  // ÇİZİM MODU
  // ═══════════════════════════════════════════════════════════════════

  function enterDrawMode() {
    _state  = 'drawing';
    _shapes = [];
    _curPts = [];
    _drag   = null;

    // Kamerayı kaydet
    var cam = getCamera();
    _savedCam = {
      pos:  cam.position.clone(),
      quat: cam.quaternion.clone(),
      up:   cam.up.clone()
    };

    // Kamerayı yüzey normeline hizala
    alignCamera();

    // SVG overlay oluştur (OrbitControls'ü doğal olarak engeller)
    buildSVG();
    renderGrid();
    renderShapes();
    updatePanel();
    showHint('R=Dikdörtgen &nbsp; C=Çember &nbsp; L=Çizgi &nbsp; P=Polygon &nbsp;|&nbsp; Enter/Çift tık: kapat &nbsp;|&nbsp; Ctrl+Z: geri al', '#666');
  }

  function alignCamera() {
    var cam  = getCamera();
    var n    = _plane.normal.clone();
    var o    = _plane.origin.clone();
    var dist = Math.max(cam.position.distanceTo(o), 15);

    cam.position.copy(o.clone().addScaledVector(n, dist));
    cam.up.copy(_plane.yAxis);
    cam.lookAt(o);
    if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
  }

  function buildSVG() {
    if (_svgEl) _svgEl.remove();
    var dom = getRenderer().domElement;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'sketch2d-svg';
    svg.style.cssText = [
      'position:fixed', 'left:0', 'top:0',
      'width:' + dom.clientWidth  + 'px',
      'height:' + dom.clientHeight + 'px',
      'z-index:300', 'pointer-events:all',
      'cursor:crosshair', 'touch-action:none', 'outline:none'
    ].join(';');

    svg.addEventListener('pointermove',  onPointerMove);
    svg.addEventListener('pointerdown',  onPointerDown);
    svg.addEventListener('pointerup',    onPointerUp);
    svg.addEventListener('dblclick',     onDblClick);
    svg.addEventListener('contextmenu',  onCtxMenu);
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(svg);
    _svgEl = svg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3D DÖNÜŞÜM — EXTRUDE & CUT
  // ═══════════════════════════════════════════════════════════════════

  function applyOp(depth, mode) {
    if (!_shapes.length) { notify('Önce bir şekil çizin!', 'error'); return; }
    if (depth <= 0) { notify('Derinlik 0\'dan büyük olmalı!', 'error'); return; }

    // Sketch koordinat sistemini dünya uzayına çeviren matris
    var xa = _plane.xAxis, ya = _plane.yAxis, n = _plane.normal, o = _plane.origin;
    var planeMatrix = new THREE.Matrix4().set(
      xa.x, ya.x, n.x, o.x,
      xa.y, ya.y, n.y, o.y,
      xa.z, ya.z, n.z, o.z,
         0,    0,   0,   1
    );

    var mat = new THREE.MeshStandardMaterial({
      color:     mode === 'cut' ? 0xe05a2b : 0x4a8fd0,
      metalness: 0.2,
      roughness: 0.55
    });

    for (var i = 0; i < _shapes.length; i++) {
      var shape = _shapes[i];
      var geo   = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false, steps: 1 });

      // CUT: yüzeyin biraz gerisinden başlasın, solid'in içine geçsin
      if (mode === 'cut') {
        geo.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -depth * 0.1));
      }

      geo.applyMatrix4(planeMatrix);
      geo.computeVertexNormals();

      if (mode === 'cut' && _plane.targetMesh && typeof global.ThreeBSP !== 'undefined') {
        performCSGCut(geo, mat);
      } else {
        addSolidMesh(geo, mat.clone(), (mode === 'cut' ? 'Cut' : 'Extrude') + '_' + Date.now());
      }
    }

    if (typeof global.updateSceneTotals === 'function') global.updateSceneTotals();
    finish();
  }

  function performCSGCut(cutGeo, mat) {
    var target = _plane.targetMesh;
    try {
      // CSG işlemi için target'ı dünya uzayına taşı
      var tGeo = target.geometry.clone();
      tGeo.applyMatrix4(target.matrixWorld);
      var tMat  = target.material.clone ? target.material.clone() : target.material;
      var tMesh = new THREE.Mesh(tGeo, tMat);
      tMesh.name = target.name;

      var cutMesh = new THREE.Mesh(cutGeo, mat);
      var bspA    = new global.ThreeBSP(tMesh);
      var bspB    = new global.ThreeBSP(cutMesh);
      var result  = bspA.subtract(bspB).toMesh(tMat);
      result.geometry.computeVertexNormals();
      result.name        = (target.name || 'Part') + '_cut';
      result.castShadow  = result.receiveShadow = true;

      getScene().remove(target);
      getScene().add(result);
      tryAddToTree(result);
    } catch (err) {
      console.warn('[Sketch2D] CSG başarısız, bağımsız mesh ekleniyor:', err);
      addSolidMesh(cutGeo, mat.clone(), 'CutTool_' + Date.now());
    }
  }

  function addSolidMesh(geo, mat, name) {
    var mesh       = new THREE.Mesh(geo, mat);
    mesh.name      = name;
    mesh.castShadow = mesh.receiveShadow = true;
    getScene().add(mesh);
    tryAddToTree(mesh);
  }

  function tryAddToTree(mesh) {
    try { if (typeof addMeshToTree      === 'function') addMeshToTree(mesh); }      catch(e) {}
    try { if (typeof global.addMeshToTree === 'function') global.addMeshToTree(mesh); } catch(e) {}
    try { if (typeof updateModelTree    === 'function') updateModelTree(); }         catch(e) {}
  }

  // ═══════════════════════════════════════════════════════════════════
  // BİTİR / İPTAL
  // ═══════════════════════════════════════════════════════════════════

  function finish() {
    cleanup();
    notify('Sketch tamamlandı ✓', 'success');
  }

  function cancel() { cleanup(); }

  function cleanup() {
    _state  = 'idle';
    _shapes = [];
    _curPts = [];
    _drag   = null;
    _plane  = null;

    if (_svgEl) { _svgEl.remove(); _svgEl = null; }
    document.removeEventListener('keydown', onKeyDown);

    if (_savedCam) {
      var cam = getCamera();
      cam.position.copy(_savedCam.pos);
      cam.quaternion.copy(_savedCam.quat);
      cam.up.copy(_savedCam.up);
      if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
      _savedCam = null;
    }

    updatePanel();
    hideHint();
  }

  // ═══════════════════════════════════════════════════════════════════
  // UI — PANEL OLUŞTURMA
  // ═══════════════════════════════════════════════════════════════════

  function buildUI() {
    if (document.getElementById('sk2d-panel')) {
      _panelEl = document.getElementById('sk2d-panel');
      _dimEl   = document.getElementById('sk2d-dim');
      return;
    }

    injectCSS();

    var div = document.createElement('div');
    div.id  = 'sk2d-panel';
    div.innerHTML = PANEL_HTML;
    document.body.appendChild(div);
    _panelEl = div;
    _dimEl   = document.getElementById('sk2d-dim');
  }

  function updatePanel() {
    if (!_panelEl) return;

    var badges = { idle: 'Hazır', 'face-pick': 'Seçim', drawing: 'Çizim' };
    var badge  = document.getElementById('sk2d-badge');
    if (badge) badge.textContent = badges[_state] || _state;

    var show = function(id, v) {
      var el = document.getElementById(id);
      if (el) el.style.display = v ? '' : 'none';
    };

    show('sk2d-sec-activate', _state === 'idle');
    show('sk2d-sec-tools',    _state === 'drawing');
    show('sk2d-sec-ops',      _state === 'drawing');
    show('sk2d-sec-cancel',   _state !== 'idle');
  }

  function updateStatus(msg) {
    var el = document.getElementById('sk2d-badge');
    if (el) el.textContent = msg;
  }

  // ═══════════════════════════════════════════════════════════════════
  // HİNT ÇUBUĞU
  // ═══════════════════════════════════════════════════════════════════

  function showHint(msg, color) {
    var el = document.getElementById('sk2d-hint');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sk2d-hint';
      document.body.appendChild(el);
    }
    el.innerHTML = msg;
    el.style.color   = color || '#888';
    el.style.opacity = '1';
  }

  function hideHint() {
    var el = document.getElementById('sk2d-hint');
    if (el) el.style.opacity = '0';
  }

  function notify(msg, type) {
    try { if (typeof showNotification === 'function') { showNotification(msg, type); return; } } catch(e) {}
    showHint(msg, type === 'success' ? '#38fa80' : type === 'error' ? '#e05a2b' : '#aaa');
    setTimeout(hideHint, 2500);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PANEL HTML
  // ═══════════════════════════════════════════════════════════════════

  var PANEL_HTML = '\
<div class="sk2d-head">\
  <span class="sk2d-title">✏ SKETCH</span>\
  <span id="sk2d-badge" class="sk2d-badge">Hazır</span>\
</div>\
<div class="sk2d-sec" id="sk2d-sec-activate">\
  <button class="sk2d-btn sk2d-blue" onclick="Sketch2D.activate()">\
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>\
    YÜZEY SEÇ\
  </button>\
  <div class="sk2d-hint-sm">Bir yüzeye tıkla → sketch düzlemi tanımla</div>\
</div>\
<div class="sk2d-sec" id="sk2d-sec-tools" style="display:none">\
  <div class="sk2d-lbl">ÇİZİM ARAÇLARI</div>\
  <div class="sk2d-toolrow">\
    <button class="sk2d-tool active" data-tool="rect"    onclick="Sketch2D.setTool(\'rect\')"    title="Dikdörtgen [R]">▭</button>\
    <button class="sk2d-tool"        data-tool="circle"  onclick="Sketch2D.setTool(\'circle\')"  title="Çember [C]">◯</button>\
    <button class="sk2d-tool"        data-tool="line"    onclick="Sketch2D.setTool(\'line\')"    title="Çizgi [L]">╱</button>\
    <button class="sk2d-tool"        data-tool="polygon" onclick="Sketch2D.setTool(\'polygon\')" title="Polygon [P]">⬠</button>\
  </div>\
  <div id="sk2d-dim" class="sk2d-dim">0.000,  0.000</div>\
  <div class="sk2d-shortcut">Çift tık / Enter → kapat &nbsp;│&nbsp; Ctrl+Z → geri al<br>Sağ tık → iptal / kapat</div>\
</div>\
<div class="sk2d-sec" id="sk2d-sec-ops" style="display:none">\
  <div class="sk2d-lbl">3D DÖNÜŞÜM</div>\
  <div class="sk2d-field">\
    <label>DERİNLİK</label>\
    <div style="display:flex;align-items:center;gap:6px">\
      <input type="number" id="sk2d-depth" value="5" min="0.001" step="0.5" class="sk2d-input">\
      <span style="font-size:9px;color:#404570;">birim</span>\
    </div>\
  </div>\
  <div class="sk2d-oprow">\
    <button class="sk2d-btn sk2d-blue" onclick="Sketch2D.extrude()">▲ EXTRUDE</button>\
    <button class="sk2d-btn sk2d-red"  onclick="Sketch2D.cut()">▼ CUT</button>\
  </div>\
</div>\
<div class="sk2d-sec" id="sk2d-sec-cancel" style="display:none">\
  <button class="sk2d-btn sk2d-ghost" onclick="Sketch2D.cancel()">✕ İptal / Kapat</button>\
</div>';

  // ═══════════════════════════════════════════════════════════════════
  // PANEL CSS
  // ═══════════════════════════════════════════════════════════════════

  function injectCSS() {
    if (document.getElementById('sk2d-css')) return;
    var s = document.createElement('style');
    s.id  = 'sk2d-css';
    s.textContent = [
      '#sk2d-panel{position:fixed;left:12px;top:50%;transform:translateY(-50%);width:198px;',
      'background:#111425;border:1px solid #232845;border-radius:12px;',
      'box-shadow:0 20px 60px rgba(0,0,0,.65);z-index:500;',
      'font-family:"Inter",system-ui,sans-serif;overflow:hidden;user-select:none;}',

      '.sk2d-head{display:flex;justify-content:space-between;align-items:center;',
      'padding:10px 13px 9px;background:#0d1020;border-bottom:1px solid #1c2038;}',

      '.sk2d-title{font-size:10px;font-weight:800;letter-spacing:2px;color:#a0a8cc;}',

      '.sk2d-badge{font-size:9px;font-weight:700;letter-spacing:.5px;',
      'color:#38a0fa;background:#091830;border:1px solid #143060;',
      'border-radius:20px;padding:2px 9px;text-transform:uppercase;}',

      '.sk2d-sec{padding:10px 12px;border-bottom:1px solid #181c30;}',
      '.sk2d-sec:last-child{border:none;}',

      '.sk2d-lbl{font-size:9px;letter-spacing:1.5px;color:#363a5a;font-weight:800;',
      'margin-bottom:8px;display:block;}',

      '.sk2d-toolrow{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px;}',

      '.sk2d-tool{height:36px;display:flex;align-items:center;justify-content:center;',
      'background:#191e38;border:1px solid #262c48;border-radius:7px;',
      'color:#404870;cursor:pointer;font-size:16px;transition:all .13s;}',
      '.sk2d-tool:hover{background:#222848;color:#7080a8;border-color:#3c4468;}',
      '.sk2d-tool.active{background:#0a1e48;border-color:#38a0fa;color:#38a0fa;}',

      '.sk2d-btn{display:flex;align-items:center;justify-content:center;gap:6px;',
      'width:100%;padding:9px 8px;border-radius:7px;font-size:11px;font-weight:800;',
      'cursor:pointer;letter-spacing:.5px;transition:all .13s;box-sizing:border-box;}',

      '.sk2d-blue{background:#09193e;border:1px solid #38a0fa;color:#38a0fa;}',
      '.sk2d-blue:hover{background:#38a0fa;color:#fff;}',

      '.sk2d-red{background:#1e0a0a;border:1px solid #e05a2b;color:#e05a2b;}',
      '.sk2d-red:hover{background:#e05a2b;color:#fff;}',

      '.sk2d-ghost{background:transparent;border:1px solid #262c48;color:#404060;}',
      '.sk2d-ghost:hover{border-color:#e05a2b;color:#e05a2b;}',

      '.sk2d-oprow{display:flex;gap:5px;margin-top:6px;}',
      '.sk2d-oprow .sk2d-btn{flex:1;}',

      '.sk2d-field{margin-bottom:5px;}',
      '.sk2d-field label{font-size:9px;color:#363a5a;display:block;margin-bottom:4px;letter-spacing:.5px;}',

      '.sk2d-input{width:100%;padding:6px 8px;box-sizing:border-box;',
      'background:#181c38;border:1px solid #262c48;border-radius:6px;',
      'color:#b0b8d8;font-size:11px;font-family:monospace;}',
      '.sk2d-input:focus{outline:none;border-color:#38a0fa;}',

      '.sk2d-dim{font-family:"Fira Mono","JetBrains Mono",monospace;font-size:10px;',
      'color:#38a0fa;text-align:center;background:#080c1e;border:1px solid #141830;',
      'border-radius:5px;padding:4px 8px;margin-bottom:6px;letter-spacing:.5px;}',

      '.sk2d-shortcut{font-size:9px;color:#252848;text-align:center;line-height:1.6;}',
      '.sk2d-hint-sm{font-size:9px;color:#303452;text-align:center;margin-top:6px;line-height:1.5;}',

      /* Hint çubuğu */
      '#sk2d-hint{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);',
      'background:rgba(8,10,22,.94);border:1px solid #1c2038;border-radius:24px;',
      'padding:7px 22px;font-size:11px;letter-spacing:.2px;z-index:600;',
      'pointer-events:none;transition:opacity .25s;backdrop-filter:blur(14px);',
      'font-family:system-ui,sans-serif;white-space:nowrap;}'
    ].join('');
    document.head.appendChild(s);
  }

  // ═══════════════════════════════════════════════════════════════════
  // GENEL API (window.Sketch2D)
  // ═══════════════════════════════════════════════════════════════════

  var API = {
    activate: function() {
      if (_state !== 'idle') return;
      buildUI();
      enterFacePickMode();
    },

    setTool: function(t) {
      _tool   = t;
      _curPts = [];
      _drag   = null;
      svgClear('sk2d-prev');
      document.querySelectorAll('.sk2d-tool').forEach(function(b) {
        b.classList.toggle('active', b.dataset.tool === t);
      });
    },

    extrude: function() {
      var d = parseFloat(document.getElementById('sk2d-depth') && document.getElementById('sk2d-depth').value || '5');
      applyOp(d, 'extrude');
    },

    cut: function() {
      var d = parseFloat(document.getElementById('sk2d-depth') && document.getElementById('sk2d-depth').value || '5');
      applyOp(d, 'cut');
    },

    cancel: function() {
      if (_state === 'face-pick') abortFacePick();
      else if (_state === 'drawing') cancel();
    },

    get state() { return _state; }
  };

  global.Sketch2D = API;

})(window);
