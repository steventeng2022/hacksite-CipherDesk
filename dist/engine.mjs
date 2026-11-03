import {seedState} from './fixtures.mjs';
import {demoUser,missions} from './catalog.mjs';

// Intentionally vulnerable, synthetic teaching service. Shared by the browser
// adapter and the optional loopback-only HTTP server. No real credentials/data.
const DEMO_KEY='CIPHERDESK-DEMO-ONLY-HMAC-KEY-NOT-FOR-PRODUCTION';
const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const segment=value=>b64(encoder.encode(JSON.stringify(value)));
const unsegment=value=>JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));
async function signingKey(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
export async function issueToken(user,secret=DEMO_KEY){const input=segment({alg:'HS256',typ:'JWT'})+'.'+segment({sub:user.id,tenantId:user.tenantId,role:user.role,exp:Math.floor(Date.now()/1000)+28800});return input+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret),encoder.encode(input))))}
export async function verifyToken(token,secret=DEMO_KEY){try{const [head,payload,signature,...extra]=token.split('.');if(extra.length)throw Error();const h=unsegment(head),p=unsegment(payload);if(!p.sub||!p.tenantId||!p.role||!Number.isFinite(p.exp)||p.exp<Date.now()/1000)throw Error();if(h.alg==='none'&&signature==='')return {...p,verification:'unsigned'}; // INTENTIONAL algorithm downgrade.
  if(h.alg!=='HS256'||!signature)throw Error();const sig=Uint8Array.from(atob(signature.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));if(!await crypto.subtle.verify('HMAC',await signingKey(secret),sig,encoder.encode(head+'.'+payload)))throw Error();return {...p,verification:'signed'};
}catch{return null}}
const clone=value=>structuredClone(value);
const brief=({body,...doc})=>doc;
export class LabService{
  constructor(state,{secret=DEMO_KEY}={}){this.state=state?.version===1?clone(state):seedState();this.secret=secret}
  snapshot(){return clone(this.state)}
  complete(id){if(!this.state.completed.includes(id)){this.state.completed.push(id);return id}return null}
  async request({method='GET',path='/api/me',headers={},body={}}={}){
    method=method.toUpperCase();const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),String(v)]));let url;
    try{url=new URL(path,'https://cipherdesk.invalid');if(url.origin!=='https://cipherdesk.invalid'||!url.pathname.startsWith('/api/'))throw Error()}catch{return {status:400,body:{error:'只接受 /api/ 開頭的站內相對路徑。'}}}
    const route=url.pathname, now=new Date().toISOString();const newProof=[];const mark=id=>{if(this.complete(id))newProof.push(id)};
    const result=(status,data)=>{this.state.events.unshift({id:'evt_'+(++this.state.sequence),at:now,method,path:route,status});this.state.events=this.state.events.slice(0,80);return {status,body:clone(data),proof:newProof}};
    if(route==='/api/demo/session'&&method==='POST'){const member=this.state.members.find(m=>m.id===demoUser.id);return result(200,{user:member,token:await issueToken(member,this.secret),notice:'Fictional training account only'})}
    const publicShare=route.startsWith('/api/shared/');
    const claims=await verifyToken((h.authorization||'').replace(/^Bearer\s+/i,''),this.secret);
    if(!claims&&!publicShare)return result(401,{error:'需要有效的教學 API 權杖。請重新連線示範帳號。'});
    const tenant=h['x-workspace-id']||claims?.tenantId; // INTENTIONAL: trusts caller-controlled context.
    const admin=claims?.role==='workspace_admin';
    const doc=id=>this.state.documents.find(d=>d.id===id);
    const ownDoc=id=>doc(id)?.tenantId===claims?.tenantId;
    const next=prefix=>prefix+'_'+(++this.state.sequence);
    const match=pattern=>route.match(pattern);
    if(route==='/api/me'&&method==='GET')return result(200,{user:{...this.state.members.find(m=>m.id===claims.sub),role:claims.role,tenantId:claims.tenantId},verification:claims.verification});
    if(route==='/api/workspace'&&method==='GET')return result(200,{id:claims.tenantId,name:claims.tenantId==='aster'?'Aster Studio':'Helix Research',plan:'Business',storage:{used:7.2,total:20},members:this.state.members.filter(m=>m.tenantId===claims.tenantId).length});
    if(route==='/api/documents'&&method==='GET')return result(200,{documents:this.state.documents.filter(d=>d.tenantId===claims.tenantId).map(brief)});
    if(route==='/api/search'&&method==='GET'){const q=(url.searchParams.get('q')||'').toLowerCase();return result(200,{workspaceContext:tenant,results:this.state.documents.filter(d=>d.tenantId===tenant&&(d.title+' '+d.category).toLowerCase().includes(q)).map(brief)})}
    let m;
    if((m=match(/^\/api\/documents\/([^/]+)$/))&&method==='GET'){const d=doc(m[1]);if(!d)return result(404,{error:'找不到文件'});if(d.tenantId!==tenant)return result(403,{error:'文件不屬於目前工作空間'});if(d.tenantId!==claims.tenantId&&h['x-workspace-id'])mark('boundary');return result(200,{document:d,revisions:this.state.revisions.filter(r=>r.documentId===d.id&&!r.deleted).map(({body,...r})=>r)})}
    if((m=match(/^\/api\/revisions\/([^/]+)$/))&&method==='GET'){const r=this.state.revisions.find(r=>r.id===m[1]);if(!r||!ownDoc(r.documentId))return result(404,{error:'找不到版本'});if(r.deleted&&url.searchParams.get('includeDeleted')!=='true')return result(410,{error:'版本已刪除',hint:'Legacy integration supports includeDeleted'});if(r.deleted)mark('revision');return result(200,{revision:r})}
    if(route==='/api/members'&&method==='GET')return result(200,{members:this.state.members.filter(m=>m.tenantId===claims.tenantId),invitations:this.state.invitations.filter(i=>i.tenantId===claims.tenantId)});
    if(route==='/api/invitations'&&method==='POST'){const email=String(body.email||'').toLowerCase();if(!email.endsWith('.test'))return result(400,{error:'請使用 .test 結尾的虛構 Email'});const invitation={id:next('inv'),email,role:'viewer',...body,tenantId:claims.tenantId,createdBy:claims.sub,status:'pending'};invitation.id=next('inv');this.state.invitations.push(invitation);return result(201,{invitation})} // INTENTIONAL mass assignment of role.
    if((m=match(/^\/api\/invitations\/([^/]+)\/accept$/))&&method==='POST'){const i=this.state.invitations.find(i=>i.id===m[1]);const member=this.state.members.find(m=>m.id===claims.sub);if(!i||i.status!=='pending'||i.email!==member?.email||i.tenantId!==member.tenantId)return result(403,{error:'邀請無法由目前帳號接受'});member.role=i.role;i.status='accepted';if(member.id==='u_mika'&&member.role==='workspace_admin')mark('invitation');return result(200,{user:member,token:await issueToken(member,this.secret)})}
    if(route==='/api/approvals'&&method==='GET')return result(200,{approvals:this.state.approvals.filter(a=>a.tenantId===claims.tenantId)});
    if((m=match(/^\/api\/approvals\/([^/]+)(\/approve)?$/))){const a=this.state.approvals.find(a=>a.id===m[1]);if(!a||a.tenantId!==claims.tenantId)return result(404,{error:'找不到審批'});if(method==='GET')return result(200,{approval:a,etag:String(a.version)});if(method==='POST'&&m[2]){if(claims.sub===a.submitterId)return result(403,{error:'申請人不可核准自己的申請'});if(!['reviewer','workspace_admin'].includes(claims.role))return result(403,{error:'需要審核者權限'});if(!a.approvedBy.includes(claims.sub))a.approvedBy.push(claims.sub);if(a.approvedBy.length>=a.requiredApprovals)a.status='approved';a.version++;return result(200,{approval:a})}if(method==='PATCH'&&!m[2]){if(!admin)return result(403,{error:'管理更新需要 workspace_admin'});if(h['if-match']!==String(a.version))return result(409,{error:'版本衝突',expectedVersion:a.version});for(const field of ['status','approvedBy'])if(body[field]!==undefined)a[field]=clone(body[field]);a.version++;if(a.status==='approved'&&a.submitterId===claims.sub&&Array.isArray(a.approvedBy)&&a.approvedBy.length<a.requiredApprovals)mark('workflow');return result(200,{approval:a})}} // INTENTIONAL state-machine bypass.
    if(route==='/api/admin/policy'&&method==='GET'){if(!admin)return result(403,{error:'僅限管理員'});if(claims.verification==='unsigned')mark('token');return result(200,{policy:{requiredApprovals:2,allowSelfApproval:false,tenantIsolation:true},integration:{acceptedAlgorithms:['HS256','none'],compatibilityMode:'legacy'},notice:'Fictional configuration; not a real service secret.'})}
    if(route==='/api/exports'&&method==='GET')return result(200,{exports:this.state.exports.filter(j=>j.tenantId===claims.tenantId)});
    if(route==='/api/exports'&&method==='POST'){if(!admin)return result(403,{error:'建立匯出工作需要 workspace_admin'});const ids=body.documentIds;if(!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(id=>!doc(id)))return result(400,{error:'請提供有效 documentIds（1–20 筆）'});if(!ownDoc(ids[0]))return result(403,{error:'第一份文件不屬於目前租戶'});const job={id:next('job'),tenantId:claims.tenantId,ownerId:claims.sub,documentIds:ids,status:'ready',created:now,name:String(body.name||'文件匯出')};this.state.exports.push(job);return result(201,{export:job})} // INTENTIONAL: validates first item only.
    if((m=match(/^\/api\/exports\/([^/]+)(\/download)?$/))&&method==='GET'){const job=this.state.exports.find(j=>j.id===m[1]);if(!job)return result(404,{error:'找不到匯出工作'});if(!m[2]){if(job.tenantId!==claims.tenantId)return result(403,{error:'匯出工作不屬於你的工作空間'});return result(200,{export:job})}const contents=job.documentIds.map(doc).filter(Boolean);if(job.tenantId!==claims.tenantId)mark('download');if(job.tenantId===claims.tenantId&&contents.some(d=>d.tenantId!==claims.tenantId))mark('batch');return result(200,{filename:job.id+'.json',export:job,documents:contents})} // INTENTIONAL download authorization omission.
    if(route==='/api/shares'&&method==='POST'){if(!ownDoc(body.documentId))return result(403,{error:'只能共用自己的工作空間文件'});const share={id:next('share'),token:crypto.randomUUID(),documentId:body.documentId,tenantId:claims.tenantId,createdBy:claims.sub,expiresAt:Date.now()+86400000};this.state.shares.push(share);return result(201,{share,url:'#/shared/'+share.token})}
    if((m=match(/^\/api\/shared\/([^/]+)$/))&&method==='GET'){const share=this.state.shares.find(s=>s.token===m[1]);if(!share||share.expiresAt<Date.now())return result(404,{error:'共用連結不存在或已到期'});const d=doc(url.searchParams.get('documentId')||share.documentId);if(!d)return result(404,{error:'找不到文件'});if(d.tenantId!==share.tenantId)mark('share');return result(200,{document:d,sharedBy:share.createdBy,expiresAt:share.expiresAt})} // INTENTIONAL capability not bound to resource.
    if(route==='/api/audit'&&method==='GET')return result(200,{events:this.state.events.slice(0,35)});
    if(route==='/api/lab/progress'&&method==='GET')return result(200,{completed:this.state.completed,points:missions.filter(m=>this.state.completed.includes(m.id)).reduce((s,m)=>s+m.points,0),total:1850});
    return result(404,{error:'找不到 API 路徑',method,path:route});
  }
}
