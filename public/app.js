/* ==========================================================================
   THE FORGE — ATHLETE DEVELOPMENT PORTAL (live version)
   Data lives in Supabase. Who can see what is enforced by the database
   (see supabase/schema.sql); this page only shows what the database returns.
   ========================================================================== */

/* ============ CONFIG ============ */
const CFG = window.FORGE_CONFIG || {};
const EMAILS = CFG.emailNotifications === true;   // family/coach notification emails (needs Resend)
const CONFIGURED = !!(window.supabase && CFG.supabaseUrl && !/YOUR-/.test(CFG.supabaseUrl) && CFG.supabaseAnonKey && !/YOUR-/.test(CFG.supabaseAnonKey));
const sb = CONFIGURED ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
const pad = n => String(n).padStart(2, '0');
const periodOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
let TODAY = new Date();
let PERIOD = periodOf(TODAY);

/* ============ CONSTANTS ============ */
const CORE=[
 {id:'move',s:'Movement',n:'Movement & Body Control'},
 {id:'hand',s:'Handfighting',n:'Positioning & Handfighting'},
 {id:'off',s:'Offense',n:'Offensive Wrestling'},
 {id:'def',s:'Defense',n:'Defensive Wrestling'},
 {id:'mat',s:'Mat / Par Terre',n:'Mat Wrestling & Par Terre'},
 {id:'habits',s:'Training Habits',n:'Training & Competition Habits'}];
const SCALE=['Not Yet Introduced','Developing','Consistent in Controlled Drilling','Effective vs. Live Resistance','Reliable in Competition'];
const SETS={
 GR:{name:'Greco-Roman',items:[['stance','Stance & positioning'],['pummel','Pummeling'],['inside','Inside control'],['uhook','Underhooks'],['two','Two-on-ones'],['setups','Upper-body attack setups'],['blocks','Bodylocks'],['throws','Throws'],['tdef','Throw defense'],['ptoff','Par terre offense'],['ptdef','Par terre defense'],['tac','Tactical understanding']]},
 FS:{name:'Freestyle',items:[['leg','Leg attacks'],['setup','Attack setups'],['finish','Finishing ability'],['legdef','Leg-attack defense'],['expo','Exposure awareness'],['ptoff','Par terre offense'],['ptdef','Par terre defense'],['trans','Transitional wrestling'],['tac','Tactical understanding']]},
 FK:{name:'Folkstyle',items:[['neut','Neutral offense'],['tdd','Takedown defense'],['top','Top control'],['ride','Riding ability'],['bottom','Bottom positioning'],['esc','Escapes & reversals'],['matret','Mat returns'],['sit','Situational awareness'],['mm','Match management']]}};
const STYLES=['Greco-Roman','Freestyle','Folkstyle','Freestyle & Greco-Roman','All Three Styles'];
const STYLESETS={'Greco-Roman':['GR'],'Freestyle':['FS'],'Folkstyle':['FK'],'Freestyle & Greco-Roman':['GR','FS'],'All Three Styles':['GR','FS','FK']};
const GOAL_ST=['Not Started','In Progress','Demonstrated','Needs Revision','Completed'];
const CATS=CORE.map(c=>c.n);
const STAGES=[
 {n:1,t:'Physical Literacy',d:'Movement, coordination, confidence and fun'},
 {n:2,t:'Wrestling Foundations',d:'Position, movement, control and mat awareness'},
 {n:3,t:'Style Exploration',d:'Freestyle and Greco technical foundations'},
 {n:4,t:'Regional Performance',d:'Advanced freestyle and Greco training'},
 {n:5,t:'National Performance',d:'National and international competition'}];
const stageName=n=>{const x=STAGES.find(s=>s.n===n);return x?`Stage ${x.n} · ${x.t}`:''};
const stagesDiffer=a=>a.coachStage&&a.familyStage&&a.coachStage!==a.familyStage;
const SUB_ST={test:'Test activation',active:'Active',grace:'Payment issue · grace period',inactive:'Inactive'};
function g(title,category,behavior,measure,review,coachRec,commit,status){return {title,category,behavior,measure,review,coachRec,commit,status}}

/* ============ STATE ============ */
let S = blankState();
function blankState(){return {ui:{role:null,filter:'all',open:null,tab:'overview',range:6,skill:'tsi',cmpA:null,cmpB:null,slot:null,pa:null,adm:'overview',choosing:false},
  me:null,people:[],athletes:[],coaches:[],requests:[],assessments:[],reflections:[],meetings:[],slots:[],asks:[],notifs:[],audit:[],links:[]}}
let SESSION=null, LOADING=false, LOAD_ERR='';
let GUARDIANS={};
const U=()=>S.ui;
function save(){} // every change is written to the database as it happens

/* ============ HELPERS ============ */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=sel=>document.querySelector(sel);
const ath=id=>S.athletes.find(a=>a.id===id);
const coach=id=>S.coaches.find(c=>c.id===id)||{id,name:id?'Coach':'Coach not assigned',styles:''};
const person=id=>S.people.find(p=>p.id===id);
function monthLabel(p){const[y,m]=p.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'})}
function monthShort(p){const[y,m]=p.split('-').map(Number);return new Date(y,m-1,1).toLocaleDateString('en-US',{month:'short'})}
function periodEnd(p){const[y,m]=p.split('-').map(Number);return new Date(y,m,0)}
function fd(iso,opt){if(!iso)return '—';const d=/^\d{4}-\d{2}-\d{2}$/.test(iso)?new Date(iso+'T12:00:00'):new Date(iso);return d.toLocaleDateString('en-US',opt||{month:'short',day:'numeric',year:'numeric'})}
function ft(iso){return new Date(iso).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}
function initials(n){return String(n||'?').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}
function firstName(n){return String(n||'').split(' ')[0]}
const sameTime=(a,b)=>+new Date(a)===+new Date(b);
const pubs=id=>S.assessments.filter(a=>a.athleteId===id&&a.status==='published').sort((a,b)=>a.period.localeCompare(b.period));
const latestPub=id=>pubs(id).slice(-1)[0];
const prevPub=(id,period)=>pubs(id).filter(a=>a.period<period).slice(-1)[0];
const find=(id,p)=>S.assessments.find(a=>a.athleteId===id&&a.period===p);
function tsi(r){const v=CORE.map(c=>r[c.id]).filter(x=>typeof x==='number');return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
const observed=r=>CORE.filter(c=>typeof r[c.id]==='number').length;
const fmtR=v=>typeof v==='number'?v+'/4':(v==='NO'?'Not observed':'—');
function editPeriod(a){return a.overdueFrom||PERIOD}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('on'),3200)}
function daysTo(d){return Math.ceil((d-TODAY)/864e5)}
function dayDiff(a,b){const x=new Date(a.getFullYear(),a.getMonth(),a.getDate()),y=new Date(b.getFullYear(),b.getMonth(),b.getDate());return Math.round((x-y)/864e5)}
const dueLabel=p=>periodEnd(p).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
// Where a coach stands on an athlete's monthly report: overdue | due | done | notyet
function deadline(a){
  if(a.overdue&&a.overdue.length){const p=a.overdue[0];return {state:'overdue',period:p,count:a.overdue.length,late:dayDiff(TODAY,periodEnd(p))}}
  const r=find(a.id,PERIOD);const left=dayDiff(periodEnd(PERIOD),TODAY);
  if(r&&r.status==='published')return {state:'done',period:PERIOD,left};
  if(!a.owesCurrent)return {state:'notyet',period:a.firstOwed,left:dayDiff(periodEnd(a.firstOwed),TODAY)}
  return {state:'due',period:PERIOD,left,stage:!r?'Not started':r.status==='draft'?'Draft in progress':r.status==='review'?'Awaiting your review':'Approved — publish it'}
}
const leftText=n=>n<=0?'Due today':n===1?'1 day left':n+' days left';
const lateText=n=>n<=1?'1 day late':n+' days late';
function trend(c,p){if(typeof c!=='number'||typeof p!=='number')return {t:p===undefined?'New':'—',c:'muted',a:''};if(c>p)return {t:'Improving',c:'up-c',a:'↑'};if(c<p)return {t:'Needs renewed attention',c:'down-c',a:'↓'};return {t:'Consistent',c:'muted',a:'→'}}
const isAdmin=()=>S.me?.role==='admin';
const isCoachMe=()=>S.me&&(S.me.role==='coach'||(S.me.role==='admin'&&S.me.is_coach));
const myId=()=>S.me?.id;
const errMsg=e=>{const m=(e&&e.message)||'';if(/locked|no longer available|assigned coach/i.test(m)||/Approve the report/i.test(m)||/Only an administrator/i.test(m)||/isn.t published|not found/i.test(m)||/start as drafts/i.test(m))return m;
  if(/duplicate key/i.test(m))return 'That already exists.';if(/row-level security/i.test(m))return 'You don’t have permission to do that.';
  if(/Failed to fetch|NetworkError/i.test(m))return 'Can’t reach the server. Check your connection and try again.';return m||'Something went wrong. Try again.'};

/* ============ DATA ============ */
async function q(p){const {data,error}=await p;if(error)throw error;return data||[]}
function familyName(a,gs){const lasts=[...new Set(gs.map(x=>x.full_name.trim().split(' ').slice(-1)[0]))];
  return (lasts.length?lasts.join(' / '):a.full_name.trim().split(' ').slice(-1)[0])+' family'}
async function loadAll(){
  TODAY=new Date();PERIOD=periodOf(TODAY);
  const email=(SESSION?.user?.email||'').toLowerCase();
  const people=await q(sb.from('people').select('*'));
  const me=people.find(p=>p.email===email&&p.active)||null;
  S.me=me;if(!me)return;
  const staff=me.role!=='guardian';
  const [athletes,links,assess,notes,refl,asks,mtgs,avail,notifs,audit,creqs]=await Promise.all([
    q(sb.from('athletes').select('*').order('full_name')),
    q(sb.from('athlete_guardians').select('*')),
    q(sb.from('assessments').select('*')),
    staff?q(sb.from('assessment_notes').select('*')):Promise.resolve([]),
    q(sb.from('reflections').select('*').order('created_at')),
    q(sb.from('asks').select('*').order('created_at')),
    q(sb.from('meetings').select('*').order('starts_at')),
    q(sb.from('availability').select('*').order('starts_at')),
    q(sb.from('notifications').select('*').order('created_at',{ascending:false}).limit(100)),
    me.role==='admin'?q(sb.from('audit_log').select('*').order('at',{ascending:false}).limit(60)):Promise.resolve([]),
    q(sb.from('coach_requests').select('*').order('created_at'))]);
  const P=Object.fromEntries(people.map(p=>[p.id,p]));
  S.people=people;S.links=links;
  S.coaches=people.filter(p=>p.role==='coach'||(p.role==='admin'&&p.is_coach)).map(p=>({id:p.id,name:p.full_name,styles:p.specialties||'',bio:p.bio||'',accepting:p.accepting!==false,active:p.active}));
  const noteMap=Object.fromEntries(notes.map(n=>[n.assessment_id,n.notes||{}]));
  S.assessments=assess.map(r=>({id:r.id,athleteId:r.athlete_id,period:String(r.period).slice(0,7),status:r.status,ratings:r.ratings||{},styleRatings:r.style_ratings||{},notes:noteMap[r.id]||{},
    stand:r.stand||'',well:r.well||'',tough:r.tough||'',adjCoach:r.adj_coach||'',adjAthlete:r.adj_athlete||'',take:r.take||'',goals:r.goals||[],contrib:r.contrib,coach:r.coach_id,
    ts:{created:r.created_at,edited:r.updated_at,approved:r.approved_at,published:r.published_at,ack:r.acknowledged_at}}));
  GUARDIANS={};
  S.athletes=athletes.map(a=>{const ls=links.filter(l=>l.athlete_id===a.id);const gs=ls.map(l=>P[l.guardian_id]).filter(Boolean);
    GUARDIANS[a.id]=ls.map(l=>{const p=P[l.guardian_id];return p&&{id:p.id,name:p.full_name,rel:l.relationship,email:p.email,phone:p.phone||'',pref:p.contact_pref||'Email',best:p.best_time||'',notify:p.notify_email}}).filter(Boolean);
    return {id:a.id,name:a.full_name,style:a.primary_style,coach:a.coach_id,aff:a.affiliation,stage:a.stage,coachStage:a.coach_stage||null,familyStage:a.family_stage||null,status:a.status,created:a.created_at,family:familyName(a,gs),guardianIds:gs.map(x=>x.id)}});
  S.requests=creqs.map(r=>({id:r.id,athleteId:r.athlete_id,coach:r.coach_id,byName:r.requester_name||'A Forge family',note:r.note||'',status:r.status,ts:r.created_at,decided:r.decided_at}));
  S.athletes.forEach(a=>{
    // Reports are owed from the month the current coach took the athlete on (after the 15th → starting next month).
    const acc=S.requests.filter(r=>r.athleteId===a.id&&r.coach===a.coach&&r.status==='accepted').map(r=>r.decided).sort().slice(-1)[0];
    const start=new Date(acc&&acc>a.created?acc:a.created);
    const first=new Date(start.getFullYear(),start.getMonth()+(start.getDate()>15?1:0),1);
    a.firstOwed=periodOf(first);a.owesCurrent=a.firstOwed<=PERIOD;a.overdue=[];
    if(a.status!=='inactive'&&a.coach)for(let d=new Date(first);periodOf(d)<PERIOD;d=new Date(d.getFullYear(),d.getMonth()+1,1)){
      const p=periodOf(d),r=find(a.id,p);if(!(r&&r.status==='published'))a.overdue.push(p)}
    a.overdueFrom=a.overdue[0]||null});
  S.reflections=refl.map(r=>({id:r.id,athleteId:r.athlete_id,assessmentId:r.assessment_id,ts:r.created_at,answers:r.answers||{},author:P[r.author_id]?.full_name||'Family',ack:r.ack_at?{ts:r.ack_at,reply:r.ack_reply||''}:null}));
  S.meetings=mtgs.map(m=>({id:m.id,athleteId:m.athlete_id,coach:m.coach_id,slot:m.starts_at,purpose:m.purpose,note:m.note||'',status:m.status,summary:m.summary||'',ts:m.created_at}));
  S.slots=avail.map(s=>({id:s.id,at:s.starts_at,on:s.open,coach:s.coach_id}));
  S.asks=asks.map(x=>({id:x.id,athleteId:x.athlete_id,type:x.type,text:x.body,ts:x.created_at,seen:!!x.seen_at,
    reply:(x.reply_text||x.reply_link)?{by:P[x.reply_by]?.full_name||'Family',ts:x.replied_at,text:x.reply_text||'',link:x.reply_link||''}:null}));
  S.notifs=notifs.map(n=>({id:n.id,ts:n.created_at,athleteId:n.athlete_id,kind:n.kind,to:P[n.person_id]?.full_name||n.address,channel:n.channel,addr:n.address,subject:n.subject,text:n.body,status:n.status,error:n.error}));
  S.audit=audit.map(e=>({ts:e.at,actor:P[e.actor_id]?.full_name||'System',action:e.action}));
}
function rolesFor(me){if(!me)return [];if(me.role==='guardian')return [['parent','Family']];if(me.role==='coach')return [['coach','Coach']];
  return me.is_coach?[['admin','Administrator'],['coach','Coach']]:[['admin','Administrator']]}
async function run(fn,okMsg){
  try{await fn();await loadAll();render();if(okMsg)toast(okMsg);return true}
  catch(e){console.error(e);toast(errMsg(e));return false}}
function log(_actor,action){if(sb&&S.me)sb.from('audit_log').insert({actor_id:S.me.id,action}).then(()=>{},()=>{})}
function sendQueued(){if(sb&&EMAILS)sb.functions.invoke('send-notifications').then(()=>{},()=>{})}

const needsAction=t=>t.some(x=>!['published','notyet','mismatch'].includes(x.k));
function tasksFor(a){
  const t=[];const ep=editPeriod(a);
  if(ep!==PERIOD){t.push({k:'overdue',l:a.overdue.length>1?'Overdue · '+a.overdue.length+' reports':'Overdue · '+monthShort(ep)+' report'})}
  if(ep===PERIOD&&!a.owesCurrent&&!find(a.id,PERIOD)){t.push({k:'notyet',l:'First report due '+dueLabel(a.firstOwed)});return t.concat(extraTasks(a))}
  const cur=find(a.id,ep);
  if(!cur) t.push({k:'notstarted',l:'Not Started'});
  else if(cur.status==='draft') t.push({k:'draft',l:'Draft in Progress'});
  else if(cur.status==='review') t.push({k:'review',l:'Awaiting Coach Review'});
  else if(cur.status==='ready') t.push({k:'ready',l:'Ready to Publish'});
  else t.push({k:'published',l:'Published'});
  return t.concat(extraTasks(a));
}
function extraTasks(a){const t=[];
  if(stagesDiffer(a)) t.push({k:'mismatch',l:'Stage views differ'});
  if(S.reflections.some(r=>r.athleteId===a.id&&!r.ack)||asksFor(a.id).some(q=>q.reply&&!q.seen)) t.push({k:'parent',l:'Parent Response Pending'});
  if(S.meetings.some(m=>m.athleteId===a.id&&m.status==='requested')) t.push({k:'meeting',l:'Meeting Requested'});
  return t;
}
function outstanding(t){const k=t.map(x=>x.k);
  if(k.includes('overdue'))return 'Complete overdue report';
  if(k.includes('ready'))return 'Publish approved report';
  if(k.includes('review'))return 'Review contributing notes & approve';
  if(k.includes('draft'))return 'Finish draft';
  if(k.includes('notstarted'))return 'Start monthly assessment';
  if(k.includes('parent'))return 'Respond to family';
  if(k.includes('meeting'))return 'Confirm meeting';
  return 'Up to date'}
