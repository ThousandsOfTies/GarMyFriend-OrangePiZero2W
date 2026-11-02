'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {once}=require('node:events');
const {createSimulatorServer}=require('../simulation/server.cjs');

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
  assert.deepEqual(Object.keys(state).sort(),['body','io','rotary']);assert.equal(state.rotary.counter,1);
  assert.equal(state.body.ready,false,'A local-host panel must never start physical body commands');
  assert.equal((await post('/api/body',{mode:'forward',from:'stand'})).status,503);
  for(const value of [null,[],{mode:'shell',from:'stand'},{mode:'forward'},{mode:'stop',from:'stand'},{mode:'stand',from:'stand',command:'anything'}])assert.equal((await post('/api/body',value)).status,400);
  assert.equal((await post('/api/body',{mode:'stop'},{Origin:'https://untrusted.example'})).status,403);
  for(const route of ['/api/command','/api/scenarios','/api/recording'])assert.equal((await post(route,{type:'expression',value:'happy'})).status,404);
  for(const input of [null,[],{action:'rotate',direction:0},{action:'press',direction:1},{action:'expression',value:'happy'}])assert.equal((await post('/api/rotary',input)).status,400);
  assert.equal(calls.length,2);
  assert.equal((await post('/api/rotary',{action:'press'},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await request(port,'/health',{headers:{Host:'untrusted.example'}})).status,403);
  for(const route of ['/simulator/%2e%2e/shared/expressions.json','/simulator/%5c..%5capplication/face.cjs'])assert.equal((await request(port,route)).status,403);
  for(const route of ['/application/face.cjs','/preview/face.js','/gar-components/gamepad.js'])assert.equal((await request(port,route)).status,404);
  for(const route of ['/gar-components/pca9685.js','/gar-components/sg90.js','/gar-components/servo-model.mjs','/gar-components/pwm-components.css'])assert.equal((await request(port,route)).status,200);
});
