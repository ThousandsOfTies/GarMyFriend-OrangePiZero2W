'use strict';
const crypto=require('node:crypto');

/** Physical-part replacement: relay GPIO actions and driver-produced pixels.
 * This module does not import the application or know expression names. */
class DeviceBridge {
  constructor(){this.frame=null;this.frameId=null;this.counter=0;this.ready=false;this.error=null;this.pwm=null;this.pwmReady=false;this.closed=false;this.poll();}
  async poll(){
    try{
      const response=await fetch('http://127.0.0.1:8080/api/state',{signal:AbortSignal.timeout(1500)});
      if(!response.ok)throw new Error(`Device bridge HTTP ${response.status}`);
      const state=await response.json(),display=state.spi?.gc9a01;
      if(display?.pixels&&display.width===240&&display.height===240){
        const frame=Buffer.from(display.pixels,'base64');
        if(frame.length!==115200)throw new Error('Invalid RGB565 frame size');
        this.frame=frame;this.frameId=crypto.createHash('sha256').update(frame).digest('hex');
      }
      this.counter=state.gpio.rotary.counter;this.ready=Boolean(state.hardware.gpio.rotary);this.error=null;
      this.pwm=state.i2c?.pca9685||null;this.pwmReady=Boolean(state.hardware.devices?.includes('pca9685'));
    }catch(error){this.ready=false;this.pwmReady=false;this.error=error.message;}
    if(!this.closed){this.timer=setTimeout(()=>this.poll(),80);this.timer.unref();}
  }
  async inject({action,direction}){
    if(!this.ready)throw new Error(this.error||'GPIO bridge is not ready');
    const route=action==='rotate'?'rotate':'press';
    const response=await fetch(`http://127.0.0.1:8080/api/rotary/${route}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='rotate'?{direction}:{}),signal:AbortSignal.timeout(2000),
    });
    if(!response.ok)throw new Error(`GPIO bridge HTTP ${response.status}`);
    if(!(await response.json()).ok)throw new Error('GPIO input was rejected');
  }
  status(){return {backend:'linux-dev',displayReady:Boolean(this.frame)&&!this.error,frameId:this.frameId,error:this.error};}
  state(){return {io:this.status(),rotary:{ready:this.ready,counter:this.counter},pwm:{ready:this.pwmReady,controller:this.pwm}};}
  close(){this.closed=true;clearTimeout(this.timer);}
}
module.exports={DeviceBridge};
