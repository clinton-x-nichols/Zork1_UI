/**
 * Zork UI — Main Application
 * Connects to Flask backend, handles all UI updates.
 */

(function () {
  "use strict";

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const $cliLocName  = document.getElementById("cli-loc-name");
  const $btnSave     = document.getElementById("btn-save");
  const $btnResume   = document.getElementById("btn-resume");
  const $resumeFile  = document.getElementById("resume-file");
  const $cliOutput   = document.getElementById("cli-output");
  const $cliInput    = document.getElementById("cli-input");
  const $cliFontSize = document.getElementById("cli-font-size");
  const $invGrid     = document.getElementById("inventory-grid");
  const $invEmpty    = document.getElementById("inventory-empty");
  const $locHeader   = document.getElementById("loc-name");
  const $locImg      = document.getElementById("location-img-container");
  const $mapContainer= document.getElementById("map-container");
  const $gameOver    = document.getElementById("game-over-overlay");
  const $btnRestart  = document.getElementById("btn-restart");
  const $btnPlayAgain= document.getElementById("btn-play-again");
  const $zoomIn      = document.getElementById("zoom-in");
  const $zoomOut     = document.getElementById("zoom-out");
  const $zoomFit     = document.getElementById("zoom-fit");
  const $mapCenter   = document.getElementById("map-center");

  // Location label → directory key in /images/locations/
  // TEMPORARY (review aid): scene dirs the user has locked. The map draws a red
  // border around these tiles so it's obvious which scenes are frozen. Remove
  // this list (and the locked-border code in map.js) when the review pass ends.
  const LOCKED_SCENES = ["west_of_house", "north_of_house", "south_of_house"];

  const LOC_IMAGES = {
    // Surface / house exterior
    "West of House":        "west_of_house",
    "North of House":       "north_of_house",
    "South of House":       "south_of_house",
    "Behind House":         "behind_house",
    // House interior
    "Living Room":          "living_room",
    "Kitchen":              "kitchen",
    "Attic":                "attic",
    // Underground — entry
    "Cellar":               "cellar",
    "East of Chasm":        "cellar_east_of_chasm",
    "Gallery":              "cellar_east_of_chasm",
    "Studio":               "cellar_east_of_chasm",
    "The Troll Room":       "troll_room",
    "East-West Passage":    "troll_ew_passage",
    "Round Room":           "round_room",
    // Forest / surface wilderness
    "Forest":               "forest",
    "Forest Path":          "forest_path",
    "Up a Tree":            "up_a_tree",
    "Clearing":             "clearing",
    // Canyon / rainbow / falls
    "Canyon View":          "canyon_view",
    "Rocky Ledge":          "canyon_view",
    "Canyon Bottom":        "canyon_bottom",
    "End of Rainbow":       "end_of_rainbow",
    "On the Rainbow":       "on_rainbow",
    "Aragain Falls":        "aragain_falls",
    // River / shore
    "Shore":                "shore",
    "Sandy Beach":          "sandy_beach",
    "Sandy Cave":           "sandy_beach",
    "Stream":               "reservoir",
    "Stream View":          "reservoir",
    "Frigid River":         "shore",
    "White Cliffs Beach":   "shore",
    // Dam / reservoir
    "Dam":                  "dam",
    "Dam Lobby":            "dam_lobby",
    "Dam Base":             "dam",
    "Maintenance Room":     "maintenance_room",
    "Reservoir":            "reservoir",
    "Reservoir South":      "reservoir",
    "Reservoir North":      "reservoir",
    "Atlantis Room":        "atlantis_room",
    // Maze
    "Maze":                 "maze",
    "Dead End":             "dead_end",
    "Grating Room":         "grating_room",
    "Grating Clearing":     "grating_clearing",
    // Cyclops / treasure
    "Cyclops Room":         "cyclops_room",
    "Strange Passage":      "strange_passage",
    "Treasure Room":        "treasure_room",
    // Passages / caves
    "Chasm":                "cellar_east_of_chasm",
    "North-South Passage":  "troll_ew_passage",
    "Cold Passage":         "troll_ew_passage",
    "Narrow Passage":       "troll_ew_passage",
    "Winding Passage":      "troll_ew_passage",
    "Twisting Passage":     "troll_ew_passage",
    "Deep Canyon":          "canyon_bottom",
    "Loud Room":            "loud_room",
    "Damp Cave":            "troll_ew_passage",
    "Cave":                 "troll_ew_passage",
    // Engravings / dome / temple
    "Engravings Cave":      "engravings_cave",
    "Dome Room":            "dome_room",
    "Torch Room":           "torch_room",
    "Temple":               "north_temple",
    "Altar":                "south_temple",
    "Egyptian Room":        "egypt_room",
    // Hades
    "Entrance to Hades":    "hades",
    "Land of the Dead":     "land_of_dead",
    // Mirror rooms
    "Mirror Room":          "mirror_room",
    // Mine
    "Coal Mine":            "mine",
    "Mine Entrance":        "mine",
    "Bat Room":             "bat_room",
    "Squeaky Room":         "mine",
    "Shaft Room":           "mine",
    "Smelly Room":          "mine",
    "Gas Room":             "gas_room",
    "Drafty Room":          "timber_room",
    "Ladder Top":           "mine",
    "Ladder Bottom":        "mine",
    "Timber Room":          "timber_room",
    "Machine Room":         "machine_room",
    "Slide Room":           "mine",
    // Barrow
    "Stone Barrow":         "hades",
  };

  // ── Command history ────────────────────────────────────────────────────────
  let cmdHistory = [];
  let historyIdx = -1;

  // ── Initial load ───────────────────────────────────────────────────────────
  let currentState = null;

  function init() {
    window.LOC_IMAGES = LOC_IMAGES;   // expose label→dir map for the map tile renderer
    window.LOCKED_SCENES = LOCKED_SCENES;   // TEMP: locked-scene dirs for the map red border
    ZorkScene.init(sendCommand, () => sendCommand("look", true));
    ZorkMap.init($mapContainer, handleTeleport);
    bindEvents();
    initCliFontSize();
    initResizers();
    fetchState();

  }

  // ── Event bindings ─────────────────────────────────────────────────────────

  function bindEvents() {
    $cliInput.addEventListener("keydown", onKeyDown);
    $btnRestart.addEventListener("click", doRestart);
    $btnPlayAgain.addEventListener("click", doRestart);
    if ($btnSave)   $btnSave.addEventListener("click", doSave);
    if ($btnResume) $btnResume.addEventListener("click", () => $resumeFile.click());
    if ($resumeFile) $resumeFile.addEventListener("change", doResume);
    if ($cliFontSize) $cliFontSize.addEventListener("change", () => setCliFontSize($cliFontSize.value, true));
    $zoomIn.addEventListener("click",  () => ZorkMap.zoom(0.2));
    $zoomOut.addEventListener("click", () => ZorkMap.zoom(-0.2));
    $zoomFit.addEventListener("click", resetMapZoom);
    if ($mapCenter) $mapCenter.addEventListener("click", centerMapOnPlayer);
    $cliInput.focus();
  }

  function initCliFontSize() {
    let saved = "13";
    try { saved = localStorage.getItem("zork-cli-font-size") || saved; } catch (_) {}
    setCliFontSize(saved, false);
  }

  function setCliFontSize(value, persist) {
    const allowed = new Set(["12", "13", "16", "19", "22"]);
    const size = allowed.has(String(value)) ? String(value) : "13";
    document.documentElement.style.setProperty("--cli-font-size", `${size}px`);
    if ($cliFontSize) $cliFontSize.value = size;
    if (persist) {
      try { localStorage.setItem("zork-cli-font-size", size); } catch (_) {}
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter") {
      const cmd = $cliInput.value.trim();
      if (!cmd) return;
      $cliInput.value = "";
      cmdHistory.unshift(cmd);
      if (cmdHistory.length > 100) cmdHistory.pop();
      historyIdx = -1;
      sendCommand(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      historyIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
      $cliInput.value = cmdHistory[historyIdx] || "";
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      historyIdx = Math.max(historyIdx - 1, -1);
      $cliInput.value = historyIdx < 0 ? "" : cmdHistory[historyIdx];
    }
  }

  // ── API calls ──────────────────────────────────────────────────────────────

  function fetchState() {
    fetch("/api/state")
      .then(r => r.json())
      .then(applyState);
  }

  let commandPending = false;
  function focusCli() {
    if (currentState && !currentState.startup && !$cliInput.disabled) {
      $cliInput.focus({preventScroll: true});
    }
  }

  function sendCommand(cmd, begin = false) {
    if (commandPending || currentState?.game_over || (currentState?.startup && !begin)) return;
    // Echo command in terminal
    appendToTerminal(`> ${cmd}`, "cmd-echo");

    // TEMP dev command: "lock"/"unlock" marks the current scene locked (red map
    // border + protected). Handled client-side since the label→dir map lives here.
    const low = (cmd || "").trim().toLowerCase();
    if (low === "lock" || low === "unlock") { handleLockCommand(low === "lock"); return; }

    // TEMP dev command: capture notes while exploring. "note <text>" stores a note
    // for the current room (read back by the dev each iteration); "notes" lists them.
    if (low === "note" || low === "notes") { handleListNotes(); return; }
    if (low.startsWith("note ")) { handleDevNote(cmd.trim().slice(5).trim()); return; }

    commandPending = true;
    ZorkScene.setBusy(true);
    $cliInput.disabled = true;
    fetch("/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd }),
    })
      .then(r => { if (!r.ok) throw new Error(`Command failed (${r.status})`); return r.json(); })
      .then(applyState)
      .catch(err => appendToTerminal(`[Error: ${err.message}]`, "error"))
      .finally(() => {
        commandPending = false;
        ZorkScene.setBusy(false);
        $cliInput.disabled = !!currentState?.startup;
        focusCli();
      });
  }

  function handleDevNote(text) {
    if (!text) { appendToTerminal("[Usage: note <your note text>]", "error"); return; }
    const st = currentState || {};
    fetch("/api/dev-note", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: st.room_id || "", location: st.location || "", note: text }),
    })
      .then(r => r.json())
      .then(res => appendToTerminal(res && res.ok
        ? `[📝 Note saved for ${st.location || st.room_id} (#${res.count}).]`
        : "[Note failed.]", res && res.ok ? null : "error"))
      .catch(err => appendToTerminal(`[Note error: ${err.message}]`, "error"));
  }

  function handleListNotes() {
    const st = currentState || {};
    fetch(`/api/dev-notes?room_id=${encodeURIComponent(st.room_id || "")}`)
      .then(r => r.json())
      .then(res => {
        const ns = (res && res.notes) || [];
        if (!ns.length) { appendToTerminal(`[No notes for ${st.location || "this room"} yet. Add with: note <text>]`); return; }
        appendToTerminal(`[📝 Notes for ${st.location || st.room_id}:]`);
        ns.forEach((n, i) => appendToTerminal(`  ${i + 1}. ${n.note}`));
      })
      .catch(err => appendToTerminal(`[Notes error: ${err.message}]`, "error"));
  }

  function handleLockCommand(lock) {
    const loc = (currentState && currentState.location) || "";
    const dir = currentState?.scene_dir || LOC_IMAGES[loc];
    if (!dir) { appendToTerminal(`[Can't ${lock ? "lock" : "unlock"}: no scene art for "${loc}".]`, "error"); return; }
    fetch("/api/lock-scene", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir, locked: lock }),
    })
      .then(r => r.json())
      .then(res => {
        if (!res || !res.ok) { appendToTerminal("[Lock failed.]", "error"); return; }
        window.LOCKED_SCENES = res.locked || [];
        if (currentState) currentState.locked_scenes = window.LOCKED_SCENES;
        ZorkMap.update((currentState && currentState.visited) || [], currentState && currentState.room_id,
                       currentState && currentState.reveal_map, !!(currentState && currentState.teleport_enabled));
        appendToTerminal(`[${lock ? "🔒 Locked" : "🔓 Unlocked"}: ${loc} (${dir}).]`);
      })
      .catch(err => appendToTerminal(`[Lock error: ${err.message}]`, "error"));
  }

  function doSave() {
    try { window.BrowserGame.download(); appendToTerminal('[Save downloaded.]'); }
    catch (error) { appendToTerminal(`[Save failed: ${error.message}]`, 'error'); }
    focusCli();
  }

  function doResume(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("savefile", file);
    fetch("/api/restore", { method: "POST", body: form })
      .then(r => r.json())
      .then(state => {
        if (state && state.error) { appendToTerminal(`[Resume failed: ${state.error}]`, "error"); return; }
        $cliOutput.innerHTML = "";
        applyState(state);
        appendToTerminal("[Game resumed from save file.]");
      })
      .catch(err => appendToTerminal(`[Resume failed: ${err.message}]`, "error"));
    e.target.value = "";   // allow re-selecting the same file
  }

  function doRestart() {
    $gameOver.classList.remove("active");
    fetch("/api/restart", { method: "POST" })
      .then(r => r.json())
      .then(state => {
        $cliOutput.innerHTML = "";
        applyState(state);
      });
  }

  // ── SSE stream ─────────────────────────────────────────────────────────────

  function startSSE() {
    const es = new EventSource("/api/stream");
    es.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "ping") return;
        // SSE is secondary; primary update comes from POST response
      } catch (_) {}
    };
    es.onerror = () => {
      // silently retry
    };
  }

  // ── State application ──────────────────────────────────────────────────────

  function applyState(state) {
    if (!state) return;
    currentState = state;

    // Location name shown in the CLI panel header (below the scene image)
    if ($cliLocName) $cliLocName.textContent = state.startup ? "Zork I" : state.location || "";

    // CLI output
    if (state.startup) $cliOutput.replaceChildren();
    else if (state.output) appendToTerminal(state.output);

    ZorkScene.render(state);

    // Keep the locked-scene list (red map borders) in sync with the server.
    if (state.locked_scenes) window.LOCKED_SCENES = state.locked_scenes;

    // Map
    ZorkMap.update(state.visited || [], state.room_id, state.reveal_map, !!state.teleport_enabled);
    if (state.reveal_map) ZorkMap.revealAllRooms();

    // Game over
    $gameOver.classList.toggle('active', !!state.game_over);

    // Auto-scroll terminal
    $cliOutput.scrollTop = $cliOutput.scrollHeight;
    $cliInput.disabled = commandPending || !!state.startup;
    focusCli();
  }

  // ── Terminal rendering ─────────────────────────────────────────────────────

  function appendToTerminal(text, cls) {
    if (!text) return;
    const lines = text.split("\n");
    for (const line of lines) {
      const div = document.createElement("div");
      div.className = "cli-line" + (cls ? " " + cls : "");
      div.textContent = line;
      if (cls === "cmd-echo") {
        div.style.color = "#ffb000";
        div.style.fontWeight = "bold";
      }
      $cliOutput.appendChild(div);
    }
    $cliOutput.scrollTop = $cliOutput.scrollHeight;
    focusCli();
  }

  // ── Resizable panels ──────────────────────────────────────────────────────

  function initResizers() {
    setupColResizer(
      document.getElementById("resizer-loc-map"),
      document.getElementById("location-panel"),
      document.getElementById("images-row")
    );
    setupColResizer(
      document.getElementById("resizer-cli-inv"),
      document.getElementById("cli-panel"),
      document.getElementById("bottom-row")
    );
    setupRowResizer(
      document.getElementById("resizer-rows"),
      document.getElementById("images-row"),
      document.getElementById("main-area")
    );
  }

  function setupColResizer(resizer, leftPanel, container) {
    if (!resizer || !leftPanel || !container) return;
    resizer.addEventListener("mousedown", e => {
      const startX    = e.clientX;
      const startW    = leftPanel.getBoundingClientRect().width;
      const totalW    = container.getBoundingClientRect().width;
      document.body.classList.add("resizing-col");
      resizer.classList.add("active");

      const onMove = ev => {
        const newW = Math.max(80, Math.min(startW + ev.clientX - startX, totalW - 80));
        leftPanel.style.flex = `0 0 ${(newW / totalW) * 100}%`;
      };
      const onUp = () => {
        document.body.classList.remove("resizing-col");
        resizer.classList.remove("active");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  function setupRowResizer(resizer, topPanel, container) {
    if (!resizer || !topPanel || !container) return;
    resizer.addEventListener("mousedown", e => {
      const startY    = e.clientY;
      const startH    = topPanel.getBoundingClientRect().height;
      const totalH    = container.getBoundingClientRect().height;
      document.body.classList.add("resizing-row");
      resizer.classList.add("active");

      const onMove = ev => {
        const newH = Math.max(80, Math.min(startH + ev.clientY - startY, totalH - 80));
        topPanel.style.flex = `0 0 ${(newH / totalH) * 100}%`;
      };
      const onUp = () => {
        document.body.classList.remove("resizing-row");
        resizer.classList.remove("active");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });
  }

  // ── Teleport handler ───────────────────────────────────────────────────────

  function handleTeleport(roomLabel, roomId) {
    if (!roomLabel) return;
    // Click-to-teleport is a god-mode power — only honoured once enabled.
    if (!currentState || !currentState.teleport_enabled) return;
    appendToTerminal(`[Teleporting to ${roomLabel}...]`, "cmd-echo");
    sendCommand(`#teleport:${roomId}`);
  }

  function resetMapZoom() {
    ZorkMap.fitView();
  }

  function centerMapOnPlayer() {
    if (currentState && currentState.room_id) ZorkMap.centerOnRoom(currentState.room_id);
  }

  // ── Start ──────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
