'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {DeviceBridge}=require('./device-bridge.cjs');
const {BodyController,validateBodyInput}=require('./body-controller.cjs');
class RequestError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const parts=new Set(['display.mjs','framebuffer.mjs','rotary.mjs','pca9685.js','sg90.js','servo-model.mjs','component-styles.mjs','pwm-components.css']);
function parsePublicOrigin(value){
  if(!value)return null;
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||value!==value.trim())throw new Error('ROBOT_PANEL_ORIGIN must be one HTTPS origin');
  return url.origin;
}
function inside(parent,child){const relative=path.relative(parent,child);return relative!==''&&relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
function validateInput(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new RequestError('Invalid rotary input');
  const keys=Object.keys(value);
  if(value.action==='rotate'&&keys.length===2&&keys.includes('direction')&&(value.direction===1||value.direction===-1))return;
  if(value.action==='press'&&keys.length===1)return;
  throw new RequestError('Expected a rotary rotation (-1/1) or press');
}
function createSimulatorServer({root=path.resolve(__dirname,'..'),deviceBridge,bodyController,publicOrigin=process.env.ROBOT_PANEL_ORIGIN,environment=process.env.GAR_SIM_ENVIRONMENT||'local-host'}={}){
  root=fs.realpathSync(root);
  const bridge=deviceBridge||new DeviceBridge(),origin=parsePublicOrigin(publicOrigin);
  const body=bodyController||new BodyController({root,environment});
  const host={environment,platform:process.platform,arch:process.arch,hostname:os.hostname()};
  const server=http.createServer(async(req,res)=>{
    const local=[`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`];
    const hosts=[...local,...(origin?[new URL(origin).host]:[])];
    const origins=[...local.map(value=>'http://'+value),...(origin?[origin]:[])];
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json=(code,value)=>{const data=JSON.stringify(value);res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(req.method==='HEAD'?undefined:data);};
    try{
      if(!hosts.includes(req.headers.host))throw new RequestError('Unknown panel host',403);
      let route;try{route=decodeURIComponent(req.url.split('?')[0]);}catch{throw new RequestError('Invalid URL');}
      if(route.includes('\\')||route.includes('\0')||route.split('/').includes('..'))throw new RequestError('Path outside public files',403);
      if(req.method==='GET'||req.method==='HEAD'){
        if(route==='/health')return json(200,{ok:bridge.status().displayReady,product:'orange-pi-face-lab',pid:process.pid,host,io:bridge.status()});
        if(route==='/api/state')return json(200,{...bridge.state(),body:body.state()});
        if(route==='/api/body/config')return json(200,{servos:body.configuration()});
        if(route==='/api/io/frame'){
          if(!bridge.status().displayReady)throw new RequestError('Waiting for the display driver',503);
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bridge.frame.length,ETag:bridge.frameId});res.end(req.method==='HEAD'?undefined:bridge.frame);return;
        }
        let directory,relative;
        if(route==='/'){directory='simulator';relative='index.html';}
        else if(route.startsWith('/simulator/')){directory='simulator';relative=route.slice(11);}
        else if(route.startsWith('/gar-components/')&&parts.has(route.slice(16))){directory='sources/gar-tools/web-simulator/components';relative=route.slice(16);}
        else throw new RequestError('Not found',404);
        let allowed,file;try{allowed=fs.realpathSync(path.join(root,directory));file=fs.realpathSync(path.resolve(allowed,relative));}catch{throw new RequestError('Not found',404);}
        if(!inside(root,allowed)||!inside(allowed,file)||!fs.statSync(file).isFile())throw new RequestError('Path outside public files',403);
        if(!types[path.extname(file)])throw new RequestError('Not found',404);
        const data=fs.readFileSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)],'Content-Length':data.length});res.end(req.method==='HEAD'?undefined:data);return;
      }
      if(req.method!=='POST'||!['/api/rotary','/api/body'].includes(route))throw new RequestError('Not found',404);
      if((req.headers.origin&&!origins.includes(req.headers.origin))||req.headers['sec-fetch-site']==='cross-site')throw new RequestError('Cross-site input is not accepted',403);
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw new RequestError('Send JSON',415);
      const chunks=[];let length=0;
      for await(const chunk of req){length+=chunk.length;if(length>1024)throw new RequestError('Input too large',413);chunks.push(chunk);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new RequestError('Invalid JSON');}
      if(route==='/api/body'){
        try{validateBodyInput(input);}catch(error){throw new RequestError(error.message);}
        return json(200,{ok:true,body:await body.command(input)});
      }
      validateInput(input);
      try{await bridge.inject(input);}catch{throw new RequestError('GPIO bridge is unavailable',503);}
      json(200,{ok:true});
    }catch(error){if(!res.headersSent)json(error.status||500,{error:error.status?error.message:'Device panel error'});else res.end();}
  });
  server.shutdown=async()=>{await body.close();bridge.close();await new Promise(resolve=>server.close(resolve));};
  server.on('close',()=>{bridge.close();body.close().catch(error=>console.error(error.message));});return server;
}
if(require.main===module){
  const args=process.argv.slice(2),port=args.length?Number(args[1]):8773;
  if((args.length&&!(args.length===2&&args[0]==='--port'))||!Number.isInteger(port)||port<1||port>65535)throw new Error('Usage: node simulation/server.cjs [--port PORT]');
  const server=createSimulatorServer();server.on('error',error=>{console.error(error.message);process.exitCode=1;server.close();});server.listen(port,'127.0.0.1');
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.shutdown().then(()=>process.exit(0),error=>{console.error(error.message);process.exitCode=1;server.close();}));
}
module.exports={createSimulatorServer,parsePublicOrigin};
