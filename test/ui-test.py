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
    units=A.evaluate("fetch('/api/sync').then(r=>r.json()).then(j=>Object.fromEntries(j.docs.filter(d=>d.col==='inventory'&&['base-tomate','base-papa','base-arroz','base-lechugas'].includes(d.id)).map(d=>[d.id,d.data.unit])))")
    check(units=={'base-tomate':'kg','base-papa':'kg','base-arroz':'unid.','base-lechugas':'unid.'},'frutas y verduras en kg, el resto por unidad: '+str(units))
    A.click('#loadBase') if A.query_selector('#loadBase') else None
    check(A.query_selector('#loadBase') is None,'el botón de lista base desaparece al tener artículos')

    # --- A: despensa
    A.click('#addItem'); A.fill('#f_name','Arroz'); A.fill('#f_qty','1'); A.fill('#f_min','2')
    # (la lista base ya trae "Arroz": se espera al contador, no al nombre)
    A.click('#sheetBody button[type=submit]'); A.wait_for_selector('#buyBadge:not([hidden])', timeout=10000)
    check('1 por comprar' in A.inner_text('#invTop').lower(),'A: arroz queda en Por comprar')
    check(A.inner_text('#buyBadge')=='1','contador rojo en la pestaña Despensa = 1')

    # --- Editar el nombre: desde "Por comprar" y desde la lista
    A.click('#invTop >> text=Arroz'); A.wait_for_selector('#f_name')
    check(A.input_value('#f_name')=='Arroz','Por comprar abre la edición del artículo')
    A.fill('#f_name','Arroz integral'); A.click('#sheetBody button[type=submit]')
    A.wait_for_selector('#invTop >> text=Arroz integral', timeout=10000)
    check(A.query_selector('#invList .row-main .ed') is not None,'cada artículo muestra el lápiz de editar')
    A.click('#invList >> text=Lechugas'); A.wait_for_selector('#f_name'); A.fill('#f_name','Lechuga romana'); A.click('#sheetBody button[type=submit]')
    A.wait_for_selector('#invList >> text=Lechuga romana', timeout=10000)
    nm=A.evaluate("fetch('/api/sync').then(r=>r.json()).then(j=>j.docs.find(d=>d.id==='base-lechugas').data.name)")
    check(nm=='Lechuga romana','el nombre editado se guarda ('+str(nm)+')')
    A.click('#invTop >> text=Arroz integral'); A.wait_for_selector('#f_name'); A.fill('#f_name','Arroz'); A.click('#sheetBody button[type=submit]')
    A.wait_for_selector('#invTop >> text="Arroz"', timeout=10000)

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
    check(not A.is_visible('#buyBadge') and not B.is_visible('#buyBadge'),'el contador desaparece al reponer')

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
    # Lectura del recibo (OCR simulado): en un gasto nuevo rellena monto, detalle y fecha
    A.click('#addExp'); A.wait_for_selector('#f_receipt')
    with A.expect_file_chooser() as fc0: A.click('#sheetBody >> text=Galería')
    fc0.value.set_files(tmp)
    A.wait_for_function("document.querySelector('#f_amount').value==='12345'", timeout=10000)
    check(A.input_value('#f_desc')=='Automercado' and A.input_value('#f_date')=='2026-11-08','OCR rellena detalle y fecha')
    A.click('#sheetX')

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

    # --- Recibos: A agrega el alquiler y lo marca pagado con comprobante; B lo ve
    A.click('[data-tab=recibos]'); A.click('#addBill'); A.wait_for_selector('#f_name')
    A.fill('#f_name','Alquiler'); A.fill('#f_amount','300000'); A.fill('#f_due','1')
    A.click('#sheetBody button[type=submit]'); A.wait_for_selector('#billMount >> text=Alquiler')
    A.click('#billMount >> text=Alquiler'); A.wait_for_selector('#f_receipt')
    check(A.input_value('#f_amount')=='300000' and A.input_value('#f_paidBy')!='','el pago trae el monto y quién paga')
    with A.expect_file_chooser() as fc3: A.click('#sheetBody >> text=Galería')
    fc3.value.set_files(tmp); A.wait_for_selector('.fname >> text=recibo.png')
    A.click('#sheetBody button[type=submit]'); A.wait_for_selector('#billMount .rcpt', timeout=15000)
    t=A.inner_text('#billMount').replace('\u00a0',' ')
    check('Pagado' in t and 'comprobante' in t.lower() and 'Tú' in t,'A ve el alquiler pagado por ella con comprobante (el botón va en mayúsculas por CSS)')
    check('Ana te debe' in t and '120 000' in t,'balance: Ana le debe 120 000 (150 000 del alquiler - 30 000 del súper)')
    B.click('[data-tab=recibos]'); B.wait_for_selector('#billMount .rcpt', timeout=12000)
    check('Gabo' in B.inner_text('#billMount') and 'Pagado' in B.inner_text('#billMount'),'B ve que Gabo pagó el alquiler con comprobante')
    B.click('#billMount .rcpt'); B.wait_for_selector('.rcpt-img'); check('Comprobante' in B.inner_text('#sheetTitle'),'B abre el comprobante'); B.click('#sheetX')
    nb=B.evaluate("fetch('/api/sync').then(r=>r.json()).then(j=>j.docs.find(d=>d.col==='payments').data)")
    check(nb.get('paidBy') and nb.get('receiptType')=='image' and bool(nb.get('receipt')),'el pago guarda quién pagó y el comprobante: '+str({k:nb.get(k) for k in ('paidBy','receiptType')}))
    # Quitar el comprobante borra el archivo
    rid=nb['receipt']; A.click('#billMount >> text=Alquiler'); A.wait_for_selector('#f_receipt')
    A.click('#sheetBody >> text=Quitar comprobante'); A.click('#sheetBody >> text=Confirmar: quitar')
    A.wait_for_function("!document.querySelector('#billMount .rcpt')", timeout=10000)
    check('Pagado' in A.inner_text('#billMount'),'sin comprobante el pago sigue marcado')
    A.wait_for_timeout(1500); check(A.context.request.get(URL+'api/file?id='+rid).status==404,'el archivo del comprobante se borra')

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
