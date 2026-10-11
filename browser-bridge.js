/* Preserve the UI contract without HTTP, fetches, a launcher or native bindings. */
window.fetch = async (input, options={}) => {
  const path=String(input).split('?')[0];
  const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  const game=window.BrowserGame,D=window.ZORK_DATA;
  try{
    if(path==='/api/state')return response(game.state());
    if(path==='/api/command')return response(game.command(JSON.parse(options.body).command));
    if(path==='/api/restart')return response(game.restart());
    if(path==='/api/restore')return response(game.restore(new Uint8Array(await options.body.get('savefile').arrayBuffer())));
    if(path==='/api/map-data')return response(D.map);
    if(path==='/api/map-builder/load')return response(D.layout);
    if(path==='/static/room-exits.json')return response(D.exits);
    if(path==='/api/dev-notes')return response({ok:true,notes:JSON.parse(localStorage.getItem('zork-notes')||'[]')});
    if(path==='/api/dev-note'){
      const notes=JSON.parse(localStorage.getItem('zork-notes')||'[]');notes.push(JSON.parse(options.body));
      localStorage.setItem('zork-notes',JSON.stringify(notes));return response({ok:true,count:notes.length});
    }
    if(path==='/api/lock-scene')return response({ok:false});
    throw new Error(`Unknown browser operation: ${path}`);
  }catch(error){throw error;}
};
