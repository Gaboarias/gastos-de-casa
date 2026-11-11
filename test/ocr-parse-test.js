'use strict';
// Prueba del extractor de total, comercio y fecha (bloque ocr-parse de index.html) con textos
// como los que devuelve Tesseract para recibos de Costa Rica.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/\/\* ocr-parse:start[\s\S]*?\*\/([\s\S]*?)\/\* ocr-parse:end \*\//);
if (!m) { console.log('FALLA: no se encontró el bloque ocr-parse en index.html'); process.exit(1); }
const { parseReceipt, parseNum } = new Function(m[1] + '\nreturn { parseReceipt, parseNum };')();

let fails = 0, total = 0;
const ok = (c, msg) => { total++; if (!c) { fails++; console.log('FALLA:', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' → ' + JSON.stringify(a));
const T = '2026-11-10';

eq(parseNum('12.345'), 12345, 'miles con punto');
eq(parseNum('12,345.00'), 12345, 'miles con coma y decimales');
eq(parseNum('₡ 1.234.567,00'), 1234567, 'colones con símbolo');
eq(parseNum('12,50'), 12.5, 'decimal con coma');
eq(parseNum('4500'), 4500, 'entero');
eq(parseNum('1.2345'), null, 'cuatro decimales no es monto');

const auto = `AUTO MERCADO S.A.
CED JUR 3-101-004593
Sucursal: Guayabos   Caja 04
Fecha: 08/11/2026  Hora: 18:42
Leche Dos Pinos 1L          1.250,00
Pan integral                2.100,00
Queso Turrialba 500g        4.300,00
SUBTOTAL                    7.650,00
IVA                           995,00
TOTAL                       8.645,00
EFECTIVO                   10.000,00
CAMBIO                      1.355,00
Total artículos: 3
GRACIAS POR SU COMPRA`;
eq(parseReceipt(auto, T), { amount: 8645, desc: 'Automercado', date: '2026-11-08' }, 'Automercado con subtotal, IVA y cambio');

const wal = `Walmart
Walmart de Mexico y Centroamerica
Tel 2582-1500
10/11/26 09:15 TIENDA 1234
ARROZ TIO PELON 1.8 KG     3,495
POLLO ENTERO KG            6,210
T0TAL                      9,705
TARJETA                    9,705
No. DE ARTICULOS: 2`;
eq(parseReceipt(wal, T), { amount: 9705, desc: 'Walmart', date: '2026-11-10' }, 'Walmart con T0TAL leído con cero y miles con coma');

const pali = `MAXI PALI CARTAGO
FACTURA ELECTRONICA 00100001010000012345
2026-11-09 17:03
JABON LAVAPLATOS           1 890,00
TOTAL AHORRO                 500,00
TOTAL A PAGAR
                          21.450,00
PUNTOS GANADOS 21`;
eq(parseReceipt(pali, T), { amount: 21450, desc: 'Maxi Palí', date: '2026-11-09' }, 'Maxi Palí, total en la línea siguiente e ignora Total ahorro');

const soda = `SODA LA ESQUINA
Casado con pollo            4.500,00
Fresco                      1.000,00
Total                       5.500,00
12-11-2026`;
eq(parseReceipt(soda, T), { amount: 5500, desc: 'Soda La Esquina', date: null }, 'comercio desconocido en primera línea; fecha futura descartada');

const sinTotal = `FERRETERIA EL MAR
tornillos 12 x 1.200,00
pintura 1 x 15.900,00
17/10/2026`;
eq(parseReceipt(sinTotal, T), { amount: 15900, desc: 'Ferretería', date: '2026-10-17' }, 'sin línea Total: el mayor con decimales');

eq(parseReceipt('   \n ', T), { amount: null, desc: null, date: null }, 'texto vacío');
eq(parseReceipt('TOTAL 3 ARTICULOS\n0212 9999 8888', T), { amount: null, desc: null, date: null }, 'sin monto creíble');

console.log(fails ? `${fails} FALLAS de ${total}` : `OCR-PARSE OK: ${total} comprobaciones`);
process.exit(fails ? 1 : 0);
