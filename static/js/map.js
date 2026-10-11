/**
 * Zork UI — Map Renderer
 * Renders the Zork 1 world map as a zoomable/draggable SVG.
 * Rooms are revealed as visited; clickable to teleport.
 */

const ZorkMap = (() => {
  // ── State ──────────────────────────────────────────────────────────────────
  let mapData    = null;   // { rooms, connections }
  let visited    = new Set();
  let currentRoom = null;
  let revealAll  = false;
  let teleportEnabled = false;   // click-to-teleport gated behind god mode
  let onTeleport = null;   // callback(roomLabel)

  // Edges + on-page connectors. When a saved map-builder layout exists it drives
  // these; otherwise edges are derived from the computed game layout. An edge
  // endpoint is {t:"c",id,dir}. On-page connectors {tile,dir,target} are drawn as
  // number-free directional markers (scene numbers live only in the builder).
  let edges       = [];    // [{a:{t:"c",id,dir}, b:{t:"c",id,dir}, kind}]
  let connectorsList = []; // [{tile,dir,target}]
  const _FACE_SHORT = { n:[0,-.5], ne:[.5,-.5], e:[.5,0], se:[.5,.5],
                        s:[0,.5], sw:[-.5,.5], w:[-.5,0], nw:[-.5,-.5] };
  const _DIR_SHORT  = { north:"n",south:"s",east:"e",west:"w",northeast:"ne",
                        northwest:"nw",southeast:"se",southwest:"sw",
                        up:"n",down:"s",in:"n",out:"s" };

  // ── Pan/Zoom ───────────────────────────────────────────────────────────────
  let scale  = 1;
  let tx = 0, ty = 0;       // translation
  let dragging = false;
  let dragStart = { x: 0, y: 0, tx: 0, ty: 0 };
  let userMoved = false;    // once the user pans/zooms, stop auto-framing

  let SVG_W = 1500, SVG_H = 1300;   // overwritten by computed layout bounds
  const NODE_W = 60, NODE_H = 60;   // square top-down map tile

  // Resolve a room's top-down tile dir from its label (uses app.js's LOC_IMAGES
  // when available, else a sensible label→dir fallback).
  function _tileDir(room) {
    if (room.scene_dir) return room.scene_dir;
    const map = (typeof window !== "undefined" && window.LOC_IMAGES) || {};
    return map[room.label] || room.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  let container, svgEl, rootG;

  // Map styling is monochrome pen-and-ink — colours live in CSS, not here,
  // so the map reads as the same hand-inked artwork as the scene images.

  // ── Init ───────────────────────────────────────────────────────────────────

  function init(containerEl, teleportCb) {
    container  = containerEl;
    onTeleport = teleportCb;

    svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("id", "map-svg");
    svgEl.setAttribute("width",  SVG_W);
    svgEl.setAttribute("height", SVG_H);
    container.appendChild(svgEl);

    // Hand-drawn ink filter — a subtle turbulence displacement gives strokes a
    // wavering pen-and-ink quality consistent with the scene artwork.
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML =
      '<filter id="mapInkRough" x="-20%" y="-20%" width="140%" height="140%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="noise"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" ' +
          'xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter>';
    svgEl.appendChild(defs);

    rootG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgEl.appendChild(rootG);

    _bindPanZoom();
    _fitToContainer();

    fetch("/api/map-data")
      .then(r => r.json())
      .then(data => {
        mapData = data;
        // If the user has saved a hand-built layout, that becomes the live map;
        // otherwise fall back to the computed game layout.
        return fetch("/api/map-builder/load")
          .then(r => r.json())
          .then(res => { if (res && res.ok) _applySavedLayout(res.layout); else _buildFallbackEdges(); })
          .catch(() => _buildFallbackEdges());
      })
      .then(() => {
        _recomputeBounds();
        _render();
        _fitToRevealed();
      });
  }

  // Convert the computed game connections into the unified edge form.
  function _buildFallbackEdges() {
    connectorsList = [];
    edges = (mapData.connections || []).map(c => ({
      a: { t: "c", id: c[0], dir: _DIR_SHORT[c[3]] || "n" },
      b: { t: "c", id: c[1], dir: _DIR_SHORT[c[4]] || "n" },
      kind: c[2] || "level",
    }));
  }

  // Adopt a saved map-builder layout: override room positions, load direct links
  // and on-page connectors. Builder scene numbers are intentionally ignored here.
  function _applySavedLayout(L) {
    if (!L || !mapData) { _buildFallbackEdges(); return; }
    for (const id in (L.tiles || {})) {
      if (mapData.rooms[id]) {
        mapData.rooms[id].x = L.tiles[id].x;
        mapData.rooms[id].y = L.tiles[id].y;
      }
    }
    const conv = ep => Array.isArray(ep) ? { t: "c", id: ep[0], dir: _DIR_SHORT[ep[1]] || ep[1] || "n" } : ep;
    edges = (L.links || []).map(ln => ({ a: conv(ln.a), b: conv(ln.b), kind: ln.kind || "level" }))
                           .filter(e => e.a && e.b && e.a.t === "c" && e.b.t === "c");
    connectorsList = (L.connectors || [])
      .map(c => ({ tile: c.tile, dir: _DIR_SHORT[c.dir] || c.dir || "n" }))
      .filter(c => mapData.rooms[c.tile]);
  }

  // SVG canvas bounds from current room positions.
  function _recomputeBounds() {
    const xs = [], ys = [];
    for (const id in (mapData.rooms || {})) { xs.push(mapData.rooms[id].x); ys.push(mapData.rooms[id].y); }
    if (!xs.length) return;
    SVG_W = Math.max(...xs) + 120;
    SVG_H = Math.max(...ys) + 120;
    svgEl.setAttribute("width", SVG_W);
    svgEl.setAttribute("height", SVG_H);
  }

  // World position of a tile-face endpoint, plus its room id (for visited-gating).
  function _anchorOf(ep) {
    if (!ep || ep.t !== "c") return null;
    const r = mapData.rooms[ep.id];
    if (!r) return null;
    const f = _FACE_SHORT[ep.dir] || _FACE_SHORT[_DIR_SHORT[ep.dir]] || [0, 0];
    return { x: r.x + f[0] * NODE_W, y: r.y + f[1] * NODE_H, room: ep.id };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function _render() {
    if (!mapData) return;
    rootG.innerHTML = "";

    const edgeG = _group();
    const ocG   = _group();
    // NOTE: edges carry no #mapInkRough filter — a zero-area (axis-aligned) line's
    // objectBoundingBox filter region collapses and the line never paints.
    const nodeG = _group();
    rootG.appendChild(edgeG);
    rootG.appendChild(ocG);
    rootG.appendChild(nodeG);

    // Centroid of all rooms — connectors bow away from it so loops read as rings.
    const allRooms = Object.values(mapData.rooms);
    const cenX = allRooms.reduce((s, r) => s + r.x, 0) / (allRooms.length || 1);
    const cenY = allRooms.reduce((s, r) => s + r.y, 0) / (allRooms.length || 1);

    // Draw direct adjacency edges as face-anchored curves.
    for (const e of edges) {
      const A = _anchorOf(e.a), B = _anchorOf(e.b);
      if (!A || !B) continue;
      const rooms = [A.room, B.room].filter(Boolean);
      const isVisited = revealAll || rooms.every(r => visited.has(r));
      const isCurrent = rooms.indexOf(currentRoom) !== -1;

      const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      let nx = -(B.y - A.y), ny = (B.x - A.x);
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if ((mx - cenX) * nx + (my - cenY) * ny < 0) { nx = -nx; ny = -ny; }
      const len = Math.hypot(B.x - A.x, B.y - A.y);
      const bow = Math.min(len * 0.16, 42);

      const path = _el("path", {
        d: `M ${A.x} ${A.y} Q ${mx + nx * bow} ${my + ny * bow} ${B.x} ${B.y}`,
        fill: "none",
        class: "map-edge" +
               (e.kind === "vertical" ? " vertical-edge" : "") +
               (isVisited ? " visited-edge" : "") +
               (isCurrent ? " current-edge" : ""),
      });
      if (!isVisited && !revealAll) path.style.display = "none";
      edgeG.appendChild(path);
    }

    // Draw on-page connectors as small NUMBER-FREE directional chevrons at the
    // exit face of visited rooms (the scene numbers exist only in the builder).
    for (const c of connectorsList) {
      const r = mapData.rooms[c.tile];
      if (!r) continue;
      if (!revealAll && !visited.has(c.tile)) continue;
      const f = _FACE_SHORT[c.dir] || [0, 0];
      const bx = r.x + f[0] * (NODE_W + 12), by = r.y + f[1] * (NODE_H + 12);
      const ang = Math.atan2(f[1], f[0]);
      const px = Math.cos(ang), py = Math.sin(ang), qx = -py, qy = px, s = 5, d = 7;
      const tip = `${bx + px * d} ${by + py * d}`;
      const l = `${bx - px * 2 + qx * s} ${by - py * 2 + qy * s}`;
      const rr = `${bx - px * 2 - qx * s} ${by - py * 2 - qy * s}`;
      const cls = "map-connector" + ((c.tile === currentRoom) ? " current" : "");
      ocG.appendChild(_el("path", { d: `M ${tip} L ${l} L ${rr} Z`, class: cls }));
    }

    // Draw nodes
    for (const [id, room] of Object.entries(mapData.rooms)) {
      const isVisited = visited.has(id) || revealAll;
      const isCurrent = id === currentRoom;
      const show      = isVisited || isCurrent;

      const g = _el("g", { class: "map-room" + (show ? (isCurrent ? " current" : " visited") : " hidden") });

      const rx = room.x - NODE_W / 2;
      const ry = room.y - NODE_H / 2;

      // Top-down illustrated tile for this location (bird's-eye plan view).
      // Falls back to the ink box if no tile image exists for this dir.
      const img = _el("image", {
        x: rx, y: ry, width: NODE_W, height: NODE_H,
        preserveAspectRatio: "xMidYMid slice",
        class: "room-tile",
      });
      if (room.tile) img.setAttribute('href', room.tile);
      img.addEventListener('error', () => {
        // Preserve the room name/frame even if an asset becomes unavailable.
        img.style.display = 'none';
      }, { once: true });
      g.appendChild(img);

      // Frame around the tile (also the fallback box when no tile loads).
      const rect = _el("rect", {
        class: "room-bg",
        x: rx, y: ry,
        width: NODE_W, height: NODE_H,
        rx: 2,
        filter: "url(#mapInkRough)",
      });
      g.appendChild(rect);

      // When the tile loads, drop the box fill so the illustration shows through.
      img.addEventListener("load", () => rect.setAttribute("fill", "none"));
      img.addEventListener("error", () => img.remove());

      // TEMP (review aid): red border around scenes the user has locked.
      const lockedSet = (typeof window !== "undefined" && window.LOCKED_SCENES) || [];
      if (show && lockedSet.indexOf(_tileDir(room)) !== -1) {
        const lock = _el("rect", {
          class: "locked-border",
          x: rx - 2, y: ry - 2,
          width: NODE_W + 4, height: NODE_H + 4,
          rx: 3, fill: "none",
        });
        g.appendChild(lock);
      }

      const text = _el("text", {
        class: "room-label",
        x: room.x, y: ry + NODE_H + 9,
        "text-anchor": "middle",
        "pointer-events": "none",
      });
      text.textContent = room.label;
      g.appendChild(text);

      if (isCurrent) {
        const dot = _el("circle", { class: "room-marker", cx: rx + 6, cy: ry + 6, r: 3 });
        g.appendChild(dot);
      }

      if (show && teleportEnabled) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => {
          if (onTeleport && id !== currentRoom) {
            onTeleport(room.label, id);
          }
        });
      }
      if (show) g.title = room.label;

      nodeG.appendChild(g);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function update(visitedList, roomId, reveal, teleport) {
    visited    = new Set(visitedList || []);
    currentRoom = roomId || null;
    revealAll  = !!reveal;
    teleportEnabled = !!teleport;
    _render();
    // Keep the revealed area framed and readable until the user takes manual
    // control of pan/zoom. Early game this makes adjacent rooms (and the
    // connector between them) large enough to actually see.
    if (!userMoved) _fitToRevealed();
  }

  // Center the view on a given room (used by the "center on me" button), zooming
  // in to a readable level so the current location is prominent.
  function centerOnRoom(roomId) {
    if (!mapData || !mapData.rooms[roomId]) return;
    const r = mapData.rooms[roomId];
    scale = Math.max(scale, 1.1);          // zoom in if currently zoomed far out
    const cw = container.clientWidth, ch = container.clientHeight;
    tx = cw / 2 - r.x * scale;
    ty = ch / 2 - r.y * scale;
    _applyTransform();
  }

  function revealAllRooms() {
    revealAll = true;
    if (mapData) {
      for (const id of Object.keys(mapData.rooms)) visited.add(id);
    }
    _render();
  }

  // ── Pan/Zoom ───────────────────────────────────────────────────────────────

  function _fitToContainer() {
    const cw = container.clientWidth  || 800;
    const ch = container.clientHeight || 300;
    scale = Math.min(cw / SVG_W, ch / SVG_H) * 0.9;
    tx = (cw - SVG_W * scale) / 2;
    ty = (ch - SVG_H * scale) / 2;
    _applyTransform();
  }

  // Frame just the revealed rooms (or all, in god-mode reveal) so the map is
  // zoomed to what the player has actually seen rather than the whole 110-room
  // canvas. Clamped to a readable zoom range and centred on the revealed bbox.
  function _fitToRevealed() {
    if (!mapData) { _fitToContainer(); return; }
    const ids = revealAll ? Object.keys(mapData.rooms) : [...visited];
    const pts = ids.map(id => mapData.rooms[id]).filter(Boolean);
    if (pts.length === 0) { _fitToContainer(); return; }

    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const r of pts) {
      if (r.x < minx) minx = r.x;
      if (r.y < miny) miny = r.y;
      if (r.x > maxx) maxx = r.x;
      if (r.y > maxy) maxy = r.y;
    }
    const PAD = 110;                    // room for the node tile + its label
    minx -= PAD; miny -= PAD; maxx += PAD; maxy += PAD;

    const bw = Math.max(maxx - minx, 1), bh = Math.max(maxy - miny, 1);
    const cw = container.clientWidth  || 800;
    const ch = container.clientHeight || 300;
    scale = Math.max(0.2, Math.min(1.4, Math.min(cw / bw, ch / bh)));
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    tx = cw / 2 - cx * scale;
    ty = ch / 2 - cy * scale;
    _applyTransform();
  }

  function _applyTransform() {
    svgEl.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
  }

  function zoom(delta) {
    const cw = container.clientWidth  / 2;
    const ch = container.clientHeight / 2;
    const newScale = Math.min(4, Math.max(0.2, scale * (1 + delta)));
    tx = cw - (cw - tx) * (newScale / scale);
    ty = ch - (ch - ty) * (newScale / scale);
    scale = newScale;
    _applyTransform();
  }

  function _bindPanZoom() {
    container.addEventListener("wheel", e => {
      e.preventDefault();
      userMoved = true;
      zoom(e.deltaY < 0 ? 0.1 : -0.1);
    }, { passive: false });

    container.addEventListener("mousedown", e => {
      dragging = true;
      userMoved = true;
      dragStart = { x: e.clientX, y: e.clientY, tx, ty };
      container.classList.add("grabbing");
    });
    window.addEventListener("mousemove", e => {
      if (!dragging) return;
      tx = dragStart.tx + (e.clientX - dragStart.x);
      ty = dragStart.ty + (e.clientY - dragStart.y);
      _applyTransform();
    });
    window.addEventListener("mouseup", () => {
      dragging = false;
      container.classList.remove("grabbing");
    });

    // Touch support
    let lastDist = 0;
    container.addEventListener("touchstart", e => {
      userMoved = true;
      if (e.touches.length === 1) {
        dragging = true;
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
      } else if (e.touches.length === 2) {
        lastDist = _touchDist(e);
      }
    }, { passive: true });
    container.addEventListener("touchmove", e => {
      if (e.touches.length === 1 && dragging) {
        tx = dragStart.tx + (e.touches[0].clientX - dragStart.x);
        ty = dragStart.ty + (e.touches[0].clientY - dragStart.y);
        _applyTransform();
      } else if (e.touches.length === 2) {
        const d = _touchDist(e);
        zoom((d - lastDist) / 200);
        lastDist = d;
      }
    }, { passive: true });
    container.addEventListener("touchend", () => { dragging = false; });
  }

  function _touchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  // ── SVG helpers ────────────────────────────────────────────────────────────

  function _el(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function _group() {
    return document.createElementNS("http://www.w3.org/2000/svg", "g");
  }

  // Point on a tile's edge corresponding to a movement direction. north/up exits
  // leave the top face, south/down the bottom, east the right, west the left;
  // diagonals leave the matching corner. Unknown/in/out anchor at the centre.
  const _FACE = {
    north: [0, -0.5], up: [0, -0.5],
    south: [0, 0.5],  down: [0, 0.5],
    east: [0.5, 0],   west: [-0.5, 0],
    northeast: [0.5, -0.5], northwest: [-0.5, -0.5],
    southeast: [0.5, 0.5],  southwest: [-0.5, 0.5],
  };
  function _faceAnchor(room, dir) {
    const f = _FACE[dir] || [0, 0];
    return { x: room.x + f[0] * NODE_W, y: room.y + f[1] * NODE_H };
  }

  function fitView() {
    _fitToContainer();
    _applyTransform();
  }

  return { init, update, revealAllRooms, zoom, fitView, centerOnRoom };
})();
