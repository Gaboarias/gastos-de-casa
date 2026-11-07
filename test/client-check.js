
(function(){
'use strict';
const $=s=>document.querySelector(s);

/* ---------- Constantes ---------- */
const INV_CATS=[['comida','Comida'],['limpieza','Limpieza'],['casa','Casa']];
const BUD_CATS=[['alimentacion','Alimentación'],['transporte','Transporte'],['salud','Salud'],['hogar','Hogar'],['ocio','Ocio'],['ahorro','Ahorro'],['otros','Otros']];
const UNITS=['unid.','kg','g','L','mL','paquetes','rollos','botellas','latas'];
const QUICK_BILLS=['Alquiler','Electricidad','Agua','Internet','Teléfono'];
const EXP_CATS=[['super','Supermercado'],['feria','Feria y verduras'],['hogar','Limpieza y hogar'],['salud','Farmacia y salud'],['transporte','Transporte'],['salidas','Restaurantes y salidas'],['otros','Otros']];
const QUICK_EXP=[['Supermercado','super'],['Feria','feria'],['Farmacia','salud'],['Gasolina','transporte'],['Restaurante','salidas']];
const TABS=['despensa','recibos','gastos','presupuesto'];
// Lista base de la casa (lista-despensa-casa-en-orden.md): se carga con un botón cuando la despensa está vacía.
const BASE_FOOD=['Lechugas','Patilla','Salmas','Galletas de soya','Yogur natural sin sabor','Limones','Uvas verdes','Manzanas verdes','Arroz','Arroz basmati','Garbanzos naturales','Lentejas','Pasta spaghetti de arroz','Petit pois','Ciruelas','Sardinas','Atún en trozos','Calamares','Risotto','Salsa de tomate Sacla','Fresco en polvo','Gelatina light','Harina de arroz','Mezcla para pancake gluten free','Masa para tortillas','Maizena / Vitamaíz','Salsa Worcestershire','Aderezo','Leche condensada','Leche deslactosada','Huevos','Queso crema','Jaleas','Quesos','Jamón','Salsa de soya sin gluten','Cacao sin azúcar en polvo','Mantequilla','Pasta de tomate','Salchichas','Papa','Yuca','Camote','Tomate','Chile dulce','Zanahoria','Rábano','Cebolla morada','Pepinos','Espinaca','Peras','Melocotones','Naranjas / mandarinas','Té','Sorbetos sin gluten','Galletas de arroz'];
const BASE_CLEAN=['Papel higiénico','Toalla de cocina','Servilletas','Jabón de manos','Jabón lavaplatos','Cloro','Desinfectante','Vinagre blanco','Esponjas lavaplatos'];
const BASE_LIST=[...BASE_FOOD.map(n=>[n,'comida']),...BASE_CLEAN.map(n=>[n,'limpieza'])];
const catLabel=k=>(INV_CATS.find(c=>c[0]===k)||[0,'Otro'])[1];
const budLabel=k=>(BUD_CATS.find(c=>c[0]===k)||[0,'Otros'])[1];
const expLabel=k=>(EXP_CATS.find(c=>c[0]===k)||[0,'Otros'])[1];

/* ---------- Formato ---------- */
const moneyFmt=new Intl.NumberFormat('es-CR',{style:'currency',currency:'CRC',maximumFractionDigits:0});
const money=n=>moneyFmt.format(Math.round(n||0));
const fmtNum=n=>String(Math.round((n||0)*100)/100).replace('.',',');
const pad=n=>String(n).padStart(2,'0');
const iso=()=>new Date().toISOString();
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const ymOf=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
const curYM=()=>ymOf(new Date());
const shiftYM=(ym,k)=>{const p=ym.split('-').map(Number);return ymOf(new Date(p[0],p[1]-1+k,1));};
const labelYM=ym=>{const p=ym.split('-').map(Number);const s=new Date(p[0],p[1]-1,1).toLocaleDateString('es-CR',{month:'long',year:'numeric'});return s.charAt(0).toUpperCase()+s.slice(1);};
const daysIn=ym=>{const p=ym.split('-').map(Number);return new Date(p[0],p[1],0).getDate();};
const dayDiff=s=>{const p=s.split('-').map(Number);const t=new Date();return Math.round((new Date(p[0],p[1]-1,p[2])-new Date(t.getFullYear(),t.getMonth(),t.getDate()))/86400000);};
const shortDate=s=>{if(!s)return '';const p=s.split('-').map(Number);return new Date(p[0],p[1]-1,p[2]).toLocaleDateString('es-CR',{day:'numeric',month:'short'});};
const norm=s=>(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const sum=(a,f)=>a.reduce((t,x)=>t+(f(x)||0),0);
const byName=(a,b)=>String(a.name).localeCompare(String(b.name),'es');
const first=s=>(s||'').trim().split(/\s+/)[0];

/* ---------- DOM helper ---------- */
const h=(tag,props,...kids)=>{
  const e=document.createElement(tag);
  if(props) for(const k of Object.keys(props)){
    const v=props[k]; if(v==null||v===false) continue;
    if(k==='class') e.className=v;
    else if(k.slice(0,2)==='on') e.addEventListener(k.slice(2).toLowerCase(),v);
    else e.setAttribute(k,v===true?'':String(v));
  }
  for(const c of kids.flat()){ if(c==null||c===false) continue; e.append(c.nodeType?c:document.createTextNode(String(c))); }
  return e;
};

/* ---------- Estado ---------- */
const S={status:'boot',db:null,user:null,uid:null,canWrite:null,profiles:{},members:[],inventory:[],bills:[],payments:[],settlements:[],
  cfg:{income:0,limits:{}},entries:[],expenses:[],ready:{},failed:null,synced:false,tab:'despensa',month:curYM(),bmonth:curYM(),xmonth:curYM(),invCat:'todo',q:'',histOpen:false};
const pending=new Map();

/* ---------- Personas ---------- */
function memberIds(){const ids=S.members.map(m=>m.id); if(S.uid&&!ids.includes(S.uid)) ids.push(S.uid); return ids;}
function nm(id){ if(id===S.uid) return 'Tú'; const p=S.profiles[id]; return first(p&&p.name)||'La otra persona'; }
function shareOf(bill,id){
  const ids=memberIds(); if(!ids.includes(id)) return 0;
  if(ids.length===2){ const pct=bill&&typeof bill.split==='number'?bill.split:50; return ids[0]===id?pct:100-pct; }
  return 100/ids.length;
}
async function loadProfiles(){
  if(!S.user) return; const ids=memberIds(); if(!ids.length) return;
  try{ S.profiles=await S.user.profiles(ids); queueRender(); }catch(e){}
}

/* ---------- Cálculos ---------- */
const payMap=()=>new Map(S.payments.map(p=>[p.id,p]));
function balances(){
  const ids=memberIds(), bal={}; ids.forEach(i=>bal[i]=0);
  const bm=new Map(S.bills.map(b=>[b.id,b]));
  for(const p of S.payments){
    if(!p.paidBy||!(p.paidBy in bal)) continue;
    const b=bm.get(p.billId); bal[p.paidBy]+=p.amount||0;
    for(const id of ids) bal[id]-=(p.amount||0)*shareOf(b,id)/100;
  }
  for(const x of S.expenses){
    if(!x.paidBy||!(x.paidBy in bal)) continue;
    bal[x.paidBy]+=x.amount||0;
    for(const id of ids) bal[id]-=(x.amount||0)*shareOf(x,id)/100;
  }
  for(const s of S.settlements){ if(s.from in bal) bal[s.from]+=s.amount||0; if(s.to in bal) bal[s.to]-=s.amount||0; }
  return bal;
}
function myBillsShare(month){
  if(!S.uid) return 0; const pm=payMap();
  return sum(S.bills,b=>{const p=pm.get(b.id+'_'+month);const amt=p?p.amount:(b.amount||0);return amt*shareOf(b,S.uid)/100;});
}
function myExpensesShare(month){
  if(!S.uid) return 0;
  return sum(S.expenses.filter(x=>x.month===month),x=>(x.amount||0)*shareOf(x,S.uid)/100);
}
const needsBuy=it=>(it.qty||0)<=(it.min||0);
const needQty=it=>{const t=it.target!=null?it.target:Math.max((it.min||0)*2,1);return Math.max(t,(it.qty||0)+1);};
function expState(it){
  if(!it.expires) return null; const d=dayDiff(it.expires);
  if(d<0) return {kind:'bad',text:'Venció'};
  if(d<=7) return {kind:'warn',text:d===0?'Vence hoy':'Vence en '+d+' d'};
  return null;
}

/* ---------- Mensajes ---------- */
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},3600);}
function errMsg(e){
  if(e&&e.serverMsg) return e.serverMsg;
  const c=e&&e.code;
  if(c==='invalid_argument') return 'No se pudo guardar: tu acceso no permite editar.';
  if(c==='quota_exceeded') return 'Se llenó el espacio de la base de datos.';
  if(c==='resource_exhausted') return 'Demasiadas acciones seguidas. Espera un momento.';
  if(c==='unavailable') return 'Sin conexión. Intenta de nuevo.';
  if(c==='revoked') return 'Tu acceso cambió. Recarga la página.';
  return 'No se pudo guardar. Intenta de nuevo.';
}
function roBlock(){ if(S.status!=='ok'){toast('Los datos compartidos no están disponibles en esta vista.');return true;} if(S.canWrite===false){toast('Tienes acceso de solo lectura.');return true;} return false; }
async function guard(fn){
  if(roBlock()) throw new Error('ro');
  try{ return await fn(); }catch(e){ if(!(e&&e.message==='ro')) toast(errMsg(e)); throw e; }
}

