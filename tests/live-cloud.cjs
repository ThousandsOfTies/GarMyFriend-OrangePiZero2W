'use strict';
// Opt-in integration: real Gemini + the VM App/native virtual I2C controller.
// Microphone input is a generated silence fixture; text uses the panel's normal
// input form. No provider endpoint, token issuance or App tool is substituted.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
if(process.env.GAR_LIVE_INTEGRATION!=='1'){console.log('SKIP: set GAR_LIVE_INTEGRATION=1 to use the configured Cloud broker');process.exit(0);}
const directory=path.resolve(__dirname,'../.gar/tests');fs.mkdirSync(directory,{recursive:true});
const fixture=path.join(directory,'silence.wav'),samples=48000*10;
const wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);fs.writeFileSync(fixture,wav);

function observe(){
  const trace=window.liveTrace={turns:0,generating:false,tools:[],batches:[],replays:0,setups:0,blocking:false,openPoses:[],sentAudio:0};
  const NativeSocket=window.WebSocket;
  window.WebSocket=class extends NativeSocket{
    constructor(...args){
      super(...args);this.answers=new Set();
      this.addEventListener('message',async event=>{
        const raw=event.data instanceof Blob?await event.data.text():event.data;
        const message=JSON.parse(raw),content=message.serverContent;
        if(content?.modelTurn?.parts?.some(part=>part.inlineData?.data)&&!trace.generating){trace.generating=true;++trace.turns;}
        if(content?.turnComplete||content?.interrupted)trace.generating=false;
      });
      this.addEventListener('close',()=>{trace.generating=false;});
    }
    send(data){
      super.send(data);const value=JSON.parse(data);
      if(value.setup){++trace.setups;trace.blocking=value.setup.tools[0].functionDeclarations.every(tool=>tool.behavior==='BLOCKING');}
      if(value.realtimeInput?.audio)++trace.sentAudio;
      if(value.toolResponse){const replies=value.toolResponse.functionResponses;trace.batches.push(replies.length);for(const reply of replies){if(this.answers.has(reply.id))++trace.replays;this.answers.add(reply.id);}}
    }
  };
  const nativeFetch=window.fetch;
  window.fetch=async(...args)=>{
    const response=await nativeFetch(...args);
    if(typeof args[0]==='string'&&args[0]==='/api/live'&&args[1]?.body){
      const request=JSON.parse(args[1].body);
      if(request.action==='tool'){
        const result=await response.clone().json();
        trace.tools.push({name:request.name,status:result.status||null,pose:result.body?.pose||null,reason:result.reason||null});
      }
      if(request.action==='open'){
        const result=await response.clone().json();trace.openPoses.push(result.body?.pose??null);
      }
    }
    return response;
  };
}

(async()=>{
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+fixture,'--mute-audio']});
  const report={path:'real Gemini + VM App + native virtual PCA9685',microphone:'generated silence',input:'normal panel text form',speaker:'Web Audio playback, host muted',steps:[]};
  let page;
  try{
    page=await browser.newPage({viewport:{width:1100,height:900}});const errors=[];
    page.on('pageerror',()=>errors.push('page_error'));
    await page.addInitScript(observe);await page.goto(process.env.GAR_PANEL_URL||'http://127.0.0.1:8773/');
    report.stage='panel_ready';
    await page.waitForFunction(()=>!document.querySelector('#live-start').disabled,null,{timeout:30000});
    await page.click('#live-start');
    report.stage='connect';
    await page.waitForFunction(()=>!document.querySelector('#live-send').disabled,null,{timeout:60000});
    const idle=async()=>{
      await page.waitForFunction(()=>!window.liveTrace.generating&&!document.querySelector('#speakerphone').playing,null,{timeout:60000});
      await page.waitForTimeout(3500);
      assert.equal(await page.evaluate(()=>window.liveTrace.generating||document.querySelector('#speakerphone').playing),false);
    };
    report.stage='greeting';
    await page.waitForFunction(()=>window.liveTrace.turns>0,null,{timeout:30000});await idle();
    assert.equal(await page.evaluate(()=>window.liveTrace.blocking),true);
    assert.deepEqual(await page.evaluate(()=>window.liveTrace.openPoses),[null]);
    for(const step of [{name:'confirm_pose',text:'今は立っています',tool:'confirm_body_pose',status:'confirmed'},{name:'lie',text:'伏せてください',tool:'move_body',status:'completed'}]){
      report.stage=step.name;
      const before=await page.evaluate(()=>({turns:window.liveTrace.turns,tools:window.liveTrace.tools.length}));
      await page.fill('#live-text',step.text);await page.click('#live-send');
      if(step.name==='lie')await page.waitForFunction(async()=>{
        const state=await(await fetch('/api/state')).json();return state.body.running&&state.pwm.controller.channels.some(channel=>!channel.fullOff);
      },null,{timeout:30000});
      await page.waitForFunction(({before,step})=>window.liveTrace.tools.slice(before.tools).some(tool=>tool.name===step.tool&&tool.status===step.status),{before,step},{timeout:60000});
      await page.waitForFunction(count=>window.liveTrace.turns>count,before.turns,{timeout:30000});await idle();
      const turns=await page.evaluate(()=>window.liveTrace.turns)-before.turns;
      assert.equal(turns,1,step.name+': one consolidated spoken response');report.steps.push({name:step.name,spokenTurns:turns,toolCompleted:true});
    }
    const state=await page.evaluate(async()=>await(await fetch('/api/state')).json());
    assert.equal(state.body.running,false);assert.ok(state.pwm.controller.channels.every(channel=>channel.fullOff));
    report.trace=await page.evaluate(()=>window.liveTrace);assert.equal(report.trace.replays,0);assert.equal(report.trace.setups,1);assert.deepEqual(errors,[]);
    await page.click('#live-stop');await page.waitForFunction(()=>!document.querySelector('#speakerphone').active);
    report.ok=true;fs.writeFileSync(path.join(directory,'live-cloud-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  }catch(error){
    report.ok=false;
    if(page)report.trace=await page.evaluate(()=>({...window.liveTrace,status:document.querySelector('#live-status')?.textContent})).catch(()=>({unavailable:true}));
    fs.writeFileSync(path.join(directory,'live-cloud-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1;});
