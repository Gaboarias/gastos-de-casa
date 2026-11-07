/* ---------- Conexión con el servidor ---------- */
async function api(path,body){
  let r;
  try{
    r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},
      body:body?JSON.stringify(body):undefined,credentials:'same-origin',cache:'no-store'});
  }catch(e){ const x=new Error('Sin conexión con el servidor'); x.code='unavailable'; throw x; }
  let j=null; try{ j=await r.json(); }catch(e){}
  if(!r.ok){
    const x=new Error((j&&j.error)||'Error del servidor'); x.status=r.status;
    x.code=r.status===401||r.status===403?'revoked':r.status===429?'resource_exhausted':r.status>=500?'unavailable':'invalid_argument';
    if(r.status>=400&&r.status<500&&r.status!==401&&r.status!==403) x.serverMsg=x.message;
    throw x;
  }
  return j;
}
const rid=()=>'x'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* Mismo contrato que usaba la app (doc/collection/onSnapshot), ahora sobre la API.
   Los cambios del otro se ven al consultar cada ~6 s y al volver a la pestaña. */
function makeBackend(me){
  const cols=new Map(), subs=new Set();
  let loaded=false, seq=0, last='', busy=false;
  const colOf=c=>{let m=cols.get(c);if(!m){m=new Map();cols.set(c,m);}return m;};
  const parts=path=>{const s=path.split('/');let pv=false;if(s[0]==='data'&&s[1]==='users'){pv=true;s.splice(0,3);}return {pv,s};};
  const colKey=path=>{const p=parts(path);return (p.pv?'~':'')+p.s.join('/');};
  const docKey=path=>{const p=parts(path);const id=p.s.pop();return {col:(p.pv?'~':'')+p.s.join('/'),id};};
  const meta={fromCache:false,hasPendingWrites:false};
  const mkDoc=(id,data)=>({id,exists:data!==undefined,data:()=>data,metadata:meta});
  const colSnap=c=>{
    const docs=[...colOf(c)].sort((a,b)=>a[0]<b[0]?-1:1).map(e=>mkDoc(e[0],e[1]));
    return {docs,size:docs.length,empty:!docs.length,docChanges:()=>[],metadata:meta};
  };
  function subscribe(make,next,err){
    let sig=null,dead=false;
    const sub={
      fire(){
        if(dead||!loaded) return;
        const snap=make();
        const s=JSON.stringify(snap.docs?snap.docs.map(d=>[d.id,d.data()]):[snap.id,snap.data()]);
        if(s===sig) return; sig=s; next(snap);
      },
      fail(e){ if(!dead&&err) err({code:e.code||'unavailable',message:e.message}); }
    };
    subs.add(sub); if(loaded) setTimeout(()=>sub.fire(),0);
    return ()=>{dead=true;subs.delete(sub);};
  }
  const fire=()=>subs.forEach(s=>{try{s.fire();}catch(e){console.error(e);}});
  async function sync(){
    if(busy) return; busy=true; const my=seq;
    try{
      const j=await api('sync');
      if(my!==seq){ busy=false; return sync(); }   // hubo una escritura mientras leíamos: repetir
      const sig=JSON.stringify(j.docs);
      if(!loaded||sig!==last){
        last=sig; cols.clear();
        for(const d of j.docs) colOf(d.col).set(d.id,d.data);
        loaded=true; fire();
      }
    }catch(e){
      if(e.status===401){ location.reload(); }
      else if(!loaded){ subs.forEach(s=>s.fail(e)); }
    }
    busy=false;
  }
  async function write(op,col,id,data){
    seq++;
    try{
      const j=await api('doc',{op,col,id,data});
      if(op==='delete') colOf(col).delete(id); else colOf(col).set(id,j.data);
    }finally{ seq++; }
    last=''; fire(); sync();
  }
  const docRef=path=>{
    const k=docKey(path);
    return {id:k.id,path,
      get:async()=>mkDoc(k.id,colOf(k.col).get(k.id)),
      set:d=>write('set',k.col,k.id,d),
      update:d=>write('update',k.col,k.id,d),
      delete:()=>write('delete',k.col,k.id),
      onSnapshot:(next,err)=>subscribe(()=>mkDoc(k.id,colOf(k.col).get(k.id)),next,err),
      collection:p=>colRef(path+'/'+p)};
  };
  const colRef=path=>{
    const c=colKey(path);
    return {path,
      doc:id=>docRef(path+'/'+(id||rid())),
      add:async d=>{const r=colRef(path).doc();await r.set(d);return r;},
      get:async()=>colSnap(c),
      onSnapshot:(next,err)=>subscribe(()=>colSnap(c),next,err)};
  };
  const user={
    id:async()=>me.user.id,
    can:async()=>true,
    profiles:async ids=>Object.fromEntries([].concat(ids).map(i=>{
      const d=colOf('members').get(i)||{};
      return [i,{id:i,name:d.name||'',avatarUrl:'',color:'',email:null,isMe:i===me.user.id,guest:false}];
    }))
  };
  function start(){
    sync();
    setInterval(()=>{if(document.visibilityState==='visible') sync();},6000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible') sync();});
  }
  return {db:{doc:docRef,collection:colRef},user,start};
}

/* ---------- Entrada: cuenta y hogar ---------- */
function gateCard(...kids){ return h('div',{class:'gate-card'},h('h1',null,'Casa en Orden'),...kids); }
function gField(id,label,input,hint){ return h('div',{class:'field'},h('label',{for:id},label),input,hint?h('p',{class:'hint'},hint):null); }
function authScreen(box){
  return new Promise(resolve=>{
    let mode='login';
    const render=()=>{
      box.replaceChildren();
      const email=h('input',{id:'g_email',type:'email',autocomplete:'email',inputmode:'email'});
      const pass=h('input',{id:'g_pass',type:'password',autocomplete:mode==='login'?'current-password':'new-password'});
      const name=h('input',{id:'g_name',type:'text',autocomplete:'given-name',maxlength:'40'});
      const err=h('p',{class:'ferr',role:'alert',hidden:true});
      const btn=h('button',{type:'submit',class:'btn'},mode==='login'?'Entrar':'Crear cuenta');
      const form=h('form',{novalidate:true,onSubmit:async ev=>{
        ev.preventDefault(); err.hidden=true; btn.disabled=true;
        try{
          const me=await api('auth',{action:mode,email:email.value,password:pass.value,name:name.value});
          resolve(me);
        }catch(e){ err.textContent=e.message; err.hidden=false; btn.disabled=false; }
      }},
        mode==='signup'?gField('g_name','Tu nombre',name):null,
        gField('g_email','Correo',email),
        gField('g_pass','Contraseña',pass,mode==='signup'?'Mínimo 8 caracteres.':null),
        err,btn);
      const tabs=h('div',{class:'chips'},
        h('button',{type:'button',class:'chip','aria-pressed':mode==='login'?'true':'false',onClick:()=>{mode='login';render();}},'Entrar'),
        h('button',{type:'button',class:'chip','aria-pressed':mode==='signup'?'true':'false',onClick:()=>{mode='signup';render();}},'Crear cuenta'));
      box.append(gateCard(tabs,form));
      email.focus();
    };
    render();
  });
}
function householdScreen(box,me){
  return new Promise(resolve=>{
    const err=h('p',{class:'ferr',role:'alert',hidden:true});
    const run=async body=>{
      err.hidden=true;
      try{ resolve(await api('household',body)); }catch(e){ err.textContent=e.message; err.hidden=false; }
    };
    const code=h('input',{id:'g_code',type:'text',autocomplete:'off',maxlength:'6',placeholder:'ABC123',style:'text-transform:uppercase'});
    const join=h('form',{novalidate:true,onSubmit:ev=>{ev.preventDefault();run({action:'join',code:code.value});}},
      gField('g_code','Código de tu pareja',code,'Si tu pareja ya creó el hogar, pídele el código de 6 caracteres.'),
      h('button',{type:'submit',class:'btn ghost'},'Unirme con código'));
    const out=h('button',{type:'button',class:'btn ghost sm',onClick:async()=>{try{await api('auth',{action:'logout'});}catch(e){} location.reload();}},'Salir');
    box.replaceChildren(gateCard(
      h('p',{class:'summary'},'Hola, '+me.user.name+'. Falta elegir tu hogar.'),
      h('button',{type:'button',class:'btn',onClick:()=>run({action:'create'})},'Crear hogar nuevo'),
      h('p',{class:'hint'},'Crea el hogar si eres la primera persona. Te damos un código para tu pareja.'),
      join,err,out));
  });
}
function gateError(box,e){
  box.hidden=false;
  box.replaceChildren(gateCard(
    h('p',{class:'ferr',role:'alert'},e.message||'No se pudo conectar con el servidor.'),
    h('button',{type:'button',class:'btn',onClick:()=>location.reload()},'Reintentar')));
}
async function gate(){
  const box=$('#gate'); box.hidden=false;
  box.replaceChildren(gateCard(h('p',{class:'summary'},'Cargando…')));
  let me=null;
  try{ me=await api('auth'); if(!me||!me.user) me=null; }
  catch(e){ gateError(box,e); return null; }
  for(;;){
    if(!me) me=await authScreen(box);
    if(!me.household){ me=await householdScreen(box,me); continue; }
    break;
  }
  box.hidden=true; $('#appRoot').hidden=false; $('#navRoot').hidden=false;
  const be=makeBackend(me);
  $('#hhCode').textContent=me.household.code;
  return {user:be.user,db:be.db,start:be.start};
}
$('#logout').addEventListener('click',async()=>{ try{await api('auth',{action:'logout'});}catch(e){} location.reload(); });

