'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('Linux Product audio entry executes bounded jobs, speech and cancellation', {skip:process.platform !== 'linux'}, async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(),'friend-audio-cli-'));
  t.after(() => fs.rm(directory,{recursive:true,force:true}));
  const bin = path.join(directory,'bin'), hardware = path.join(directory,'hardware');
  await fs.mkdir(bin); await fs.mkdir(hardware);
  const log = path.join(directory,'calls.jsonl'), started = path.join(directory,'started');
  const env = {...process.env, PATH:bin+path.delimiter+process.env.PATH,
    GAR_HARDWARE_DIR:hardware, GAR_TOOLS_ROOT:path.join(root,'sources/gar-tools'), AUDIO_TEST_LOG:log, AUDIO_TEST_STARTED:started};
  const fixture = `#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path');
const name=path.basename(process.argv[1]),args=process.argv.slice(2);
fs.appendFileSync(process.env.AUDIO_TEST_LOG,JSON.stringify({name,args})+'\\n');
function wave(file){const b=Buffer.alloc(32044);b.write('RIFF');b.write('WAVE',8);fs.writeFileSync(file,b);}
if(name==='arecord'){
 if(process.env.AUDIO_TEST_SLOW){fs.writeFileSync(process.env.AUDIO_TEST_STARTED,'started');setInterval(()=>{},1000);}
 else wave(args.at(-1));
}else if(name==='open_jtalk'){
 let text='';process.stdin.on('data',b=>text+=b);process.stdin.on('end',()=>{fs.appendFileSync(process.env.AUDIO_TEST_LOG,JSON.stringify({text})+'\\n');wave(args[args.indexOf('-ow')+1]);});
}else if(!fs.readFileSync(args.at(-1)).length)process.exit(1);
`;
  for (const name of ['arecord','aplay','open_jtalk']) await fs.writeFile(path.join(bin,name),fixture,{mode:0o755});
  await fs.writeFile(path.join(hardware,'audio.csv'),'direction,device\ncapture,"plughw:CARD=FakeMic,DEV=0"\nplayback,"plughw:CARD=FakeSpeaker,DEV=0"\n');
  await fs.writeFile(path.join(hardware,'effects.csv'),'kind,enabled,dictionary,voice,speed\nspeech,1,/test-dictionary,/test-voice,1\n');
  const cli = path.join(root,'scripts/audio.cjs');
  const run = args => {
    const result = spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr||String(result.error)); return result.stdout;
  };
  const report = JSON.parse(run(['check']));
  assert.deepEqual(report.commands,{arecord:true,aplay:true,open_jtalk:true});
  const file = path.join(directory,'capture.wav');
  assert.equal(run(['record',file,'2']).trim(),file);
  assert.equal((await fs.stat(file)).mode & 0o777,0o600);
  run(['play',file]); run(['say','こんにちは。USBの試験です。']);
  let calls = (await fs.readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(calls[0].name,'arecord');
  assert.ok(calls[0].args.includes('2'));
  assert.equal(calls[1].args[2],'plughw:CARD=FakeSpeaker,DEV=0');
  assert.ok(calls.some(call => call.text === 'こんにちは。USBの試験です。\n'));
  assert.equal(calls.at(-1).args[2],'plughw:CARD=FakeSpeaker,DEV=0');

  const cancelled = path.join(directory,'cancelled.wav');
  const child = spawn(process.execPath,[cli,'record',cancelled,'15'],{env:{...env,AUDIO_TEST_SLOW:'1'},stdio:'ignore'});
  t.after(() => { if(child.exitCode === null) child.kill('SIGKILL'); });
  const finished = new Promise((resolve,reject) => { child.once('error',reject); child.once('exit',(code,signal)=>resolve({code,signal})); });
  for(let i=0;i<100;i++){
    try { await fs.stat(started); break; }
    catch(error){if(error.code!=='ENOENT')throw error;}
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  await fs.stat(started); child.kill('SIGTERM');
  const result = await finished;
  assert.equal(result.code,1);
  await assert.rejects(fs.stat(cancelled),{code:'ENOENT'});
  assert.equal((await fs.readdir(directory)).some(name=>name.startsWith('.friend-recording-')),false);
});
