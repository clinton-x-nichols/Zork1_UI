/* The original story executes in ifvms.js. Scenes read its live object memory. */
window.BrowserGame = (() => {
  const D = window.ZORK_DATA, story = Uint8Array.from(D.story);
  const assets = new Set(D.assets), roomIds = Object.fromEntries(Object.entries(D.roomObjects).map(([k,v]) => [v,k]));
  let vm, output = '', state, exportedSave, restoring, lastCommand = null;
  const commands = ['reveal map', 'illuminate', 'teleport', 'carry everything'];
  const clean = text => text.replace(/\r/g, '\n').replace(/\n*>\s*$/, '').trim();
  function initialize() {
    state = {startup:true,visited:[],god_mode:false,reveal_map:false,illuminate:false,teleport_enabled:false,no_weight_limit:false,game_over:false};
    output = ''; lastCommand = null;
    vm = new ZVM();
    const compile = vm.compile, execute = vm.run;
    vm.compile = function() {
      const pc=this.pc;compile.call(this);const routine=this.jit[pc];
      this.jit[pc]=engine=>{
        if(performance.now()>engine.executionDeadline)throw new Error('The interpreter could not resume this save safely.');
        return routine(engine);
      };
    };
    vm.run = function() {this.executionDeadline=performance.now()+2000;return execute.call(this);};
    vm.open_windows = vm.update_screen_size = vm.v3_status = vm.fix_upper_window = vm.split_window = () => {};
    vm._print = function(text) {
      if (this.io.streams[3].length) this.io.streams[3][0][1] += text;
      else output += text;
    };
    const Glk = {
      RefStruct: class {}, glk_select(){}, update(){}, glk_request_line_event_uni(){},
      fatal_error(error){throw error;}, glk_exit(){vm.stop=1;vm.quit=true;state.game_over=true;},
      glk_put_buffer_stream(stream, bytes){exportedSave = Array.from(bytes);},
      glk_get_buffer_stream(stream, buffer){buffer.set(restoring);}, glk_stream_close(){},
    };
    vm.save = function(pc) {
      this.pc=pc; this.fileref_data={func:'save'};
      this.save_restore_handler('local'); this.stop=0;
    };
    vm.restore = function(pc) {
      this.pc=pc; this.fileref_data={func:'restore'};
      this.save_restore_handler(restoring ? 'local' : null); this.stop=0;
      if (!restoring) output += '\nUse Resume to select a save file.\n';
    };
    vm.prepare(story.slice(), {Glk}); vm.init();
    state.output = clean(output);
    return snapshot();
  }
  function run(text) {
    output = '';
    const chars = Array.from(text.slice(0, vm.read_data.buffer.length), c => c.charCodeAt(0));
    vm.read_data.buffer.fill(0); chars.forEach((c,i) => {vm.read_data.buffer[i]=c;});
    vm.handle_line_input(chars.length); vm.run();
    state.output = clean(output);
    state.game_over = !!vm.quit || /\*\*\* You (have won|have died|are dead) \*\*\*/i.test(state.output);
    state.awaiting_clarification = /What do you want to |Which .+ do you mean|Do you mean |Be specific:|I don't know the word|I couldn't understand that sentence/i.test(state.output);
  }
  function rawCheckpoint() {
    return {ram:Array.from(new Uint8Array(vm.save_file(vm.pc, 1))), read:structuredClone(vm.read_data), state:structuredClone(state), last:lastCommand, seed:vm.xorshift_seed};
  }
  function restoreCheckpoint(record) {
    vm.quit = false;
    if (!vm.restore_file(Uint8Array.from(record.ram), 1)) throw new Error('Checkpoint belongs to another story');
    vm.read_data=record.read; state=record.state; lastCommand=record.last; vm.xorshift_seed=record.seed;
  }
  function persist() {
    if (state.game_over) return;
    try { localStorage.setItem('zork-browser-session-v1', JSON.stringify(rawCheckpoint())); }
    catch { /* Downloadable saves remain available when browser storage is full. */ }
  }
  function asset(dir, variants) {
    for (const v of variants) for (const ext of ['png','jpg','jpeg','svg']) {
      const path=`images/locations/${dir}/${v}.${ext}`;
      if(assets.has(path)) return path;
    }
    return null;
  }
  function selectScene(s) {
    const dir=D.roomDirs[s.room_id] || D.labelDirs[s.location] || s.room_id.toLowerCase().replaceAll('-','_');
    s.scene_dir=dir;
    if(dir==='grating_clearing'&&!s.grating_visible){s.scene_image=asset('clearing',['default']);return;}
    const variants=[];
    if(['grating_clearing','grating_room'].includes(dir)&&s.grating_open)variants.push('scene_open');
    if(['reservoir','reservoir_south','reservoir_north'].includes(dir)&&s.reservoir_empty)variants.push('scene_dry');
    if(dir==='mirror_room'&&s.mirror_broken)variants.push('scene_broken');
    if(dir==='west_of_house'&&s.mailbox_open)variants.push(s.leaflet_in_mailbox?'mailbox_open':'mailbox_open_empty');
    if(dir==='behind_house'&&s.window_open)variants.push('window_open');
    if(dir==='kitchen')variants.push(s.window_open?'scene_window_open':'scene');
    if(dir==='living_room')variants.push(s.trapdoor_open?'scene_trapdoor_open':s.rug_moved?'scene_rug_moved':'scene');
    if(dir==='troll_room'&&!s.troll_alive)variants.push('troll_defeated_taken');
    if(dir==='cyclops_room'&&!s.cyclops_present)variants.push('cyclops_gone');
    if(dir==='machine_room'&&s.scene_objects.some(o=>o.id===207&&o.open))variants.push('scene_open');
    const cleanRooms={kitchen:'table_clear',living_room:'both_taken',atlantis_room:'trident_taken',egypt_room:'coffin_taken'};
    s.scene_image=asset(dir,[...variants,'scene',cleanRooms[dir]||'default','default']);
  }
  function snapshot() {
    const m=vm.m, base=m.getUint16(10)+62, globals=m.getUint16(12), here=m.getUint16(globals);
    const objects={};
    for(const [id,initial] of Object.entries(D.initial)){
      const address=base+(Number(id)-1)*9;
      objects[id]={...initial,parent:m.getUint8(address+4),attributes:m.getUint32(address)};
    }
    const flag=(o,f)=>!!(o.attributes & (1 << (31-D.flags[f])));
    const s=state, rid=roomIds[here];
    if(!rid)throw new Error(`Unknown room object ${here}`);
    s.room_id=rid;s.location=D.rooms[rid].label;
    if(!s.visited.includes(rid))s.visited.push(rid);
    s.score=m.getInt16(globals+2);s.moves=m.getUint16(globals+4);
    function scope(n){
      const seen=new Set();
      while(n&&!seen.has(n)){
        if(n===here)return 'room';if(n===44)return 'inventory';seen.add(n);
        const o=objects[n];if(!o||flag(o,'INVISIBLE'))return null;
        if(![here,44].includes(o.parent)){
          const holder=objects[o.parent];if(!holder||!(flag(holder,'OPENBIT')||flag(holder,'TRANSBIT')))return null;
        }
        n=o.parent;
      }
      return null;
    }
    const scene=[],carried=[];
    for(const o of Object.values(objects)){
      const n=o.id;if([here,44].includes(n)||!o.name)continue;
      let where=scope(n);
      if(n===243&&['KITCHEN','EAST-OF-HOUSE'].includes(rid))where='room';
      if(n===29&&['GRATING-ROOM','GRATING-CLEARING'].includes(rid)&&!flag(o,'INVISIBLE'))where='room';
      if(n===58&&rid==='TORCH-ROOM'&&o.parent===11&&flag(o,'NDESCBIT'))where='room';
      if(!where)continue;
      const item={id:n,name:o.name,parent:o.parent,command:D.commands[n],parent_name:objects[o.parent]?.name||'',
        portable:flag(o,'TAKEBIT'),container:flag(o,'CONTBIT'),open:flag(o,'OPENBIT'),transparent:flag(o,'TRANSBIT'),
        door:flag(o,'DOORBIT'),lit:flag(o,'ONBIT'),light:flag(o,'LIGHTBIT'),touched:flag(o,'TOUCHBIT'),
        tied:n===58&&flag(o,'NDESCBIT')&&o.parent===11,initial_parent:D.initial[n].parent,placement:o.parent===here?'floor':'container'};
      (where==='inventory'?carried:scene).push(item);
    }
    Object.assign(s,{scene_objects:scene,inventory_objects:carried,inventory:carried.map(o=>o.name),room_items:scene.map(o=>o.name),
      dropped_items:scene.filter(o=>o.portable&&o.placement==='floor').map(o=>o.name),object_locations:Object.fromEntries(Object.values(objects).map(o=>[o.id,o.parent])),
      mailbox_open:flag(objects[230],'OPENBIT'),leaflet_in_mailbox:objects[76].parent===230,window_open:flag(objects[243],'OPENBIT'),
      trapdoor_open:flag(objects[240],'OPENBIT'),rug_moved:!flag(objects[240],'INVISIBLE'),troll_alive:objects[150].parent===127,
      cyclops_present:objects[199].parent===78,reservoir_empty:flag(objects[95],'RLANDBIT'),grating_visible:!flag(objects[29],'INVISIBLE'),
      grating_open:flag(objects[29],'OPENBIT'),rope_tied:flag(objects[58],'NDESCBIT')&&objects[58].parent===11,
      mirror_broken:!!m.getUint16(globals+70),dark:!(flag(objects[here],'ONBIT')||[...scene,...carried].some(o=>o.light&&o.lit)),scene_sync_error:null,locked_scenes:[]});
    selectScene(s);return structuredClone(s);
  }
  function command(text){
    text=text.trim();const low=text.toLowerCase();
    if(!text||state.game_over)return snapshot();state.startup=false;
    if(low==='mysterioso'){
      state.god_mode=true;state.output='GOD MODE\n'+commands.map((c,i)=>`${i+1}. ${c}`).join('\n');
    }else if(state.god_mode&&(commands.includes(low)||/^[1-4]$/.test(low))){
      const name=commands.includes(low)?low:commands[Number(low)-1];
      if(name==='reveal map'){state.reveal_map=true;state.output='[All map locations revealed.]';}
      if(name==='teleport'){state.teleport_enabled=true;state.output='[Click-to-teleport enabled.]';}
      if(name==='illuminate'){
        state.illuminate=true;
        for(const n of Object.values(D.roomObjects))vm.set_attr(n,D.flags.ONBIT);
        run('look');
      }
      if(name==='carry everything'){
        for(const v of [86,131,64])vm.m.setUint16(vm.globals+(v-16)*2,30000);
        state.no_weight_limit=true;state.output='[Your pack now holds anything.]';
      }
    }else if(text.startsWith('#teleport:')){
      const target=D.roomObjects[text.slice(10)];
      if(!state.teleport_enabled||!target)throw new Error('Teleport unavailable');
      vm.m.setUint16(vm.globals,target);vm.insert_obj(44,target);run('look');
    }else if(low==='save'){download();state.output='[Save downloaded.]';}
    else if(low==='restore'){document.getElementById('resume-file').click();state.output='[Choose a save file.]';}
    else {
      if(['again','g'].includes(low)&&lastCommand)text=lastCommand;
      run(text);if(!state.awaiting_clarification)lastCommand=text;
    }
    const result=snapshot();persist();return result;
  }
  function saveBytes(){
    if(state.awaiting_clarification||state.game_over)throw new Error('Finish the current prompt before saving.');
    const previous=rawCheckpoint();
    try{exportedSave=null;run('save');if(!exportedSave)throw new Error('Save failed');return Uint8Array.from(exportedSave);}
    finally{restoreCheckpoint(previous);}
  }
  function download(){
    const bytes=saveBytes(),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
    const a=document.createElement('a');a.href=url;a.download='zork-save.qzl';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function restore(bytes){
    const previous=rawCheckpoint();
    try{
      output='';
      restoring=Uint8Array.from(bytes);
      if(!vm.restore_file(restoring))throw new Error('Invalid save or wrong story version');
      vm.quit=false;vm.fileref_data={func:'restore'};vm.save_restore_handler('local');vm.run();
      state.startup=false;state.game_over=false;state.output=clean(output);state.awaiting_clarification=false;lastCommand=null;
      const result=snapshot();persist();return result;
    }catch(error){restoreCheckpoint(previous);throw error;}
    finally{restoring=null;}
  }
  initialize();
  try{const saved=localStorage.getItem('zork-browser-session-v1');if(saved)restoreCheckpoint(JSON.parse(saved));}catch{initialize();}
  return {state:snapshot,command,saveBytes,download,restore,restart(){const s=initialize();persist();return s;}};
})();
