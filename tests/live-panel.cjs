'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createSimulatorServer}=require('../simulation/server.cjs');
const {config,execute}=require('../sources/gar-my-friend/application/friend-control.cjs');
const {FriendRuntime}=require('../sources/gar-my-friend/application/friend-runtime.cjs');

function fakeLive(){
  window.testLive={sent:[],errors:[],urls:[]};
  window.WebSocket=class{
    constructor(url){window.testLive.urls.push(url);this.readyState=1;this.bufferedAmount=0;window.testLive.socket=this;setTimeout(()=>this.onopen?.(),0);}
    send(text){const value=JSON.parse(text);window.testLive.sent.push(value);
      if(value.setup)setTimeout(()=>this.deliver({setupComplete:{}}),0);
      if(value.clientContent)setTimeout(()=>this.deliver({serverContent:{outputTranscription:{text:'こんにちは。'},modelTurn:{parts:[{inlineData:{data:btoa(String.fromCharCode(...new Uint8Array(12000))),mimeType:'audio/pcm;rate=24000'}}]}}}),0);
    }
    deliver(value){this.onmessage?.({data:JSON.stringify(value)});}
    close(){this.readyState=3;}
  };
}
async function exercise(page,url,{native=false}={}){
  const failures=[],requests=[];page.on('pageerror',error=>failures.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/live'))requests.push(request.postData()||'');});
  let issued=0;
  if(native)await page.route('**/api/live',async route=>{
    if(route.request().postDataJSON()?.action==='credentials')return route.fulfill({json:{ephemeralToken:'auth_tokens/fake-vm-'+ ++issued,model:'gemini-3.8-live',apiVersion:'v1alpha',expiresAt:new Date(Date.now()+1800000).toISOString()}});
    await route.continue();
  });
  await page.addInitScript(fakeLive);await page.goto(url);
  await page.waitForFunction(()=>!document.querySelector('#live-start').disabled);
  await page.click('#live-start');
  await page.waitForFunction(()=>!document.querySelector('#live-send').disabled);
  assert.equal(await page.locator('#live-key').count(),0);
  assert.ok(await page.evaluate(()=>window.testLive.urls.every(url=>url.includes('BidiGenerateContentConstrained')&&!url.includes('?key='))));
  await page.waitForFunction(()=>window.testLive.sent.some(value=>value.realtimeInput?.audio));
  await page.waitForFunction(()=>document.querySelector('#live-input-status').textContent.includes('Geminiへ送信'));
  await page.locator('#speakerphone').getByRole('button',{name:'マイクをミュート',exact:true}).click();
  const mutedCount=await page.evaluate(()=>window.testLive.sent.filter(value=>value.realtimeInput?.audio).length);
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.testLive.sent.filter(value=>value.realtimeInput?.audio).length),mutedCount);
  assert.match(await page.locator('#live-status').innerText(),/ミュート中/);
  assert.ok(await page.evaluate(()=>window.testLive.sent.some(value=>value.realtimeInput?.audioStreamEnd)));
  await page.locator('#speakerphone').getByRole('button',{name:'マイクのミュートを解除',exact:true}).click();
  await page.waitForFunction(before=>window.testLive.sent.filter(value=>value.realtimeInput?.audio).length>before,mutedCount);
  await page.waitForFunction(()=>document.querySelector('#live-transcript').textContent.includes('こんにちは'));
  await page.evaluate(()=>{
    const data=btoa(String.fromCharCode(...new Uint8Array(24000)));
    for(let i=0;i<16;i++)window.testLive.socket.deliver({serverContent:{modelTurn:{parts:[{inlineData:{data,mimeType:'audio/pcm;rate=24000'}}]}}});
    window.testLive.socket.deliver({serverContent:{turnComplete:true}});
  });
  await page.waitForFunction(()=>document.querySelector('#speakerphone').nextTime-document.querySelector('#speakerphone').context.currentTime>5);
  assert.equal(await page.locator('#live-send').isEnabled(),true,'Audio generated faster than playback must not disconnect the conversation');
  assert.equal(await page.locator('#speakerphone').evaluate(p=>p.playing),true,'Generation completion must not truncate queued playback');
  await page.evaluate(()=>window.testLive.socket.deliver({toolCall:{functionCalls:[{id:'emotion-1',name:'change_emotion',args:{emotion:'happy'}}]}}));
  await page.waitForFunction(()=>window.testLive.sent.some(value=>value.toolResponse?.functionResponses.some(r=>r.id==='emotion-1')));
  await page.evaluate(()=>window.testLive.socket.deliver({toolCall:{functionCalls:[{id:'blocked-body',name:'move_body',args:{mode:'lie'}}]}}));
  await page.waitForFunction(()=>window.testLive.sent.some(value=>value.toolResponse?.functionResponses.some(r=>r.id==='blocked-body')));
  assert.equal(await page.evaluate(()=>window.testLive.sent.flatMap(value=>value.toolResponse?.functionResponses||[]).find(r=>r.id==='blocked-body').response.result.status),'blocked');
  await page.fill('#live-text','今は立っています');await page.click('#live-send');
  await page.evaluate(()=>window.testLive.socket.deliver({toolCall:{functionCalls:[{id:'pose-1',name:'confirm_body_pose',args:{pose:'stand'}}]}}));
  await page.waitForFunction(()=>window.testLive.sent.some(value=>value.toolResponse?.functionResponses.some(r=>r.id==='pose-1')));
  assert.equal(await page.evaluate(()=>window.testLive.sent.flatMap(value=>value.toolResponse?.functionResponses||[]).find(r=>r.id==='pose-1').response.result.status),'confirmed');
  await page.fill('#live-text','伏せて');await page.click('#live-send');
  await page.evaluate(()=>window.testLive.socket.deliver({toolCall:{functionCalls:[{id:'body-1',name:'move_body',args:{mode:'lie'}}]}}));
  if(native)await page.waitForFunction(async()=>{const state=await(await fetch('/api/state')).json();return state.body.running&&state.pwm.controller.channels.some(c=>!c.fullOff);});
  await page.waitForFunction(()=>window.testLive.sent.some(value=>value.toolResponse?.functionResponses.some(r=>r.id==='body-1')),{},{timeout:20000});
  const result=await page.evaluate(()=>window.testLive.sent.flatMap(value=>value.toolResponse?.functionResponses||[]).find(r=>r.id==='body-1'));
  assert.equal(result.response.result.status,'completed');assert.equal(result.response.result.pwm,'off');
  const previousCount=await page.evaluate(()=>window.testLive.sent.filter(value=>value.setup).length);
  await page.evaluate(()=>window.testLive.socket.onclose());
  await page.waitForFunction(count=>window.testLive.sent.filter(value=>value.setup).length>count,previousCount);
  await page.waitForFunction(()=>!document.querySelector('#live-send').disabled);
  await page.evaluate(()=>window.testLive.socket.deliver({toolCall:{functionCalls:[{id:'after-reconnect',name:'move_body',args:{mode:'stand'}}]}}));
  await page.waitForFunction(()=>window.testLive.sent.some(value=>value.toolResponse?.functionResponses.some(r=>r.id==='after-reconnect')));
  assert.equal(await page.evaluate(()=>window.testLive.sent.flatMap(value=>value.toolResponse?.functionResponses||[]).find(r=>r.id==='after-reconnect').response.result.status),'blocked');
  assert.ok(requests.every(value=>!value.includes('fixture-key-not-real')),'API key must never enter local HTTP commands');
  assert.ok(requests.every(value=>!value.includes('auth_tokens/')&&!value.includes('"apiKey"')),'Browser posts must not echo credentials');
  assert.equal(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}).includes('auth_tokens/')),false);
  await page.evaluate(()=>window.testLive.socket.deliver({serverContent:{interrupted:true}}));
  assert.equal(await page.locator('#speakerphone').evaluate(p=>p.playing),false);
  await page.click('#live-stop');await page.waitForFunction(()=>!document.querySelector('#speakerphone').active);
  assert.equal(await page.locator('#live-send').isDisabled(),true);assert.deepEqual(failures,[]);
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('#live-status').innerText(),'停止しました','Polling must not erase the stop reason');
  for(const width of [320,760,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
}

async function delayedPreviousReply(page){
  let held,notified;
  const captured=new Promise(resolve=>{notified=resolve;});
  const intercept=async route=>{
    const input=route.request().postDataJSON();
    if(input.action==='playback'&&!held){held=route;notified();return;}
    await route.continue();
  };
  await page.waitForFunction(()=>document.querySelector('#live-stop').disabled);
  await page.route('**/api/live',intercept);
  try{
    await page.click('#live-start');
    await page.waitForFunction(()=>!document.querySelector('#live-send').disabled);await captured;
    await page.click('#live-stop');await page.waitForFunction(()=>document.querySelector('#live-stop').disabled);
    await page.click('#live-start');
    await page.waitForFunction(()=>!document.querySelector('#live-send').disabled);
    await held.abort();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#live-send').isEnabled(),true,'A failed playback notification from the previous session must not close the new session');
    await page.click('#live-stop');await page.waitForFunction(()=>document.querySelector('#live-stop').disabled);
  }finally{await page.unroute('**/api/live',intercept);}
}

async function microphoneDenied(page){
  await page.evaluate(()=>{
    window.originalGetUserMedia=navigator.mediaDevices.getUserMedia;
    navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Permission denied by system','NotAllowedError');};
  });
  try{
    await page.click('#live-start');
    await page.waitForFunction(()=>!document.querySelector('#live-start').disabled);
    await page.waitForTimeout(2200);
    assert.match(await page.locator('#live-status').innerText(),/マイクへのアクセスが拒否/);
    assert.equal(await page.locator('#live-key').count(),0);
  }finally{await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=window.originalGetUserMedia;delete window.originalGetUserMedia;});}
}

