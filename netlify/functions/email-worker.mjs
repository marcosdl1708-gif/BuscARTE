import { mailService } from '../lib/mail-runtime.mjs';

// Netlify scheduled functions cannot be invoked through a public URL.
export default async function worker() {
  const started=Date.now(),counts={sent:0,deferred:0,cancelled:0,failed:0};
  try {
    for(let index=0;index<5 && Date.now()-started<18000;index++) {
      const result=await mailService.dispatch();
      if(result.status==='empty')break;
      if(Object.hasOwn(counts,result.status))counts[result.status]++;
      if(result.status==='deferred')break;
      await new Promise(resolve=>setTimeout(resolve,1100));
    }
    console.log('Email queue:',JSON.stringify(counts));
    return new Response(null,{status:200});
  } catch {console.warn('Email queue unavailable');return new Response(null,{status:503});}
}
export const config={schedule:'*/5 * * * *'};