const myAthletes=()=>S.athletes.filter(a=>a.coach===myId()&&a.status!=='inactive');
const pill=x=>`<span class="pill ${x.k}"><span class="dot"></span>${esc(x.l)}</span>`;

/* ============ CHARTS ============ */
function radar(cur,prev){
  const W=400,H=340,cx=200,cy=170,Rr=112,n=CORE.length;
  const ang=i=>-Math.PI/2+i*2*Math.PI/n;
  const P=(i,v)=>[cx+Math.cos(ang(i))*Rr*v/4,cy+Math.sin(ang(i))*Rr*v/4];
  const num=v=>typeof v==='number'?v:0;
  let s=`<svg viewBox="-44 0 ${W+88} ${H}" role="img" aria-label="Technical radar chart">`;
  for(let l=1;l<=4;l++){s+=`<polygon points="${CORE.map((c,i)=>P(i,l).join(',')).join(' ')}" fill="${l%2?'rgba(255,255,255,.015)':'none'}" stroke="#35483B" stroke-width="1"/>`;
    s+=`<text x="${cx+3}" y="${cy-Rr*l/4+4}" font-size="9.5" fill="#6f8275">${l}</text>`}
  CORE.forEach((c,i)=>{const[x,y]=P(i,4);s+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#35483B"/>`;
    const[lx,ly]=P(i,4.9);const anc=Math.abs(Math.cos(ang(i)))<.2?'middle':(Math.cos(ang(i))>0?'start':'end');
    s+=`<text x="${lx}" y="${ly+4}" text-anchor="${anc}" font-size="12" fill="#B8CCBD" font-family="Inter">${c.s}</text>`});
  if(prev)s+=`<polygon points="${CORE.map((c,i)=>P(i,num(prev[c.id])).join(',')).join(' ')}" fill="none" stroke="#9aa69e" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  s+=`<polygon points="${CORE.map((c,i)=>P(i,num(cur[c.id])).join(',')).join(' ')}" fill="rgba(98,141,124,.32)" stroke="#8FB8A6" stroke-width="2"/>`;
  CORE.forEach((c,i)=>{const[x,y]=P(i,num(cur[c.id]));s+=`<circle cx="${x}" cy="${y}" r="4.5" fill="#8FB8A6" stroke="#142019" stroke-width="1.5"><title>${c.n}: ${fmtR(cur[c.id])}${prev?' (previous '+fmtR(prev[c.id])+')':''}</title></circle>`});
  return s+'</svg>';
}
function lineChart(pts){
  const W=680,H=260,L=40,Rp=20,T=18,B=40,iw=W-L-Rp,ih=H-T-B;
  const x=i=>L+(pts.length===1?iw/2:i*iw/(pts.length-1)),y=v=>T+ih-(v/4)*ih;
  let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Development over time">`;
  for(let v=0;v<=4;v++)s+=`<line x1="${L}" x2="${W-Rp}" y1="${y(v)}" y2="${y(v)}" stroke="#35483B" ${v?'stroke-dasharray="2 4"':''}/><text x="${L-10}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#7f9184">${v}</text>`;
  const ok=pts.map((p,i)=>({...p,i})).filter(p=>typeof p.y==='number');
  if(ok.length>1){const d=ok.map((p,j)=>`${j?'L':'M'}${x(p.i)},${y(p.y)}`).join(' ');
    s+=`<path d="${d} L${x(ok.at(-1).i)},${y(0)} L${x(ok[0].i)},${y(0)}Z" fill="rgba(98,141,124,.12)"/>`;
    s+=`<path d="${d}" fill="none" stroke="#8FB8A6" stroke-width="2.2"/>`}
  ok.forEach(p=>s+=`<circle cx="${x(p.i)}" cy="${y(p.y)}" r="4.5" fill="#8FB8A6" stroke="#142019" stroke-width="1.5"><title>${p.x}: ${p.y.toFixed(1)}</title></circle><text x="${x(p.i)}" y="${y(p.y)-10}" text-anchor="middle" font-size="11" fill="#F1F4F0">${p.y%1?p.y.toFixed(1):p.y}</text>`);
  pts.forEach((p,i)=>s+=`<text x="${x(i)}" y="${H-14}" text-anchor="middle" font-size="11.5" fill="#AAB8AD">${p.x}</text>`);
  return s+'</svg>';
}
function segBar(cur,prev){let s='<div class="bar" aria-hidden="true">';for(let i=1;i<=4;i++)s+=`<i class="${typeof cur==='number'&&i<=cur?'f':''} ${typeof prev==='number'&&i===prev?'p':''}"></i>`;return s+'</div>'}

/* ============ TOP BAR ============ */
function renderRoles(){
  const roles=rolesFor(S.me);
  $('#roles').innerHTML=roles.length>1?roles.map(([k,l])=>`<button role="tab" aria-selected="${U().role===k}" class="${U().role===k?'on':''}" data-act="role" data-v="${k}">${l}</button>`).join(''):'';
  $('#roles').hidden=roles.length<2;
  $('#who').textContent=S.me?S.me.full_name:'';
}

