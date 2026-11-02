import '/gar-components/speakerphone.mjs';
import {GeminiLive} from '/gar-components/gemini-live.mjs';

// Product wiring only. Gemini protocol is shared; tool semantics live in the App.
const device=document.querySelector('#speakerphone'),start=document.querySelector('#live-start'),stop=document.querySelector('#live-stop');
const key=document.querySelector('#live-key'),model=document.querySelector('#live-model'),voice=document.querySelector('#live-voice');
const status=document.querySelector('#live-status'),transcript=document.querySelector('#live-transcript'),tool=document.querySelector('#live-tool');
const text=document.querySelector('#live-text'),send=document.querySelector('#live-send'),pose=document.querySelector('#start-pose');
let client,session=null,generation=0,heartbeat,pollTimer,busy=false,ready=false,disposed=false,lastLine=null,lastRole=null;
async function command(value){
  const response=await fetch('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(value.action==='tool'?38000:4000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'アプリに接続できません');return result;
}
function controls(){start.disabled=busy||!ready;stop.disabled=!busy;key.disabled=busy;model.disabled=busy;voice.disabled=busy;text.disabled=send.disabled=!client?.ready;}
async function poll(){
  try{const state=await(await fetch('/api/state',{signal:AbortSignal.timeout(2500)})).json();ready=state.live?.ready===true;if(!busy)status.textContent=ready?'APIキーを入力して会話を始められます':'VM内の共通アプリを待っています';}
  catch{ready=false;if(!busy)status.textContent='WebPanelとの接続を確認中';}
  controls();if(!disposed)pollTimer=setTimeout(poll,2000);
}
async function end(message='停止しました'){
  ++generation;const previous=session;session=null;clearInterval(heartbeat);client?.stop();client=null;
  controls();status.textContent='停止しています';
  await device.stop();if(previous)await command({action:'close',session:previous}).catch(()=>{});
  busy=false;status.textContent=message;controls();
}
function append({role,text:words}){
  if(lastRole!==role||!lastLine){lastLine=document.createElement('li');lastLine.dataset.role=role;lastLine.textContent=role==='user'?'あなた：':'相棒：';transcript.append(lastLine);lastRole=role;while(transcript.children.length>12)transcript.firstElementChild.remove();}
  lastLine.textContent=(lastLine.textContent+words).slice(0,4000);transcript.scrollTop=transcript.scrollHeight;
}
start.addEventListener('click',async()=>{
  if(busy)return;if(!key.value.trim()){status.textContent='Gemini APIキーを入力してください';key.focus();return;}
  const apiKey=key.value.trim();key.value='';busy=true;const current=++generation;controls();status.textContent='マイクとスピーカーを準備中';
  transcript.replaceChildren();lastLine=lastRole=null;tool.textContent='';
  try{
    await device.start();if(current!==generation)return;
    const opened=await command({action:'open'});
    if(current!==generation){await command({action:'close',session:opened.session});return;}
    session=opened.session;const activeSession=session;
    const isCurrent=()=>session===activeSession&&generation===current;
    client=new GeminiLive({onTool:async(call,{signal})=>{
      if(signal.aborted||session!==activeSession)throw new Error('Conversation ended');
      const result=await command({action:'tool',session:activeSession,id:call.id,name:call.name,args:call.args,from:pose.value});
      if(session===activeSession&&!signal.aborted)tool.textContent=call.name==='change_emotion'?'表情を変更しました':call.name==='move_body'?`身体の動作が完了しました：${call.args.mode}`:'状態を確認しました';
      return result;
    }});
    client.addEventListener('audio',({detail})=>{if(!isCurrent())return;try{device.playPcm(detail.bytes,{sampleRate:detail.sampleRate});}catch(error){end(error.message);}});
    client.addEventListener('interrupted',()=>{if(isCurrent())device.stopPlayback();});
    client.addEventListener('transcript',({detail})=>{if(isCurrent())append(detail);});
    client.addEventListener('turn-end',()=>{if(isCurrent()){lastLine=lastRole=null;status.textContent='聞いています';}});
    client.addEventListener('cancel',()=>{if(isCurrent())command({action:'cancel',session:activeSession}).catch(error=>{if(isCurrent())end(error.message);});});
    client.addEventListener('error',({detail})=>{if(isCurrent())end(detail);});
    heartbeat=setInterval(()=>{if(isCurrent())command({action:'heartbeat',session:activeSession}).catch(error=>{if(isCurrent())end(error.message);});},3000);
    status.textContent='Gemini Liveへ接続中';
    await client.connect({apiKey,model:model.value.trim()||opened.config.model,voice:voice.value.trim()||opened.config.voice,instruction:opened.config.instruction,tools:opened.config.tools});
    if(current!==generation)return;status.textContent='接続しました。話しかけてください';controls();
    client.text('こんにちは。短く自己紹介して挨拶してください。');
  }catch(error){if(current===generation)await end(error.message||'会話を開始できませんでした');}
});
stop.addEventListener('click',()=>end());
device.addEventListener('gar-audio-input',({detail})=>client?.sendAudio(detail.bytes));
device.addEventListener('gar-audio-mute',({detail})=>{if(detail.muted)client?.audioEnd();});
device.addEventListener('gar-audio-error',({detail})=>end(detail.message));
device.addEventListener('gar-audio-playback',({detail})=>{const active=session;if(active)command({action:'playback',session:active,playing:detail.playing}).catch(error=>{if(session===active)end(error.message);});});
document.querySelector('#live-text-form').addEventListener('submit',event=>{event.preventDefault();if(!client?.ready||!text.value.trim())return;client.text(text.value.trim());text.value='';lastLine=lastRole=null;});
window.addEventListener('pagehide',()=>{disposed=true;clearTimeout(pollTimer);clearInterval(heartbeat);client?.stop();device.stop().catch(()=>{});if(session)fetch('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close',session}),keepalive:true}).catch(()=>{});});
poll();
