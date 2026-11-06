'use strict';
/**
 * مزوّد الإشعارات (نمط adapter). صاحب السيارة ما بيشوف رقم المرسل،
 * والمرسل ما بيشوف رقم صاحب السيارة: الرقم بس بيصل لهون.
 *   NOTIFIER=console     → طباعة بالـlog (تطوير)
 *   NOTIFIER=twilio-sms  → TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM
 *   NOTIFIER=whatsapp    → WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE (+WHATSAPP_LANG)
 */
const cfg = require('./config');

const sent = []; // آخر الرسائل (للاختبارات والتطوير فقط)

const providers = {
  console: {
    async send(phone, body, kind) {
      sent.push({ phone, body, kind });
      if (sent.length > 50) sent.shift();
      console.log(`[notify:${kind}] → ${phone.slice(0, 7)}***\n${body}\n`);
    },
  },
  'twilio-sms': {
    async send(phone, body) {
      const { TWILIO_SID: sid, TWILIO_TOKEN: tok, TWILIO_FROM: from } = process.env;
      if (!sid || !tok || !from) throw new Error('إعدادات Twilio ناقصة');
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: phone, From: from, Body: body }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`Twilio ${r.status}`);
    },
  },
  whatsapp: {
    // واتساب Business يلزمه "قالب" معتمد من Meta. القالب: {{1}} اسم السيارة، {{2}} النص، {{3}} الرابط
    async send(phone, body, kind, parts) {
      const { WHATSAPP_TOKEN: tok, WHATSAPP_PHONE_ID: pid, WHATSAPP_TEMPLATE: tpl } = process.env;
      if (!tok || !pid || !tpl) throw new Error('إعدادات واتساب ناقصة');
      const p = parts || { label: '', text: body, url: '' };
      const r = await fetch(`https://graph.facebook.com/v21.0/${pid}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', to: phone.replace('+', ''), type: 'template',
          template: { name: tpl, language: { code: process.env.WHATSAPP_LANG || 'ar' },
            components: [{ type: 'body', parameters: [p.label, p.text, p.url].map((t) => ({ type: 'text', text: t })) }] },
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw new Error(`WhatsApp ${r.status}`);
    },
  },
};

const provider = providers[cfg.notifier];
if (!provider) throw new Error(`NOTIFIER غير معروف: ${cfg.notifier}`);

module.exports = {
  sent,
  send: (phone, body, kind = 'msg', parts) => provider.send(phone, body, kind, parts),
};