/* ---------- Hoja de formulario ---------- */
let lastFocus=null;
function closeSheet(){
  $('#overlay').hidden=true; $('#sheetBody').replaceChildren();
  if(lastFocus&&lastFocus.focus){try{lastFocus.focus();}catch(e){}} lastFocus=null;
}
function twoStep(btn,label,confirmLabel,run){
  let armed=false,t;
  const reset=()=>{armed=false;btn.textContent=label;btn.classList.remove('danger');};
  btn.addEventListener('click',async()=>{
    if(!armed){armed=true;btn.textContent=confirmLabel;btn.classList.add('danger');t=setTimeout(reset,4000);return;}
    clearTimeout(t); await run(); reset();
  });
}
function openSheet(cfg){
  if($('#overlay').hidden) lastFocus=document.activeElement;
  $('#sheetTitle').textContent=cfg.title;
  const body=$('#sheetBody'); body.replaceChildren();
  const form=h('form',{novalidate:true}); const ctl={},err={};
  for(const f of cfg.fields){
    let c;
    if(f.type==='select'){
      c=h('select',{id:'f_'+f.id},f.options.map(o=>h('option',{value:o[0],selected:String(o[0])===String(f.value)?true:null},o[1])));
    }else{
      c=h('input',{id:'f_'+f.id,type:f.type||'text',value:f.value==null?'':f.value,placeholder:f.placeholder,inputmode:f.type==='number'?'decimal':null,step:f.type==='number'?'any':null,min:f.min,max:f.max,autocomplete:'off'});
    }
    ctl[f.id]=c; err[f.id]=h('p',{class:'ferr',hidden:true});
    form.append(h('div',{class:'field'},h('label',{for:'f_'+f.id},f.label),c,f.hint?h('p',{class:'hint'},f.hint):null,err[f.id]));
  }
  const collect=()=>{
    let ok=true; const vals={};
    for(const f of cfg.fields){
      const raw=ctl[f.id].value.trim(); let msg='';
      err[f.id].hidden=true;
      if(raw===''){ if(f.required) msg='Campo obligatorio'; }
      else if(f.type==='number'){
        const n=Number(raw);
        if(!Number.isFinite(n)) msg='Escribe un número';
        else if(f.min!=null&&n<f.min) msg='El mínimo es '+f.min;
        else if(f.max!=null&&n>f.max) msg='El máximo es '+f.max;
      }
      vals[f.id]=f.type==='number'?(raw===''?null:Number(raw)):raw;
      if(msg){err[f.id].textContent=msg;err[f.id].hidden=false;ok=false;}
    }
    return ok?vals:null;
  };
  const submit=h('button',{type:'submit',class:'btn'},cfg.submitLabel||'Guardar');
  form.addEventListener('submit',async ev=>{
    ev.preventDefault(); const vals=collect(); if(!vals) return;
    submit.disabled=true;
    try{ await cfg.onSubmit(vals); closeSheet(); }catch(e){ submit.disabled=false; }
  });
  const actions=h('div',{class:'actions'},submit);
  for(const x of cfg.extra||[]){
    const b=h('button',{type:'button',class:'btn ghost'},x.label);
    const run=async()=>{
      let vals=null; if(x.needsForm){vals=collect(); if(!vals) return;}
      b.disabled=true;
      try{ await x.onClick(vals); if(!x.noClose) closeSheet(); }catch(e){ b.disabled=false; }
    };
    if(x.confirm) twoStep(b,x.label,x.confirm,run); else b.addEventListener('click',run);
    actions.append(b);
  }
  form.append(actions); body.append(form);
  $('#overlay').hidden=false;
  const f1=form.querySelector('input'); if(f1&&f1.type!=='date') setTimeout(()=>f1.focus(),40);
}
$('#sheetX').addEventListener('click',closeSheet);
$('#overlay').addEventListener('click',ev=>{if(ev.target.id==='overlay') closeSheet();});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('#overlay').hidden) closeSheet();});