(async()=>{
  let server;
  const friend=new FriendRuntime({servo:{async perform(){return true;}}});
  const bridge={frame:Buffer.alloc(115200),frameId:'fixture',status(){return {displayReady:true,frameId:this.frameId};},state(){return {io:this.status()};},close(){}};
  const body={enabled:true,state:()=>friend.status().body,configuration:()=>[],call:input=>execute(friend,input),async close(){}};
  let url=process.env.GAR_PANEL_URL;
  if(!url){server=createSimulatorServer({deviceBridge:bridge,bodyController:body,liveCredentials:async()=>({ephemeralToken:'auth_tokens/fake-local',model:'gemini-3.8-live',apiVersion:'v1alpha',expiresAt:new Date(Date.now()+1800000).toISOString()})});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url=`http://127.0.0.1:${server.address().port}`;}
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--mute-audio']});
  try{
    const page=await browser.newPage({viewport:{width:1100,height:900}});
    await exercise(page,url,{native:!!process.env.GAR_PANEL_URL});
    if(!process.env.GAR_PANEL_URL){await microphoneDenied(page);await delayedPreviousReply(page);}
    fs.mkdirSync('artifacts',{recursive:true});await page.setViewportSize({width:1100,height:900});await page.screenshot({path:process.env.GAR_PANEL_URL?'artifacts/live-vm.png':'artifacts/live-fixture.png',fullPage:true});
    console.log('PASS: fake Gemini session + browser microphone/speaker + App expression/body tools + stop + ephemeral Cloud authentication + responsive layout');
  }finally{await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}}
})().catch(error=>{console.error(error);process.exitCode=1;});
