const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createSimulatorServer}=require('../simulation/server.cjs');
function frame(color){const data=Buffer.alloc(115200);for(let i=0;i<data.length;i+=2)data.writeUInt16BE(color,i);return data;}
(async()=>{
  const calls=[];
  const pwm={address:64,frequencyHz:50,channels:Array.from({length:16},(_,channel)=>({channel,on:0,off:0,fullOff:true,fullOn:false}))};
  const bridge={frame:frame(0xff00),frameId:'first',counter:0,status(){return {displayReady:true,frameId:this.frameId};},state(){return {io:this.status(),pwm:{ready:true,controller:pwm}};},close(){}};
  let running=false,mode='stop';
  const body={state(){return {ready:true,running,mode,error:null};},configuration(){return Array.from({length:4},(_,channel)=>({name:`servo-${channel+1}`,channel,role:['front-left','front-right','rear-left','rear-right'][channel],minPulseUs:1300,maxPulseUs:1700}));},async command(input){calls.push(input);mode=input.mode;running=mode!=='stop';return this.state();},async close(){}};
  const server=createSimulatorServer({deviceBridge:bridge,bodyController:body});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const forward=page.locator('[data-mode="forward"]'),stop=page.locator('[data-mode="stop"]');
    await page.waitForFunction(()=>!document.querySelector('[data-mode="forward"]').disabled);
    assert.equal(await page.locator('main > section').count(),5);
    assert.equal(await page.locator('gar-speakerphone').count(),1);
    assert.equal(await page.locator('gar-sg90').count(),4);assert.equal(await page.locator('gar-pca9685').count(),1);
    assert.equal(await page.locator('gar-rotary,#expressions,#scenarios,#record,#pause').count(),0);
    const pixels=()=>page.locator('#screen').evaluate(display=>display.displayContext.canvas.toDataURL());
    const first=await pixels();await forward.click();
    await page.waitForFunction(()=>document.querySelector('[data-mode="forward"]').disabled);
    assert.equal(await pixels(),first,'Only driver pixels may change the display');
    assert.equal(await stop.isEnabled(),true);
    pwm.channels[0]={channel:0,on:0,off:328,fullOff:false,fullOn:false};
    await page.waitForFunction(()=>document.querySelector('#servo-1').classList.contains('active'));
    assert.equal(await page.locator('#servo-2').evaluate(element=>element.classList.contains('active')),false);
    await stop.focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('[data-mode="lie"]').disabled);
    await page.locator('[data-mode="lie"]').click();
    await page.waitForFunction(()=>document.querySelector('#body-status').textContent.includes('伏せ · 実行中'));
    running=false;
    await page.waitForFunction(()=>document.querySelector('#start-pose').value==='lie');
    await page.locator('[data-mode="stand"]').click();
    await stop.click();
    assert.deepEqual(calls,[{mode:'forward',from:'stand'},{mode:'stop'},{mode:'lie',from:'stand'},{mode:'stand',from:'lie'},{mode:'stop'}]);
    bridge.frame=frame(0x001f);bridge.frameId='second';
    await page.waitForFunction(old=>document.querySelector('#screen').displayContext.canvas.toDataURL()!==old,first);
    for(const width of [320,760,1440]){await page.setViewportSize({width,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    fs.mkdirSync('artifacts',{recursive:true});await page.setViewportSize({width:1000,height:750});await page.screenshot({path:'artifacts/parts-fixture.png',fullPage:true});
    await browser.close();assert.deepEqual(errors,[]);
    console.log('PASS: display + PCA9685 + four servos; command wiring, PWM output, stop, keyboard, responsive 320/760/1440');
  }finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
