'use strict';
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const root=path.resolve(__dirname,'../sources/gar-tools/web-simulator');
  const server=spawn(process.platform==='win32'?'python':'python3',[path.join(root,'serve.py'),'--panel',path.join(root,'examples/audio-parts'),'--port',String(port)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.stdout.once('data',resolve);server.once('exit',code=>reject(new Error('Shared server exited '+code)));});
    browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--mute-audio']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`);
    assert.deepEqual(await page.locator('gar-speakerphone').evaluateAll(parts=>parts.map(part=>part.volume)),[30,70]);
    await page.locator('[data-start=first]').click();await page.waitForFunction(()=>document.querySelector('#first').active);
    await page.waitForFunction(()=>!document.querySelector('#first-count').textContent.startsWith('0 '));
    assert.equal(await page.locator('#second').evaluate(p=>p.active),false);
    await page.locator('[data-start=second]').click();await page.waitForFunction(()=>document.querySelector('#second').active);
    assert.equal(await page.locator('#first').getByRole('combobox',{name:'入力マイク',exact:true}).isDisabled(),true);
    assert.match(await page.locator('#first').getByRole('status').innerText(),/入力：/);
    await page.locator('#first button').click();assert.equal(await page.locator('#first').evaluate(p=>p.muted),true);assert.equal(await page.locator('#second').evaluate(p=>p.muted),false);
    assert.equal(await page.locator('#first').getByRole('button',{name:'マイクのミュートを解除',exact:true}).count(),1);
    assert.equal(await page.locator('#first').getByText('マイク：ミュート中',{exact:true}).isVisible(),true);
    const before=await page.locator('#first-count').innerText();
    await page.waitForTimeout(350);assert.equal(await page.locator('#first-count').innerText(),before,'Muted capture must not emit audio');
    await page.locator('#first').getByRole('button',{name:'マイクのミュートを解除',exact:true}).click();
    await page.waitForFunction(previous=>document.querySelector('#first-count').textContent!==previous,before);
    assert.equal(await page.locator('#first').getByText('マイク：入力ON',{exact:true}).isVisible(),true);
    await page.locator('[data-tone=second]').click();await page.waitForFunction(()=>document.querySelector('#second').playing);
    assert.equal(await page.locator('#first').evaluate(p=>p.playing),false);
    await page.waitForFunction(()=>!document.querySelector('#second').playing);
    const queued=await page.locator('#second').evaluate(part=>{
      const seconds=2,bytes=new Uint8Array(24000*2*seconds);
      for(let i=0;i<6;i++)part.playPcm(bytes);
      const secondsAhead=part.nextTime-part.context.currentTime;
      let limited=false;
      try{for(let i=0;i<30;i++)part.playPcm(bytes);}catch(error){limited=error.message.includes('60秒');}
      part.stopPlayback();
      return {secondsAhead,limited,playing:part.playing,sources:part.sources.size,active:part.active};
    });
    assert.ok(queued.secondsAhead>10,'A burst containing a normal long answer must queue instead of failing after four seconds');
    assert.equal(queued.limited,true,'Playback memory must remain bounded');
    assert.deepEqual({...queued,secondsAhead:0},{secondsAhead:0,limited:true,playing:false,sources:0,active:true});
    await page.locator('[data-stop=first]').click();await page.waitForFunction(()=>!document.querySelector('#first').active);
    assert.equal(await page.locator('#first').getByRole('combobox',{name:'入力マイク',exact:true}).isEnabled(),true);
    assert.equal(await page.locator('#second').evaluate(p=>p.active),true);
    const selected=await page.locator('#first select option').evaluateAll(options=>options.find(option=>option.value&&!['default','communications'].includes(option.value))?.value);
    assert.ok(selected,'Available capture inputs must be selectable');
    await page.locator('#first').getByRole('combobox',{name:'入力マイク',exact:true}).selectOption(selected);
    await page.evaluate(()=>{
      const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia=constraints=>{window.captureConstraints=constraints;return original(constraints);};
    });
    await page.locator('[data-start=first]').click();await page.waitForFunction(()=>document.querySelector('#first').active);
    assert.equal(await page.evaluate(()=>window.captureConstraints.audio.deviceId.exact),selected,'Selected input must reach getUserMedia, not just the label');
    await page.locator('[data-stop=first]').click();
    await page.locator('[data-stop=second]').click();assert.deepEqual(errors,[]);
    console.log('PASS: two independent USB speakerphones, actual fake-media capture/worklet, mute, PCM playback and cleanup');
  }finally{await browser?.close();server.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
