'use strict';
const {randomUUID}=require('node:crypto');
/** One browser lease; private device credentials stay in the server. */
class LiveController{
  constructor(body,{credentials=null}={}){this.body=body;this.credentials=credentials;this.session=null;this.deadline=0;this.playing=false;this.work=new Map();this.timer=setInterval(()=>{if(this.session&&Date.now()>this.deadline)this.close().catch(()=>{});},2000);this.timer.unref();}
  state(){return {ready:this.body.enabled===true&&this.body.state().ready===true&&!!this.credentials,authenticationReady:!!this.credentials,active:!!this.session};}
  async handle(input){
    if(!input||Array.isArray(input)||typeof input!=='object')throw Object.assign(new Error('Invalid live input'),{status:400});
    if(input.action==='open'){
      if(this.session)throw Object.assign(new Error('Another conversation is active'),{status:409});
      if(!this.credentials)throw Object.assign(new Error('会話の接続設定を確認してください'),{status:503});
      const opened=await this.body.call({type:'conversation',action:'open'}),appConfig=opened.config;
      const config={...appConfig,instruction:appConfig.instruction+'\n現在の接続先はVM内の仮想部品です。実機を操作しているとは説明しません。'};
      this.session=randomUUID();this.deadline=Date.now()+15000;this.tokenWork=null;this.credentialAbort=new AbortController();
      return {session:this.session,config,body:opened.body};
    }
    if(!this.session||input.session!==this.session)throw Object.assign(new Error('Conversation has ended'),{status:409});
    this.deadline=Date.now()+15000;
    if(input.action==='credentials'){
      const active=this.session;
      if(!this.tokenWork){const signal=this.credentialAbort.signal;this.tokenWork=Promise.resolve().then(()=>this.credentials({signal}));}
      let issued;
      try{issued=await this.tokenWork;}catch{throw Object.assign(new Error('会話の接続情報を取得できません。少し待ってから再接続します'),{status:503});}
      if(active!==this.session)throw Object.assign(new Error('Conversation has ended'),{status:409});
      const {ephemeralToken,model,apiVersion,expiresAt}=issued;
      return {ephemeralToken,model,apiVersion,expiresAt};
    }
    if(input.action==='input'){
      if(!input.input||!['user','model'].includes(input.input.role)||typeof input.input.text!=='string'||input.input.text.length>2000)throw Object.assign(new Error('Invalid conversation input'),{status:400});
      return this.body.call({type:'conversation',action:'input',input:input.input});
    }
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
      const work=this.body.call({type:'conversation',action:'tool',name:input.name,args:input.args});this.work.set(input.id,work);return work;
    }
    if(input.action==='cancel'){await this.body.call({type:'conversation',action:'cancel'});return {ok:true};}
    if(input.action==='close'){await this.close();return {ok:true};}
    throw Object.assign(new Error('Unknown live action'),{status:400});
  }
  async close(){const active=this.session;this.session=null;this.credentialAbort?.abort();this.tokenWork=null;this.playing=false;this.work.clear();if(typeof this.body.call==='function')await Promise.allSettled([this.body.call({type:'speaking',value:false}),...(active?[this.body.call({type:'conversation',action:'close'})]:[])]);}
  async dispose(){clearInterval(this.timer);await this.close();}
}
module.exports={LiveController};
