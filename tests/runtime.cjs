'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {createSimulatorServer}=require('../simulation/server.cjs');
const {LiveController}=require('../simulation/live-controller.cjs');
const {FriendRuntime}=require('../sources/gar-my-friend/application/friend-runtime.cjs');
const {execute}=require('../sources/gar-my-friend/application/friend-control.cjs');
const {createGunzip}=require('node:zlib');

function request(port,route,{method='GET',body,headers={}}={}){
  return new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port,path:route,method,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks)}));
    });req.on('error',reject);if(body!==undefined)req.write(body);req.end();
  });
}
test('panel relays only driver frames and raw rotary actions, without application state',async t=>{
  const calls=[],frame=Buffer.alloc(115200,0x5a);
  const bridge={frame,frameId:'fixture',counter:0,status(){return {displayReady:true,frameId:this.frameId};},state(){return {io:this.status(),rotary:{ready:true,counter:this.counter}};},async inject(value){calls.push(value);if(value.action==='rotate')this.counter+=value.direction;},close(){}};
  const server=createSimulatorServer({deviceBridge:bridge});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));const port=server.address().port;
  const post=(route,value,headers={})=>request(port,route,{method:'POST',body:JSON.stringify(value),headers:{'Content-Type':'application/json',...headers}});
  assert.deepEqual((await request(port,'/api/io/frame')).body,frame);
  assert.equal((await post('/api/rotary',{action:'rotate',direction:1})).status,200);
  assert.equal((await post('/api/rotary',{action:'press'})).status,200);
  assert.deepEqual(calls,[{action:'rotate',direction:1},{action:'press'}]);
  assert.deepEqual((await request(port,'/api/io/frame')).body,frame,'The bridge must never draw a face in response to a knob event');
  const state=JSON.parse((await request(port,'/api/state')).body);
  assert.deepEqual(Object.keys(state).sort(),['body','io','live','rotary']);assert.equal(state.rotary.counter,1);
  assert.equal(state.live.ready,false);
  assert.equal((await post('/api/live',{action:'open'})).status,503,'A host panel cannot enable application commands on physical hardware');
  assert.equal(state.body.ready,false,'A local-host panel must never start physical body commands');
  assert.equal((await post('/api/body',{mode:'forward',from:'stand'})).status,503);
  for(const value of [null,[],{mode:'shell',from:'stand'},{mode:'forward'},{mode:'stop',from:'stand'},{mode:'stand',from:'stand',command:'anything'}])assert.equal((await post('/api/body',value)).status,400);
  assert.equal((await post('/api/body',{mode:'stop'},{Origin:'https://untrusted.example'})).status,403);
  for(const route of ['/api/command','/api/scenarios','/api/recording'])assert.equal((await post(route,{type:'expression',value:'happy'})).status,404);
  for(const input of [null,[],{action:'rotate',direction:0},{action:'press',direction:1},{action:'expression',value:'happy'}])assert.equal((await post('/api/rotary',input)).status,400);
  assert.equal(calls.length,2);
  assert.equal((await post('/api/rotary',{action:'press'},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await post('/api/live',{action:'open'},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await request(port,'/health',{headers:{Host:'untrusted.example'}})).status,403);
  for(const route of ['/simulator/%2e%2e/shared/expressions.json','/simulator/%5c..%5capplication/face.cjs'])assert.equal((await request(port,route)).status,403);
  for(const route of ['/application/face.cjs','/preview/face.js','/gar-components/gamepad.js'])assert.equal((await request(port,route)).status,404);
  for(const route of ['/gar-components/pca9685.js','/gar-components/sg90.js','/gar-components/servo-model.mjs','/gar-components/pwm-components.css'])assert.equal((await request(port,route)).status,200);
});