/* ============ COACH DASHBOARD ============ */
function coachDash(){
  const me=myId();
  const list=myAthletes().map(a=>({a,t:tasksFor(a)}));
  const mineIds=new Set(list.map(x=>x.a.id));
  const has=k=>list.filter(x=>x.t.some(t=>k.includes(t.k))).length;
  const pubThis=S.assessments.filter(x=>x.period===PERIOD&&x.status==='published'&&mineIds.has(x.athleteId)).length;
  const pendingRefl=S.reflections.filter(r=>!r.ack&&mineIds.has(r.athleteId));
  const famReplies=asks().filter(q=>q.reply&&!q.seen&&mineIds.has(q.athleteId));
  const mtgs=S.meetings.filter(m=>mineIds.has(m.athleteId)&&['requested','confirmed'].includes(m.status)&&new Date(m.slot)>=new Date(TODAY.getTime()-36e5*12));
  const due=periodEnd(PERIOD),dd=daysTo(due);
  const hr=TODAY.getHours(),greet=hr<12?'Good morning':hr<17?'Good afternoon':'Good evening';
  const stats=[
    ['all','Assigned athletes',list.length],
    ['action','Needs action',list.filter(x=>needsAction(x.t)).length],
    ['overdue','Overdue',has(['overdue']),'amber'],
    ['draft','Drafts in progress',has(['draft'])],
    ['review','Awaiting publication',has(['review','ready'])],
    ['published','Published this month',pubThis],
    ['parent','Parent questions',pendingRefl.length+famReplies.length],
    ['meetings','Meetings',mtgs.length]];
  const f=U().filter;
  const filt={all:()=>true,action:x=>needsAction(x.t),overdue:x=>x.t.some(t=>t.k==='overdue'),draft:x=>x.t.some(t=>t.k==='draft'),review:x=>x.t.some(t=>['review','ready'].includes(t.k)),published:x=>x.t.some(t=>t.k==='published'),parent:x=>x.t.some(t=>t.k==='parent'),meetings:x=>mtgs.some(m=>m.athleteId===x.a.id)};
  const shown=list.filter(filt[f]||filt.all);
  const chips=[['all','All'],['action','Needs action'],['overdue','Overdue'],['draft','Drafts'],['review','Awaiting review'],['published','Published'],['parent','Parent requests'],['meetings','Meetings']];
  const mySlots=S.slots.filter(s=>s.coach===me&&new Date(s.at)>TODAY);
  const dl=list.map(x=>({a:x.a,d:deadline(x.a)}));
  const over=dl.filter(x=>x.d.state==='overdue').sort((x,y)=>y.d.late-x.d.late);
  const dueNow=dl.filter(x=>x.d.state==='due');
  const doneNow=dl.filter(x=>x.d.state==='done');
  const left=dayDiff(periodEnd(PERIOD),TODAY);
  const alert=over.length?`<div class="dl-alert bad" role="alert"><div><b>${over.length} overdue report${over.length===1?'':'s'}</b> — ${over.map(x=>esc(firstName(x.a.name))).join(', ')}. Families are waiting on ${over.length===1?'it':'these'}.</div><button class="btn sm primary" data-act="open" data-id="${over[0].a.id}">Start with ${esc(firstName(over[0].a.name))}</button></div>`
    :dueNow.length&&left<=7?`<div class="dl-alert warn"><div><b>${dueNow.length} report${dueNow.length===1?'':'s'} due ${left<=0?'today':'in '+left+' day'+(left===1?'':'s')}</b> (${dueLabel(PERIOD)}).</div><button class="btn sm primary" data-act="open" data-id="${dueNow[0].a.id}">Open ${esc(firstName(dueNow[0].a.name))}</button></div>`
    :dl.length&&!dueNow.length?`<div class="dl-alert ok"><b>You’re all caught up.</b> Every ${monthLabel(PERIOD)} report is published.</div>`:'';
  const item=(x,meta)=>`<button class="dl-item" data-act="open" data-id="${x.a.id}"><span class="av">${initials(x.a.name)}</span><span class="dl-txt"><b>${esc(x.a.name)}</b><span>${meta}</span></span><span class="dl-go">Open →</span></button>`;
  const board=list.length?`<section class="dl-board" aria-label="Report deadlines">
    <div class="dl-col overdue"><div class="dl-h"><span>Overdue</span><b>${over.length}</b></div>
      ${over.length?over.map(x=>item(x,`${x.d.count>1?x.d.count+' reports, oldest '+monthLabel(x.d.period):monthLabel(x.d.period)+' report'} · <strong>${lateText(x.d.late)}</strong>`)).join(''):'<div class="dl-empty">Nothing overdue.</div>'}</div>
    <div class="dl-col due"><div class="dl-h"><span>Due ${dueLabel(PERIOD)}</span><b>${dueNow.length}</b></div><div class="dl-sub">${leftText(left)} in ${monthLabel(PERIOD)}</div>
      ${dueNow.length?dueNow.map(x=>item(x,esc(x.d.stage))).join(''):'<div class="dl-empty">No reports left this month.</div>'}</div>
    <div class="dl-col done"><div class="dl-h"><span>Published this month</span><b>${doneNow.length}</b></div>
      ${doneNow.length?doneNow.map(x=>item(x,'Published')).join(''):'<div class="dl-empty">None yet.</div>'}</div>
  </section>`:'';
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:18px">
    <div><div class="up xs muted">Coach Action Dashboard</div><h1 style="font-size:28px;margin-top:4px">${greet}, ${esc(firstName(S.me.full_name))}</h1>
    <div class="muted sm" style="margin-top:4px">${monthLabel(PERIOD)} reports are due by ${dueLabel(PERIOD)} · ${leftText(left)}</div></div>
  </div>
  ${alert}${board}
  <div class="grid g4" style="margin-bottom:20px">${stats.map(([k,l,n,c])=>`<button class="stat ${c||''} ${f===k?'active':''}" data-act="filter" data-v="${k}"><div class="l">${l}</div><div class="n">${n}</div></button>`).join('')}</div>
  <div class="split">
    <section class="card" aria-label="Athlete task queue">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Athlete task queue</h3><span class="muted sm">${shown.length} of ${list.length}</span></div>
      <div class="chips">${chips.map(([k,l])=>`<button class="chip ${f===k?'on':''}" data-act="filter" data-v="${k}">${l}</button>`).join('')}</div>
      <div class="qrow qhead"><span></span><span>Athlete</span><span>Status</span><span>Deadline</span><span>Last report</span><span></span></div>
      ${!list.length?`<div class="empty">No athletes are assigned to you yet. An administrator assigns athletes under Administrator → Athletes.</div>`:
      shown.length?shown.map(({a,t})=>{const ep=editPeriod(a);const lp=latestPub(a.id);const end=periodEnd(ep);
        return `<div class="qrow"><div class="av">${initials(a.name)}</div>
        <div><b>${esc(a.name)}</b><div class="muted sm">${esc(a.style)} · <span class="muted">${esc(outstanding(t))}</span></div></div>
        <div class="pills">${t.map(pill).join('')}</div>
        ${(()=>{const d=deadline(a);return `<div class="qd sm ${d.state==='overdue'?'down-c':''}"><b style="font-weight:600">${dueLabel(d.period)}</b><div class="xs ${d.state==='overdue'?'down-c':'muted'}">${d.state==='overdue'?lateText(d.late):d.state==='done'?'Published':d.state==='notyet'?'First report':leftText(d.left)}</div></div>`})()}
        <div class="ql sm muted">${lp?monthShort(lp.period)+' '+lp.period.slice(0,4):'—'}</div>
        <div><button class="btn sm ${needsAction(t)?'primary':''}" data-act="open" data-id="${a.id}">Open</button></div></div>`}).join(''):`<div class="empty">No athletes match this filter.</div>`}
    </section>
    <aside class="aside">
      ${(()=>{const apps=S.requests.filter(r=>r.coach===me&&r.status==='pending');return `<div class="card" ${apps.length?'style="border-color:var(--accent2)"':''}><h4>New athlete applications${apps.length?` · ${apps.length}`:''}</h4>
        ${apps.length?apps.map(r=>{const x=ath(r.athleteId);return `<div class="app"><b>${esc(x?.name||'Athlete')}</b><div class="sm muted">${esc(x?.style||'')}${x?.aff?' · '+esc(x.aff):''}</div>
          <div class="xs muted" style="margin-top:4px">From ${esc(r.byName)} · ${fd(r.ts,{month:'short',day:'numeric'})}${x?.coach?' · currently with '+esc(coach(x.coach).name):''}</div>
          ${r.note?`<p class="sm" style="margin:6px 0 0">“${esc(r.note)}”</p>`:''}
          <div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm primary" data-act="acceptreq" data-id="${r.id}">Accept</button><button class="btn sm" data-act="declinereq" data-id="${r.id}">Decline</button></div></div>`}).join('<div class="hr"></div>'):'<div class="muted sm">No new applications.</div>'}</div>`})()}
      <div class="card"><h4>Parent questions</h4>
        ${pendingRefl.length||famReplies.length?pendingRefl.map(r=>`<div><b>${esc(ath(r.athleteId)?.name)}</b><div class="sm muted">Reflection · ${fd(r.ts,{month:'short',day:'numeric'})}</div><p class="sm" style="margin:6px 0 8px">“${esc(r.answers.discuss||r.answers.differ||r.answers.agree||r.answers.commit)}”</p><button class="btn sm" data-act="open" data-id="${r.athleteId}">Review</button></div>`).join('<div class="hr"></div>'):'<div class="muted sm">Nothing waiting.</div>'}${famReplies.map(q=>`<div class="hr"></div><div><b>${esc(ath(q.athleteId)?.name)}</b><div class="sm muted">Family replied · ${esc(q.type)}</div><p class="sm" style="margin:6px 0 8px">“${esc(q.reply.text||q.reply.link)}”</p><button class="btn sm" data-act="open" data-id="${q.athleteId}">Review</button></div>`).join('')}
      </div>
      <div class="card"><h4>Meetings</h4>
        ${mtgs.length?mtgs.map(m=>`<div style="margin-bottom:10px"><b>${esc(ath(m.athleteId)?.name)}</b> ${m.status==='requested'?'<span class="pill meeting">Requested</span>':'<span class="pill published">Confirmed</span>'}<div class="sm muted">${ft(m.slot)} · 20 min</div>
          ${m.status==='requested'?`<div class="sm" style="margin:4px 0 8px">${esc(m.purpose)}${m.note?' — “'+esc(m.note)+'”':''}</div><div style="display:flex;gap:6px"><button class="btn sm primary" data-act="confirmmtg" data-id="${m.id}">Confirm</button><button class="btn sm" data-act="declinemtg" data-id="${m.id}">Decline</button></div>`:''}${(()=>{const lp=latestPub(m.athleteId);return lp&&m.status==='confirmed'?`<button class="btn sm" style="margin-top:6px" data-act="dlreport" data-id="${lp.id}">Printable report</button>`:''})()}</div>`).join(''):'<div class="muted sm">No meetings scheduled.</div>'}
      </div>
      <div class="card"><h4>My meeting times</h4><div class="sm muted" style="margin-bottom:10px">Families can request any open time. Tap a time to close or reopen it.</div>
        <div class="fgrid" style="margin-bottom:10px"><div><label class="f" for="av-date">Date</label><input type="date" id="av-date" min="${TODAY.toISOString().slice(0,10)}"></div><div><label class="f" for="av-time">Time</label><input type="time" id="av-time" value="17:00" step="900"></div></div>
        <button class="btn sm" data-act="addslot" style="margin-bottom:12px">+ Add time</button>
        ${mySlots.length?`<div class="slots">${mySlots.map(sl=>{const taken=S.meetings.some(m=>sameTime(m.slot,sl.at)&&m.coach===me&&['requested','confirmed'].includes(m.status));return `<div class="slotwrap"><button class="slot ${sl.on?'':'off'}" ${taken?'disabled':''} data-act="toggleslot" data-id="${sl.id}">${fd(sl.at,{weekday:'short',month:'short',day:'numeric'})}<br><span class="muted">${new Date(sl.at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}${taken?' · booked':''}</span></button>${taken?'':`<button class="slotx" data-act="delslot" data-id="${sl.id}" aria-label="Remove this time">×</button>`}</div>`}).join('')}</div>`:'<div class="muted sm">No upcoming times yet.</div>'}
      </div>
      <div class="card"><h4>My coach profile</h4><div class="xs muted" style="margin-bottom:10px">Families see this when choosing a coach.</div>
        <label class="f" for="cp-spec">Specialties</label><input type="text" id="cp-spec" value="${esc(S.me.specialties||'')}" placeholder="e.g. Greco-Roman · Freestyle · Par terre">
        <label class="f" for="cp-bio" style="margin-top:10px">Short bio</label><textarea id="cp-bio" rows="4" placeholder="Your coaching background and approach">${esc(S.me.bio||'')}</textarea>
        <label style="display:flex;gap:8px;align-items:center;font-size:13.5px;margin-top:10px"><input type="checkbox" id="cp-acc" ${S.me.accepting!==false?'checked':''}> Accepting new athletes</label>
        <button class="btn sm" style="margin-top:10px" data-act="saveprofile">Save profile</button></div>
    </aside>
  </div>`;
}

/* ============ COACH WORKSPACE ============ */
function rateRow(key,label,val,prev,note,ro){
  return `<div class="rrow"><div class="rlab"><b>${esc(label)}</b><span class="muted xs">${prev!==undefined?'Previous: '+fmtR(prev):'No previous rating'}</span></div>
  <div class="rate" role="group" aria-label="${esc(label)} rating">${[0,1,2,3,4].map(v=>`<button type="button" ${ro?'disabled':''} data-act="rate" data-key="${key}" data-v="${v}" class="${val===v?'on':''}" title="${v} — ${SCALE[v]}" aria-pressed="${val===v}">${v}</button>`).join('')}<button type="button" ${ro?'disabled':''} data-act="rate" data-key="${key}" data-v="NO" class="no ${val==='NO'?'on':''}" title="Not observed this period" aria-pressed="${val==='NO'}">N/O</button></div>
  <details ${note?'open':''}><summary>Observation notes & evidence (staff only)</summary><textarea ${ro?'disabled':''} data-note="${key}" placeholder="What did you see? When?">${esc(note||'')}</textarea></details></div>`;
}
function workspace(){
  const a=ath(U().open);if(!a){U().open=null;return coachDash()}
  const ep=editPeriod(a);const d=find(a.id,ep);const prev=prevPub(a.id,ep);
  const t=tasksFor(a);const refl=S.reflections.filter(r=>r.athleteId===a.id);const mt=S.meetings.filter(m=>m.athleteId===a.id&&m.status!=='declined');
  const lp=latestPub(a.id);
  const head=`<button class="btn ghost sm" data-act="back" style="margin-bottom:14px">← Dashboard</button>
   <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:18px"><div class="av" style="width:52px;height:52px;font-size:17px">${initials(a.name)}</div>
   <div style="margin-right:auto"><h1 style="font-size:26px">${esc(a.name)}</h1><div class="muted sm">${esc(a.style)} · ${esc(a.aff)} · ${monthLabel(ep)} assessment${ep!==PERIOD?' <span class="down-c">(overdue)</span>':''}</div></div>
   <div class="pills" style="display:flex;gap:6px;flex-wrap:wrap">${t.map(pill).join('')}</div></div>`;
  let body;
  if(!d){
    body=`<div class="card" style="text-align:center;padding:40px 20px"><h3>${monthLabel(ep)} assessment not started</h3><p class="muted">Previous ratings and goals will be shown alongside the form for reference.</p><button class="btn primary" data-act="start" data-id="${a.id}">Start assessment</button></div>`;
  } else if(d.status==='published'){
    body=`<div class="banner good">Published ${fd(d.ts.published)} · ${d.ts.ack?'Family read it '+fd(d.ts.ack):'Not yet read by the family'}. Published reports are locked; an administrator can help with corrections.${S.me&&S.me.role==='admin'?` <button class="btn sm" data-act="reopen" data-id="${d.id}" style="margin-left:8px">Reopen for corrections</button>`:''}
      <button class="btn sm" data-act="dlreport" data-id="${d.id}" style="margin-left:auto">Printable report</button></div>
      ${reportBody(d,a,prevPub(a.id,d.period))}`;
  } else body=editor(a,d,prev);
  return head+`<div class="split"><div>${body}</div>${wsAside(a,lp,refl,mt,d)}</div>`;
}
function editor(a,d,prev){
  const sets=STYLESETS[a.style]||[];const others=['GR','FS','FK'].filter(x=>!sets.includes(x));
  const pr=prev?prev.ratings:{};const psr=prev?prev.styleRatings:{};
  const setBlock=(k,open)=>`<details class="group" ${open?'open':''}><summary>${SETS[k].name} competencies ${open?'':'<span class="muted sm" style="font-family:Inter,sans-serif;font-weight:400">· optional, transferable</span>'}</summary>
     ${SETS[k].items.map(([id,l])=>{const key=k+'.'+id;return rateRow('s:'+key,l,d.styleRatings[key],psr[key],d.notes['s:'+key])}).join('')}</details>`;
  const ta=(f,ph,rows)=>`<textarea data-f="${f}" rows="${rows||4}" placeholder="${esc(ph)}">${esc(d[f])}</textarea>`;
  return `
  ${d.contrib?`<div class="banner"><div><b>Supplementary observation · ${esc(d.contrib.coach)}</b> (contributing coach)<div class="sm" style="margin-top:4px">“${esc(d.contrib.note)}”</div><div class="xs muted" style="margin-top:4px">You remain responsible for approving the final report.</div></div></div>`:''}
  <nav class="secnav" aria-label="Assessment sections">${[['s-r','Ratings'],['s-a','A · Where You Stand'],['s-b','B · Going Well'],['s-c','C · Tough Truths'],['s-d','D · Adjustments'],['s-e','E · Coach’s Take'],['s-f','F · Next 30 Days']].map(([h,l])=>`<a href="#${h}">${l}</a>`).join('')}</nav>
  <section class="card esec" id="s-r"><div class="letter">Technical evaluation</div><h3>Competency ratings</h3>
    <div class="hint">Rate what you have actually seen this month. “Not observed” is excluded from the Skill Index — it is not a zero.</div>
    <div class="scale">${SCALE.map((s,i)=>`<div><b>${i}</b>${s}</div>`).join('')}<div><b>N/O</b>Not observed</div></div>
    <h4 class="up xs muted" style="margin:16px 0 4px">Core competencies</h4>
    ${CORE.map(c=>rateRow('c:'+c.id,c.n,d.ratings[c.id],pr[c.id],d.notes['c:'+c.id])).join('')}
    ${sets.map(k=>setBlock(k,true)).join('')}${others.map(k=>setBlock(k,false)).join('')}
  </section>
  <section class="card esec" id="s-a"><div class="letter">Section A</div><h3>Where You Stand</h3><div class="hint">Current level, readiness, strengths, limitations, recent progress. Don’t predict a ceiling.</div>${ta('stand','Developing regional competitor…',3)}</section>
  <section class="card esec" id="s-b"><div class="letter">Section B</div><h3>What Is Going Well</h3><div class="hint">Concrete observations only — what improved and where you saw it.</div>${ta('well','Your handfighting has become…')}</section>
  <section class="card esec" id="s-c"><div class="letter">Section C</div><h3>Tough Truths</h3><div class="hint">What is actually holding them back, backed by what you’ve seen. If they’re thriving, name the next standard.</div>${ta('tough','You are still too reliant on…')}</section>
  <section class="card esec" id="s-d"><div class="letter">Section D</div><h3>Recommended Adjustments</h3><div class="hint">Separate what you will change from what the athlete must do.</div>
    <div class="grid g2"><div><label class="f">What the coach will change</label>${ta('adjCoach','We are adding…',4)}</div><div><label class="f">What the athlete must do</label>${ta('adjAthlete','Your job is to…',4)}</div></div></section>
  <section class="card esec" id="s-e"><div class="letter">Section E</div><h3>The Coach’s Take</h3><div class="hint">A short note straight to the wrestler. Honest, specific, in your voice.</div>${ta('take','You’re getting better, but…',4)}</section>
  <section class="card esec" id="s-f"><div class="letter">Section F</div><h3>Next 30 Days</h3><div class="hint">Two or three realistic, measurable goals.</div>
    <div id="goals">${d.goals.map((gl,i)=>goalEditor(gl,i)).join('')}</div>
    ${d.goals.length<3?`<button class="btn sm" data-act="addgoal">+ Add goal</button>`:''}
  </section>
  <div class="actionbar"><span class="save" id="savestate">Draft · saved ${ft(d.ts.edited)}</span>
    <button class="btn" data-act="savedraft">Save draft</button>
    <button class="btn" data-act="preview">Preview family report</button>
    ${d.status==='ready'?`<button class="btn primary" data-act="publish">Publish to family</button>`:`<button class="btn primary" data-act="approve">Approve report</button>`}
  </div>`;
}
function goalEditor(gl,i){
  const inp=(f,ph)=>`<input type="text" data-g="${i}" data-gf="${f}" value="${esc(gl[f])}" placeholder="${esc(ph)}">`;
  return `<div class="goal-ed"><div class="gh"><b class="up xs" style="color:var(--accent2)">Goal ${i+1}</b><button class="btn sm ghost" data-act="rmgoal" data-i="${i}">Remove</button></div>
  <div class="fgrid">
    <div class="full"><label class="f">Goal</label>${inp('title','e.g. Primary-to-secondary attack chain')}</div>
    <div><label class="f">Skill category</label><select data-g="${i}" data-gf="category">${CATS.map(c=>`<option ${gl.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
    <div><label class="f">Target review date</label><input type="date" data-g="${i}" data-gf="review" value="${esc(gl.review)}"></div>
    <div class="full"><label class="f">Expected behavior</label>${inp('behavior','What should we see them do?')}</div>
    <div class="full"><label class="f">Measurement</label>${inp('measure','How will we know? e.g. 3 live sessions')}</div>
    <div><label class="f">Coach recommendation</label>${inp('coachRec','Drills / reps')}</div>
    <div><label class="f">Athlete commitment</label>${inp('commit','What they commit to')}</div>
    <div><label class="f">Status</label><select data-g="${i}" data-gf="status">${GOAL_ST.map(s=>`<option ${gl.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
  </div></div>`;
}
function wsAside(a,lp,refl,mt,d){
  const lpR=lp?lp.ratings:null;
  return `<aside class="aside">${stageCard(a,'coach')}${contactCard(a)}
   <div class="card"><h4>Latest published report</h4>${lp?`<div style="display:flex;justify-content:space-between;align-items:baseline"><b>${monthLabel(lp.period)}</b><span class="sm muted">Index ${tsi(lpR)!=null?tsi(lpR).toFixed(1):'—'}</span></div>
     ${CORE.map(c=>`<div class="mini"><span class="muted">${c.s}</span><span class="t"><i style="width:${(typeof lpR[c.id]==='number'?lpR[c.id]:0)*25}%"></i></span><span>${typeof lpR[c.id]==='number'?lpR[c.id]:'–'}</span></div>`).join('')}`:'<div class="muted sm">No published reports yet.</div>'}</div>
   <div class="card"><h4>Previous goals</h4>${lp&&lp.goals.length&&lp!==d?lp.goals.map((gl,i)=>`<div style="margin-bottom:10px"><div class="sm"><b>${esc(gl.title)}</b></div><select class="sm" style="margin-top:4px;padding:5px 8px" data-gs="${lp.id}|${i}" aria-label="Update goal status">${GOAL_ST.map(s=>`<option ${gl.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`).join(''):'<div class="muted sm">No earlier goals to review.</div>'}</div>
   <div class="card"><h4>Family responses</h4>${refl.length?refl.map(r=>`<div class="refl"><div class="sm muted" style="margin-bottom:6px">${esc(r.author)} · ${fd(r.ts)} · on ${monthLabel(S.assessments.find(x=>x.id===r.assessmentId)?.period||PERIOD)} report</div>
      <b>Agree most</b><p>${esc(r.answers.agree)||'—'}</p><b>See differently</b><p>${esc(r.answers.differ)||'—'}</p><b>Commitment</b><p>${esc(r.answers.commit)||'—'}</p><b>Wants to discuss</b><p>${esc(r.answers.discuss)||'—'}</p>
      ${r.ack?`<div class="banner good" style="margin:0">Acknowledged ${fd(r.ack.ts)}${r.ack.reply?' — “'+esc(r.ack.reply)+'”':''}</div>`:`<textarea id="ack-${r.id}" rows="2" placeholder="Optional reply to the family"></textarea><button class="btn sm primary" style="margin-top:8px" data-act="ackrefl" data-id="${r.id}">Acknowledge</button>`}</div>`).join('<div class="hr"></div>'):'<div class="muted sm">No reflections yet.</div>'}</div>
   <div class="card"><h4>Meetings</h4>${mt.length?mt.map(m=>{const past=new Date(m.slot)<TODAY;return `<div style="margin-bottom:12px"><div class="sm"><b>${ft(m.slot)}</b> · ${m.status}</div><div class="sm muted">${esc(m.purpose)}${m.note?' — “'+esc(m.note)+'”':''}</div>
     ${m.status==='requested'?`<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm primary" data-act="confirmmtg" data-id="${m.id}">Confirm</button><button class="btn sm" data-act="declinemtg" data-id="${m.id}">Decline</button></div>`:''}
     ${(()=>{const lp2=latestPub(m.athleteId);return lp2&&m.status==='confirmed'?`<button class="btn sm" style="margin-top:6px" data-act="dlreport" data-id="${lp2.id}">Printable report</button>`:''})()}
     ${m.status==='confirmed'&&past?`<label class="f" for="sum-${m.id}" style="margin-top:8px">Meeting summary (the family sees this)</label><textarea id="sum-${m.id}" rows="2"></textarea><button class="btn sm" style="margin-top:6px" data-act="donemtg" data-id="${m.id}">Save summary & mark held</button>`:''}
     ${m.summary?`<p class="sm muted" style="margin:4px 0 0">${esc(m.summary)}</p>`:''}</div>`}).join(''):'<div class="muted sm">None.</div>'}</div>
  </aside>`;
}

/* ============ DEVELOPMENT STAGE (coach + family views) ============ */
function stageCard(a,who){
  const c=a.coachStage,f=a.familyStage,mine=who==='coach'?c:f,k=esc(firstName(a.name)),cn=esc(coach(a.coach).name);
  const note=stagesDiffer(a)?`<div class="stage-talk"><b>Talking point.</b> ${who==='coach'?`The family sees ${k} at Stage ${f}; you see Stage ${c}.`:`You see ${k} at Stage ${f}; ${cn} sees Stage ${c}.`} A good thing to talk through at your next development meeting.</div>`
    :c&&f?`<div class="sm up-c" style="margin:8px 0 4px">${who==='coach'?'You and the family':'You and '+cn} agree: ${stageName(c)}.</div>`
    :`<div class="sm muted" style="margin:8px 0 4px">${!mine?'Tap the stage that best describes '+k+' right now.':who==='coach'?'The family hasn’t picked a stage yet.':cn+' hasn’t picked a stage yet.'}</div>`;
  return `<div class="card stagecard noprint"><h4>Development stage</h4>
    <div class="xs muted">${who==='coach'?'You and the family each pick a stage. If you differ, it shows up here as a talking point.':'You and '+cn+' each pick a stage. If you see it differently, that’s worth a conversation.'}</div>
    ${note}
    <div class="stages" role="radiogroup" aria-label="Development stage">${STAGES.slice().reverse().map(st=>`<button class="stage ${mine===st.n?'mine':''}" role="radio" aria-checked="${mine===st.n}" data-act="setstage" data-a="${a.id}" data-v="${st.n}">
      <span class="sn">${st.n}</span><span class="st"><b>${st.t}</b><span>${st.d}</span></span>
      <span class="tags">${c===st.n?'<i class="tag tc">Coach</i>':''}${f===st.n?'<i class="tag tf">Family</i>':''}</span></button>`).join('')}</div></div>`;
}

/* ============ REPORT (shared by parent view & preview) ============ */
function reportBody(r,a,prev){
  const ti=tsi(r.ratings),pt=prev?tsi(prev.ratings):null;const ch=ti!=null&&pt!=null?ti-pt:null;
  const active=r.goals.filter(x=>x.status!=='Completed').length;
  return `
  <div class="grid g3" style="margin-bottom:16px">
    <div class="metric"><div class="lab">Technical Skill Index</div><div class="v">${ti!=null?ti.toFixed(1):'—'} <small>/ 4</small></div><div class="foot">Average of ${observed(r.ratings)} observed core ratings. Not a percentile, ranking or prediction.</div></div>
    <div class="metric"><div class="lab">Change since previous</div><div class="v ${ch>0?'up-c':ch<0?'down-c':''}">${ch==null?'—':(ch>0?'+':'')+ch.toFixed(1)}</div><div class="foot">${prev?'Compared with '+monthLabel(prev.period):'First assessment — no comparison yet'}</div></div>
    <div class="metric"><div class="lab">Active development goals</div><div class="v">${active}</div><div class="foot">Review by ${r.goals[0]?fd(r.goals[0].review,{month:'short',day:'numeric'}):'—'}</div></div>
  </div>
  <div class="rcard" style="margin-bottom:16px"><div class="rk" style="color:var(--sage)">Where you stand</div><p>${esc(r.stand)||'<span class="muted">Not written yet.</span>'}</p></div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="rcard well"><div class="rk">▲ What is going well</div><p>${esc(r.well)||'—'}</p></div>
    <div class="rcard tough"><div class="rk">◆ Tough truths</div><p>${esc(r.tough)||'—'}</p></div>
  </div>
  <div class="rcard" style="margin-bottom:16px"><div class="rk" style="color:var(--sage)">Recommended adjustments</div>
    <div class="grid g2"><div><div class="xs up muted" style="margin-bottom:4px">What your coach will change</div><p>${esc(r.adjCoach)||'—'}</p></div><div><div class="xs up muted" style="margin-bottom:4px">What you need to do</div><p>${esc(r.adjAthlete)||'—'}</p></div></div></div>
  <div class="take"><div class="up xs" style="color:var(--accent2);margin-bottom:12px">The Coach’s Take</div><div class="q">“</div><blockquote>${esc(r.take)||'—'}</blockquote><div class="sig">— ${esc(coach(r.coach||a.coach).name)} · ${monthLabel(r.period)}</div></div>`;
}


/* ============ COACH SELECTION (families) ============ */
function coachCard(c,a){
  const cur=c.id===a.coach;
  return `<div class="ccard"><div class="cch"><div class="av" style="width:48px;height:48px;font-size:16px">${initials(c.name)}</div>
    <div style="min-width:0"><b>${esc(c.name)}</b><div class="xs muted">${esc(c.styles)||'Forge coach'}</div></div></div>
    <p class="sm" style="margin:10px 0 12px;flex:1">${esc(c.bio)||'<span class="muted">Profile coming soon.</span>'}</p>
    ${cur?'<span class="pill published">Current coach</span>':c.accepting?`<button class="btn primary sm" data-act="reqcoach" data-c="${c.id}">Request ${esc(firstName(c.name))}</button>`:'<span class="pill">Not taking new athletes right now</span>'}</div>`;
}
function coachPicker(a){
  const pend=S.requests.find(r=>r.athleteId===a.id&&r.status==='pending');
  if(pend)return `<div class="card" style="max-width:620px;margin:24px auto;text-align:center;padding:28px">
    <div class="up xs muted">Coach request sent</div><h2 style="margin:8px 0 10px;font-size:24px">Waiting on ${esc(coach(pend.coach).name)}</h2>
    <p class="muted">${esc(coach(pend.coach).name)} has your request to coach ${esc(a.name)}. You’ll see the answer here${a.coach?'':' and can start using the portal once it’s accepted'}.</p>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">${a.coach?'<button class="btn sm" data-act="cancelchoose">Back to the report</button>':''}<button class="btn sm ghost" data-act="withdrawreq" data-id="${pend.id}">Withdraw request</button></div></div>`;
  const declined=S.requests.filter(r=>r.athleteId===a.id&&r.status==='declined').slice(-1)[0];
  const list=S.coaches.filter(c=>c.active);
  return `${declined&&!a.coach?`<div class="banner">${esc(coach(declined.coach).name)} isn’t able to take on ${esc(firstName(a.name))} right now. Please choose another coach.</div>`:''}
  <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin:6px 0 16px">
    <div><div class="up xs muted">${a.coach?'Change coach':'Welcome to The Forge'}</div><h1 style="font-size:28px;margin-top:4px">Choose ${esc(firstName(a.name))}’s coach</h1>
    <p class="muted" style="margin:6px 0 0;max-width:62ch">Pick the coach you’d like ${esc(firstName(a.name))} to work with. They’ll get your request and accept it in the portal. ${a.coach?'Past reports stay with '+esc(firstName(a.name))+' if the coach changes.':''}</p></div>
    ${a.coach?'<button class="btn sm" data-act="cancelchoose">Cancel</button>':''}</div>
  <div class="card" style="margin-bottom:16px"><label class="f" for="cr-note">Anything the coach should know? (optional)</label><textarea id="cr-note" rows="2" placeholder="e.g. Wrestles folkstyle for his high school; wants to focus on Greco this spring"></textarea></div>
  ${list.length?`<div class="grid g3">${list.map(c=>coachCard(c,a)).join('')}</div>`:'<div class="empty">No coaches are listed yet. The club will assign a coach for you.</div>'}`;
}

/* ============ PARENT ============ */
const famKids=()=>S.athletes.filter(x=>x.guardianIds.includes(myId()));
const curKid=()=>{const k=famKids();return k.find(x=>x.id===U().pa)||k[0]};
function kidSwitcher(){const k=famKids();if(k.length<2)return '';
  return `<div class="kids noprint" role="tablist" aria-label="Choose athlete">${k.map(x=>{const lp=latestPub(x.id);const unread=lp&&!lp.ts.ack;const on=x.id===curKid().id;
    return `<button role="tab" aria-selected="${on}" class="kid ${on?'on':''}" data-act="pickkid" data-v="${x.id}"><span class="av">${initials(x.name)}</span><span><b>${esc(x.name)}</b><span class="xs muted">${esc(x.style)} · ${esc(coach(x.coach).name)}</span></span>${unread?'<span class="newdot" title="New report"></span>':''}</button>`}).join('')}</div>`}
function parentView(){
  const a=curKid();
  if(!a)return `<div class="empty" style="margin-top:30px">Your account isn’t linked to an athlete yet. The club will link your athlete after registration; check back soon.</div>`;
  if(!a.coach||U().choosing)return kidSwitcher()+coachPicker(a);
  const r=latestPub(a.id);const prev=r?prevPub(a.id,r.period):null;
  const tab=U().tab;
  const tabs=[['overview','Overview'],['performance','Performance'],['blueprint','Development Blueprint'],['history','Progress History'],['meetings','Meetings']];
  const isNew=r&&!r.ts.ack;
  let body='';
  if(!r&&tab!=='meetings') body='<div class="empty">Your first report will appear here once your coach publishes it.</div>'+stageCard(a,'family')+notifCard(a);
  else if(tab==='overview') body=reportBody(r,a,prev)+stageCard(a,'family')+reflectionBlock(a,r)+notifCard(a);
  else if(tab==='performance') body=perfTab(r,prev,a);
  else if(tab==='blueprint') body=blueprint(r,prev);
  else if(tab==='history') body=historyTab(a);
  else body=meetings(a);
  return `
  ${kidSwitcher()}
  ${parentAsks(a)}
  ${isNew?`<div class="banner good noprint"><b>New report from ${esc(coach(r.coach||a.coach).name)}</b> — ${monthLabel(r.period)}, published ${fd(r.ts.published)}.<button class="btn sm" data-act="ackreport" style="margin-left:auto">Mark as read</button></div>`:''}
  <div class="hero"><div class="kick"><img alt="The Forge" src="logo.png">Athlete Development Report</div><h1>${esc(a.name)}</h1>
    <div class="meta"><div><span>Primary style</span><b>${esc(a.style)}</b></div><div><span>Assigned coach</span><b>${esc(coach(a.coach).name)}</b><button class="linkbtn noprint" style="display:block;margin-top:2px;font-size:12px" data-act="choosecoach">${S.requests.some(x=>x.athleteId===a.id&&x.status==='pending')?'Coach request pending':'Request a different coach'}</button></div><div><span>Reporting month</span><b>${r?monthLabel(r.period):'—'}</b></div><div><span>Development stage</span><b>${a.coachStage?esc(stageName(a.coachStage)):'Not set yet'}</b>${stagesDiffer(a)?'<span class="xs" style="display:block;color:var(--amber)">You picked Stage '+a.familyStage+'</span>':''}</div><div><span>Status</span><b>${r?'Published '+fd(r.ts.published,{month:'short',day:'numeric'}):'Pending'}</b></div></div>
  </div>
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:0" class="noprint">
    <div class="tabs" role="tablist" style="flex:1">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'on':''}" role="tab" aria-selected="${tab===k}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
  </div>
  ${body}
  ${r?`<div class="noprint" style="margin-top:22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn" data-act="dlreport" data-id="${r.id}">Printable report</button><span class="xs muted">Opens a print-ready copy to bring to a meeting.</span></div>`:''}`;
}
function reflectionBlock(a,r){
  const mine=S.reflections.filter(x=>x.athleteId===a.id&&x.assessmentId===r.id);
  if(mine.length){const m=mine[0];return `<div class="card noprint" style="margin-top:16px"><h3>Your response</h3><div class="sm muted">Sent by ${esc(m.author)} ${fd(m.ts)} · visible to your coach and guardians on this account</div>
    ${m.ack?`<div class="banner good" style="margin:12px 0 0">${esc(coach(a.coach).name)} acknowledged your response ${fd(m.ack.ts)}${m.ack.reply?': “'+esc(m.ack.reply)+'”':'.'}</div>`:`<div class="banner" style="margin:12px 0 0">Waiting for ${esc(coach(a.coach).name)} to respond.</div>`}</div>`}
  const qs=[['agree','What part of this assessment do you agree with most?'],['differ','What part do you see differently?'],['commit','What will you commit to improving?'],['discuss','What would you like to discuss with your coach?']];
  return `<div class="card noprint" style="margin-top:16px"><h3>Respond to this report</h3><div class="sm muted" style="margin-bottom:14px">Private to your family and ${esc(coach(a.coach).name)}.</div>
  <div class="grid g2">${qs.map(([k,l])=>`<div><label class="f" for="rf-${k}">${l}</label><textarea id="rf-${k}" rows="3"></textarea></div>`).join('')}</div>
  <button class="btn primary" style="margin-top:12px" data-act="sendrefl">Send to coach</button></div>`;
}
function perfTab(r,prev,a){
  const sets=STYLESETS[a.style]||[];
  return `<div class="grid g2" style="align-items:start">
   <div class="card chart"><h3>Technical profile</h3><div class="legend" style="margin-bottom:6px"><span><svg width="18" height="10"><rect y="2" width="18" height="6" fill="rgba(98,141,124,.5)" stroke="#8FB8A6"/></svg>${monthLabel(r.period)}</span>${prev?`<span><svg width="18" height="10"><line x1="0" y1="5" x2="18" y2="5" stroke="#9aa69e" stroke-dasharray="4 3" stroke-width="1.5"/></svg>${monthLabel(prev.period)}</span>`:''}</div>${radar(r.ratings,prev?.ratings)}
     <div class="xs muted">Scale 0–4 · hover or tap a point for detail.</div></div>
   <div class="card"><h3>Core competencies</h3>${CORE.map(c=>{const cv=r.ratings[c.id],pv=prev?.ratings[c.id];const t=trend(cv,pv);
     return `<div class="prow"><div class="top2"><b style="font-weight:500">${c.n}</b><span class="sm ${t.c}">${t.a} ${t.t}</span></div>${segBar(cv,pv)}
     <div class="xs muted">Previous ${fmtR(pv)} · Current <b style="color:var(--text)">${fmtR(cv)}</b>${typeof cv==='number'?' — '+SCALE[cv]:''}</div></div>`}).join('')}</div>
  </div>
  ${sets.map(k=>{const rows=SETS[k].items.filter(([id])=>r.styleRatings[k+'.'+id]!==undefined);if(!rows.length)return '';
    return `<div class="card" style="margin-top:16px"><h3>${SETS[k].name} detail</h3><div class="grid g2" style="gap:0 28px">${rows.map(([id,l])=>{const cv=r.styleRatings[k+'.'+id],pv=prev?.styleRatings?.[k+'.'+id];const t=trend(cv,pv);
      return `<div class="prow"><div class="top2"><span>${l}</span><span class="xs ${t.c}">${t.a} ${fmtR(cv)}</span></div>${segBar(cv,pv)}</div>`}).join('')}</div></div>`}).join('')}
  <div class="card" style="margin-top:16px"><h3 style="margin-bottom:8px">What the numbers mean</h3><div class="scale" style="margin:0">${SCALE.map((s,i)=>`<div><b>${i}</b>${s}</div>`).join('')}<div><b>N/O</b>Not observed — not counted</div></div></div>`;
}
function blueprint(r,prev){
  const st=s=>({'Not Started':0,'In Progress':1,'Needs Revision':1,'Demonstrated':2,'Completed':3}[s]||0);
  return `<div class="card" style="margin-bottom:16px"><h3>Current priorities</h3><div class="chips" style="margin:0">${[...new Set(r.goals.map(x=>x.category))].map(c=>`<span class="chip on" style="cursor:default">${esc(c)}</span>`).join('')}</div>
    <div class="grid g2" style="margin-top:16px"><div><div class="xs up muted">Coach responsibilities</div><p class="sm" style="margin:6px 0 0">${esc(r.adjCoach)}</p></div><div><div class="xs up muted">Athlete responsibilities</div><p class="sm" style="margin:6px 0 0">${esc(r.adjAthlete)}</p></div></div></div>
  <div class="grid g3">${r.goals.map((gl,i)=>`<div class="gcard"><div class="gn">GOAL ${i+1} · ${esc(gl.category)}</div><h4>${esc(gl.title)}</h4>
    <span class="pill ${gl.status==='Completed'||gl.status==='Demonstrated'?'published':gl.status==='Needs Revision'?'overdue':''}">${esc(gl.status)}</span>
    <div class="steps" aria-label="Progress">${[0,1,2].map(j=>`<i class="${j<st(gl.status)?'f':''}"></i>`).join('')}</div><div class="xs muted" style="margin-bottom:12px">Started → In progress → Demonstrated</div>
    <dl><dt>What we’ll see</dt><dd>${esc(gl.behavior)}</dd><dt>How we measure</dt><dd>${esc(gl.measure)}</dd><dt>Coach plan</dt><dd>${esc(gl.coachRec)}</dd><dt>Athlete commits</dt><dd>${esc(gl.commit)}</dd><dt>Assigned</dt><dd>${monthLabel(r.period)}</dd><dt>Review by</dt><dd>${fd(gl.review)}</dd></dl></div>`).join('')}</div>
  ${prev&&prev.goals.length?`<div class="card" style="margin-top:16px"><h3>Last month’s goals — outcome</h3>${prev.goals.map(gl=>`<div class="prow"><div class="top2"><span>${esc(gl.title)}</span><span class="pill ${['Completed','Demonstrated'].includes(gl.status)?'published':''}">${esc(gl.status)}</span></div></div>`).join('')}</div>`:''}`;
}
function historyTab(a){
  const all=pubs(a.id);const rng=U().range,sk=U().skill;
  const [py,pm]=PERIOD.split('-').map(Number);
  const inR=all.filter(r=>{const[y,m]=r.period.split('-').map(Number);return (py-y)*12+(pm-m)<rng});
  const pts=inR.map(r=>({x:monthShort(r.period),y:sk==='tsi'?tsi(r.ratings):(typeof r.ratings[sk]==='number'?r.ratings[sk]:null)}));
  const A=S.assessments.find(x=>x.id===U().cmpA)||all.at(-2),B=S.assessments.find(x=>x.id===U().cmpB)||all.at(-1);
  let cmp='<div class="empty">At least two published reports are needed to compare.</div>';
  if(A&&B&&A!==B){const [o,n]=A.period<B.period?[A,B]:[B,A];
    const imp=[],same=[],dn=[];CORE.forEach(c=>{const x=o.ratings[c.id],y=n.ratings[c.id];if(typeof x!=='number'||typeof y!=='number')return;(y>x?imp:y<x?dn:same).push(`${c.n} <span class="muted">(${x}→${y})</span>`)});
    const done=o.goals.filter(x=>['Completed','Demonstrated'].includes(x.status)),carried=o.goals.filter(x=>!['Completed','Demonstrated'].includes(x.status));
    cmp=`<div class="cmp"><div class="rcard well"><div class="rk">Improved</div><ul>${imp.map(x=>`<li>${x}</li>`).join('')||'<li class="muted">None</li>'}</ul></div>
      <div class="rcard"><div class="rk" style="color:var(--sage)">Consistent</div><ul>${same.map(x=>`<li>${x}</li>`).join('')||'<li class="muted">None</li>'}</ul></div>
      <div class="rcard tough"><div class="rk">Renewed attention</div><ul>${dn.map(x=>`<li>${x}</li>`).join('')||'<li class="muted">None</li>'}</ul></div></div>
      <div class="grid g2" style="margin-top:12px"><div class="rcard"><div class="rk" style="color:var(--sage)">Goals completed (${monthShort(o.period)})</div><ul style="margin:0;padding-left:18px">${done.map(x=>`<li>${esc(x.title)}</li>`).join('')||'<li class="muted">None</li>'}</ul></div>
      <div class="rcard"><div class="rk" style="color:var(--sage)">Goals carried forward</div><ul style="margin:0;padding-left:18px">${carried.map(x=>`<li>${esc(x.title)}</li>`).join('')||'<li class="muted">None</li>'}</ul></div></div>
      <div class="note" style="margin-top:12px">Coach’s summary, ${monthLabel(n.period)}: ${esc(n.stand)}</div>`}
  const opt=sel=>all.map(r=>`<option value="${r.id}" ${sel&&sel.id===r.id?'selected':''}>${monthLabel(r.period)}</option>`).join('');
  return `<div class="card chart" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><h3 style="margin:0">Development over time</h3>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><div class="seg">${[3,6,12].map(n=>`<button class="${rng===n?'on':''}" data-act="range" data-v="${n}">${n} mo</button>`).join('')}</div>
    <select data-hist="skill" style="width:auto" aria-label="Skill to chart">${[['tsi','Technical Skill Index'],...CORE.map(c=>[c.id,c.n])].map(([k,l])=>`<option value="${k}" ${sk===k?'selected':''}>${l}</option>`).join('')}</select></div></div>
    ${pts.length>=2?lineChart(pts):`<div class="empty">Not enough history in this range yet — trends appear after two published reports.</div>`}</div>
  <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px"><h3 style="margin:0">Compare two reports</h3>
    <div style="display:flex;gap:8px;align-items:center"><select data-hist="cmpA" style="width:auto" aria-label="Earlier report">${opt(A)}</select><span class="muted">vs</span><select data-hist="cmpB" style="width:auto" aria-label="Later report">${opt(B)}</select></div></div>${cmp}</div>`;
}
function quarterStart(d){return new Date(d.getFullYear(),Math.floor(d.getMonth()/3)*3,1)}
function meetings(a){
  const mine=S.meetings.filter(m=>m.athleteId===a.id);
  const qs=quarterStart(TODAY);
  const used=mine.filter(m=>['requested','confirmed','completed'].includes(m.status)&&new Date(m.slot)>=qs).length;
  const taken=S.meetings.filter(m=>['requested','confirmed'].includes(m.status));
  const open=S.slots.filter(s=>s.on&&s.coach===a.coach&&new Date(s.at)>TODAY&&!taken.some(m=>sameTime(m.slot,s.at)&&m.coach===s.coach));
  const up=mine.filter(m=>['requested','confirmed'].includes(m.status)&&new Date(m.slot)>=new Date(TODAY.getTime()-36e5*12)),past=mine.filter(m=>m.status==='completed');
  return `<div class="split"><div>
    <div class="card" style="margin-bottom:16px"><h3>Request a development meeting</h3>
      <div class="sm muted" style="margin-bottom:14px">20 minutes in person with ${esc(coach(a.coach).name)} · The Forge, 1135 Lincoln Hwy, Rochelle, IL 61068<br>Your subscription includes one meeting per quarter — <b style="color:var(--text)">${Math.max(0,1-used)} of 1 remaining this quarter</b>${used>=1?'. Additional meetings depend on coach availability.':''}.</div>
      <label class="f">Available times</label>
      ${open.length?`<div class="slots" style="margin-bottom:14px">${open.map(s=>`<button class="slot ${U().slot===s.at?'on':''}" data-act="pickslot" data-v="${s.at}">${fd(s.at,{weekday:'short',month:'short',day:'numeric'})}<br><span class="muted">${new Date(s.at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span></button>`).join('')}</div>`:'<div class="empty" style="margin-bottom:14px">No open times right now. Your coach adds times regularly.</div>'}
      <div class="fgrid"><div><label class="f" for="mp">Purpose</label><select id="mp"><option>Quarterly development meeting</option><option>Discuss this month’s report</option><option>Goal setting</option><option>Competition planning</option></select></div>
      <div><label class="f" for="mn">Anything to prepare? (optional)</label><input type="text" id="mn" placeholder="e.g. Fargo timeline"></div></div>
      <button class="btn primary" style="margin-top:12px" data-act="reqmtg" ${open.length?'':'disabled'}>Request meeting</button></div>
    <div class="card"><h3>Previous meeting summaries</h3>${past.length?past.map(m=>`<div class="prow"><b>${fd(m.slot)}</b> · <span class="muted sm">${esc(m.purpose)}</span><p class="sm" style="margin:6px 0 0">${esc(m.summary)||'—'}</p></div>`).join(''):'<div class="muted sm">None yet.</div>'}</div>
  </div><aside class="aside"><div class="card"><h4>Upcoming</h4>${up.length?up.map(m=>`<div style="margin-bottom:12px"><b>${ft(m.slot)}</b><div class="sm muted">${esc(m.purpose)}</div><span class="pill ${m.status==='confirmed'?'published':'meeting'}">${m.status==='confirmed'?'Confirmed':'Awaiting coach'}</span></div>`).join(''):'<div class="muted sm">Nothing scheduled.</div>'}</div></aside></div>`;
}

/* ============ ADMIN ============ */
function adminView(){
  const tab=U().adm;
  const tabs=[['overview','Overview'],['athletes','Athletes'],['people','People']];
  const head=`<div style="margin-bottom:14px"><div class="up xs muted">Administrator</div><h1 style="font-size:28px;margin-top:4px">${tab==='overview'?'Organization overview':tab==='athletes'?'Athletes':'People'}</h1><div class="muted sm">${monthLabel(PERIOD)} reporting cycle</div></div>
  <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button class="tab ${tab===k?'on':''}" role="tab" aria-selected="${tab===k}" data-act="admtab" data-v="${k}">${l}</button>`).join('')}</div>`;
  return head+(tab==='athletes'?adminAthletes():tab==='people'?adminPeople():adminOverview());
}
function adminOverview(){
  const live=S.athletes.filter(a=>a.status!=='inactive');
  const rows=S.coaches.map(c=>{const mine=live.filter(a=>a.coach===c.id);const ids=new Set(mine.map(a=>a.id));
    return {c,assigned:mine.length,done:S.assessments.filter(x=>x.period===PERIOD&&x.status==='published'&&ids.has(x.athleteId)).length,
      over:mine.filter(a=>a.overdueFrom).length,q:S.reflections.filter(r=>!r.ack&&ids.has(r.athleteId)).length+S.asks.filter(x=>x.reply&&!x.seen&&ids.has(x.athleteId)).length,
      m:S.meetings.filter(m=>m.status==='requested'&&ids.has(m.athleteId)).length}});
  const done=S.assessments.filter(x=>x.period===PERIOD&&x.status==='published'&&live.some(a=>a.id===x.athleteId)).length;
  const overdue=live.filter(a=>a.overdueFrom);
  const unassigned=live.filter(a=>!a.coach);
  const upcoming=S.meetings.filter(m=>['requested','confirmed'].includes(m.status)&&new Date(m.slot)>TODAY).length;
  const queued=S.notifs.filter(n=>n.status==='queued').length;
  const left=dayDiff(periodEnd(PERIOD),TODAY);
  const status=S.coaches.filter(c=>c.active).map(c=>{const mine=live.filter(a=>a.coach===c.id).map(a=>({a,d:deadline(a)}));
    return {c,over:mine.filter(x=>x.d.state==='overdue'),due:mine.filter(x=>x.d.state==='due'),done:mine.filter(x=>x.d.state==='done'),total:mine.length}})
    .filter(r=>r.total).sort((x,y)=>y.over.length-x.over.length||y.due.length-x.due.length);
  const late=status.filter(r=>r.over.length);
  const overdueReports=late.reduce((n,r)=>n+r.over.reduce((m,x)=>m+x.d.count,0),0);
  const top=late.length?`<div class="dl-alert bad" role="alert"><div><b>${late.length} coach${late.length===1?' has':'es have'} overdue reports:</b> ${late.map(r=>esc(r.c.name)+' ('+r.over.reduce((m,x)=>m+x.d.count,0)+')').join(', ')}.</div></div>`
    :status.length?`<div class="dl-alert ok"><b>No overdue reports.</b> ${monthLabel(PERIOD)} reports are due ${dueLabel(PERIOD)} (${leftText(left).toLowerCase()}).</div>`:'';
  const statusCard=status.length?`<div class="card" style="margin-bottom:16px"><h3>Coach reporting status</h3><div class="sm muted" style="margin-bottom:10px">Each athlete’s monthly report is due by the last day of the month. ${monthLabel(PERIOD)}: due ${dueLabel(PERIOD)} · ${leftText(left).toLowerCase()}.</div>
    <div class="tscroll"><table class="t"><thead><tr><th>Coach</th><th>Overdue</th><th>Still due this month</th><th>Published this month</th></tr></thead><tbody>
    ${status.map(r=>`<tr class="${r.over.length?'row-bad':''}"><td><b>${esc(r.c.name)}</b><div class="xs muted">${r.total} athlete${r.total===1?'':'s'}</div></td>
      <td>${r.over.length?r.over.map(x=>`<div class="sm down-c"><b>${esc(x.a.name)}</b> · ${x.d.count>1?x.d.count+' reports (since '+monthShort(x.d.period)+')':monthLabel(x.d.period)} · ${lateText(x.d.late)}</div>`).join(''):'<span class="up-c sm">None</span>'}</td>
      <td>${r.due.length?r.due.map(x=>`<div class="sm">${esc(x.a.name)} <span class="xs muted">· ${esc(x.d.stage)}</span></div>`).join(''):'<span class="muted sm">—</span>'}</td>
      <td class="sm">${r.done.length} of ${r.done.length+r.due.length}</td></tr>`).join('')}</tbody></table></div></div>`:'';
  return `${top}${statusCard}<div class="grid g4" style="margin-bottom:20px">
    ${[['Subscribed athletes',live.length],['Active coaches',S.coaches.filter(c=>c.active).length],['Reports published this month',done+' of '+live.length],['Completion rate',live.length?Math.round(done/live.length*100)+'%':'—'],
      ['Overdue reports',overdueReports,overdueReports?'amber':''],['Upcoming meetings',upcoming],['Paid (active)',S.athletes.filter(a=>a.status==='active').length],['Payment issues',S.athletes.filter(a=>a.status==='grace').length,S.athletes.some(a=>a.status==='grace')?'amber':'']]
      .map(([l,n,c])=>`<div class="stat ${c||''}" style="cursor:default"><div class="l">${l}</div><div class="n">${n}</div></div>`).join('')}
  </div>
  ${(()=>{const pend=S.requests.filter(r=>r.status==='pending');return pend.length?`<div class="card" style="margin-bottom:16px"><h3>Coach requests waiting</h3>${pend.map(r=>`<div class="prow" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><b>${esc(ath(r.athleteId)?.name||'Athlete')}</b> <span class="muted sm">→ ${esc(coach(r.coach).name)} · from ${esc(r.byName)} · ${fd(r.ts,{month:'short',day:'numeric'})}</span></div><div style="display:flex;gap:6px"><button class="btn sm" data-act="acceptreq" data-id="${r.id}">Approve</button><button class="btn sm ghost" data-act="declinereq" data-id="${r.id}">Decline</button></div></div>`).join('')}</div>`:''})()}
  ${unassigned.filter(a=>!S.requests.some(r=>r.athleteId===a.id&&r.status==='pending')).length?`<div class="banner">${unassigned.length} athlete${unassigned.length===1?' has':'s have'} no coach yet. Families choose one when they sign in, or you can assign one under Athletes.</div>`:''}
  <div class="card" style="margin-bottom:16px"><h3>Coach workload</h3>${rows.length?`<div class="tscroll"><table class="t"><thead><tr><th>Coach</th><th>Assigned</th><th>Published this month</th><th>Overdue</th><th>Parent questions</th><th>Pending meetings</th></tr></thead>
   <tbody>${rows.map(r=>`<tr><td><b>${esc(r.c.name)}</b></td><td>${r.assigned}</td><td>${r.done}</td><td class="${r.over?'down-c':''}">${r.over}</td><td>${r.q}</td><td>${r.m}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted sm">No coaches yet. Add them under People.</div>'}</div>
  <div class="grid g2" style="align-items:start">
   ${EMAILS?'':`<div class="card"><h3>Notification emails</h3><div class="sm muted">Turned off. Families and coaches see new reports, requests and meetings when they sign in. To turn emails on later, connect Resend and set <b>emailNotifications: true</b> in config.js.</div></div>`}
   ${!EMAILS?'':`<div class="card"><h3>Family emails</h3><div class="xs muted" style="margin-bottom:8px">Sent when a report is published, a coach sends a request, or a meeting is confirmed.${queued?` ${queued} waiting to send.`:''}</div>
     ${queued?`<button class="btn sm" data-act="sendnow" style="margin-bottom:10px">Send waiting emails now</button>`:''}
     ${S.notifs.length?S.notifs.slice(0,10).map(nPreview).join(''):'<div class="muted sm">None yet.</div>'}</div>`}
   <div class="card"><h3>Audit log</h3>${S.audit.length?S.audit.slice(0,15).map(e=>`<div class="prow sm"><div>${esc(e.action)}</div><div class="xs muted">${esc(e.actor)} · ${ft(e.ts)}</div></div>`).join(''):'<div class="muted sm">Nothing logged yet.</div>'}</div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Assessment rubric</h3><div class="sm muted" style="margin-bottom:12px">The skills coaches rate each month.</div>
   <div class="grid g4">${[['Core',CORE.map(c=>c.n)],...Object.values(SETS).map(s=>[s.name,s.items.map(i=>i[1])])].map(([n,it])=>`<div><div class="xs up muted" style="margin-bottom:6px">${n}</div><ul style="margin:0;padding-left:16px" class="sm">${it.map(x=>`<li>${x}</li>`).join('')}</ul></div>`).join('')}</div></div>`;
}
function adminAthletes(){
  const guardians=S.people.filter(p=>p.role==='guardian'&&p.active).sort((a,b)=>a.full_name.localeCompare(b.full_name));
  const coachOpts=sel=>`<option value="">— Family chooses —</option>`+S.coaches.filter(c=>c.active).map(c=>`<option value="${c.id}" ${sel===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
  const gOpts=`<option value="">— Choose guardian —</option>`+guardians.map(p=>`<option value="${p.id}">${esc(p.full_name)} (${esc(p.email)})</option>`).join('');
  return `<div class="card" style="margin-bottom:16px"><h3>Add an athlete</h3>
    <div class="sm muted" style="margin-bottom:12px">Add the parent or guardian under People first, then link them here. Leave the coach as “Family chooses” and the family picks one when they sign in.</div>
    <div class="fgrid">
      <div><label class="f" for="na-name">Athlete name</label><input type="text" id="na-name" placeholder="First Last"></div>
      <div><label class="f" for="na-style">Primary style</label><select id="na-style">${STYLES.map(s=>`<option>${s}</option>`).join('')}</select></div>
      <div><label class="f" for="na-coach">Primary coach</label><select id="na-coach">${coachOpts('')}</select></div>
      <div><label class="f" for="na-aff">Home club or school (optional)</label><input type="text" id="na-aff" value="Rochelle Wrestling Club"></div>
      <div><label class="f" for="na-stage">Starting stage (coach view, optional)</label><select id="na-stage"><option value="">— Coach decides —</option>${STAGES.map(st=>`<option value="${st.n}">${esc(stageName(st.n))}</option>`).join('')}</select></div>
      <div><label class="f" for="na-status">Subscription</label><select id="na-status">${Object.entries(SUB_ST).map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div>
      <div><label class="f" for="na-g1">Guardian</label><select id="na-g1">${gOpts}</select></div>
      <div><label class="f" for="na-r1">Relationship</label><input type="text" id="na-r1" value="Parent"></div>
      <div><label class="f" for="na-g2">Second guardian (optional)</label><select id="na-g2">${gOpts}</select></div>
      <div><label class="f" for="na-r2">Relationship</label><input type="text" id="na-r2" value="Parent"></div>
    </div>
    <button class="btn primary" style="margin-top:12px" data-act="addathlete">Add athlete</button></div>
  <div class="card"><h3>All athletes</h3>${S.athletes.length?`<div class="tscroll"><table class="t"><thead><tr><th>Athlete</th><th>Coach</th><th>Subscription</th><th>Guardians</th></tr></thead><tbody>
    ${S.athletes.map(a=>`<tr><td><b>${esc(a.name)}</b> <button class="linkbtn" data-act="editathlete" data-id="${a.id}" aria-label="Edit ${esc(a.name)}’s profile">edit</button><div class="xs muted">${esc(a.style)} · ${esc(a.aff)}</div><div class="xs ${stagesDiffer(a)?'down-c':'muted'}">Stage: coach ${a.coachStage||'—'} · family ${a.familyStage||'—'}</div></td>
      <td><select data-aset="coach_id" data-id="${a.id}" aria-label="Coach for ${esc(a.name)}">${coachOpts(a.coach)}</select></td>
      <td><select data-aset="status" data-id="${a.id}" aria-label="Subscription for ${esc(a.name)}">${Object.entries(SUB_ST).map(([k,l])=>`<option value="${k}" ${a.status===k?'selected':''}>${l}</option>`).join('')}</select></td>
      <td>${(GUARDIANS[a.id]||[]).map(gd=>`<div class="sm">${esc(gd.name)} <span class="xs muted">· ${esc(gd.rel)}</span> <button class="linkbtn" data-act="unlink" data-a="${a.id}" data-g="${gd.id}" aria-label="Unlink ${esc(gd.name)}">unlink</button></div>`).join('')||'<span class="xs down-c">No guardian linked</span>'}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><select id="lg-${a.id}" style="width:auto;max-width:220px" aria-label="Guardian to link">${gOpts}</select><input type="text" id="lr-${a.id}" value="Parent" style="width:100px" aria-label="Relationship"><button class="btn sm" data-act="link" data-id="${a.id}">Link</button></div></td></tr>`).join('')}
  </tbody></table></div>`:'<div class="muted sm">No athletes yet.</div>'}</div>`;
}
function adminPeople(){
  const ppl=S.people.slice().sort((a,b)=>a.role.localeCompare(b.role)||a.full_name.localeCompare(b.full_name));
  return `<div class="card" style="margin-bottom:16px"><h3>Add a person</h3>
    <div class="sm muted" style="margin-bottom:12px">Adding someone creates their sign-in and shows you a temporary password to share with them privately. Families only ever see the athletes linked to them.</div>
    <div class="fgrid">
      <div><label class="f" for="np-name">Full name</label><input type="text" id="np-name" placeholder="First Last"></div>
      <div><label class="f" for="np-email">Email</label><input type="email" id="np-email" placeholder="name@example.com"></div>
      <div><label class="f" for="np-role">Role</label><select id="np-role"><option value="guardian">Parent / guardian</option><option value="coach">Coach</option><option value="admin">Administrator</option></select></div>
      <div><label class="f" for="np-phone">Phone (optional)</label><input type="text" id="np-phone" placeholder="(815) 555-0100"></div>
      <div class="full"><label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="np-coach"> Administrator also coaches athletes</label></div>
    </div>
    <button class="btn primary" style="margin-top:12px" data-act="addperson">Add person & create sign-in</button></div>
  <div class="card"><h3>Everyone with access</h3><div class="tscroll"><table class="t"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Access</th></tr></thead><tbody>
    ${ppl.map(p=>`<tr><td><b>${esc(p.full_name)}</b>${p.phone?`<div class="xs muted">${esc(p.phone)}</div>`:''}</td><td class="sm">${esc(p.email)}</td>
      <td><select data-pset="role" data-id="${p.id}" aria-label="Role for ${esc(p.full_name)}" ${p.id===myId()?'disabled':''}><option value="guardian" ${p.role==='guardian'?'selected':''}>Parent / guardian</option><option value="coach" ${p.role==='coach'?'selected':''}>Coach</option><option value="admin" ${p.role==='admin'?'selected':''}>Administrator</option></select>
        ${p.role==='admin'?`<label class="xs" style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" data-pset="is_coach" data-id="${p.id}" ${p.is_coach?'checked':''}> also coaches</label>`:''}</td>
      <td>${p.id===myId()?'<span class="xs muted">You</span>':`<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" data-act="setpw" data-id="${p.id}">Set password</button><button class="btn sm ${p.active?'':'primary'}" data-act="toggleperson" data-id="${p.id}">${p.active?'Turn off access':'Turn on access'}</button></div>`}</td></tr>`).join('')}
  </tbody></table></div></div>`;
}

/* ============ SIGN IN (email + password) ============ */
let SI={err:'',busy:false,email:''};
function siSide(){return `<section class="si-side" aria-label="The Forge">
     <img alt="The Forge" src="logo.png">
     <div><div class="up xs" style="color:var(--accent2);margin-bottom:14px">Individual Athlete Profile</div>
       <h2>REAL FEEDBACK.<br>REAL DEVELOPMENT.</h2>
       <div class="sl">Evaluate. Develop. Refine. Perform.</div></div>
     <div class="addr">The Forge · Rochelle Wrestling Club<br>1135 Lincoln Hwy, Rochelle, IL 61068</div></section>`}
function siShell(inner){return `<div class="si">${siSide()}<section class="si-main"><div class="si-box">${inner}</div></section></div>`}
function signInView(){
  return `<div class="si">${siSide()}<section class="si-main"><form class="si-box" data-form="signin" novalidate>
     <h1>Sign in</h1>
     <div class="muted sm" style="margin-bottom:22px">For Forge families, coaches and staff.</div>
     <div class="fld"><label class="f" for="si-email">Email address</label><input type="email" id="si-email" autocomplete="username" value="${esc(SI.email)}" placeholder="you@example.com"></div>
     <div class="fld"><label class="f" for="si-pw">Password</label><input type="password" id="si-pw" autocomplete="current-password"></div>
     ${SI.err?`<div class="err" role="alert">${esc(SI.err)}</div>`:''}
     <button type="submit" class="btn primary" ${SI.busy?'disabled':''}>${SI.busy?'Signing in…':'Sign in'}</button>
     <div class="si-foot">Forgot your password? Ask a Forge administrator to reset it.<br>New families: register through <a href="https://rochellewrestlingclub.com" target="_blank" rel="noopener">rochellewrestlingclub.com</a> and the club will set up your sign-in.</div>
   </form></section></div>`;
}
function newTempPassword(){const A='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz',D='23456789';const r=new Uint32Array(8);crypto.getRandomValues(r);
  const pick=(set,i)=>set[r[i]%set.length];return 'Forge-'+[0,1,2,3].map(i=>pick(D,i)).join('')+'-'+[4,5,6,7].map(i=>pick(A,i)).join('')}
async function setLogin(email,password){
  const {data,error}=await sb.functions.invoke('manage-login',{body:{email,password}});
  if(error){let m=error.message;try{const b=await error.context?.json?.();if(b?.error)m=b.error}catch(e){}throw new Error(m||'Couldn’t set the password.')}
  if(data?.error)throw new Error(data.error);
  return data;
}
function passwordModal(name,email,pw){
  modal(`<div class="mh"><h3>Sign-in for ${esc(name)}</h3><button class="btn sm" data-act="closemodal">Done</button></div>
   <p class="muted sm">Share this privately (in person, text or phone). They’ll be asked to choose their own password after signing in. This password won’t be shown again.</p>
   <div class="card" style="margin-top:12px"><div class="cline"><span><span class="xs muted">Email</span><br><span class="sel">${esc(email)}</span></span>${copyBtn(email)}</div>
   <div class="hr"></div><div class="cline"><span><span class="xs muted">Temporary password</span><br><b class="sel" style="font-size:18px;letter-spacing:.04em">${esc(pw)}</b></span>${copyBtn(pw)}</div></div>
   <p class="xs muted" style="margin-top:12px">Sign in at ${esc(location.origin)}</p>`);
}
function changePwModal(forced){
  modal(`<div class="mh"><h3>${forced?'Choose your own password':'Change password'}</h3>${forced?'':'<button class="btn sm" data-act="closemodal">Cancel</button>'}</div>
   ${forced?'<p class="muted sm">You signed in with a temporary password from the club. Pick a new one only you know.</p>':''}
   <div class="fld" style="margin-top:12px"><label class="f" for="pw1">New password (at least 8 characters)</label><input type="password" id="pw1" autocomplete="new-password"></div>
   <div class="fld" style="margin-top:10px"><label class="f" for="pw2">Type it again</label><input type="password" id="pw2" autocomplete="new-password"></div>
   <button class="btn primary" style="margin-top:14px" data-act="dochangepw">Save password</button>`);
  setTimeout(()=>$('#pw1')?.focus(),30);
}
function setupView(){return siShell(`<h1>Almost ready</h1><p class="muted">This portal isn’t connected to its database yet. Open <b>config.js</b> and paste in the Supabase project URL and anon key, as described in the setup guide.</p>`)}
function loadingView(){return `<div class="empty" style="margin-top:60px">Loading your portal…</div>`}
function noAccessView(){return siShell(`<h1>No access yet</h1><p class="muted">You’re signed in as <b style="color:var(--text)">${esc(SESSION?.user?.email)}</b>, but that email isn’t set up in the portal.</p>
  <p class="muted sm">Families: the club adds your email after registration. If you used a different email when you registered, sign out and try that one.</p>
  <button class="btn" data-act="signout" style="margin-top:8px">Sign out</button>`)}
function errorView(){return `<div class="card" style="margin-top:40px;text-align:center"><h3>We couldn’t load the portal</h3><p class="muted">${esc(LOAD_ERR)}</p><button class="btn primary" data-act="retry">Try again</button></div>`}

/* ============ PRINTABLE REPORT ============ */
function printableHTML(r,a,prev){
  const logo=new URL('logo.png',location.href).href;
  const ti=tsi(r.ratings),pt=prev?tsi(prev.ratings):null,ch=ti!=null&&pt!=null?ti-pt:null;
  const rad=radar(r.ratings,prev?.ratings).replace(/#B8CCBD/g,'#2b3a30').replace(/#35483B/g,'#cdd6cf').replace(/rgba\(255,255,255,\.015\)/g,'none').replace(/#6f8275/g,'#7d8981').replace(/#9aa69e/g,'#8a948d').replace(/#8FB8A6/g,'#3f6b59').replace(/stroke="#142019"/g,'stroke="#ffffff"').replace(/rgba\(98,141,124,\.32\)/g,'rgba(63,107,89,.22)');
  const dots=v=>[1,2,3,4].map(i=>`<i class="${typeof v==='number'&&i<=v?'f':''}"></i>`).join('');
  const skillRows=CORE.map(c=>{const cv=r.ratings[c.id],pv=prev?.ratings[c.id];const t=trend(cv,pv);
    return `<tr><td>${c.n}</td><td class="c">${fmtR(pv)}</td><td class="c"><b>${fmtR(cv)}</b></td><td><span class="dots">${dots(cv)}</span></td><td>${t.a} ${t.t}</td></tr>`}).join('');
  const sets=STYLESETS[a.style]||[];
  const styleRows=sets.map(k=>{const items=SETS[k].items.filter(([id])=>r.styleRatings[k+'.'+id]!==undefined);if(!items.length)return '';
    return `<div class="sub">${SETS[k].name}</div><div class="sgrid">${items.map(([id,l])=>`<div><span>${l}</span><b>${fmtR(r.styleRatings[k+'.'+id])}</b></div>`).join('')}</div>`}).join('');
  const goals=r.goals.map((gl,i)=>`<div class="goal"><div class="gh"><b>Goal ${i+1}. ${esc(gl.title)}</b><span>${esc(gl.status)}</span></div>
    <table class="gt"><tr><th>Category</th><td>${esc(gl.category)}</td><th>Review by</th><td>${fd(gl.review)}</td></tr>
    <tr><th>What we'll see</th><td colspan="3">${esc(gl.behavior)}</td></tr><tr><th>How we measure</th><td colspan="3">${esc(gl.measure)}</td></tr>
    <tr><th>Coach plan</th><td colspan="3">${esc(gl.coachRec)}</td></tr><tr><th>Athlete commits</th><td colspan="3">${esc(gl.commit)}</td></tr></table></div>`).join('');
  const c=coach(r.coach||a.coach).name;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.name)} — ${monthLabel(r.period)} Development Report</title>
<style>
@page{size:letter;margin:0.55in 0.6in}*{box-sizing:border-box}
body{margin:0;font-family:"Helvetica Neue",Arial,sans-serif;color:#18231c;font-size:10.5pt;line-height:1.45;background:#e9ece9}
.sheet{background:#fff;max-width:8.5in;margin:24px auto;padding:0.55in 0.6in;box-shadow:0 2px 16px rgba(0,0,0,.12)}
.bar{position:sticky;top:0;background:#142019;color:#F1F4F0;padding:12px 16px;display:flex;gap:12px;align-items:center;justify-content:center;font-size:14px}
.bar button{background:#628D7C;border:0;color:#0f1a14;font-weight:700;padding:9px 18px;border-radius:8px;cursor:pointer;font-size:14px}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2.5px solid #18231c;padding-bottom:10px;margin-bottom:14px}
header img{height:22px;filter:invert(1) brightness(.2)}
header .k{font-size:8pt;letter-spacing:.2em;text-transform:uppercase;color:#4a5a50;text-align:right}
h1{font-size:22pt;margin:0 0 2px;letter-spacing:.01em}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0 14px;font-size:9pt}
.meta span{display:block;font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;color:#5d6b62}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.metrics div{border:1px solid #c9d2cb;border-radius:6px;padding:8px 10px}
.metrics b{display:block;font-size:18pt;line-height:1.1}
.metrics span{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#5d6b62}
.metrics small{display:block;font-size:7.5pt;color:#5d6b62}
h2{font-size:9pt;letter-spacing:.16em;text-transform:uppercase;margin:16px 0 6px;color:#2b3a30;border-bottom:1px solid #c9d2cb;padding-bottom:3px}
p{margin:0 0 6px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.box{border:1px solid #c9d2cb;border-left:3px solid #3f6b59;border-radius:4px;padding:8px 10px}
.box.t{border-left-color:#a77d2e;background:#fbf7ee}
.box h3{margin:0 0 4px;font-size:8.5pt;letter-spacing:.14em;text-transform:uppercase}
.perf{display:grid;grid-template-columns:2.6in 1fr;gap:14px;align-items:center}.perf svg{width:100%;height:auto}
table{border-collapse:collapse;width:100%}
.sk th,.sk td{padding:4px 6px;border-bottom:1px solid #e1e6e2;font-size:9pt;text-align:left}
.sk th{font-size:7.5pt;letter-spacing:.1em;text-transform:uppercase;color:#5d6b62}.c{text-align:center!important}
.dots{display:inline-flex;gap:2px}.dots i{width:14px;height:6px;border:1px solid #9aa79e;border-radius:2px}.dots i.f{background:#3f6b59;border-color:#3f6b59}
.sub{font-size:8pt;font-weight:700;margin:8px 0 3px;color:#2b3a30}
.sgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px 14px;font-size:8.5pt}
.sgrid div{display:flex;justify-content:space-between;border-bottom:1px dotted #d3dad5;padding:2px 0}
.goal{border:1px solid #c9d2cb;border-radius:5px;padding:7px 9px;margin-bottom:7px;break-inside:avoid}
.goal .gh{display:flex;justify-content:space-between;gap:10px;margin-bottom:4px}
.goal .gh span{font-size:8pt;border:1px solid #9aa79e;border-radius:10px;padding:0 8px;white-space:nowrap}
.gt th{width:1.15in;text-align:left;font-weight:600;color:#4a5a50;font-size:8.5pt;padding:2px 6px 2px 0;vertical-align:top}
.gt td{font-size:9pt;padding:2px 10px 2px 0;vertical-align:top}
.take{background:#1E3326;color:#F1F4F0;border-radius:6px;padding:12px 16px;margin-top:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.take h3{margin:0 0 6px;font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;color:#B8CCBD}
.take p{font-size:11.5pt;font-style:italic}.take .sig{font-size:9pt;color:#B8CCBD}
.notes{break-before:page}.lines div{border-bottom:1px solid #b8c2bb;height:26px}
.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:22px;font-size:8.5pt;color:#4a5a50}
.sign div{border-top:1px solid #18231c;padding-top:4px}
footer{margin-top:16px;padding-top:6px;border-top:1px solid #c9d2cb;font-size:7.5pt;color:#5d6b62;display:flex;justify-content:space-between;gap:10px}
.box,.two,.perf,.metrics{break-inside:avoid}
@media print{body{background:#fff}.bar{display:none}.sheet{margin:0;padding:0;box-shadow:none;max-width:none}}
@media(max-width:700px){.sheet{padding:20px;margin:0}.two,.perf{grid-template-columns:1fr}.meta{grid-template-columns:1fr 1fr}.sgrid{grid-template-columns:1fr 1fr}}
</style></head><body>
<div class="bar"><span>Ready to print</span><button onclick="window.print()">Print report</button></div>
<div class="sheet">
<header><img alt="The Forge" src="${logo}"><div class="k">Athlete Development Report<br>Rochelle Wrestling Club</div></header>
<h1>${esc(a.name)}</h1>
<div class="meta"><div><span>Reporting month</span>${monthLabel(r.period)}</div><div><span>Primary style</span>${esc(a.style)}</div><div><span>Coach</span>${esc(c)}</div><div><span>Development stage</span>${a.coachStage?esc(stageName(a.coachStage)):'Not set'}${a.familyStage?'<br><small>Family view: Stage '+a.familyStage+'</small>':''}</div></div>
<div class="metrics"><div><span>Technical Skill Index</span><b>${ti!=null?ti.toFixed(1):'—'} / 4</b><small>Average of ${observed(r.ratings)} observed core ratings. Not a ranking or prediction.</small></div>
<div><span>Change since previous</span><b>${ch==null?'—':(ch>0?'+':'')+ch.toFixed(1)}</b><small>${prev?'Compared with '+monthLabel(prev.period):'First assessment'}</small></div>
<div><span>Active goals</span><b>${r.goals.filter(x=>x.status!=='Completed').length}</b><small>Review by ${r.goals[0]?fd(r.goals[0].review):'—'}</small></div></div>
<h2>Where you stand</h2><p>${esc(r.stand)}</p>
<div class="two" style="margin-top:10px"><div class="box"><h3>What is going well</h3><p>${esc(r.well)}</p></div><div class="box t"><h3>Tough truths</h3><p>${esc(r.tough)}</p></div></div>
<h2>Recommended adjustments</h2><div class="two"><div><b style="font-size:8.5pt">What your coach will change</b><p>${esc(r.adjCoach)}</p></div><div><b style="font-size:8.5pt">What you need to do</b><p>${esc(r.adjAthlete)}</p></div></div>
<h2>Technical profile</h2>
<div class="perf"><div>${rad}<div style="font-size:7.5pt;color:#5d6b62;text-align:center">Solid: ${monthLabel(r.period)}${prev?' · Dashed: '+monthLabel(prev.period):''}</div></div>
<table class="sk"><tr><th>Skill</th><th class="c">Prev.</th><th class="c">Now</th><th></th><th>Change</th></tr>${skillRows}</table></div>
${styleRows}
<div style="font-size:7.5pt;color:#5d6b62;margin-top:6px">Scale: 0 Not yet introduced · 1 Developing · 2 Consistent in controlled drilling · 3 Effective vs. live resistance · 4 Reliable in competition. Skills not observed are not scored.</div>
<h2>Next 30 days</h2>${goals||'<p>No goals set.</p>'}
<div class="take"><h3>The Coach's Take</h3><p>“${esc(r.take)}”</p><div class="sig">— ${esc(c)}</div></div>
<div class="notes"><h2>Development meeting notes</h2>
<div class="meta" style="grid-template-columns:repeat(3,1fr)"><div><span>Date</span>____________________</div><div><span>Attending</span>____________________</div><div><span>Location</span>The Forge, Rochelle</div></div>
<div class="sub">What we agreed</div><div class="lines">${'<div></div>'.repeat(7)}</div>
<div class="sub" style="margin-top:12px">Changes to goals</div><div class="lines">${'<div></div>'.repeat(5)}</div>
<div class="sub" style="margin-top:12px">Questions to follow up on</div><div class="lines">${'<div></div>'.repeat(4)}</div>
<div class="sign"><div>Athlete</div><div>Parent / guardian</div><div>Coach</div></div></div>
<footer><span>The Forge · 1135 Lincoln Hwy, Rochelle, IL 61068</span><span>Approved ${fd(r.ts.approved||r.ts.published)} · Confidential, prepared for the ${esc(a.family)}</span></footer>
</div></body></html>`;
}
function downloadReport(id){
  const r=S.assessments.find(x=>x.id===id);if(!r)return;const a=ath(r.athleteId);const prev=prevPub(a.id,r.period);
  const html=printableHTML(r,a,prev);
  const w=window.open('','_blank');
  if(w){w.document.open();w.document.write(html);w.document.close();return}
  const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));
  const link=document.createElement('a');link.href=url;link.download=`${a.name.replace(/\s+/g,'-')}-${monthLabel(r.period).replace(/\s+/g,'-')}-Forge-Report.html`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  toast('Downloaded. Open the file and choose Print report.');
}

/* ============ FAMILY CONTACT + COACH REQUESTS ============ */
const ASK_TYPES=['Question','Video request','Information request'];
const asks=()=>S.asks;
const asksFor=id=>S.asks.filter(q=>q.athleteId===id);
function copyBtn(v){return `<button type="button" class="btn sm ghost copy" data-act="copy" data-v="${esc(v)}" aria-label="Copy ${esc(v)}">Copy</button>`}
function contactCard(a){
  const gs=GUARDIANS[a.id]||[];const qs=asksFor(a.id).slice().reverse();
  return `<div class="card"><h4>Family contact</h4>
   ${gs.length?gs.map(gd=>`<div class="gcon"><div><b>${esc(gd.name)}</b> <span class="xs muted">· ${esc(gd.rel)}</span></div>
     <div class="cline"><span class="sel">${esc(gd.email)}</span>${copyBtn(gd.email)}</div>
     ${gd.phone?`<div class="cline"><span class="sel">${esc(gd.phone)}</span>${copyBtn(gd.phone)}</div>`:''}
     <div class="xs muted">Prefers ${esc(gd.pref.toLowerCase())}${gd.best?' · '+esc(gd.best):''}</div></div>`).join(''):'<div class="muted sm">No guardian linked yet. An administrator links families under Athletes.</div>'}
   <div class="xs muted" style="margin-top:8px">Visible only to the assigned coach and administrators. Contact guardians, not athletes directly.</div>
   <div class="hr"></div>
   <h4>Ask the family</h4>
   <div class="xs muted" style="margin-bottom:8px">${EMAILS?'Requests are emailed to every guardian on the account and kept here.':'Requests appear for every guardian on the account and are kept here.'}</div>
   <label class="f" for="ask-type">Type</label><select id="ask-type" style="margin-bottom:8px">${ASK_TYPES.map(t=>`<option>${t}</option>`).join('')}</select>
   <label class="f" for="ask-text">Request</label><textarea id="ask-text" rows="3" placeholder="e.g. Could you send video of Saturday's matches? I want to look at par terre defense."></textarea>
   <button class="btn sm primary" style="margin-top:8px" data-act="sendask" data-id="${a.id}" ${gs.length?'':'disabled'}>Send to family</button>
   ${qs.length?`<div style="margin-top:14px">${qs.map(q=>`<div class="ask ${q.reply&&!q.seen?'new':''}"><div class="xs muted">${esc(q.type)} · ${fd(q.ts,{month:'short',day:'numeric'})}</div><div class="sm">${esc(q.text)}</div>
     ${q.reply?`<div class="reply"><div class="xs muted">${esc(q.reply.by)} replied ${fd(q.reply.ts,{month:'short',day:'numeric'})}</div>${q.reply.text?`<div class="sm">${esc(q.reply.text)}</div>`:''}${q.reply.link?`<a class="sm" href="${esc(q.reply.link)}" target="_blank" rel="noopener noreferrer">${esc(q.reply.link)}</a>`:''}
       ${!q.seen?`<button class="btn sm" style="margin-top:6px" data-act="askseen" data-id="${q.id}">Mark as read</button>`:''}</div>`:'<div class="xs" style="color:var(--amber);margin-top:4px">Waiting for the family</div>'}</div>`).join('')}</div>`:''}
  </div>`;
}
function parentAsks(a){
  const open=asksFor(a.id).filter(q=>!q.reply);const done=asksFor(a.id).filter(q=>q.reply).slice(-2);
  if(!open.length&&!done.length)return '';
  return `<div class="card noprint" style="margin-bottom:18px;border-color:rgba(208,170,98,.4)">
   ${open.map(q=>`<div class="pask"><div class="up xs" style="color:var(--amber)">${esc(coach(a.coach).name)} · ${esc(q.type)}</div><p style="margin:6px 0 10px">${esc(q.text)}</p>
     <label class="f" for="rp-${q.id}">Your reply</label><textarea id="rp-${q.id}" rows="2"></textarea>
     <label class="f" for="rl-${q.id}" style="margin-top:8px">Link to video or file (optional)</label><input type="text" id="rl-${q.id}" placeholder="YouTube, Hudl, Google Drive or FloWrestling link">
     <button class="btn sm primary" style="margin-top:10px" data-act="replyask" data-id="${q.id}">Send reply</button></div>`).join('<div class="hr"></div>')}
   ${done.length&&!open.length?`<div class="sm muted">Recent replies to ${esc(coach(a.coach).name)}:</div>${done.map(q=>`<div class="sm" style="margin-top:6px"><b>${esc(q.type)}:</b> ${esc(q.text)}<div class="xs muted">${esc(q.reply.by)} replied ${fd(q.reply.ts,{month:'short',day:'numeric'})}${q.seen?' · Read by coach':''}</div></div>`).join('')}`:''}
  </div>`;
}

/* ============ FAMILY EMAIL SETTINGS ============ */
function planText(a){const gs=GUARDIANS[a.id]||[];if(!gs.length)return 'No guardian is linked yet, so no one will be emailed.';
  return gs.map(gd=>`<b>${esc(gd.name)}</b> ${gd.notify?'by email':'(emails turned off)'}`).join(' · ')}
function notifCard(a){
  const me=S.me;
  if(!EMAILS)return `<div class="card noprint" style="margin-top:16px"><h3>Your contact details</h3>
   <div class="sm muted" style="margin-bottom:6px">${esc(coach(a.coach).name)} uses these if they need to reach you.</div>
   <div class="fgrid" style="margin-top:10px"><div><label class="f" for="me-phone">Phone</label><input type="text" id="me-phone" value="${esc(me.phone||'')}"></div>
   <div><label class="f" for="me-pref">Best way to reach me</label><select id="me-pref">${['Email','Text','Phone call'].map(x=>`<option ${me.contact_pref===x?'selected':''}>${x}</option>`).join('')}</select></div>
   <div class="full"><label class="f" for="me-best">Best times</label><input type="text" id="me-best" value="${esc(me.best_time||'')}" placeholder="e.g. Weekdays after 5 PM"></div></div>
   <button class="btn sm" style="margin-top:10px" data-act="savecontact">Save contact details</button></div>`;const gs=GUARDIANS[a.id]||[];const others=gs.filter(x=>x.id!==me.id);
  const recent=S.notifs.filter(n=>n.athleteId===a.id).slice(0,4);
  return `<div class="card noprint" style="margin-top:16px"><h3>How we reach you</h3>
   <div class="sm muted" style="margin-bottom:12px">We email you when ${esc(coach(a.coach).name)} publishes a report, sends you a request, or confirms a meeting. Emails say what’s new and link here; the report itself stays behind your sign-in.</div>
   <div class="nrow"><div><b>${esc(me.full_name)}</b> <span class="xs muted">(you)</span><div class="xs muted">${esc(me.email)}</div></div>
     <div class="seg nseg" role="radiogroup" aria-label="Email notifications">${[['on','Email me'],['off','Off']].map(([k,l])=>`<button role="radio" aria-checked="${(me.notify_email?'on':'off')===k}" class="${(me.notify_email?'on':'off')===k?'on':''}" data-act="setnotify" data-v="${k}">${l}</button>`).join('')}</div></div>
   ${others.map(gd=>`<div class="nrow"><div><b>${esc(gd.name)}</b><div class="xs muted">${esc(gd.email)}</div></div><span class="xs muted">${gd.notify?'Gets emails':'Emails off'}</span></div>`).join('')}
   <details style="margin-top:12px"><summary class="sm" style="cursor:pointer;color:var(--accent2)">Update my contact details for the coach</summary>
     <div class="fgrid" style="margin-top:10px"><div><label class="f" for="me-phone">Phone</label><input type="text" id="me-phone" value="${esc(me.phone||'')}"></div>
     <div><label class="f" for="me-pref">Best way to reach me</label><select id="me-pref">${['Email','Text','Phone call'].map(x=>`<option ${me.contact_pref===x?'selected':''}>${x}</option>`).join('')}</select></div>
     <div class="full"><label class="f" for="me-best">Best times</label><input type="text" id="me-best" value="${esc(me.best_time||'')}" placeholder="e.g. Weekdays after 5 PM"></div></div>
     <button class="btn sm" style="margin-top:10px" data-act="savecontact">Save contact details</button></details>
   ${recent.length?`<div class="hr"></div><div class="xs up muted" style="margin-bottom:8px">Recent emails to you</div>${recent.map(nPreview).join('')}`:''}
  </div>`;
}
function nPreview(n){const st=n.status==='failed'?' · <span class="down-c">not delivered</span>':n.status==='queued'?' · waiting to send':'';
  return `<div class="nmsg email"><div class="xs muted">Email to ${esc(n.to)} · ${esc(n.addr)} · ${fd(n.ts,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}${st}</div><div class="sm"><b>${esc(n.subject)}</b></div><div class="sm">${esc(n.text)}</div></div>`}

/* ============ RENDER ============ */
function render(){
  const ready=!!(SESSION&&S.me&&!LOADING&&!LOAD_ERR);
  $('.top').hidden=!ready;
  document.querySelector('main').style.padding=ready?'':'0';
  document.querySelector('main>.wrap').style.cssText=ready?'':'max-width:none;padding:0';
  if(!sb){$('#main').innerHTML=setupView();return}
  if(!SESSION){$('#main').innerHTML=signInView();return}
  if(LOADING){document.querySelector('main>.wrap').style.cssText='';$('#main').innerHTML=loadingView();return}
  if(LOAD_ERR){document.querySelector('main>.wrap').style.cssText='';$('#main').innerHTML=errorView();return}
  if(!S.me){$('#main').innerHTML=noAccessView();return}
  const roles=rolesFor(S.me).map(r=>r[0]);if(!roles.includes(U().role))U().role=roles[0];
  renderRoles();
  const r=U().role;
  $('#main').innerHTML= r==='coach'?(U().open?workspace():coachDash()) : r==='parent'?parentView() : adminView();
  if(SESSION.user?.user_metadata?.temp_password&&!$('#pw1'))changePwModal(true);
}

/* ============ SAVING DRAFTS ============ */
function curDraft(){const a=ath(U().open);return a&&find(a.id,editPeriod(a))}
let saveTimer=null,saveQueue=Promise.resolve(),dirty=false;
function draftRow(d){return {ratings:clean(d.ratings),style_ratings:clean(d.styleRatings),stand:d.stand,well:d.well,tough:d.tough,adj_coach:d.adjCoach,adj_athlete:d.adjAthlete,take:d.take,goals:d.goals}}
function clean(o){const r={};Object.entries(o||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null)r[k]=v});return r}
function setSaveState(t){const e=$('#savestate');if(e)e.textContent=t}
function writeDraft(d){
  dirty=false;
  const row=draftRow(d);if(d.status==='ready')row.status='draft';
  saveQueue=saveQueue.then(async()=>{
    const {error}=await sb.from('assessments').update(row).eq('id',d.id);
    if(error)throw error;
    const n=await sb.from('assessment_notes').upsert({assessment_id:d.id,notes:clean(d.notes),updated_at:new Date().toISOString()});
    if(n.error)throw n.error;
    if(d.status==='ready'){d.status='draft';d.ts.approved=null}
    d.ts.edited=new Date().toISOString();
    setSaveState('Draft · saved '+new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}));
  }).catch(e=>{console.error(e);dirty=true;setSaveState('Not saved — check your connection');toast(errMsg(e))});
  return saveQueue;
}
function touch(d){
  dirty=true;
  if(d.status==='ready'){const b=document.querySelector('[data-act="publish"]');if(b){b.dataset.act='approve';b.textContent='Approve report'}}
  setSaveState('Saving…');
  clearTimeout(saveTimer);saveTimer=setTimeout(()=>writeDraft(d),800);
}
async function flushDraft(){const d=curDraft();if(saveTimer){clearTimeout(saveTimer);saveTimer=null}if(d&&dirty)writeDraft(d);await saveQueue}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
function validate(d){
  const m=[];if(CORE.filter(c=>typeof d.ratings[c.id]==='number').length<3)m.push('at least 3 observed core ratings');
  [['stand','Where You Stand'],['well','What Is Going Well'],['tough','Tough Truths'],['adjCoach','coach adjustment'],['adjAthlete','athlete adjustment'],['take','Coach’s Take']].forEach(([f,l])=>{if(!String(d[f]||'').trim())m.push(l)});
  if(d.goals.filter(x=>(x.title||'').trim()&&(x.measure||'').trim()).length<2)m.push('2 goals with a title and measurement');
  return m;
}
function modal(html){$('#modal').innerHTML=`<div class="modal" data-act="closemodal"><div class="box">${html}</div></div>`}
const val=id=>($('#'+id)?.value||'').trim();

/* ============ ACTIONS ============ */
const ACT={
  role:async t=>{await flushDraft();U().role=t.dataset.v;U().open=null;render();scrollTo(0,0)},
  retry:()=>afterAuth(),
  filter:t=>{U().filter=t.dataset.v;render()},
  open:t=>{U().open=t.dataset.id;render();scrollTo(0,0)},
  back:async()=>{await flushDraft();U().open=null;await run(async()=>{});scrollTo(0,0)},
  start:t=>{const a=ath(t.dataset.id);const rv=new Date(TODAY.getTime()+30*864e5).toISOString().slice(0,10);
    run(()=>q(sb.from('assessments').insert({athlete_id:a.id,period:editPeriod(a)+'-01',coach_id:myId(),goals:[g('','Offensive Wrestling','','',rv,'','','Not Started')]}).select('id')),'Draft started')},
  rate:t=>{const d=curDraft();if(!d||d.status==='published')return;const[kind,key]=t.dataset.key.split(/:(.+)/);const v=t.dataset.v==='NO'?'NO':Number(t.dataset.v);
    const tgt=kind==='c'?d.ratings:d.styleRatings;tgt[key]=tgt[key]===v?undefined:v;
    t.parentElement.querySelectorAll('button').forEach(b=>{const on=(b.dataset.v==='NO'?'NO':Number(b.dataset.v))===tgt[key];b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});touch(d)},
  addgoal:()=>{const d=curDraft();const rv=new Date(TODAY.getTime()+30*864e5).toISOString().slice(0,10);d.goals.push(g('','Offensive Wrestling','','',rv,'','','Not Started'));touch(d);render();document.getElementById('s-f')?.scrollIntoView()},
  rmgoal:t=>{const d=curDraft();d.goals.splice(+t.dataset.i,1);touch(d);render();document.getElementById('s-f')?.scrollIntoView()},
  savedraft:async()=>{const d=curDraft();if(!d)return;dirty=true;await flushDraft();if(!dirty)toast('Draft saved')},
  preview:()=>{const d=curDraft();const a=ath(U().open);
    modal(`<div class="mh"><div><div class="up xs" style="color:var(--amber)">Preview · not visible to family</div><h3 style="margin-top:4px">${esc(a.name)} — ${monthLabel(d.period)}</h3></div><button class="btn sm" data-act="closemodal">Close</button></div>
     ${reportBody(d,a,prevPub(a.id,d.period))}<div class="card chart" style="margin-top:16px"><h3>Technical profile</h3>${radar(d.ratings,prevPub(a.id,d.period)?.ratings)}</div>`)},
  closemodal:(t,e)=>{if(SESSION?.user?.user_metadata?.temp_password&&$('#pw1'))return;if(e.target===t||t.tagName==='BUTTON')$('#modal').innerHTML=''},
  approve:async()=>{const d=curDraft();const m=validate(d);if(m.length){toast('Still needed: '+m.join(', '));return}
    await flushDraft();if(dirty)return;
    run(()=>q(sb.from('assessments').update({status:'ready'}).eq('id',d.id).select('id')),'Approved. Publish when you’re ready.')},
  publish:()=>{const d=curDraft();const a=ath(d.athleteId);
    modal(`<div class="mh"><h3>Publish ${monthLabel(d.period)} report?</h3></div><p>The ${esc(a.family)} will see this report right away. After publishing it’s locked; an administrator can help with corrections.</p>${EMAILS?`<div class="note" style="margin-top:12px">Emailing: ${planText(a)}</div>`:''}
     <div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" data-act="dopublish">Publish to family</button><button class="btn" data-act="closemodal">Cancel</button></div>`)},
  dopublish:async t=>{const d=curDraft();const a=ath(d.athleteId);t.disabled=true;t.textContent='Publishing…';
    const ok=await run(()=>q(sb.from('assessments').update({status:'published'}).eq('id',d.id).select('id')),'Published — the '+a.family+' can see it now');
    $('#modal').innerHTML='';if(ok)sendQueued()},
  tab:t=>{U().tab=t.dataset.v;render()},
  setstage:t=>{const n=Number(t.dataset.v);run(()=>q(sb.rpc('set_athlete_stage',{p_athlete:t.dataset.a,p_stage:n})),'Saved: '+stageName(n))},
  choosecoach:()=>{U().choosing=true;render();scrollTo(0,0)},
  cancelchoose:()=>{U().choosing=false;render();scrollTo(0,0)},
  reqcoach:async t=>{const a=curKid();const c=coach(t.dataset.c);t.disabled=true;
    const ok=await run(()=>q(sb.from('coach_requests').insert({athlete_id:a.id,coach_id:c.id,requested_by:myId(),note:val('cr-note')||null}).select('id')),'Request sent to '+c.name);
    if(ok){sendQueued()}else t.disabled=false},
  withdrawreq:t=>run(()=>q(sb.from('coach_requests').update({status:'withdrawn'}).eq('id',t.dataset.id).select('id')),'Request withdrawn'),
  acceptreq:async t=>{const r=S.requests.find(x=>x.id===t.dataset.id);
    const ok=await run(()=>q(sb.from('coach_requests').update({status:'accepted'}).eq('id',r.id).select('id')),(ath(r.athleteId)?.name||'Athlete')+' is now on '+(r.coach===myId()?'your':coach(r.coach).name+'’s')+' list');
    if(ok)sendQueued()},
  declinereq:async t=>{const ok=await run(()=>q(sb.from('coach_requests').update({status:'declined'}).eq('id',t.dataset.id).select('id')),'Declined — the family will be asked to choose another coach');if(ok)sendQueued()},
  saveprofile:()=>run(()=>q(sb.from('people').update({specialties:val('cp-spec')||null,bio:val('cp-bio')||null,accepting:!!$('#cp-acc')?.checked}).eq('id',myId()).select('id')),'Profile saved'),
  admtab:t=>{U().adm=t.dataset.v;render()},
  dlreport:t=>downloadReport(t.dataset.id),
  copy:t=>{const v=t.dataset.v;const done=()=>{t.textContent='Copied';setTimeout(()=>t.textContent='Copy',1500)};
    const sel=()=>{const el=t.parentElement.querySelector('.sel');if(el){const r=document.createRange();r.selectNodeContents(el);const x=getSelection();x.removeAllRanges();x.addRange(r)}toast('Selected — press Ctrl+C or ⌘C to copy')};
    try{navigator.clipboard.writeText(v).then(done,sel)}catch(e){sel()}},
  sendask:async t=>{const a=ath(t.dataset.id);const text=val('ask-text');if(!text){toast('Write your request first');return}
    const ok=await run(()=>q(sb.from('asks').insert({athlete_id:a.id,coach_id:myId(),type:val('ask-type')||'Question',body:text}).select('id')),EMAILS?'Sent — the '+a.family+' will get an email':'Sent — the family will see it when they sign in');
    if(ok)sendQueued()},
  askseen:t=>run(()=>q(sb.from('asks').update({seen_at:new Date().toISOString()}).eq('id',t.dataset.id).select('id'))),
  replyask:t=>{const id=t.dataset.id;const text=val('rp-'+id);let link=val('rl-'+id);
    if(!text&&!link){toast('Add a reply or a link first');return}
    if(link&&!/^https?:\/\//i.test(link))link='https://'+link;
    run(()=>q(sb.from('asks').update({reply_text:text||null,reply_link:link||null,reply_by:myId(),replied_at:new Date().toISOString(),seen_at:null}).eq('id',id).select('id')),'Reply sent to your coach')},
  setnotify:t=>run(()=>q(sb.from('people').update({notify_email:t.dataset.v==='on'}).eq('id',myId()).select('id')),t.dataset.v==='on'?'You’ll get emails':'Emails turned off'),
  savecontact:()=>run(()=>q(sb.from('people').update({phone:val('me-phone')||null,contact_pref:val('me-pref')||'Email',best_time:val('me-best')||null}).eq('id',myId()).select('id')),'Contact details saved'),
  pickkid:t=>{U().choosing=false;U().pa=t.dataset.v;U().slot=null;U().cmpA=null;U().cmpB=null;render()},
  ackreport:()=>{const r=latestPub(curKid().id);run(()=>q(sb.rpc('acknowledge_report',{p_id:r.id})))},
  sendrefl:async()=>{const a=curKid();const r=latestPub(a.id);const ans={};let any=false;['agree','differ','commit','discuss'].forEach(k=>{ans[k]=val('rf-'+k);if(ans[k])any=true});
    if(!any){toast('Add at least one answer first');return}
    await sb.rpc('acknowledge_report',{p_id:r.id});
    run(()=>q(sb.from('reflections').insert({assessment_id:r.id,athlete_id:a.id,author_id:myId(),answers:ans}).select('id')),'Sent to '+coach(a.coach).name)},
  ackrefl:t=>{const id=t.dataset.id;run(()=>q(sb.from('reflections').update({ack_at:new Date().toISOString(),ack_reply:val('ack-'+id)||null}).eq('id',id).select('id')),'Acknowledged')},
  range:t=>{U().range=+t.dataset.v;render()},
  pickslot:t=>{U().slot=t.dataset.v;render()},
  reqmtg:()=>{if(!U().slot){toast('Choose a time first');return}const a=curKid();const slot=U().slot;
    run(async()=>{await q(sb.from('meetings').insert({athlete_id:a.id,coach_id:a.coach,starts_at:slot,purpose:val('mp'),note:val('mn')||null,requested_by:myId()}).select('id'));U().slot=null},'Request sent to '+coach(a.coach).name)},
  confirmmtg:async t=>{const ok=await run(()=>q(sb.from('meetings').update({status:'confirmed'}).eq('id',t.dataset.id).select('id')),EMAILS?'Confirmed — the family will get an email':'Confirmed');if(ok)sendQueued()},
  declinemtg:t=>run(()=>q(sb.from('meetings').update({status:'declined'}).eq('id',t.dataset.id).select('id')),'Declined'),
  donemtg:t=>{const id=t.dataset.id;run(()=>q(sb.from('meetings').update({status:'completed',summary:val('sum-'+id)||null}).eq('id',id).select('id')),'Meeting summary saved')},
  addslot:()=>{const d=val('av-date'),tm=val('av-time');if(!d||!tm){toast('Pick a date and a time');return}
    const at=new Date(d+'T'+tm);if(at<=TODAY){toast('Pick a time in the future');return}
    run(()=>q(sb.from('availability').insert({coach_id:myId(),starts_at:at.toISOString()}).select('id')),'Time added')},
  toggleslot:t=>{const s=S.slots.find(x=>x.id===t.dataset.id);run(()=>q(sb.from('availability').update({open:!s.on}).eq('id',s.id).select('id')))},
  delslot:t=>run(()=>q(sb.from('availability').delete().eq('id',t.dataset.id).select('id')),'Time removed'),
  sendnow:async()=>{toast('Sending…');try{await sb.functions.invoke('send-notifications')}catch(e){}await run(async()=>{})},
  addperson:async t=>{const name=val('np-name'),email=val('np-email').toLowerCase(),role=val('np-role');
    if(!name){toast('Enter a name');return}if(!/^\S+@\S+\.\S+$/.test(email)){toast('Enter a valid email');return}
    const pw=newTempPassword();
    const ok=await run(async()=>{await q(sb.from('people').insert({full_name:name,email,role,phone:val('np-phone')||null,is_coach:role==='admin'&&!!$('#np-coach')?.checked}).select('id'));log(null,'Added '+role+' — '+name)});
    if(!ok)return;
    try{await setLogin(email,pw);passwordModal(name,email,pw)}
    catch(e){toast(name+' was added, but the password couldn’t be set: '+e.message+'. Use “Set password” in the list.')}},
  toggleperson:t=>{const p=person(t.dataset.id);run(async()=>{await q(sb.from('people').update({active:!p.active}).eq('id',p.id).select('id'));log(null,(p.active?'Turned off':'Turned on')+' access — '+p.full_name)},p.active?'Access turned off':'Access turned on')},
  addathlete:()=>{const name=val('na-name');if(!name){toast('Enter the athlete’s name');return}
    const g1=val('na-g1'),g2=val('na-g2');
    run(async()=>{const [row]=await q(sb.from('athletes').insert({full_name:name,primary_style:val('na-style'),coach_id:val('na-coach')||null,affiliation:val('na-aff')||'Independent',coach_stage:val('na-stage')?Number(val('na-stage')):null,status:val('na-status')||'test'}).select('id'));
      const links=[[g1,val('na-r1')],[g2,val('na-r2')]].filter(([gid],i,arr)=>gid&&arr.findIndex(x=>x[0]===gid)===i).map(([gid,rel])=>({athlete_id:row.id,guardian_id:gid,relationship:rel||'Parent'}));
      if(links.length)await q(sb.from('athlete_guardians').insert(links).select('athlete_id'));log(null,'Added athlete — '+name)},name+' added')},
  editathlete:t=>{const a=ath(t.dataset.id);
    const coachOpts=`<option value="">— Family chooses —</option>`+S.coaches.filter(c=>c.active||c.id===a.coach).map(c=>`<option value="${c.id}" ${a.coach===c.id?'selected':''}>${esc(c.name)}</option>`).join('');
    modal(`<div class="mh"><h3>Edit ${esc(a.name)}’s profile</h3></div>
      <div class="fgrid">
        <div><label class="f" for="ea-name">Athlete name</label><input type="text" id="ea-name" value="${esc(a.name)}"></div>
        <div><label class="f" for="ea-style">Primary style</label><select id="ea-style">${STYLES.map(x=>`<option ${a.style===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div><label class="f" for="ea-aff">Home club or school</label><input type="text" id="ea-aff" value="${esc(a.aff)}"></div>
        <div><label class="f" for="ea-coach">Primary coach</label><select id="ea-coach">${coachOpts}</select></div>
        <div><label class="f" for="ea-stage">Stage (coach view)</label><select id="ea-stage"><option value="">— Not set —</option>${STAGES.map(st=>`<option value="${st.n}" ${a.coachStage===st.n?'selected':''}>${esc(stageName(st.n))}</option>`).join('')}</select></div>
        <div><label class="f" for="ea-status">Subscription</label><select id="ea-status">${Object.entries(SUB_ST).map(([k,l])=>`<option value="${k}" ${a.status===k?'selected':''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="xs muted" style="margin-top:10px">Family’s stage view: ${a.familyStage?esc(stageName(a.familyStage)):'not picked yet'} (only the family can change it). Changing the primary style changes which style skills appear on future reports; published reports stay as they are.</div>
      <div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" data-act="saveathlete" data-id="${a.id}">Save changes</button><button class="btn" data-act="closemodal">Cancel</button></div>`);
    $('#ea-name')?.focus()},
  saveathlete:t=>{const a=ath(t.dataset.id);const name=val('ea-name');if(!name){toast('Enter the athlete’s name');return}
    const st=val('ea-stage')?Number(val('ea-stage')):null;
    const upd={full_name:name,primary_style:val('ea-style'),affiliation:val('ea-aff')||'Independent',coach_id:val('ea-coach')||null,status:val('ea-status')||a.status};
    if(st!==a.coachStage){upd.coach_stage=st;upd.coach_stage_at=st?new Date().toISOString():null}
    $('#modal').innerHTML='';
    run(async()=>{await q(sb.from('athletes').update(upd).eq('id',a.id).select('id'));log(null,'Edited athlete profile — '+name)},name+'’s profile saved')},
  reopen:t=>{const d=S.assessments.find(x=>x.id===t.dataset.id),a=ath(d.athleteId);
    modal(`<div class="mh"><h3>Reopen ${esc(a.name)}’s ${monthLabel(d.period)} report?</h3></div><p class="muted">It goes back to a draft so it can be corrected. ${esc(a.family)} won’t see this report until it’s approved and published again; everything already written stays in place.</p><div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" data-act="doreopen" data-id="${d.id}">Reopen report</button><button class="btn" data-act="closemodal">Cancel</button></div>`)},
  doreopen:t=>{$('#modal').innerHTML='';run(()=>q(sb.rpc('reopen_report',{p_assessment:t.dataset.id})),'Report reopened — edit it, then approve and publish again')},
  link:t=>{const aid=t.dataset.id;const gid=val('lg-'+aid);if(!gid){toast('Choose a guardian');return}
    run(()=>q(sb.from('athlete_guardians').insert({athlete_id:aid,guardian_id:gid,relationship:val('lr-'+aid)||'Parent'}).select('athlete_id')),'Guardian linked')},
  unlink:t=>{const a=ath(t.dataset.a),gd=person(t.dataset.g);
    modal(`<div class="mh"><h3>Unlink ${esc(gd.full_name)}?</h3></div><p class="muted">${esc(gd.full_name)} will no longer see ${esc(a.name)}’s reports. You can link them again later.</p><div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" data-act="dounlink" data-a="${a.id}" data-g="${gd.id}">Unlink</button><button class="btn" data-act="closemodal">Cancel</button></div>`)},
  dounlink:t=>{$('#modal').innerHTML='';run(()=>q(sb.from('athlete_guardians').delete().eq('athlete_id',t.dataset.a).eq('guardian_id',t.dataset.g).select('athlete_id')),'Unlinked')},
  setpw:t=>{const p=person(t.dataset.id);const pw=newTempPassword();
    modal(`<div class="mh"><h3>Set a new password for ${esc(p.full_name)}?</h3></div><p class="muted">Their current password will stop working. You’ll see the new temporary password once, to share with them.</p><div style="display:flex;gap:8px;margin-top:16px"><button class="btn primary" data-act="dosetpw" data-id="${p.id}" data-pw="${pw}">Set new password</button><button class="btn" data-act="closemodal">Cancel</button></div>`)},
  dosetpw:async t=>{const p=person(t.dataset.id);t.disabled=true;t.textContent='Saving…';
    try{await setLogin(p.email,t.dataset.pw);log(null,'Set a new sign-in password — '+p.full_name);passwordModal(p.full_name,p.email,t.dataset.pw)}
    catch(e){$('#modal').innerHTML='';toast(e.message)}},
  changepw:()=>changePwModal(false),
  dochangepw:async t=>{const a=$('#pw1').value,b=$('#pw2').value;
    if(a.length<8){toast('Use at least 8 characters');return}if(a!==b){toast('The two passwords don’t match');return}
    t.disabled=true;t.textContent='Saving…';
    const {data,error}=await sb.auth.updateUser({password:a,data:{temp_password:false}});
    if(error){t.disabled=false;t.textContent='Save password';toast(/same|different/i.test(error.message||'')?'Choose a password different from your current one.':errMsg(error));return}
    if(data?.user&&SESSION)SESSION={...SESSION,user:data.user};
    $('#modal').innerHTML='';toast('Password saved');render()},
  signout:async()=>{await flushDraft().catch(()=>{});await sb.auth.signOut();},
};
document.addEventListener('click',e=>{const t=e.target.closest('[data-act]');if(!t||t.disabled)return;if(t.tagName==='A')return;ACT[t.dataset.act]?.(t,e)});
document.addEventListener('input',e=>{const el=e.target;
  if(el.dataset.otp!==undefined)return;
  if(U().role!=='coach'||!U().open)return;const d=curDraft();if(!d||d.status==='published')return;
  if(el.dataset.f){d[el.dataset.f]=el.value;touch(d)}
  else if(el.dataset.note){d.notes[el.dataset.note.replace(/^c:/,'c:')]=el.value;touch(d)}
  else if(el.dataset.g!==undefined){d.goals[+el.dataset.g][el.dataset.gf]=el.value;touch(d)}});
document.addEventListener('change',e=>{const el=e.target;
  if(el.dataset.gs){const[id,i]=el.dataset.gs.split('|');const r=S.assessments.find(x=>x.id===id);const goals=r.goals.map((x,k)=>k===+i?{...x,status:el.value}:x);
    run(()=>q(sb.from('assessments').update({goals}).eq('id',id).select('id')),'Goal updated — the family will see it')}
  if(el.dataset.hist){U()[el.dataset.hist]=el.value;render()}
  if(el.dataset.aset){const v=el.value||null;run(()=>q(sb.from('athletes').update({[el.dataset.aset]:v}).eq('id',el.dataset.id).select('id')),'Saved')}
  if(el.dataset.pset){const v=el.type==='checkbox'?el.checked:el.value;run(()=>q(sb.from('people').update({[el.dataset.pset]:v}).eq('id',el.dataset.id).select('id')),'Saved')}});
document.addEventListener('submit',async e=>{if(e.target.dataset.form!=='signin')return;e.preventDefault();
  const em=val('si-email').toLowerCase(),pw=$('#si-pw')?.value||'';SI.email=em;
  if(!/^\S+@\S+\.\S+$/.test(em)){SI.err='Enter a valid email address.';render();return}
  if(!pw){SI.err='Enter your password.';render();$('#si-pw')?.focus();return}
  SI.busy=true;SI.err='';render();
  const {error}=await sb.auth.signInWithPassword({email:em,password:pw});
  if(error){SI.busy=false;const m=error.message||'';
    SI.err=/rate|too many/i.test(m)?'Too many tries. Wait a minute, then try again.':/Failed to fetch|network/i.test(m)?'Can’t reach the server. Check your connection and try again.':'Email or password is incorrect.';
    render();$('#si-pw')?.focus();return}
  SI={err:'',busy:false,email:''};
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!(SESSION?.user?.user_metadata?.temp_password&&$('#pw1')))$('#modal').innerHTML=''});

/* ============ START ============ */
async function afterAuth(){
  if(!SESSION){const ui=S.ui;S=blankState();S.ui={...S.ui};LOADING=false;LOAD_ERR='';render();return}
  LOADING=true;LOAD_ERR='';render();
  try{await loadAll()}catch(e){console.error(e);LOAD_ERR=errMsg(e)}
  LOADING=false;render();scrollTo(0,0);
}
async function boot(){
  if(!sb){render();return}
  const {data}=await sb.auth.getSession();SESSION=data.session;
  sb.auth.onAuthStateChange((ev,sess)=>{const had=!!SESSION;SESSION=sess;
    if((ev==='SIGNED_IN'&&!had)||ev==='SIGNED_OUT')setTimeout(afterAuth,0)});
  afterAuth();
}
boot();