/* ---------- Despensa ---------- */
function bumpQty(id,delta){
  if(roBlock()) return;
  const it=S.inventory.find(x=>x.id===id); if(!it) return;
  const next=Math.max(0,Math.round(((it.qty||0)+delta)*100)/100);
  it.qty=next;
  let p=pending.get(id); if(!p){p={};pending.set(id,p);}
  p.qty=next; clearTimeout(p.timer); p.timer=setTimeout(()=>flushQty(id),400);
  queueRender();
}
async function flushQty(id){
  const p=pending.get(id); if(!p) return;
  if(p.busy){p.timer=setTimeout(()=>flushQty(id),200);return;}
  p.busy=true; const q=p.qty;
  try{ await S.db.doc('inventory/'+id).update({qty:q,updatedAt:iso()}); }catch(e){ toast(errMsg(e)); }
  p.busy=false;
  if(p.qty!==q) flushQty(id); else pending.delete(id);
}
async function restock(it){
  if(roBlock()) return;
  const p=pending.get(it.id); if(p){clearTimeout(p.timer);pending.delete(it.id);}
  const q=needQty(it); it.qty=q; queueRender();
  try{ await S.db.doc('inventory/'+it.id).update({qty:q,updatedAt:iso()}); }catch(e){ toast(errMsg(e)); }
}
function openItemSheet(it){
  if(roBlock()) return;
  const edit=!!it;
  openSheet({
    title:edit?'Editar artículo':'Nuevo artículo', submitLabel:edit?'Guardar':'Agregar',
    fields:[
      {id:'name',label:'Nombre',required:true,value:edit?it.name:'',placeholder:'Arroz, detergente, papel higiénico…'},
      {id:'cat',label:'Tipo',type:'select',options:INV_CATS,value:edit?it.cat:(S.invCat!=='todo'?S.invCat:'comida')},
      {id:'qty',label:'Cantidad actual',type:'number',required:true,min:0,value:edit?it.qty:1},
      {id:'unit',label:'Unidad',type:'select',options:UNITS.map(u=>[u,u]),value:edit?it.unit:'unid.'},
      {id:'min',label:'Avisar al llegar a',type:'number',min:0,value:edit?it.min:1,hint:'Con esta cantidad o menos pasa a Por comprar.'},
      {id:'target',label:'Cantidad al reponer',type:'number',min:0,value:edit?it.target:'',hint:'Opcional; vacío = el doble del mínimo.'},
      {id:'expires',label:'Vence',type:'date',value:edit?it.expires:'',hint:'Opcional.'}
    ],
    onSubmit:v=>guard(async()=>{
      const ref=edit?S.db.doc('inventory/'+it.id):S.db.collection('inventory').doc();
      if(edit){const p=pending.get(it.id);if(p){clearTimeout(p.timer);pending.delete(it.id);}}
      await ref.set({name:v.name,cat:v.cat,qty:v.qty,unit:v.unit,min:v.min==null?0:v.min,target:v.target==null?null:v.target,expires:v.expires||null,createdBy:edit&&it.createdBy?it.createdBy:(S.uid||null),updatedAt:iso()});
    }),
    extra:edit?[{label:'Eliminar artículo',confirm:'Confirmar: eliminar',onClick:()=>guard(async()=>{await S.db.doc('inventory/'+it.id).delete();})}]:[]
  });
}
// Carga la lista base en la despensa (ids fijos "base-…", así no se duplica si se pulsa dos veces).
let baseLoading=false;
async function loadBaseList(){
  if(baseLoading) return; baseLoading=true;
  const b=$('#loadBase'); if(b){b.disabled=true;b.textContent='Cargando…';}
  const slug=n=>'base-'+norm(n).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  try{
    await guard(async()=>{
      let done=0;
      for(let i=0;i<BASE_LIST.length;i+=8){
        await Promise.all(BASE_LIST.slice(i,i+8).map(([name,cat])=>S.db.doc('inventory/'+slug(name)).set({name,cat,qty:1,unit:'unid.',min:0,target:null,expires:null,createdBy:S.uid||null,updatedAt:iso()})));
        done=Math.min(i+8,BASE_LIST.length); if(b) b.textContent='Cargando… '+done+'/'+BASE_LIST.length;
      }
      toast('Lista base cargada: '+done+' artículos.');
    });
  }catch(e){ if(b){b.disabled=false;b.textContent='Cargar lista base ('+BASE_LIST.length+' artículos)';} }
  finally{ baseLoading=false; }
}
function invRow(it){
  const buy=needsBuy(it),ex=expState(it),pills=[];
  if(buy) pills.push(h('span',{class:'pill '+((it.qty||0)<=0?'bad':'warn')},(it.qty||0)<=0?'Agotado':'Bajo'));
  if(ex) pills.push(h('span',{class:'pill '+ex.kind},ex.text));
  return h('div',{class:'row'},
    h('button',{type:'button',class:'row-main',onClick:()=>openItemSheet(it),'aria-label':'Editar '+it.name},
      h('div',{class:'nm'},it.name),
      h('div',{class:'meta'},h('span',null,catLabel(it.cat)),pills)),
    h('div',{class:'stepper'},
      h('button',{type:'button','aria-label':'Quitar uno de '+it.name,onClick:()=>bumpQty(it.id,-1),disabled:(it.qty||0)<=0?true:null},'−'),
      h('div',{class:'qtybox'},h('span',{class:'qty'},fmtNum(it.qty)),h('span',{class:'unit'},it.unit||'')),
      h('button',{type:'button','aria-label':'Agregar uno de '+it.name,onClick:()=>bumpQty(it.id,1)},'+')));
}
function emptyBox(title,text,btn){
  return h('div',{class:'empty'},h('b',null,title),text?h('p',null,text):null,btn||null);
}
function renderInvTop(){
  const m=$('#invTop'); m.replaceChildren();
  const tools=$('#invTools');
  if(S.status==='boot'||(S.status==='ok'&&!S.ready.inventory)){ tools.hidden=true; m.append(h('p',{class:'summary'},'Cargando despensa…')); return; }
  if(S.status!=='ok'){ tools.hidden=true; m.append(emptyBox('Sin datos compartidos','Inicia sesión para guardar y compartir la despensa.')); return; }
  const items=S.inventory; tools.hidden=items.length===0;
  if(!items.length) return;
  const buy=items.filter(needsBuy).sort(byName), soon=items.filter(i=>expState(i));
  m.append(h('p',{class:'summary'},items.length+(items.length===1?' artículo':' artículos')+' · '+buy.length+' por comprar · '+soon.length+' por vencer'));
  if(buy.length){
    const list=h('div',{class:'list'});
    for(const it of buy) list.append(h('div',{class:'row'},
      h('div',{class:'row-main static'},h('div',{class:'nm'},it.name),h('div',{class:'meta'},'Quedan '+fmtNum(it.qty)+' '+(it.unit||'')+' · faltan '+fmtNum(needQty(it)-(it.qty||0)))),
      h('button',{type:'button',class:'btn sm',onClick:()=>restock(it),'aria-label':'Marcar comprado: '+it.name},'Comprado')));
    m.append(h('h3',{class:'sec'},'Por comprar'),list);
  }
  m.append(h('h3',{class:'sec'},'Todo lo que hay'));
}
function renderInvList(){
  const m=$('#invList'); m.replaceChildren();
  if(S.status!=='ok'||!S.ready.inventory) return;
  if(!S.inventory.length){
    m.append(emptyBox('La despensa está vacía','Agrega artículos o carga la lista base.',
      h('div',{class:'chips center'},
        h('button',{type:'button',class:'btn',onClick:()=>openItemSheet(null)},'Agregar el primer artículo'),
        h('button',{type:'button',class:'btn ghost',id:'loadBase',onClick:loadBaseList},'Cargar lista base ('+BASE_LIST.length+' artículos)'))));
    return;
  }
  const q=norm(S.q);
  const rows=S.inventory.filter(i=>(S.invCat==='todo'||i.cat===S.invCat)&&(!q||norm(i.name).includes(q)))
    .sort((a,b)=>(needsBuy(b)-needsBuy(a))||((expState(b)?1:0)-(expState(a)?1:0))||byName(a,b));
  if(!rows.length){ m.append(emptyBox('Nada coincide','Prueba con otra búsqueda o cambia el tipo.')); return; }
  const list=h('div',{class:'list'}); rows.forEach(r=>list.append(invRow(r))); m.append(list);
}
function renderDespensa(){renderInvTop();renderInvList();}
$('#q').addEventListener('input',ev=>{S.q=ev.target.value;renderInvList();});
$('#invChips').addEventListener('click',ev=>{
  const b=ev.target.closest('.chip'); if(!b) return;
  S.invCat=b.dataset.cat;
  document.querySelectorAll('#invChips .chip').forEach(c=>c.setAttribute('aria-pressed',c===b?'true':'false'));
  renderInvList();
});
$('#addItem').addEventListener('click',()=>openItemSheet(null));

