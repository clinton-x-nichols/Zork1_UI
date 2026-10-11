/* Scene objects are a projection of the interpreter's object tree. */
const ZorkScene = (() => {
  let state, command, begin, host, stage, image, menu, busy = false;
  let roomExits = {};
  const NS = 'http://www.w3.org/2000/svg';
  const icons = {
    10:'figurine',12:'torch',14:'food',17:'matches',23:'trident',24:'leaflet',26:'candle',
    36:'axe',41:'leaflet',58:'rope',60:'coal',68:'boat',76:'leaflet',80:'canary',83:'bell',
    91:'brass_lantern',92:'painting',94:'bag',96:'key',97:'coin',99:'bag',105:'egg',
    108:'basket',109:'pump',114:'screwdriver',115:'egg',119:'gem',126:'scarab',132:'shovel',
    133:'gem',135:'nest',136:'tube',138:'bottle',140:'skull',142:'coal',146:'brass_lantern',
    149:'canary',154:'gold',157:'leaves',163:'brass_lantern',165:'knife',168:'bell',
    179:'coffin',180:'leaflet',181:'timber',185:'buoy',186:'water',192:'gem',195:'tube',
    196:'book',201:'bar',203:'basket',204:'sceptre',208:'boat',214:'bracelet',215:'leaflet',
    217:'garlic',219:'boat',227:'elvish_sword',229:'chest',232:'knife',236:'wrench',242:'chalice',246:'knife',
  };
  const actors = {70:'bat',150:'troll',164:'thief',199:'cyclops',211:'ghost'};
  // Architectural fixtures get a clickable hotspot rather than a second picture.
  const fixtures = {
    west_of_house:{230:[17,61],121:[59,55]}, behind_house:{243:[49,47]},
    kitchen:{169:[46,64],243:[94,30]}, living_room:{55:[53,81],240:[56,79],197:[49,53],100:[16,47]},
    machine_room:{207:[83,52],101:[92,51]}, north_temple:{71:[70,42]},
    south_temple:{35:[53,62]}, dome_room:{57:[52,66]}, torch_room:{79:[53,67]},
    mirror_room:{183:[52,46],234:[52,46]}, grating_room:{29:[49,30]}, grating_clearing:{29:[53,64]},
    shaft_room:{108:[50,66]},
    maintenance_room:{63:[32.5,33],151:[36,33],212:[40,33],225:[29,33],237:[66,60]},
    dam:{9:[66,45],200:[67,49],210:[70,54],223:[30,70]},
  };
  const initialAnchors = {
    kitchen:{99:[41,52],138:[56,51]}, living_room:{146:[57,36],227:[42,36],24:[52,51]},
    attic:{58:[27,58],165:[64,52]}, dam_lobby:{17:[35,67],215:[62,67]},
    atlantis_room:{23:[51,66]}, bat_room:{10:[54,74]}, torch_room:{12:[52,55]},
    north_temple:{83:[52,69]}, south_temple:{26:[43,53],196:[56,53]},
    maintenance_room:{114:[39,69],195:[53,68],236:[66,69]}, gallery:{92:[45,32]},
    up_a_tree:{135:[52,68]}, egypt_room:{179:[52,70]}, loud_room:{201:[52,72]},
    reservoir_north:{109:[58,75]}, sandy_beach:{132:[62,75]}, sandy_cave:{126:[51,74]},
    end_of_rainbow:{154:[53,72]}, timber_room:{181:[54,76]}, gas_room:{214:[52,72]},
    reservoir:{229:[54,76]}, treasure_room:{242:[48,76]}, mine_dead_end:{60:[52,75]},
    river_5:{185:[57,72]}, dam_base:{219:[54,76]}, grating_clearing:{157:[51,78]},
  };

  function init(sendCommand, beginGame) {
    command = sendCommand;
    begin = beginGame;
    fetch('/static/room-exits.json').then(r => r.json()).then(data => {
      roomExits = data;
      if (state) highlightExits(state);
    });
    host = document.getElementById('scene-view');
    menu = document.getElementById('object-actions');
    document.querySelectorAll('#scene-compass button').forEach(button => {
      button.addEventListener('click', () => {
        if (!busy && !state?.game_over) command(button.dataset.direction);
      });
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    new ResizeObserver(fit).observe(host);
  }

  function fit() {
    if (!stage || !image?.naturalWidth) return;
    const scale = Math.min(host.clientWidth / image.naturalWidth, host.clientHeight / image.naturalHeight);
    stage.style.width = `${image.naturalWidth * scale}px`;
    stage.style.height = `${image.naturalHeight * scale}px`;
  }

  function highlightExits(next) {
    const exits = new Set(roomExits[next.room_id] || []);
    const gates = {
      'EAST-OF-HOUSE': {west: next.window_open},
      'KITCHEN': {east: next.window_open},
      'LIVING-ROOM': {down: next.trapdoor_open},
      'CELLAR': {up: next.trapdoor_open},
      'GRATING-CLEARING': {down: next.grating_visible && next.grating_open},
      'GRATING-ROOM': {up: next.grating_open},
      'DOME-ROOM': {down: next.rope_tied},
      'TROLL-ROOM': {east: !next.troll_alive, west: !next.troll_alive},
      'CYCLOPS-ROOM': {up: !next.cyclops_present},
    };
    for (const [direction, open] of Object.entries(gates[next.room_id] || {})) {
      if (!open) exits.delete(direction);
    }
    document.querySelectorAll('#scene-compass [data-direction]').forEach(button => {
      const available = !next.startup && exits.has(button.dataset.direction);
      button.classList.toggle('exit-available', available);
      button.title = `Go ${button.dataset.direction}${available ? ' (exit)' : ''}`;
    });
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#scene-compass button, #scene-view button, #inventory-grid button, #object-actions button, #object-actions select')
      .forEach(el => { el.disabled = value || !!state?.game_over; });
  }

  function objectIcon(item) {
    const icon = icons[item.id];
    if (!icon) return null;
    const img = document.createElement('img');
    let variant = 'scene';
    if (item.tied) variant = 'tied';
    else if (item.id === 115) variant = 'broken';
    else if (icon === 'bottle') {
      const full = allObjects().some(o => o.id === 186 && o.parent === item.id);
      variant = item.open ? (full ? 'open' : 'open_empty') : (full ? 'scene' : 'empty');
    }
    else if (item.open && ['egg','bag','coffin','chest','book','tube'].includes(icon)) variant = 'open';
    img.src = `images/objects/${icon}/${variant}.svg?v=2`;
    img.alt = '';
    img.className = 'object-icon' + (item.light && item.lit ? ' lit' : '');
    img.onerror = () => { img.onerror = null; img.src = `images/objects/${icon}/scene.svg`; };
    return img;
  }

  function allObjects() { return [...(state?.scene_objects || []), ...(state?.inventory_objects || [])]; }

  function caption(item) {
    let name = item.id === 242 ? 'silver chalice' : item.name;
    if (item.container || item.door) name += ` · ${item.open ? 'open' : 'closed'}`;
    if (item.light) name += item.lit ? ' · lit' : ' · unlit';
    if (item.tied) name += ' · tied to railing';
    if (item.placement === 'container' && item.parent_name && item.parent !== 44 && !item.tied)
      name += ` · ${[35,79,169,250].includes(item.parent) ? 'on' : 'in'} ${item.parent_name}`;
    return name;
  }

  function buttonFor(item, inventory = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.objectId = item.id;
    button.className = inventory ? 'inv-item object-button' : 'scene-object object-button';
    button.title = caption(item);
    button.setAttribute('aria-label', caption(item));
    button.disabled = busy || state.game_over;
    const icon = objectIcon(item);
    if (icon) button.append(icon);
    const label = document.createElement('span');
    label.className = inventory ? 'inv-label' : 'scene-object-label';
    label.textContent = caption(item);
    button.append(label);
    if (item.container) button.classList.add(item.open ? 'is-open' : 'is-closed');
    button.addEventListener('click', () => showActions(item, inventory));
    return button;
  }

  function showActions(item, inventory) {
    if (busy || state.game_over) return;
    menu.replaceChildren();
    menu.hidden = false;
    const title = document.createElement('strong');
    title.textContent = caption(item);
    menu.append(title);
    const actions = document.createElement('div');
    actions.className = 'object-action-buttons';
    function action(label, text) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => { closeMenu(); command(text); });
      actions.append(button);
    }
    const noun = item.command || item.name;
    action('Examine', `examine ${noun}`);
    if (item.portable) action(inventory ? 'Drop' : 'Take', `${inventory ? 'drop' : 'take'} ${noun}`);
    if ((item.container && ![35,79,169,250,242].includes(item.id)) || item.door)
      action(item.open ? 'Close' : 'Open', `${item.open ? 'close' : 'open'} ${noun}`);
    if (item.light) action(item.lit ? 'Extinguish' : 'Light', `${item.lit ? 'turn off' : 'turn on'} ${noun}`);
    if ([17,24,41,71,76,84,180,196,215].includes(item.id)) action('Read', `read ${noun}`);
    if (item.id === 55) action('Move rug', 'move rug');
    if (item.id === 58 && state.room_id === 'DOME-ROOM')
      action(item.tied ? 'Untie' : 'Tie to railing', item.tied ? 'untie rope' : 'tie rope to railing');
    if ([63,151,212,225].includes(item.id)) action('Push', `push ${noun}`);
    if ([70,150,164,199].includes(item.id)) action('Attack with sword', `attack ${noun} with sword`);
    menu.append(actions);
    if (inventory && item.portable) {
      const targets = allObjects().filter(o => o.id !== item.id && o.container && o.id !== 242);
      if (targets.length) {
        const label = document.createElement('label'); label.textContent = 'Put in / on: ';
        const select = document.createElement('select'); select.setAttribute('aria-label','Container for ' + noun);
        select.append(new Option('Choose a container…', ''));
        targets.forEach(o => select.append(new Option(o.name, o.id)));
        select.addEventListener('change', () => {
          const target = targets.find(o => String(o.id) === select.value);
          if (!target) return;
          closeMenu();
          command(`put ${noun} ${[35,79,169,250].includes(target.id) ? 'on' : 'in'} ${target.command || target.name}`);
        });
        label.append(select); menu.append(label);
      }
    }
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Dismiss';
    close.addEventListener('click', closeMenu); menu.append(close);
    actions.querySelector('button')?.focus();
  }

  function closeMenu() { if (menu) { menu.hidden = true; menu.replaceChildren(); } }

  function render(next) {
    state = next;
    closeMenu();
    host.replaceChildren();
    const header = document.getElementById('loc-name');
    if (header) header.textContent = next.startup ? 'Zork I' : next.location;
    document.getElementById('scene-compass').hidden = !!next.startup;
    highlightExits(next);
    if (next.startup) {
      stage = document.createElement('div'); stage.className = 'scene-stage startup-stage';
      image = document.createElement('img'); image.className = 'scene-background startup-background';
      image.alt = 'Zork I: The Great Underground Empire'; image.src = 'images/ui/zork1_startup.png';
      const play = document.createElement('button');
      play.type = 'button'; play.className = 'startup-play';
      play.textContent = 'press play to begin';
      play.addEventListener('click', begin);
      image.onload = fit; stage.append(image, play); host.append(stage); fit();
      play.focus({preventScroll: true});
    } else if (next.dark) {
      const dark = document.createElement('div'); dark.id = 'location-dark';
      dark.textContent = 'It is pitch black.'; host.append(dark);
      stage = image = null;
    } else {
      stage = document.createElement('div'); stage.className = 'scene-stage';
      image = document.createElement('img'); image.className = 'scene-background';
      image.alt = next.location; image.src = next.scene_image || '';
      image.onload = fit;
      image.onerror = () => { image.alt = `Scene unavailable: ${next.location}`; };
      stage.append(image); host.append(stage);
      if (next.scene_dir === 'living_room' && next.scene_objects.some(o => o.id === 197 && o.open)) {
        const doors = document.createElement('img');
        doors.src = 'images/locations/living_room/scene_case_open.png';
        doors.className = 'case-door-layer'; doors.alt = '';
        stage.append(doors);
      }
      renderObjects(next);
      fit();
    }
    renderInventory(next);
    const warning = document.getElementById('scene-warning');
    warning.textContent = next.scene_sync_error || '';
    warning.hidden = !next.scene_sync_error;
    setBusy(busy);
  }

  function renderObjects(next) {
    const objects = next.scene_objects || [];
    const anchors = fixtures[next.scene_dir] || {};
    const roomAnchors = initialAnchors[next.scene_dir] || {};
    const positions = new Map();
    let floorIndex = 0, fixtureIndex = 0;
    const surfaces = {169:[48,59],250:[49,58],197:[48,54],79:[52,57],35:[50,55],135:[51,64],230:[17,60]};
    const children = {};
    objects.forEach(o => { (children[o.parent] ||= []).push(o); });
    // Parent objects first, then their contents.
    const ordered = [...objects].sort((a,b) => Number(a.placement === 'container') - Number(b.placement === 'container'));
    for (const item of ordered) {
      // Water is pictured inside its bottle; never a second item floating on the floor.
      if (item.id === 186 && item.parent === 138) continue;
      let pos = anchors[item.id];
      let hotspot = !!pos || (!item.portable && !icons[item.id] && !actors[item.id]);
      if (!pos && !item.touched) pos = roomAnchors[item.id];
      if (!pos && item.parent === 75 && !item.touched && [146,227].includes(item.id))
        pos = item.id === 146 ? [56,36] : [43,36];
      if (!pos && item.id === 242 && next.scene_dir === 'treasure_room' && !item.touched) pos = [47,83];
      if (!pos && item.id === 92 && next.scene_dir === 'gallery' && !item.touched) pos = [45,32];
      if (!pos && item.id === 135 && next.scene_dir === 'up_a_tree') pos = [52,80];
      if (item.tied) pos = next.scene_dir === 'torch_room' ? [52,45] : [52,83];
      if (!pos && item.parent === 169) {
        const list = children[169]; pos = [38 + list.indexOf(item)*13,52];
      }
      if (!pos && item.placement === 'container') {
        const parentPos = surfaces[item.parent] || positions.get(item.parent);
        if (parentPos) {
          const siblings = children[item.parent];
          pos = [Math.max(7,Math.min(89,parentPos[0]+(siblings.indexOf(item)-(siblings.length-1)/2)*9)),parentPos[1]-2];
        }
      }
      if (!pos && actors[item.id]) pos = [65,58];
      if (!pos && hotspot) { pos = [8 + (fixtureIndex % 4)*24,22 + Math.floor(fixtureIndex/4)*14]; fixtureIndex++; }
      if (!pos) { pos = [12+(floorIndex%7)*12,84-Math.floor(floorIndex/7)*14]; floorIndex++; }
      positions.set(item.id,pos);
      const button = buttonFor(item);
      if (item.portable && item.touched && item.placement === 'floor') button.classList.add('is-dropped');
      if (hotspot) button.classList.add('fixture-hotspot');
      if (item.tied) button.classList.add('tied-rope');
      if (actors[item.id]) {
        // Troll and cyclops are already pictured in their room variants.
        if ([70,150,199].includes(item.id)) button.classList.add('fixture-hotspot');
        else {
          const img = document.createElement('img'); img.src = `images/characters/${actors[item.id]}/default.svg`; img.alt = '';
          button.prepend(img);
        }
      }
      if ((item.id === 76 && item.parent === 230) || item.parent === 150) button.classList.add('fixture-hotspot');
      if (item.placement === 'container' && objects.some(o => o.id === item.parent && o.portable))
        button.classList.add('nested-object');
      button.style.left = pos[0]+'%'; button.style.top = pos[1]+'%';
      button.dataset.placement = item.placement;
      stage.append(button);
    }
  }

  function renderInventory(next) {
    const grid = document.getElementById('inventory-grid'); grid.replaceChildren();
    const objects = next.inventory_objects || [];
    document.getElementById('inventory-empty').style.display = objects.length ? 'none' : 'block';
    for (const item of objects) {
      if (item.id === 186 && item.parent === 138) continue;
      grid.append(buttonFor(item,true));
    }
  }

  return {init, render, setBusy};
})();
