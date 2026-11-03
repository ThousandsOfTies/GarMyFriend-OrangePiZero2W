'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {AlsaDuplex}=require('../sources/gar-tools/targets/linux-device/runtime/alsa-audio/duplex.cjs');
const {LiveSession}=require('../sources/gar-my-friend/application/live-session.cjs');
const {FriendRuntime}=require('../sources/gar-my-friend/application/friend-runtime.cjs');

test('Linux raw ALSA processes and shared Gemini protocol complete a native voice turn', {skip:process.platform!=='linux'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'friend-live-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const helper=path.join(root,'audio.cjs'),stats=path.join(root,'stats');
  await fs.writeFile(helper,`const fs=require('node:fs');
if(process.argv[2]==='capture'){
 const chunk=Buffer.alloc(3200);for(let i=0;i<chunk.length;i+=2)chunk.writeInt16LE(i%800-400,i);
 const timer=setInterval(()=>process.stdout.write(chunk),100);
 process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0);});
}else{
 let size=0;process.stdin.on('data',chunk=>size+=chunk.length);
 process.stdin.on('end',()=>{fs.appendFileSync(${JSON.stringify(stats)},size+'\\n');setTimeout(()=>process.exit(0),150);});
}`);
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  for(const [name,mode] of [['arecord','capture'],['aplay','playback']])await fs.writeFile(path.join(root,name),`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(helper)} ${mode}\n`,{mode:0o700});
  const {spawn}=require('node:child_process');let socket;const packets=[],failures=[];
  class Socket{
    constructor(){socket=this;this.readyState=1;setImmediate(()=>this.onopen?.());}
    send(text){const value=JSON.parse(text);packets.push(value);
      if(value.setup)this.deliver({setupComplete:{}});
      if(value.clientContent)setImmediate(()=>{this.deliver({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(96000).toString('base64')}}]}}});this.deliver({toolCall:{functionCalls:[{id:'face',name:'change_emotion',args:{emotion:'happy'}}]}});this.deliver({serverContent:{turnComplete:true}});});
    }
    deliver(value){this.onmessage?.({data:JSON.stringify(value)});}
    close(){this.readyState=3;}
  }
  const {GeminiLive}=await import(pathToFileURL(path.resolve('sources/gar-tools/web-simulator/components/gemini-live.mjs')).href);
  const audio=new AlsaDuplex({capture:'mic',playback:'speaker',spawnProcess:(cmd,args,options)=>spawn(cmd,args,{...options,env:{...process.env,PATH:root+path.delimiter+process.env.PATH}})});
  const friend=new FriendRuntime(),session=new LiveSession({friend,audio,createClient:options=>new GeminiLive({...options,socketFactory:()=>new Socket()}),onFailure:error=>failures.push(error)});
  const until=async predicate=>{for(let i=0;i<150;i++){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}assert.fail('Native audio update timed out');};
  try{
    await session.start({apiKey:'fixture-not-a-real-key'});await until(()=>audio.playing);assert.equal(friend.face.speaking,true);
    await until(()=>!audio.playing);assert.equal(friend.face.speaking,false);
    assert.equal((await fs.readFile(stats,'utf8')).trim(),'96000');
    assert.equal(friend.face.expressionId,'happy');
    await until(()=>packets.some(value=>value.realtimeInput?.audio));
    const pcm=Buffer.from(packets.find(value=>value.realtimeInput?.audio).realtimeInput.audio.data,'base64');assert.equal(pcm.length,3200);assert.ok(pcm.some(value=>value!==0));
    socket.deliver({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:Buffer.alloc(48000).toString('base64')}}]}}});
    await until(()=>audio.playing);socket.deliver({serverContent:{interrupted:true}});await until(()=>!audio.playing);
    assert.deepEqual(failures,[]);
  }finally{await session.close();}
  assert.equal(audio.capture.finished,true);assert.equal(audio.turns.length,0);
});
