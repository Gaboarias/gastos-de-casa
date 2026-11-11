# Lectura local del recibo en un navegador real (sin clave de Claude): foto y PDF.
# Necesita internet (tesseract.js, datos de idioma y pdf.js vienen de CDN) y el servidor de prueba así:
#   OCR_LOCAL=1 PORT=3998 node test/server.js &
#   python3 test/ui-ocr-local.py
import os, sys, time, tempfile
from playwright.sync_api import sync_playwright
URL = 'http://localhost:3998/'
RECIBO = """<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#8a8f94;display:flex;justify-content:center;padding:24px 0}
.r{width:340px;background:#f7f5ee;color:#222;font:15px/1.45 "Courier New",monospace;padding:18px 16px;transform:rotate(-1.2deg)}
.c{text-align:center}.b{font-weight:bold}.row{display:flex;justify-content:space-between}</style>
<div class="r"><div class="c b">AUTO MERCADO S.A.</div><div class="c">CED. JUR. 3-101-004593</div>
<div class="c">Sucursal Guayabos  Caja 04</div><div>Fecha: 08/11/2026   Hora: 18:42</div><div>Tiquete: 0001-00045678</div>
<div class="row"><span>LECHE DOS PINOS 1L</span><span>1.250,00</span></div><div class="row"><span>PAN INTEGRAL</span><span>2.100,00</span></div>
<div class="row"><span>QUESO TURRIALBA 500G</span><span>4.300,00</span></div><div class="row"><span>HUEVOS 12 UN</span><span>2.890,00</span></div>
<div class="row"><span>SUBTOTAL</span><span>10.540,00</span></div><div class="row"><span>IVA 13%</span><span>1.370,00</span></div>
<div class="row b"><span>TOTAL</span><span>11.910,00</span></div><div class="row"><span>EFECTIVO</span><span>15.000,00</span></div>
<div class="row"><span>CAMBIO</span><span>3.090,00</span></div><div>Total articulos: 4</div><div class="c">GRACIAS POR SU COMPRA</div></div>"""
errs = []; fails = []
def check(c, msg):
    if not c: fails.append(msg); print('FALLA:', msg)
tmp = tempfile.mkdtemp(); png = os.path.join(tmp, 'recibo.png'); pdf = os.path.join(tmp, 'recibo.pdf')
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1) "foto" y PDF del recibo simulado
    pg0 = b.new_page(viewport={'width': 420, 'height': 760}, device_scale_factor=2)
    pg0.set_content(RECIBO); pg0.screenshot(path=png, full_page=True); pg0.pdf(path=pdf, width='420px', height='760px'); pg0.close()
    # 2) la app sin clave: lee en el navegador
    ctx = b.new_context(viewport={'width': 400, 'height': 820})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' else None)
    pg.goto(URL); pg.wait_for_selector('#g_email')
    pg.click('text=Crear cuenta'); pg.fill('#g_name', 'Gabo'); pg.fill('#g_email', 'gabo@casa.com'); pg.fill('#g_pass', 'clave-segura-1')
    pg.click('button[type=submit]'); pg.wait_for_selector('text=Crear hogar nuevo')
    pg.click('text=Crear hogar nuevo'); pg.wait_for_selector('#appRoot:not([hidden])')
    pg.click('[data-tab=gastos]')
    for label, f in (('Galería', png), ('PDF', pdf)):
        pg.click('#addExp'); pg.wait_for_selector('#f_receipt')
        with pg.expect_file_chooser() as fc: pg.click('#sheetBody >> text=' + label)
        t0 = time.time(); fc.value.set_files(f)
        pg.wait_for_function("document.querySelector('#f_amount').value!==''", timeout=120000)
        got = (pg.input_value('#f_amount'), pg.input_value('#f_desc'), pg.input_value('#f_date'))
        print(label, '%.1f s' % (time.time() - t0), got)
        check(got == ('11910', 'Automercado', '2026-11-08'), label + ': total, comercio y fecha')
        pg.click('#sheetX')
    b.close()
print('ERRORES JS:', errs)
print('FALLAS:', fails if fails else 'ninguna')
sys.exit(1 if fails or errs else 0)
