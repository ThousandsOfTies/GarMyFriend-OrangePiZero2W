'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {readCsv}=require('../sources/gar-my-friend/application/hardware.cjs');
const {requestControl}=require('../sources/gar-my-friend/application/friend-control.cjs');
const MODES=['forward','backward','stop','lie','stand'];
function validateBodyInput(value){
  if(!value||Array.isArray(value)||typeof value!=='object'||!MODES.includes(value.mode))throw new Error('Invalid body mode');
  const keys=Object.keys(value).sort().join(',');
  if(value.mode==='stop'){if(keys!=='mode')throw new Error('stop takes only mode');}
  else if(keys!=='from,mode'||!['stand','lie'].includes(value.from))throw new Error('Body motion needs from=stand|lie');
}
/** Product transport only; the running common application owns all motion and face state. */
class BodyController{
  constructor({root,environment}={}){
    this.root=root;this.closed=false;this.enabled=false;
    this.value={ready:false,running:false,stopping:false,mode:'stop',error:null};
    try{
      if(environment!=='virtualbox-linux'||process.platform!=='linux'||process.arch!=='x64')throw new Error('Body controls require the dedicated x64 Linux simulator');
      const product=require(path.join(root,'product.json'));
      const i2c=readCsv(path.join(root,product.hardware.simulation,'i2c.csv'));
      if(i2c.length!==1||i2c[0].dev!=='/dev/i2c-10'||!fs.statSync('/dev/i2c-10').isCharacterDevice())throw new Error('Virtual I2C device is unavailable');
      this.socket=path.join(root,'.gar/friend.sock');this.enabled=true;
    }catch(error){this.value.error=error.message;}
  }
  configuration(){const product=require(path.join(this.root,'product.json'));return readCsv(path.join(this.root,product.hardware.physical,'servo-calibration.csv')).map(s=>({name:s.name,channel:Number(s.channel),role:s.role,minPulseUs:Number(s.min_us),maxPulseUs:Number(s.max_us)}));}
  state(){return this.value;}
  async call(value){
    if(!this.enabled||this.closed)throw Object.assign(new Error(this.value.error||'Simulator is unavailable'),{status:503});
    return requestControl(this.socket,value);
  }
  async refresh(){
    if(!this.enabled||this.closed)return;
    try{const value=await requestControl(this.socket,{type:'state'},{timeoutMs:1000});this.value=value.body;this.expression=value.expression;}
    catch{this.value={...this.value,ready:false,error:'Waiting for the common application'};}
  }
  async command(input){
    validateBodyInput(input);
    try{const result=await this.call({type:'body',...input,wait:false});this.value=result.body;return this.value;}
    catch(error){if(!error.status)error.status=error.message.includes('already running')?409:503;throw error;}
  }
  async close(){if(this.closed)return;if(this.enabled)await this.call({type:'body',mode:'stop'}).catch(()=>{});this.closed=true;}
}
module.exports={BodyController,validateBodyInput};
