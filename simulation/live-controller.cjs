'use strict';
const {randomUUID}=require('node:crypto');
/** One browser lease; no API keys or audio pass through this local adapter. */
class LiveController{
  constructor(body){this.body=body;this.session=null;this.deadline=0;this.playing=false;this.work=new Map();this.timer=setInterval(()=>{if(this.session&&Date.now()>this.deadline)this.close().catch(()=>{});},2000);this.timer.unref();}
  state(){return {ready:this.body.enabled===true&&this.body.state().ready===true,active:!!this.session};}
  async handle(input){
    if(!input||Array.isArray(input)||typeof input!=='object')throw Object.assign(new Error('Invalid live input'),{status:400});
    if(input.action==='open'){
      if(this.session)throw Object.assign(new Error('Another conversation is active'),{status:409});
      const appConfig=await this.body.call({type:'config'});
      const config={...appConfig,instruction:appConfig.instruction+'\n現在の接続先はVM内の仮想部品です。実機を操作しているとは説明しません。'};
      this.session=randomUUID();this.deadline=Date.now()+15000;
      return {session:this.session,config};
    }
    if(!this.session||input.session!==this.session)throw Object.assign(new Error('Conversation has ended'),{status:409});
    this.deadline=Date.now()+15000;
    if(input.action==='heartbeat'){
      await this.body.call({type:'speaking',value:this.playing});return {ok:true};
    }
    if(input.action==='playback'){
      if(typeof input.playing!=='boolean')throw Object.assign(new Error('Expected playback boolean'),{status:400});
      this.playing=input.playing;await this.body.call({type:'speaking',value:input.playing});return {ok:true};
    }
    if(input.action==='tool'){
      if(typeof input.id!=='string'||input.id.length>160||!input.id)throw Object.assign(new Error('Invalid tool call ID'),{status:400});
      if(this.work.has(input.id))return this.work.get(input.id);
      if(this.work.size>=128)throw Object.assign(new Error('Conversation tool limit reached; reconnect'),{status:409});
      const work=this.body.call({type:'tool',name:input.name,args:input.args,from:input.from});this.work.set(input.id,work);return work;
    }
    if(input.action==='cancel'){await this.body.call({type:'body',mode:'stop'});return {ok:true};}
    if(input.action==='close'){await this.close();return {ok:true};}
    throw Object.assign(new Error('Unknown live action'),{status:400});
  }
  async close(){this.session=null;this.playing=false;this.work.clear();if(typeof this.body.call==='function')await Promise.allSettled([this.body.call({type:'speaking',value:false}),this.body.call({type:'body',mode:'stop'})]);}
  async dispose(){clearInterval(this.timer);await this.close();}
}
module.exports={LiveController};
