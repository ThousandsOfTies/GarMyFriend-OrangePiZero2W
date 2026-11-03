import '/gar-components/speakerphone.mjs';
import {GeminiLive} from '/gar-components/gemini-live.mjs';

// Product wiring only. Gemini protocol is shared; tool semantics live in the App.
const device=document.querySelector('#speakerphone'),start=document.querySelector('#live-start'),stop=document.querySelector('#live-stop');
const voice=document.querySelector('#live-voice');
const status=document.querySelector('#live-status'),transcript=document.querySelector('#live-transcript'),tool=document.querySelector('#live-tool');
const text=document.querySelector('#live-text'),send=document.querySelector('#live-send');
const inputStatus=document.querySelector('#live-input-status');
let client,session=null,generation=0,heartbeat,busy=false,ready=false,lastLine=null,lastRole=null,idleMessage='';
let capturedBytes=0,sentBytes=0,lastInputUpdate=0;
let credentials=null,retryTimer,retryDelay=1000,inputQueue=Promise.resolve(),tailUntil=0,recovering=null;
async function command(value){
  const response=await fetch('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(value.action==='tool'?38000:value.action==='credentials'?20000:4000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'アプリに接続できません');return result;
}
function controls(){start.disabled=busy||!ready;stop.disabled=!busy;voice.disabled=busy;text.disabled=send.disabled=!client?.ready;}
document.addEventListener('friend-panel-state',({detail:state})=>{
  ready=state?.live?.ready===true;
  if(!busy)status.textContent=idleMessage||(!state?'WebPanelとの接続を確認中':ready?'会話を始められます':state.live?.authenticationReady===false?'会話の接続設定を確認してください':'VM内の共通アプリを待っています');
  controls();
});
async function end(message='停止しました'){
  credentials=null;recovering=null;clearTimeout(retryTimer);++generation;const previous=session;session=null;clearInterval(heartbeat);client?.stop();client=null;
  controls();status.textContent='停止しています';
  await device.stop();if(previous)await command({action:'close',session:previous}).catch(()=>{});
  busy=false;idleMessage=message;status.textContent=message;inputStatus.textContent=`音声入力：停止（取得 ${(capturedBytes/32000).toFixed(1)}秒 ／ 送信 ${(sentBytes/32000).toFixed(1)}秒）`;controls();
}
function append({role,text:words}){
  if(lastRole!==role||!lastLine){lastLine=document.createElement('li');lastLine.dataset.role=role;lastLine.textContent=role==='user'?'あなた：':'相棒：';transcript.append(lastLine);lastRole=role;while(transcript.children.length>12)transcript.firstElementChild.remove();}
  lastLine.textContent=(lastLine.textContent+words).slice(0,4000);transcript.scrollTop=transcript.scrollHeight;
}
async function reconnect(current){
  if(current!==generation||!credentials||recovering===current)return;recovering=current;
  const previous=session;session=null;client?.stop();client=null;clearInterval(heartbeat);controls();
  device.stopPlayback();if(previous)await command({action:'close',session:previous}).catch(()=>{});
  if(current!==generation||!credentials)return;
  status.textContent='接続し直しています。接続後に今の姿勢を確認します';
  retryTimer=setTimeout(()=>{if(current===generation&&credentials)connect(++generation).catch(()=>reconnect(generation));},retryDelay);
  retryDelay=Math.min(60000,retryDelay*2);
}
function input(detail,current,activeSession){
  inputQueue=inputQueue.then(()=>{
    if(current!==generation||session!==activeSession)return;
    return command({action:'input',session:activeSession,input:{role:detail.role,text:detail.text.slice(0,2000)}});
  });
  inputQueue.catch(()=>{if(current===generation)reconnect(current);});return inputQueue;
}
async function connect(current){
  if(current!==generation||!credentials)return;
  recovering=null;
  try{
    const opened=await command({action:'open'});
    if(current!==generation){await command({action:'close',session:opened.session});return;}
    session=opened.session;const activeSession=session;
    const isCurrent=()=>session===activeSession&&generation===current;
    inputQueue=Promise.resolve();transcript.replaceChildren();lastLine=lastRole=null;
    client=new GeminiLive({onTool:async(call,{signal})=>{
      if(signal.aborted||session!==activeSession)throw new Error('Conversation ended');
      await inputQueue;if(!isCurrent()||signal.aborted)throw new Error('Conversation ended');
      const result=await command({action:'tool',session:activeSession,id:call.id,name:call.name,args:call.args});
      if(isCurrent()&&!signal.aborted)tool.textContent=result.status==='blocked'?'今の姿勢を確認してから、新しく動作を指示してください':result.status==='confirmed'?'今の姿勢を受け取りました。動作を指示できます':call.name==='change_emotion'?'表情を変更しました':call.name==='move_body'?`身体の動作が完了しました：${call.args.mode}`:'状態を確認しました';
      return result;
    }});
    client.addEventListener('audio',({detail})=>{if(!isCurrent())return;try{device.playPcm(detail.bytes,{sampleRate:detail.sampleRate});}catch(error){end(error.message);}});
    client.addEventListener('interrupted',()=>{if(isCurrent())device.stopPlayback();});
    client.addEventListener('transcript',({detail})=>{if(isCurrent()){append(detail);input(detail,current,activeSession);}});
    client.addEventListener('turn-end',()=>{if(isCurrent()){lastLine=lastRole=null;status.textContent=device.muted?'マイクはミュート中です':'聞いています';}});
    client.addEventListener('cancel',()=>{if(isCurrent())command({action:'cancel',session:activeSession}).catch(error=>{if(isCurrent())end(error.message);});});
    client.addEventListener('error',()=>{if(isCurrent())reconnect(current);});
    heartbeat=setInterval(()=>{if(isCurrent())command({action:'heartbeat',session:activeSession}).catch(error=>{if(isCurrent())end(error.message);});},3000);
    status.textContent='会話の接続を準備中';
    const issued=await command({action:'credentials',session:activeSession});
    if(!isCurrent())return;
    status.textContent='Gemini Liveへ接続中';
    await client.connect({...issued,voice:credentials.voice||opened.config.voice,instruction:opened.config.instruction,tools:opened.config.tools});
    if(current!==generation)return;retryDelay=1000;status.textContent=device.muted?'接続しました。マイクはミュート中です':'接続しました。今の姿勢を教えてください';controls();
    client.text(opened.config.greeting);
  }catch(error){if(current===generation)await reconnect(current);}
}
start.addEventListener('click',async()=>{
  if(busy)return;
  const selected={voice:voice.value.trim()};idleMessage='';busy=true;const current=++generation;controls();status.textContent='マイクとスピーカーを準備中';
  transcript.replaceChildren();lastLine=lastRole=null;tool.textContent='';capturedBytes=sentBytes=lastInputUpdate=0;inputStatus.textContent='音声入力：準備中';
  try{await device.start();if(current!==generation)return;credentials=selected;retryDelay=1000;await connect(current);}
  catch(error){if(current===generation)await end(error.name==='NotAllowedError'?'マイクへのアクセスが拒否されました。ブラウザとWindowsのマイク許可を確認してください。内蔵ブラウザで使えない場合はEdgeで開いてください。':error.message||'会話を開始できませんでした');}
});
stop.addEventListener('click',()=>end());
device.addEventListener('gar-audio-input',({detail})=>{
  capturedBytes+=detail.bytes.length;if(!device.playing&&Date.now()>=tailUntil&&client?.sendAudio(detail.bytes))sentBytes+=detail.bytes.length;
  if(performance.now()-lastInputUpdate>1000){lastInputUpdate=performance.now();inputStatus.textContent=`音声データ：マイク取得 ${(capturedBytes/32000).toFixed(1)}秒 ／ Geminiへ送信 ${(sentBytes/32000).toFixed(1)}秒`;}
});
device.addEventListener('gar-audio-mute',({detail})=>{if(detail.muted)client?.audioEnd();inputStatus.textContent=detail.muted?'音声入力：ミュート中':'音声入力：入力を確認中';if(client?.ready)status.textContent=detail.muted?'マイクはミュート中です':'聞いています';});
device.addEventListener('gar-audio-error',({detail})=>end(detail.message));
device.addEventListener('gar-audio-playback',({detail})=>{if(detail.playing)client?.audioEnd();else tailUntil=Date.now()+250;const active=session;if(active)command({action:'playback',session:active,playing:detail.playing}).catch(error=>{if(session===active)end(error.message);});});
document.querySelector('#live-text-form').addEventListener('submit',async event=>{event.preventDefault();if(!client?.ready||!text.value.trim())return;const words=text.value.trim(),current=generation,active=session;text.value='';lastLine=lastRole=null;append({role:'user',text:words});await input({role:'user',text:words},current,active).catch(()=>{});if(current===generation&&client?.ready)client.text(words);lastLine=lastRole=null;});
window.addEventListener('pagehide',()=>{clearInterval(heartbeat);client?.stop();device.stop().catch(()=>{});if(session)fetch('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'close',session}),keepalive:true}).catch(()=>{});});
