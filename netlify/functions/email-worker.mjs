import { mailService } from '../lib/mail-runtime.mjs';
import { accountDeletionService } from '../lib/account-deletion.mjs';

// Netlify scheduled functions cannot be invoked through a public URL.
export default async function worker() {
  const started=Date.now(),counts={sent:0,deferred:0,cancelled:0,failed:0};
  // Start independently before waiting for any mail/provider I/O. A sustained
  // mail outage must not starve requested file deletions. No new cron or quota.
  const cleanupTask=Promise.resolve().then(()=>accountDeletionService.processOne(null,{maxMillis:6000,maxBatches:2}))
    .catch(()=>{console.warn('Account file cleanup unavailable');});
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
  finally {
    await cleanupTask;
  }
}
export const config={schedule:'*/5 * * * *'};
