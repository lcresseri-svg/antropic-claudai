import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.env.SUNNY_LOGS||'/workspace/ui3-verification';await mkdir(out,{recursive:true});
const jobs=[['liquid-dismiss.mjs'],['liquid-bulk.mjs'],['liquid-charts.mjs'],['liquid-import.mjs'],['liquid-details.mjs'],['liquid-onboarding.mjs'],...['dialog','draft','keypad','failure','backdrop'].map(m=>['check.mjs',m]),['interactions.mjs'],['accessibility.mjs'],...['print','settings','category','budget','investment'].map(m=>['regressions.mjs',m]),['piano.mjs'],['piano-acceptance.mjs'],['piano-review.mjs'],['piano-style.mjs'],['piano-category-forecast.mjs']];
const results=[];
for(const job of jobs){const label=job.join('-');console.log('RUN',label);let log='';const child=spawn(process.execPath,['ui-preview/'+job[0],...job.slice(1)],{stdio:['ignore','pipe','pipe'],env:process.env});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);const code=await new Promise(r=>child.on('exit',r));await writeFile(`${out}/${label}.log`,log);results.push({job,code});console.log(code===0?'PASS':'FAIL',label,code===0?'':log.slice(-1000));}
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));process.exitCode=results.some(r=>r.code!==0)?1:0;
