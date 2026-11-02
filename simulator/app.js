import '/gar-components/display.mjs';
import '/gar-components/pca9685.js';
import '/gar-components/sg90.js';

// Product adapter: relay commands, display actual driver pixels/PWM, no gait code.
const screen=document.querySelector('#screen'),status=document.querySelector('#status');
const controller=document.querySelector('#pca9685-1'),bodyStatus=document.querySelector('#body-status');
const pose=document.querySelector('#start-pose'),buttons=[...document.querySelectorAll('[data-mode]')];
const names={forward:'前進',backward:'後進',stop:'停止',lie:'伏せ',stand:'立ち上がり'};
let disposed=false,events,sending=false,lastRunning=null,lastState=null,pwmSignature=null;
async function request(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options,signal:AbortSignal.timeout(8000)});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'部品に接続できません');}
  return response;
}
function connection(ready){status.hidden=ready;status.textContent='液晶ドライバーとの接続を確認中';}
function updateBody(state){
  const body=state.body,ready=body?.ready&&state.pwm?.ready;
  for(const button of buttons)button.disabled=!ready||(button.dataset.mode!=='stop'&&(body.running||body.stopping||sending));
  pose.disabled=Boolean(body?.running||body?.stopping||sending);
  bodyStatus.textContent=body?.error||(!ready?'サーボとの接続を確認中':body.stopping?'停止しています':body.running?`${names[body.mode]} · 実行中`:`${names[body.mode]} · PWM OFF`);
  if(lastRunning&&!body?.running&&!body?.error){if(['stand','forward','backward'].includes(body.mode))pose.value='stand';else if(body.mode==='lie')pose.value='lie';}
  lastRunning=Boolean(body?.running);
  const signature=JSON.stringify(state.pwm);
  if(signature!==pwmSignature){pwmSignature=signature;if(state.pwm?.ready&&state.pwm.controller)controller.update({type:'pca9685',...state.pwm.controller});else controller.update({type:'init',state:null});}
}
function disconnected(){
  connection(false);lastState=null;pwmSignature=null;for(const button of buttons)button.disabled=true;controller.update({type:'init',state:null});bodyStatus.textContent='サーボとの接続を確認中';
  document.dispatchEvent(new CustomEvent('friend-panel-state',{detail:null}));
}
function connect(){
  if(disposed||document.hidden||events)return;
  events=new EventSource('/api/events');
  events.addEventListener('state',event=>{
    const state=JSON.parse(event.data);lastState=state;connection(state.io.displayReady);updateBody(state);
    document.dispatchEvent(new CustomEvent('friend-panel-state',{detail:state}));
  });
  events.addEventListener('frame',event=>{
    const bytes=Uint8Array.from(atob(event.data),character=>character.charCodeAt(0));
    if(bytes.length===115200)screen.writeFrame(bytes,{littleEndian:false});
  });
  events.onerror=disconnected;
}
for(const button of buttons)button.addEventListener('click',async()=>{
  const mode=button.dataset.mode;
  if(sending&&mode!=='stop')return;
  sending=true;
  for(const other of buttons)if(other.dataset.mode!=='stop')other.disabled=true;
  try{await request('/api/body',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mode==='stop'?{mode}:{mode,from:pose.value})});}
  catch(error){bodyStatus.textContent=error.message;}
  finally{sending=false;if(lastState)updateBody(lastState);}
});
async function configure(){
  try{
    const {servos}=await(await request('/api/body/config')).json();
    for(const servo of servos){const element=document.getElementById(servo.name);if(!element)continue;
      element.setAttribute('channel',servo.channel);element.setAttribute('min-pulse-us',servo.minPulseUs);element.setAttribute('max-pulse-us',servo.maxPulseUs);
      const labels={'front-left':'左前','front-right':'右前','rear-left':'左後ろ','rear-right':'右後ろ'};
      element.parentElement.querySelector('h3').textContent=`${labels[servo.role]||servo.role} · CH${servo.channel}`;
    }
  }catch(error){bodyStatus.textContent=error.message;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){events?.close();events=null;}else connect();});
window.addEventListener('pagehide',()=>{disposed=true;events?.close();});
configure().then(connect);