test('conversation lease isolates tabs, deduplicates tools and clears playback on close',async()=>{
  const friend=new FriendRuntime({servo:{async perform(){return true;}}}),calls=[];
  const body={enabled:true,state:()=>friend.status().body,call:async value=>{calls.push(value);return execute(friend,value);}};
  const live=new LiveController(body);
  try{
    const opened=await live.handle({action:'open'});
    assert.equal(opened.config.tools.length,4);assert.equal(opened.body.poseConfirmationRequired,true);
    await assert.rejects(live.handle({action:'open'}),/Another conversation/);
    await assert.rejects(live.handle({action:'tool',session:'wrong',id:'x'}),/ended/);
    await live.handle({action:'playback',session:opened.session,playing:true});assert.equal(friend.face.speaking,true);
    const tool={action:'tool',session:opened.session,id:'once',name:'change_emotion',args:{emotion:'happy'}};
    assert.deepEqual(await live.handle(tool),await live.handle(tool));
    assert.equal(calls.filter(value=>value.type==='conversation'&&value.action==='tool').length,1);
    await assert.rejects(live.handle({action:'tool',session:opened.session,id:'bad',name:'shell',args:{}}),/Unknown tool/);
    await live.handle({action:'close',session:opened.session});assert.equal(friend.face.speaking,false);assert.equal(live.state().active,false);
    await assert.rejects(live.handle({action:'heartbeat',session:opened.session}),/ended/);
  }finally{await live.dispose();}
});

test('simulator transport shares native pose confirmation and forgets it on a new connection',async()=>{
  const movements=[],friend=new FriendRuntime({servo:{async perform(mode,options){movements.push({mode,options});return true;}}});
  const body={enabled:true,state:()=>friend.status().body,call:value=>execute(friend,value)},live=new LiveController(body);
  try{
    const opened=await live.handle({action:'open'}),session=opened.session;
    const tool=(id,name,args)=>live.handle({action:'tool',session,id,name,args,from:'stand'});
    assert.equal((await tool('blocked','move_body',{mode:'lie'})).status,'blocked','A supplied dropdown pose cannot arm voice control');
    await live.handle({action:'input',session,input:{role:'user',text:'今は立っています'}});
    assert.equal((await tool('confirmed','confirm_body_pose',{pose:'stand'})).status,'confirmed');
    assert.equal(movements.length,0);
    assert.equal((await tool('same-turn','move_body',{mode:'lie'})).reason,'new_motion_request_required');
    await live.handle({action:'input',session,input:{role:'user',text:'伏せて'}});
    assert.equal((await tool('motion','move_body',{mode:'lie'})).status,'completed');
    assert.deepEqual(movements,[{mode:'lie',options:{from:'stand'}}]);
    await live.handle({action:'close',session});
    const next=await live.handle({action:'open'});assert.equal(next.body.pose,null);
    assert.equal((await live.handle({action:'tool',session:next.session,id:'new-motion',name:'move_body',args:{mode:'stand'}})).status,'blocked');
  }finally{await live.dispose();}
});

test('event stream compresses changed pixels, skips unchanged output and isolates reconnecting viewers',async t=>{
  const bridge={frame:Buffer.alloc(115200),frameId:'first',status(){return {displayReady:true,frameId:this.frameId};},state(){return {io:this.status()};},close(){}};
  const body={state:()=>({ready:true}),async refresh(){},async close(){}};
  const server=createSimulatorServer({deviceBridge:bridge,bodyController:body});
  server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port,clients=[];
  t.after(async()=>{for(const client of clients)client.destroy();await server.shutdown();});
  const wait=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail('Stream update timed out');};
  function open(){
    const result={text:'',bytes:0,encoding:null};
    const req=http.get({host:'127.0.0.1',port,path:'/api/events',headers:{'Accept-Encoding':'gzip'}},res=>{
      result.encoding=res.headers['content-encoding'];res.on('data',data=>{result.bytes+=data.length;});
      const decoded=res.pipe(createGunzip());decoded.on('error',()=>{});decoded.on('data',data=>{result.text+=data;});
    });clients.push(req);return result;
  }
  const first=open();await wait(()=>first.text.includes('event: frame'));
  assert.equal(first.encoding,'gzip');
  assert.ok(first.bytes<3000,'Compress solid-colour framebuffer instead of sending 115 KB raw pixels');
  const stable=first.text;await new Promise(resolve=>setTimeout(resolve,650));assert.equal(first.text,stable);
  const second=open();await wait(()=>second.text.includes('event: frame'));
  assert.equal(first.text,stable,'Joining a second viewer must not resend the first viewer snapshot');
  bridge.frame=Buffer.alloc(115200,90);bridge.frameId='second';
  await wait(()=>first.text.includes('second')&&second.text.includes('second'));
  assert.equal((await request(port,'/api/events',{headers:{Origin:'https://untrusted.example'}})).status,403);
});
