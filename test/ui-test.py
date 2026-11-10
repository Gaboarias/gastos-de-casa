from playwright.sync_api import sync_playwright
import re, sys
URL='http://localhost:3999/'
errs=[]; fails=[]
def check(c,msg):
    if not c: fails.append(msg); print('FALLA:',msg)

def mk(b,name):
    ctx=b.new_context(viewport={'width':400,'height':820})
    ctx.route('**/*',lambda r: r.continue_() if r.request.url.startswith('http://localhost') else r.abort())
    pg=ctx.new_page()
    pg.on('pageerror',lambda e:errs.append(name+': '+str(e)))
    pg.on('console',lambda m: errs.append(name+' console: '+m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    return pg

with sync_playwright() as p:
    b=p.chromium.launch()
    A=mk(b,'A'); B=mk(b,'B')

    # --- A: crear cuenta y hogar
    A.goto(URL); A.wait_for_selector('#g_email')
    A.click('text=Crear cuenta'); A.fill('#g_name','Gabo'); A.fill('#g_email','gabo@casa.com'); A.fill('#g_pass','clave-segura-1')
    A.click('button[type=submit]'); A.wait_for_selector('text=Crear hogar nuevo')
    A.click('text=Crear hogar nuevo'); A.wait_for_selector('#appRoot:not([hidden])')
    A.wait_for_function("document.querySelector('#hhCode').textContent.length===6")
    code=A.inner_text('#hhCode'); print('codigo',code)
    check(A.is_visible('#inviteNote'),'A ve el aviso con el código')

    # --- A: lista base (despensa vacía -> botón "Cargar lista base")
    A.wait_for_selector('#loadBase'); A.click('#loadBase')
    A.wait_for_selector('#invList >> text=Esponjas lavaplatos', timeout=30000)
    n=A.evaluate("fetch('/api/sync').then(r=>r.json()).then(j=>j.docs.filter(d=>d.col==='inventory').length)")
    check(n==65,'A cargó la lista base (65 artículos, hay '+str(n)+')')
    check(A.is_visible('#invList >> text=Lechugas') and A.evaluate("document.querySelectorAll('#invTop .btn').length")==0,'lista base sin avisos de compra (mínimo 0)')
    A.click('#loadBase') if A.query_selector('#loadBase') else None
    check(A.query_selector('#loadBase') is None,'el botón de lista base desaparece al tener artículos')

    # --- A: despensa
    A.click('#addItem'); A.fill('#f_name','Arroz'); A.fill('#f_qty','1'); A.fill('#f_min','2')
    A.click('#sheetBody button[type=submit]'); A.wait_for_selector('#invList >> text=Arroz')
    check('por comprar' in A.inner_text('#invTop').lower(),'A: arroz queda en Por comprar')

    # --- B: cuenta y unirse
    B.goto(URL); B.wait_for_selector('#g_email')
    B.click('text=Crear cuenta'); B.fill('#g_name','Ana'); B.fill('#g_email','ana@casa.com'); B.fill('#g_pass','clave-segura-2')
    B.click('button[type=submit]'); B.wait_for_selector('#g_code')
    B.fill('#g_code',code.lower()); B.click('text=Unirme con código'); B.wait_for_selector('#appRoot:not([hidden])')
    B.wait_for_selector('#invList >> text=Arroz', timeout=9000)
    check(True,'B ve el arroz')
    check('Gabo' in B.inner_text('#people') and 'Ana' in B.inner_text('#people') or 'Tú' in B.inner_text('#people'),'B ve a las dos personas')

    # --- B repone arroz -> A lo ve (sondeo ~6 s)
    B.click('text=Comprado')
    A.wait_for_function("document.querySelectorAll('#invTop .btn').length===0", timeout=12000)
    check(True,'A ve que B repuso el arroz')

    # --- Gastos: B paga el súper
    B.click('[data-tab=gastos]'); B.click('#addExp'); B.fill('#f_amount','60000'); B.fill('#f_desc','Automercado')
    B.click('#sheetBody button[type=submit]'); B.wait_for_selector('#expMount >> text=Automercado')
    A.click('[data-tab=gastos]'); A.wait_for_selector('#expMount >> text=Automercado', timeout=12000)
    t=A.inner_text('#expMount'); print('A gastos:',t.replace('\n',' | ')[:200])
    check('Ana te' not in t and ('le debes' in t.lower() and '30 000' in t.replace(' ',' ')),'A le debe 30 000 a Ana')

    # --- Recibo del súper: A adjunta foto al gasto, B lo ve
    import base64, tempfile, os
    png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
    tmp=os.path.join(tempfile.mkdtemp(),'recibo.png'); open(tmp,'wb').write(png)
    A.click('#expMount >> text=Automercado'); A.wait_for_selector('#f_receipt')
    with A.expect_file_chooser() as fc: A.click('#sheetBody >> text=Tomar foto')
    check(A.get_attribute('#f_receipt','capture')=='environment' and A.get_attribute('#f_receipt','accept')=='image/*','"Tomar foto" abre la cámara')
    fc.value.set_files(tmp); A.wait_for_selector('.fname >> text=recibo.png'); check(True,'muestra el archivo elegido')
    with A.expect_file_chooser() as fc2: A.click('#sheetBody >> text=PDF')
    check(A.get_attribute('#f_receipt','capture') is None and A.get_attribute('#f_receipt','accept')=='application/pdf','"PDF" abre el selector de archivos')
    fc2.value.set_files(tmp); A.click('#sheetBody button[type=submit]')
    A.wait_for_selector('#expMount .rcpt', timeout=15000); check(True,'A adjunta el recibo al gasto')
    A.click('#expMount .rcpt'); A.wait_for_selector('.rcpt-img')
    check(A.evaluate("(async()=>{const i=document.querySelector('.rcpt-img');await i.decode();return i.naturalWidth})()")==1,'A ve la imagen del recibo')
    A.click('#sheetX')
    B.wait_for_selector('#expMount .rcpt', timeout=12000); check(True,'B ve que el gasto tiene recibo')
    nf=B.evaluate("fetch('/api/sync').then(r=>r.json()).then(j=>j.docs.find(d=>d.col==='expenses').data.receipt)")
    check(B.evaluate("id=>fetch('/api/file?id='+id).then(r=>r.status)",nf)==200,'B descarga el recibo')

    # --- Presupuesto privado
    A.click('[data-tab=presupuesto]'); A.click('#addEntry'); A.fill('#f_amount','7000'); A.fill('#f_desc','secreto-de-A')
    A.click('#sheetBody button[type=submit]'); A.wait_for_selector('#budMount >> text=secreto-de-A')
    B.click('[data-tab=presupuesto]'); B.wait_for_timeout(7500)
    check('secreto-de-A' not in B.inner_text('#budMount'),'B no ve movimientos de A')
    check('Gastos compartidos (tu parte)' in A.inner_text('#budMount') and '30' in A.inner_text('#budMount'),'A descuenta su parte de gastos compartidos')

    # --- Notas compartidas
    A.click('[data-tab=notas]'); A.click('#addNote'); A.fill('#f_title','Pendientes'); A.fill('#f_text','Llamar al fontanero\nComprar bombillos')
    A.click('#sheetBody button[type=submit]'); A.wait_for_selector('#noteMount >> text=Pendientes')
    check('Llamar al fontanero' in A.inner_text('#noteMount'),'A ve su nota')
    B.click('[data-tab=notas]'); B.wait_for_selector('#noteMount >> text=Pendientes', timeout=12000)
    check('Gabo' in B.inner_text('#noteMount'),'B ve la nota de A con su nombre')
    B.click('#noteMount >> text=Pendientes'); B.wait_for_selector('#f_text'); B.fill('#f_text','Ya llamé'); B.click('#sheetBody button[type=submit]')
    A.wait_for_selector('#noteMount >> text=Ya llamé', timeout=12000); check(True,'A ve la edición de B')

    # --- Persistencia: recargar A mantiene sesión y datos
    A.reload(); A.wait_for_selector('#appRoot:not([hidden])'); A.click('[data-tab=presupuesto]'); A.wait_for_selector('#budMount >> text=secreto-de-A')
    check(True,'A recarga y conserva sesión y datos')
    w=A.evaluate('document.documentElement.scrollWidth'); check(w<=400,'sin scroll horizontal ('+str(w)+')')

    # --- Salir
    A.click('#logout'); A.wait_for_selector('#g_email'); check(True,'salir lleva al login')
    b.close()

print('ERRORES JS:',errs)
print('FALLAS:',fails if fails else 'ninguna')
sys.exit(1 if fails or errs else 0)
