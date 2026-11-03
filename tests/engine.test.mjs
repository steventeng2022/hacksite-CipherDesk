import test from 'node:test';
import assert from 'node:assert/strict';
import {LabService,issueToken,verifyToken} from '../public/engine.mjs';
import {demoUser,missions} from '../public/catalog.mjs';
import {createLabServer} from '../scripts/server.mjs';

async function exerciseAll(request){
  const login=await request({method:'POST',path:'/api/demo/session'});assert.equal(login.status,200);
  let token=login.body.token;
  const call=(method,path,body={},headers={})=>request({method,path,body,headers:{authorization:'Bearer '+token,...headers}});
  assert.equal((await call('GET','/api/me')).body.user.role,'editor');
  assert.equal((await call('GET','/api/documents')).body.documents.length,5);
  assert.equal((await call('GET','/api/documents/doc_hx_704')).status,403);
  assert.equal((await call('GET','/api/admin/policy')).status,403);
  assert.equal((await call('POST','/api/approvals/apr_302/approve')).status,403);
  assert.equal((await call('POST','/api/exports',{documentIds:['doc_as_101']})).status,403);

  const search=await call('GET','/api/search?q=研究',{}, {'X-Workspace-Id':'helix'});
  assert.ok(search.body.results.some(d=>d.id==='doc_hx_704'));
  const cross=await call('GET','/api/documents/doc_hx_704',{}, {'X-Workspace-Id':'helix'});
  assert.ok(cross.proof.includes('boundary'));assert.match(cross.body.document.body,/Meridian/);

  assert.equal((await call('GET','/api/revisions/rv_104_01')).status,410);
  const old=await call('GET','/api/revisions/rv_104_01?includeDeleted=true');
  assert.ok(old.proof.includes('revision'));assert.match(old.body.revision.body,/job_hx_018/);
  assert.equal((await call('GET','/api/exports/job_hx_018')).status,403);
  const leaked=await call('GET','/api/exports/job_hx_018/download');
  assert.ok(leaked.proof.includes('download'));assert.equal(leaked.body.documents.length,2);

  const invite=await call('POST','/api/invitations',{email:demoUser.email,role:'workspace_admin'});
  const accepted=await call('POST','/api/invitations/'+invite.body.invitation.id+'/accept');
  assert.ok(accepted.proof.includes('invitation'));token=accepted.body.token;
  assert.equal((await call('GET','/api/me')).body.user.role,'workspace_admin');
  const approval=await call('GET','/api/approvals/apr_302');
  assert.equal((await call('PATCH','/api/approvals/apr_302',{status:'approved'},{'If-Match':'999'})).status,409);
  const changed=await call('PATCH','/api/approvals/apr_302',{status:'approved',approvedBy:['u_mika']},{'If-Match':approval.body.etag});
  assert.ok(changed.proof.includes('workflow'));

  const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned=enc({alg:'none',typ:'JWT'})+'.'+enc({sub:'u_mika',tenantId:'aster',role:'workspace_admin',exp:Math.floor(Date.now()/1000)+3600})+'.';
  const policy=await request({path:'/api/admin/policy',headers:{authorization:'Bearer '+unsigned}});
  assert.ok(policy.proof.includes('token'));

  const job=await call('POST','/api/exports',{name:'Mixed teaching export',documentIds:['doc_as_101','doc_hx_704']});
  const archive=await call('GET','/api/exports/'+job.body.export.id+'/download');
  assert.ok(archive.proof.includes('batch'));assert.equal(archive.body.documents[1].tenantId,'helix');

  const shared=await call('POST','/api/shares',{documentId:'doc_as_101'});
  const confused=await request({path:'/api/shared/'+shared.body.share.token+'?documentId=doc_hx_704'});
  assert.ok(confused.proof.includes('share'));assert.equal(confused.body.document.tenantId,'helix');
  const progress=await call('GET','/api/lab/progress');
  assert.deepEqual(new Set(progress.body.completed),new Set(missions.map(m=>m.id)));
  assert.equal(progress.body.points,1850);
  return token;
}

test('all eight lessons reproduce while normal authorization controls remain visible',async()=>{
  const service=new LabService();await exerciseAll(args=>service.request(args));
});

test('signed tokens verify, tampered secrets fail, and engine state stays isolated',async()=>{
  const token=await issueToken(demoUser,'one-secret');
  assert.equal((await verifyToken(token,'one-secret')).verification,'signed');
  assert.equal(await verifyToken(token,'other-secret'),null);
  const a=new LabService(),b=new LabService();
  const login=await a.request({method:'POST',path:'/api/demo/session'});
  await a.request({path:'/api/revisions/rv_104_01?includeDeleted=true',headers:{authorization:'Bearer '+login.body.token}});
  assert.deepEqual(b.snapshot().completed,[]);
});

test('loopback HTTP adapter supports the attack chains and keeps server fixtures private',async()=>{
  const server=createLabServer({httpMode:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port+'/hacksite-CipherDesk';
  const request=async({method='GET',path,headers={},body={}})=>{const response=await fetch(base+path,{method,headers:{'content-type':'application/json',...headers},...(method==='GET'?{}:{body:JSON.stringify(body)})});const result=await response.json();assert.equal(response.status,result.status);return result};
  try{
    assert.match(await (await fetch(base+'/')).text(),/data-runtime="http"/);
    assert.equal((await fetch(base+'/engine.mjs')).status,404);
    assert.equal((await fetch(base+'/fixtures.mjs')).status,404);
    assert.equal((await fetch(base+'/catalog.mjs')).status,200);
    assert.equal((await fetch(base+'/api/me',{headers:{Origin:'https://unrelated.invalid'}})).status,403);
    const token=await exerciseAll(request);
    await fetch(base+'/api/lab/reset',{method:'POST',body:'{}'});
    assert.equal((await request({path:'/api/me',headers:{authorization:'Bearer '+token}})).status,401);
  }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});

test('request validation prevents the teaching workbench from becoming an external fetch proxy',async()=>{
  const s=new LabService();
  assert.equal((await s.request({path:'https://unrelated.invalid/api/me'})).status,400);
  assert.equal((await s.request({path:'/not-api'})).status,400);
  assert.equal((await s.request({path:'/api/me'})).status,401);
});