/* ---------- Recibos ---------- */
function monthBar(ym,onShift){
  return h('div',{class:'monthbar'},
    h('button',{type:'button',class:'btn ghost','aria-label':'Mes anterior',onClick:()=>onShift(-1)},'‹'),
    h('div',{class:'mlabel'},labelYM(ym)),
    h('button',{type:'button',class:'btn ghost','aria-label':'Mes siguiente',onClick:()=>onShift(1)},'›'));
}
function splitHint(bill){
  const ids=memberIds(); if(ids.length!==2) return '';
  const pct=bill&&typeof bill.split==='number'?bill.split:50;
  return 'Reparto: '+nm(ids[0])+' '+pct+'% · '+nm(ids[1])+' '+(100-pct)+'%';
}
function openBillSheet(bill,preset){
  if(roBlock()) return;
  const ids=memberIds(), two=ids.length===2;
  const fields=[
    {id:'name',label:'Recibo',required:true,value:bill?bill.name:(preset&&preset.name)||'',placeholder:'Alquiler, electricidad, agua…'},
    {id:'amount',label:'Monto habitual (₡)',type:'number',min:0,value:bill&&bill.amount!=null?bill.amount:'',hint:'Puedes cambiarlo cada mes cuando llegue el recibo.'},
    {id:'due',label:'Día de vencimiento',type:'number',min:1,max:31,required:true,value:bill?bill.dueDay:''}
  ];
  if(two){
    const mine=ids[0]===S.uid;
    fields.push({id:'split',label:mine?'Tu parte (%)':'Parte de '+nm(ids[0])+' (%)',type:'number',min:0,max:100,value:bill&&typeof bill.split==='number'?bill.split:50,
      hint:'El resto lo '+(ids[1]===S.uid?'pagas tú.':'paga '+nm(ids[1])+'.')});
  }
  openSheet({
    title:bill?'Editar recibo':'Nuevo recibo', submitLabel:bill?'Guardar':'Agregar', fields,
    onSubmit:v=>guard(async()=>{
      const ref=bill?S.db.doc('bills/'+bill.id):S.db.collection('bills').doc();
      await ref.set({name:v.name,amount:v.amount==null?0:v.amount,dueDay:Math.round(v.due),
        split:two?(v.split==null?50:v.split):(bill&&typeof bill.split==='number'?bill.split:50),
        createdBy:bill&&bill.createdBy?bill.createdBy:(S.uid||null),updatedAt:iso()});
    }),
    extra:bill?[{label:'Eliminar recibo',confirm:'Confirmar: borrar recibo y pagos',onClick:()=>guard(async()=>{
      for(const p of S.payments.filter(p=>p.billId===bill.id)) await S.db.doc('payments/'+p.id).delete();
      await S.db.doc('bills/'+bill.id).delete();
    })}]:[]
  });
}
function openPaySheet(bill,month){
  if(roBlock()) return;
  const pay=payMap().get(bill.id+'_'+month), ids=memberIds();
  const opts=ids.length?ids.map(i=>[i,nm(i)]):[['','Alguien']];
  const save=(v,paid)=>guard(async()=>{
    await S.db.doc('payments/'+bill.id+'_'+month).set({billId:bill.id,month,amount:v.amount,
      paidBy:paid?(v.paidBy||S.uid||null):null,paidDate:paid?(v.paidDate||todayStr()):null,updatedAt:iso()});
  });
  const extra=[{label:'Guardar monto sin pagar',needsForm:true,onClick:v=>save(v,false)}];
  if(pay) extra.push({label:pay.paidBy?'Quitar pago':'Quitar monto',confirm:'Confirmar: quitar',onClick:()=>guard(async()=>{await S.db.doc('payments/'+pay.id).delete();})});
  extra.push({label:'Editar recibo',noClose:true,onClick:async()=>{openBillSheet(bill);}});
  openSheet({
    title:bill.name+' · '+labelYM(month), submitLabel:pay&&pay.paidBy?'Actualizar pago':'Marcar pagado',
    fields:[
      {id:'amount',label:'Monto de este mes (₡)',type:'number',required:true,min:0,value:pay?pay.amount:(bill.amount||''),hint:splitHint(bill)},
      {id:'paidBy',label:'Pagó',type:'select',options:opts,value:(pay&&pay.paidBy)||S.uid||ids[0]||''},
      {id:'paidDate',label:'Fecha de pago',type:'date',value:(pay&&pay.paidDate)||todayStr()}
    ],
    onSubmit:v=>save(v,true), extra
  });
}
function openSettleSheet(){
  if(roBlock()) return;
  const ids=memberIds(); if(ids.length!==2) return;
  const bal=balances(), debtor=bal[ids[0]]<0?ids[0]:ids[1], amt=Math.abs(bal[ids[0]]);
  openSheet({
    title:'Pago entre ustedes', submitLabel:'Registrar',
    fields:[
      {id:'amount',label:'Monto (₡)',type:'number',required:true,min:0,value:Math.round(amt)||'',hint:'Registra cuando uno le transfiere o le paga en efectivo al otro.'},
      {id:'from',label:'Quién pagó',type:'select',options:ids.map(i=>[i,nm(i)]),value:debtor},
      {id:'date',label:'Fecha',type:'date',required:true,value:todayStr()}
    ],
    onSubmit:v=>guard(async()=>{
      await S.db.collection('settlements').doc().set({from:v.from,to:ids.find(i=>i!==v.from),amount:v.amount,date:v.date,createdAt:iso()});
    })
  });
}
function balanceBox(){
  const ids=memberIds(), bal=balances(); let big,small=null,canSettle=false;
  if(ids.length<2){ big='Cuentas del hogar'; small='Aquí verán quién le debe a quién.'; }
  else{
    canSettle=true; const d=bal[ids[0]];
    if(Math.abs(d)<1) big='Están a mano';
    else{
      const cred=d>0?ids[0]:ids[1], deb=d>0?ids[1]:ids[0], a=money(Math.abs(d));
      big=deb===S.uid?'Le debes '+a+' a '+nm(cred):cred===S.uid?nm(deb)+' te debe '+a:nm(deb)+' le debe '+a+' a '+nm(cred);
      small='Según los recibos y gastos pagados y los pagos entre ustedes.';
    }
  }
  return h('div',{class:'balance'},h('p',{class:'big'},big),small?h('p',{class:'small'},small):null,
    canSettle?h('div',null,h('button',{type:'button',class:'btn ghost sm',onClick:openSettleSheet},'Registrar pago entre ustedes')):null);
}
function renderRecibos(){
  const m=$('#billMount'); m.replaceChildren();
  if(S.status==='boot'||(S.status==='ok'&&!(S.ready.bills&&S.ready.payments))){ m.append(h('p',{class:'summary'},'Cargando recibos…')); return; }
  if(S.status!=='ok'){ m.append(emptyBox('Sin datos compartidos','Inicia sesión para controlar los recibos.')); return; }
  const ids=memberIds(), pm=payMap();
  if(!S.bills.length){
    m.append(emptyBox('Aún no hay recibos','Agrega alquiler y servicios; cada mes marca quién pagó.',
      h('div',{class:'chips center'},QUICK_BILLS.map(n=>h('button',{type:'button',class:'chip',onClick:()=>openBillSheet(null,{name:n})},'+ '+n)))));
    return;
  }
  m.append(monthBar(S.month,k=>{S.month=shiftYM(S.month,k);renderRecibos();}));

  m.append(balanceBox());

  // Avance del mes
  let total=0,paid=0,paidN=0;
  for(const b of S.bills){const p=pm.get(b.id+'_'+S.month);const amt=p?p.amount:(b.amount||0);total+=amt;if(p&&p.paidBy){paid+=amt;paidN++;}}
  const bar=h('div',{class:'bar'},h('i'));
  bar.firstChild.style.width=(total>0?Math.min(100,paid/total*100):(paidN/S.bills.length*100))+'%';
  m.append(h('div',{class:'progress'},
    h('div',{class:'line'},h('span',null,'Pagado en '+labelYM(S.month)),h('span',null,money(paid)+' de '+money(total))),
    bar,h('div',{class:'meta flush'},paidN+' de '+S.bills.length+(S.bills.length===1?' recibo pagado':' recibos pagados'))));

  // Lista de recibos
  const cur=curYM(), today=new Date().getDate();
  const list=h('div',{class:'list'});
  for(const b of [...S.bills].sort((a,b)=>(a.dueDay||0)-(b.dueDay||0)||byName(a,b))){
    const p=pm.get(b.id+'_'+S.month), amt=p?p.amount:(b.amount||0), due=Math.min(b.dueDay||1,daysIn(S.month));
    const late=S.month<cur||(S.month===cur&&today>due);
    let pill;
    if(p&&p.paidBy) pill=h('span',{class:'pill good'},'Pagado');
    else if(late) pill=h('span',{class:'pill bad'},'Vencido');
    else pill=h('span',{class:'pill'},'Por pagar');
    const meta=[h('span',null,'Vence el '+due)];
    const sp=splitHint(b); if(sp) meta.push(h('span',null,sp.replace('Reparto: ','')));
    if(p&&p.paidBy) meta.push(h('span',null,nm(p.paidBy)+(p.paidDate?' · '+shortDate(p.paidDate):'')));
    list.append(h('div',{class:'row'},
      h('button',{type:'button',class:'row-main',onClick:()=>openPaySheet(b,S.month),'aria-label':b.name+': registrar pago'},h('div',{class:'nm'},b.name),h('div',{class:'meta'},meta)),
      h('div',{class:'right'},h('div',{class:'amt'},amt>0?money(amt):'—'),pill)));
  }
  m.append(list);

  settleHistory(m);
}
function settleHistory(m){
  if(S.settlements.length){
    const d=h('details',{class:'hist',open:S.histOpen?true:null,onToggle:ev=>{S.histOpen=ev.target.open;}},h('summary',null,'Pagos entre ustedes ('+S.settlements.length+')'));
    const l=h('div',{class:'list'});
    for(const s of [...S.settlements].sort((a,b)=>String(b.date).localeCompare(String(a.date)))){
      const del=h('button',{type:'button',class:'btn ghost sm'});
      twoStep(del,'Quitar','¿Quitar?',async()=>{ try{ await guard(async()=>{await S.db.doc('settlements/'+s.id).delete();}); }catch(e){} });
      l.append(h('div',{class:'row'},
        h('div',{class:'row-main static'},h('div',{class:'nm'},nm(s.from)+' → '+nm(s.to)),h('div',{class:'meta'},shortDate(s.date))),
        h('div',{class:'right'},h('div',{class:'amt'},money(s.amount)),del)));
    }
    d.append(l); m.append(d);
  }
}
$('#addBill').addEventListener('click',()=>openBillSheet(null));

