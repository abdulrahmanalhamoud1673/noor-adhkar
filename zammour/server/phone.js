'use strict';
// أرقام الأردن: 07[789]XXXXXXX  →  +9627[789]XXXXXXX
// 77 أورنج، 78 أمنية، 79 زين.
function normalizeJO(input) {
  let s = String(input ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('962')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  return /^7[789]\d{7}$/.test(s) ? '+962' + s : null;
}
const mask = (e164) => e164.replace(/^(\+962)(\d{2})\d{4}(\d{3})$/, '$1 $2 ••• •$3');
module.exports = { normalizeJO, mask };
