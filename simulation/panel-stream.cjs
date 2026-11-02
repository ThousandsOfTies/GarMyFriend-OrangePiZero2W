'use strict';
const {createGzip,constants}=require('node:zlib');

// Product protocol: one shared sample, changed state/pixels only, bounded clients.
class PanelStream{
  constructor({bridge,body,live}){this.bridge=bridge;this.body=body;this.live=live;this.clients=new Set();this.closed=false;}
  add(req,res){
    res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no',...( /\bgzip\b/.test(req.headers['accept-encoding']||'')?{'Content-Encoding':'gzip'}:{})});
    res.flushHeaders();
    const output=res.hasHeader('Content-Encoding')?createGzip({level:1,flush:constants.Z_SYNC_FLUSH}):res;
    if(output!==res){output.pipe(res);output.on('error',()=>res.destroy());}
    const client={res,output,state:null,frame:null,lastWrite:0};this.clients.add(client);
    res.on('close',()=>{this.clients.delete(client);if(output!==res)output.destroy();if(!this.clients.size){clearTimeout(this.timer);this.timer=null;}});
    // A new viewer gets a snapshot even if another viewer is already connected.
    if(!this.running&&!this.timer)this.tick().catch(()=>{});
  }
  write(client,text){
    if(client.res.destroyed||client.res.writableLength>262144||client.output.writableLength>262144){client.res.destroy();return;}
    client.output.write(text);client.lastWrite=Date.now();
  }
  async tick(){
    if(this.closed||!this.clients.size)return;this.running=true;
    try{
      await this.body.refresh?.();
      if(this.closed)return;
      const state=JSON.stringify({...this.bridge.state(),body:this.body.state(),live:this.live.state()});
      const frameId=this.bridge.status().displayReady?this.bridge.frameId:null;
      let frame;
      for(const client of this.clients){
        if(state!==client.state){this.write(client,`event: state\ndata: ${state}\n\n`);client.state=state;}
        if(frameId&&frameId!==client.frame){frame??=this.bridge.frame.toString('base64');this.write(client,`event: frame\ndata: ${frame}\n\n`);client.frame=frameId;}
        if(!frameId)client.frame=null;
        if(Date.now()-client.lastWrite>15000)this.write(client,': keepalive\n\n');
      }
    }finally{this.running=false;if(!this.closed&&this.clients.size){this.timer=setTimeout(()=>{this.timer=null;this.tick().catch(()=>{});},200);this.timer.unref();}}
  }
  close(){this.closed=true;clearTimeout(this.timer);for(const {res} of this.clients)res.destroy();this.clients.clear();}
}
module.exports={PanelStream};