/* ---------- Gastos compartidos ---------- */
const ownerLabel=i=>i===S.uid?'Solo mío':'Solo de '+nm(i);
function splitOptions(){
  const ids=memberIds(); if(ids.length<2) return null;
  return [['50','Entre los dos, mitad y mitad'],['100',ownerLabel(ids[0])],['0',ownerLabel(ids[1])]];
}
function splitNote(x){
  const ids=memberIds(); if(ids.length<2||typeof x.split!=='number'||x.split===50) return null;
  if(x.split===100) return ownerLabel(ids[0]);
  if(x.split===0) return ownerLabel(ids[1]);
  return x.split+'% / '+(100-x.split)+'%';
}
function openExpSheet(x,preset){
  if(roBlock()) return;
  const edit=!!x, ids=memberIds(), sp=splitOptions();
  const fields=[
    {id:'amount',label:'Monto (₡)',type:'number',required:true,min:0,value:edit?x.amount:''},
    {id:'cat',label:'Categoría',type:'select',options:EXP_CATS,value:edit?x.cat:((preset&&preset.cat)||'super')},
    {id:'desc',label:'Detalle',value:edit?x.desc:((preset&&preset.desc)||''),placeholder:'Automercado, feria, farmacia…'},
    {id:'paidBy',label:'Pagó',type:'select',options:ids.length?ids.map(i=>[i,nm(i)]):[['','Alguien']],value:(edit&&x.paidBy)||S.uid||ids[0]||''}
  ];
  if(sp) fields.push({id:'split',label:'¿De quién es el gasto?',type:'select',options:sp,value:String(edit&&typeof x.split==='number'?x.split:50)});
  fields.push({id:'date',label:'Fecha',type:'date',required:true,value:edit?x.date:todayStr()});
  openSheet({
    title:edit?'Editar gasto':'Nuevo gasto', submitLabel:edit?'Guardar':'Agregar', fields,
    onSubmit:v=>guard(async()=>{
      const col=S.db.collection('expenses'), ref=edit?col.doc(x.id):col.doc();
      const split=(v.split!=null&&v.split!=='')?Number(v.split):(edit&&typeof x.split==='number'?x.split:50);
      await ref.set({amount:v.amount,cat:v.cat,desc:v.desc||'',paidBy:v.paidBy||S.uid||null,split,date:v.date,month:v.date.slice(0,7),
        createdBy:edit&&x.createdBy?x.createdBy:(S.uid||null),updatedAt:iso()});
    }),
    extra:edit?[{label:'Eliminar gasto',confirm:'Confirmar: eliminar',onClick:()=>guard(async()=>{await S.db.doc('expenses/'+x.id).delete();})}]:[]
  });
}
function renderGastos(){
  const m=$('#expMount'); m.replaceChildren();
  if(S.status==='boot'||(S.status==='ok'&&!S.ready.expenses)){ m.append(h('p',{class:'summary'},'Cargando gastos…')); return; }
  if(S.status!=='ok'){ m.append(emptyBox('Sin datos compartidos','Inicia sesión para registrar gastos.')); return; }
  m.append(balanceBox());
  if(!S.expenses.length){
    m.append(emptyBox('Aún no hay gastos','Anota quién pagó y la app calcula el balance.',
      h('div',{class:'chips center'},QUICK_EXP.map(q=>h('button',{type:'button',class:'chip',onClick:()=>openExpSheet(null,{desc:q[0],cat:q[1]})},'+ '+q[0])))));
    settleHistory(m); return;
  }
  m.append(monthBar(S.xmonth,k=>{S.xmonth=shiftYM(S.xmonth,k);renderGastos();}));
  const mes=S.expenses.filter(x=>x.month===S.xmonth), total=sum(mes,x=>x.amount);
  if(!mes.length){
    m.append(emptyBox('Sin gastos en '+labelYM(S.xmonth).toLowerCase(),'Usa las flechas para ver otros meses o agrega uno nuevo.'));
    settleHistory(m); return;
  }
  const mine=S.uid?sum(mes,x=>(x.amount||0)*shareOf(x,S.uid)/100):null;
  m.append(h('p',{class:'summary'},money(total)+' en '+mes.length+(mes.length===1?' gasto':' gastos')+(mine!=null?' · tu parte '+money(mine):'')));
  const byCat={}; mes.forEach(x=>{byCat[x.cat]=(byCat[x.cat]||0)+(x.amount||0);});
  const cats=EXP_CATS.filter(c=>byCat[c[0]]);
  if(cats.length>1){
    const box=h('div',{class:'list'});
    for(const c of cats){
      const bar=h('div',{class:'bar acc',role:'img','aria-label':Math.round(byCat[c[0]]/total*100)+'% del mes en '+c[1]},h('i'));
      bar.firstChild.style.width=(total>0?byCat[c[0]]/total*100:0)+'%';
      box.append(h('div',{class:'cat'},h('div',{class:'line'},h('span',null,c[1]),h('span',null,money(byCat[c[0]]))),bar));
    }
    m.append(h('h3',{class:'sec'},'Por categoría'),box);
  }
  const list=h('div',{class:'list'});
  for(const x of [...mes].sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.id.localeCompare(b.id))){
    const bits=[shortDate(x.date),expLabel(x.cat),x.paidBy?(x.paidBy===S.uid?'Pagaste tú':'Pagó '+nm(x.paidBy)):null,splitNote(x)].filter(Boolean).map(t=>h('span',null,t));
    list.append(h('div',{class:'row'},
      h('button',{type:'button',class:'row-main',onClick:()=>openExpSheet(x),'aria-label':'Editar '+(x.desc||expLabel(x.cat))},
        h('div',{class:'nm'},x.desc||expLabel(x.cat)),h('div',{class:'meta'},bits)),
      h('div',{class:'right'},h('div',{class:'amt'},money(x.amount)))));
  }
  m.append(h('h3',{class:'sec'},'Gastos'),list);
  settleHistory(m);
}
$('#addExp').addEventListener('click',()=>openExpSheet(null));

