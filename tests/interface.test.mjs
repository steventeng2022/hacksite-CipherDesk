import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';

test('browser-local interface supports normal workspace flows and API exploration',async()=>{
  const window=new Window({url:'http://localhost/hacksite-CipherDesk/',settings:{disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true,disableCSSFileLoading:true}});
  const nativeSet=globalThis.setTimeout,nativeClear=globalThis.clearTimeout,timers=new Set();
  const bindings={window,document:window.document,localStorage:window.localStorage,location:window.location,FormData:window.FormData,addEventListener:window.addEventListener.bind(window),setTimeout:(fn,ms,...args)=>{const timer=nativeSet(()=>{timers.delete(timer);fn(...args)},ms);timers.add(timer);return timer},clearTimeout:timer=>{timers.delete(timer);nativeClear(timer)}};
  const previous=new Map();for(const [key,value]of Object.entries(bindings)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true})}
  const doc=window.document;
  const until=async condition=>{for(let i=0;i<120;i++){if(condition())return;await new Promise(r=>nativeSet(r,5))}assert.ok(condition(),'Expected UI state did not appear')};
  const click=selector=>{const el=doc.querySelector(selector);assert.ok(el,selector);el.click()};
  const submit=selector=>doc.querySelector(selector).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  const navigate=async(hash,selector)=>{window.location.hash=hash;await until(()=>doc.querySelector(selector))};
  try{
    doc.write(await readFile(new URL('../public/index.html',import.meta.url),'utf8'));
    await import('../public/app.mjs');
    assert.equal(doc.querySelectorAll('.stat-card').length,4);
    assert.equal(doc.querySelectorAll('.documents-panel tbody tr').length,5);
    await navigate('/documents/doc_as_104','.document-body');assert.match(doc.querySelector('.document-body').textContent,/交接/);
    click('[data-action="share"]');await until(()=>doc.querySelector('.share-url'));assert.match(doc.querySelector('.share-url').getAttribute('href'),/#\/shared\//);
    click('[data-action="close-dialog"]');
    await navigate('/members','.member-cell');assert.equal(doc.querySelectorAll('.member-cell').length,3);
    click('[data-action="invite"]');await until(()=>doc.querySelector('#invite-form'));submit('#invite-form');await until(()=>doc.querySelector('.invitation-row'));
    assert.match(doc.querySelector('.invitation-row').textContent,/partner@aster/);
    await navigate('/approvals','.approval-card');assert.equal(doc.querySelectorAll('.approval-card').length,3);
    click('[data-action="approval-detail"]');await until(()=>doc.querySelector('[data-action="approve"]'));assert.ok(doc.querySelector('[data-action="approve"]').disabled);click('[data-action="close-dialog"]');
    await navigate('/api','#api-form');assert.ok(doc.querySelector('#api-token').value.includes('.'));submit('#api-form');await until(()=>doc.querySelector('#response-body').textContent.includes('u_mika'));
    doc.querySelector('#api-path').value='/api/search?q=研究';doc.querySelector('#api-headers').value='{"X-Workspace-Id":"helix"}';submit('#api-form');await until(()=>doc.querySelector('#response-body').textContent.includes('doc_hx_704'));
    doc.querySelector('#api-path').value='/api/documents/doc_hx_704';submit('#api-form');await until(()=>doc.querySelector('#mission-progress').textContent==='1/8');
    click('[data-action="missions"]');await until(()=>doc.querySelectorAll('.mission').length===8);assert.equal(doc.querySelectorAll('.mission.done').length,1);
    click('[data-action="reset-prompt"]');await until(()=>doc.querySelector('[data-action="reset-confirm"]'));click('[data-action="reset-confirm"]');await until(()=>doc.querySelector('#mission-progress').textContent==='0/8'&&doc.querySelector('.stats-grid'));
    assert.equal(JSON.parse(window.localStorage.getItem('cipherdesk_state')).invitations.length,0);
    assert.equal(doc.querySelectorAll('script:not([src])').length,0);
  }finally{for(const timer of timers)nativeClear(timer);await window.happyDOM.close();for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}}
});
