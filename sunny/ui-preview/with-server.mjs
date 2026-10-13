import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','ui-preview/vite.config.mjs'],{cwd,stdio:['ignore','ignore','inherit']});
try{
 let ready=false;
 for(let i=0;i<60;i++){try{ready=(await fetch('http://127.0.0.1:4177/ui-preview/index.html')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}
 if(!ready)throw Error('Preview did not start');
 const [script,...args]=process.argv.slice(2);
 const child=spawn(process.execPath,[`ui-preview/${script}`,...args],{cwd,stdio:'inherit',env:process.env});
 process.exitCode=await new Promise(r=>child.on('exit',code=>r(code??1)));
}finally{server.kill();}