/* ---------- Presupuesto personal (privado) ---------- */
const budRef=()=>S.db.doc('data/users/'+S.uid+'/budget');
function openEntrySheet(e){
  if(roBlock()) return;
  if(!S.uid){toast('Inicia sesión para usar tu presupuesto.');return;}
  const edit=!!e;
  openSheet({
    title:edit?'Editar movimiento':'Nuevo movimiento', submitLabel:edit?'Guardar':'Agregar',
    fields:[
      {id:'type',label:'Tipo',type:'select',options:[['gasto','Gasto'],['ingreso','Ingreso extra']],value:edit?e.type:'gasto'},
      {id:'amount',label:'Monto (₡)',type:'number',required:true,min:0,value:edit?e.amount:'',hint:'Para gastos solo tuyos. El súper y lo de la casa van en Gastos.'},
      {id:'cat',label:'Categoría',type:'select',options:BUD_CATS,value:edit?e.cat:'alimentacion'},
      {id:'desc',label:'Detalle',value:edit?e.desc:'',placeholder:'Súper, gasolina, café…'},
      {id:'date',label:'Fecha',type:'date',required:true,value:edit?e.date:todayStr()}
    ],
    onSubmit:v=>guard(async()=>{
      const col=budRef().collection('entries'); const ref=edit?col.doc(e.id):col.doc();
      await ref.set({type:v.type,amount:v.amount,cat:v.cat,desc:v.desc,date:v.date,month:v.date.slice(0,7),updatedAt:iso()});
    }),
    extra:edit?[{label:'Eliminar movimiento',confirm:'Confirmar: eliminar',onClick:()=>guard(async()=>{await budRef().collection('entries').doc(e.id).delete();})}]:[]
  });
}
function openCfgSheet(){
  if(roBlock()) return;
  if(!S.uid){toast('Inicia sesión para usar tu presupuesto.');return;}
  const fields=[{id:'income',label:'Ingreso mensual base (₡)',type:'number',min:0,value:S.cfg.income||'',hint:'Tu salario u otro ingreso fijo. Los ingresos extra se agregan como movimientos.'}];
  BUD_CATS.forEach(c=>fields.push({id:'l_'+c[0],label:'Límite mensual · '+c[1]+' (₡)',type:'number',min:0,value:S.cfg.limits[c[0]]||''}));
  openSheet({
    title:'Ajustar presupuesto', submitLabel:'Guardar', fields,
    onSubmit:v=>guard(async()=>{
      const limits={}; BUD_CATS.forEach(c=>{const x=v['l_'+c[0]]; if(x!=null&&x>0) limits[c[0]]=x;});
      await budRef().set({income:v.income==null?0:v.income,limits,updatedAt:iso()});
    })
  });
}
function renderPresupuesto(){
  const m=$('#budMount'); m.replaceChildren();
  const lock=h('p',{class:'privacy'});
  lock.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
  lock.append(document.createTextNode('Privado: solo tú ves esta hoja.'));
  if(S.status==='boot'||(S.status==='ok'&&S.uid&&!(S.ready.cfg&&S.ready.entries))){ m.append(h('p',{class:'summary'},'Cargando tu presupuesto…')); return; }
  if(S.status!=='ok'){ m.append(emptyBox('Sin datos guardados','Inicia sesión para llevar tu presupuesto.')); return; }
  if(!S.uid){ m.append(emptyBox('Inicia sesión','Tu presupuesto es privado y necesita saber quién eres.')); return; }
  m.append(lock);
  m.append(monthBar(S.bmonth,k=>{S.bmonth=shiftYM(S.bmonth,k);renderPresupuesto();}));

  const mes=S.entries.filter(e=>e.month===S.bmonth);
  const extra=sum(mes.filter(e=>e.type==='ingreso'),e=>e.amount);
  const gastos=sum(mes.filter(e=>e.type!=='ingreso'),e=>e.amount);
  const hogar=myBillsShare(S.bmonth), comp=myExpensesShare(S.bmonth), ingresos=(S.cfg.income||0)+extra, disp=ingresos-gastos-hogar-comp;
  m.append(h('div',{class:'ledger'},
    h('div',{class:'led'},h('span',null,'Ingresos'),h('span',null,money(ingresos))),
    h('div',{class:'led'},h('span',null,'Gastos'),h('span',null,'− '+money(gastos))),
    h('div',{class:'led'},h('span',null,'Gastos compartidos (tu parte)'),h('span',null,'− '+money(comp))),
    h('div',{class:'led'},h('span',null,'Recibos del hogar (tu parte)'),h('span',null,'− '+money(hogar))),
    h('div',{class:'led total'},h('span',null,'Disponible'),h('span',{class:disp<0?'neg':''},(disp<0?'− ':'')+money(Math.abs(disp))))));
  m.append(h('div',null,h('button',{type:'button',class:'btn ghost sm',onClick:openCfgSheet},(S.cfg.income||Object.keys(S.cfg.limits).length)?'Ajustar ingreso y límites':'Definir ingreso y límites')));

  // Categorías
  const spent={}; mes.filter(e=>e.type!=='ingreso').forEach(e=>{spent[e.cat]=(spent[e.cat]||0)+(e.amount||0);});
  const cats=BUD_CATS.filter(c=>spent[c[0]]||S.cfg.limits[c[0]]);
  if(cats.length){
    m.append(h('h3',{class:'sec'},'Por categoría'));
    const box=h('div',{class:'list'});
    for(const c of cats){
      const s=spent[c[0]]||0, lim=S.cfg.limits[c[0]];
      const row=h('div',{class:'cat'},h('div',{class:'line'},h('span',null,c[1]),h('span',null,lim?money(s)+' / '+money(lim):money(s))));
      if(lim){ const r=s/lim; const bar=h('div',{class:'bar'+(r>1?' bad':r>=.8?' warn':''),role:'img','aria-label':Math.round(r*100)+'% del límite de '+c[1]},h('i')); bar.firstChild.style.width=Math.min(100,r*100)+'%'; row.append(bar); }
      box.append(row);
    }
    m.append(box);
  }

  // Movimientos
  m.append(h('h3',{class:'sec'},'Movimientos'));
  if(!mes.length){
    m.append(emptyBox('Sin movimientos este mes','Anota tus gastos del mes.',
      h('button',{type:'button',class:'btn',onClick:()=>openEntrySheet(null)},'Agregar un gasto')));
    return;
  }
  const list=h('div',{class:'list'});
  for(const e of [...mes].sort((a,b)=>String(b.date).localeCompare(String(a.date))||a.id.localeCompare(b.id))){
    const inc=e.type==='ingreso';
    list.append(h('div',{class:'row'},
      h('button',{type:'button',class:'row-main',onClick:()=>openEntrySheet(e),'aria-label':'Editar '+(e.desc||budLabel(e.cat))},
        h('div',{class:'nm'},e.desc||(inc?'Ingreso extra':budLabel(e.cat))),h('div',{class:'meta'},shortDate(e.date)+(inc?'':' · '+budLabel(e.cat)))),
      h('div',{class:'right'},h('div',{class:'amt'+(inc?' pos':'')},(inc?'+ ':'− ')+money(e.amount)))));
  }
  m.append(list);
}
$('#addEntry').addEventListener('click',()=>openEntrySheet(null));

/* ---------- Encabezado y avisos ---------- */
function renderHeader(){
  const box=$('#people'); box.replaceChildren();
  for(const id of memberIds()){
    const p=S.profiles[id], label=nm(id);
    const av=p&&p.avatarUrl?h('img',{src:p.avatarUrl,alt:''}):h('span',{class:'ini'},label.charAt(0).toUpperCase());
    box.append(h('span',{class:'person'},av,label));
  }
  $('#inviteNote').hidden=!(S.status==='ok'&&memberIds().length<2&&S.canWrite!==false);
  $('#roNote').hidden=!(S.status==='ok'&&S.canWrite===false);
  const off=S.status!=='ok'||S.canWrite===false;
  $('#addItem').disabled=off; $('#addBill').disabled=off; $('#addExp').disabled=off; $('#addEntry').disabled=off||!S.uid;
  const net=$('#net');
  if(S.failed){ net.hidden=false; net.textContent=S.failed==='revoked'?'Tu acceso a los datos cambió. Recarga la página.':'No se pudo leer la base compartida. Lo que ves puede estar desactualizado.'; }
  else if(S.status==='ok'&&!S.synced&&S.netLate){ net.hidden=false; net.textContent='Aún no se alcanza la base compartida. Lo que ves puede estar desactualizado.'; }
  else net.hidden=true;
}
let raf=0;
function renderAll(){renderHeader();renderDespensa();renderRecibos();renderGastos();renderPresupuesto();}
function queueRender(){ if(raf) return; raf=requestAnimationFrame(()=>{raf=0;renderAll();}); }

/* ---------- Navegación ---------- */
function setTab(t){
  if(!TABS.includes(t)) t='despensa'; S.tab=t;
  document.querySelectorAll('[data-panel]').forEach(p=>{p.hidden=p.dataset.panel!==t;});
  document.querySelectorAll('.nav button').forEach(b=>{ if(b.dataset.tab===t) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
}
document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>{
  setTab(b.dataset.tab); try{location.hash=b.dataset.tab;}catch(e){} window.scrollTo(0,0);
}));
window.addEventListener('hashchange',()=>setTab((location.hash||'').replace('#','')));

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
      gField('g_code','Código del hogar',code,'Lo da quien creó el hogar.'),
      h('button',{type:'submit',class:'btn ghost'},'Unirme con código'));
    const out=h('button',{type:'button',class:'btn ghost sm',onClick:async()=>{try{await api('auth',{action:'logout'});}catch(e){} location.reload();}},'Salir');
    box.replaceChildren(gateCard(
      h('p',{class:'summary'},'Hola, '+me.user.name+'. Falta elegir tu hogar.'),
      h('button',{type:'button',class:'btn',onClick:()=>run({action:'create'})},'Crear hogar nuevo'),
      h('p',{class:'hint'},'Crea el hogar y comparte el código.'),
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

/* ---------- Datos en vivo ---------- */
function listen(key,ref,apply){
  return ref.onSnapshot(snap=>{
    apply(snap); S.ready[key]=true;
    if(!snap.metadata.fromCache){S.synced=true;S.failed=null;}
    if(key==='members') loadProfiles();
    queueRender();
  },e=>{ S.ready[key]=true; S.failed=(e&&e.code)||'error'; queueRender(); });
}
const docs=snap=>snap.docs.map(d=>Object.assign({id:d.id},d.data()));
async function init(){
  setTab((location.hash||'').replace('#',''));
  renderAll();
  const sess=await gate(); if(!sess) return;
  const user=sess.user, db=sess.db;
  S.user=user; S.db=db; S.uid=await user.id(); S.canWrite=true;
  if(!db){ S.status='nodb'; renderAll(); return; }
  S.status='ok'; renderAll();
  setTimeout(()=>{ if(!S.synced){S.netLate=true;queueRender();} },10000);

  listen('members',db.collection('members'),snap=>{
    S.members=docs(snap).sort((a,b)=>String(a.joinedAt||'').localeCompare(String(b.joinedAt||''))||a.id.localeCompare(b.id));
  });
  listen('inventory',db.collection('inventory'),snap=>{
    S.inventory=docs(snap).map(o=>{const p=pending.get(o.id);if(p&&p.qty!=null)o.qty=p.qty;return o;});
  });
  listen('bills',db.collection('bills'),snap=>{S.bills=docs(snap);});
  listen('expenses',db.collection('expenses'),snap=>{S.expenses=docs(snap);});
  listen('payments',db.collection('payments'),snap=>{S.payments=docs(snap);});
  listen('settlements',db.collection('settlements'),snap=>{S.settlements=docs(snap);});
  if(S.uid){
    listen('cfg',budRef(),snap=>{
      const d=snap.exists?snap.data():{};
      S.cfg={income:Number(d.income)||0,limits:d.limits&&typeof d.limits==='object'?d.limits:{}};
    });
    listen('entries',budRef().collection('entries'),snap=>{S.entries=docs(snap);});
  }
  sess.start();
}
init();
})();
