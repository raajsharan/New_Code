/**
 * /api/notifications - Email notification settings + test send
 */
const router = require('express').Router();
const pool = require('../config/database');
const { auth, requireAdmin } = require('../middleware/auth');

async function getSetting(key) {
  try {
    const r = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key=$1", [key]);
    return r.rows.length ? JSON.parse(r.rows[0].setting_value) : null;
  } catch {
    return null;
  }
}

async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value) VALUES ($1,$2)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value=$2, updated_at=NOW()`,
    [key, JSON.stringify(value)]
  );
}

function normalizeSmtpConfig(raw = {}) {
  const port = parseInt(raw.port, 10) || 587;
  const secure = typeof raw.secure === 'boolean' ? raw.secure : port === 465;
  return { ...raw, port, secure };
}

function buildTransportOptions(raw = {}) {
  const smtp = normalizeSmtpConfig(raw);
  const secure = smtp.secure === true || smtp.port === 465;
  const options = {
    host: smtp.host,
    port: smtp.port,
    secure,
    auth: smtp.username ? { user: smtp.username, pass: smtp.password } : undefined,
    tls: { servername: smtp.host },
  };

  if (!secure) options.requireTLS = false;

  return options;
}

async function sendMailWithConfig(smtpConfig, message) {
  const nodemailer = require('nodemailer');
  const smtp = normalizeSmtpConfig(smtpConfig);
  const primaryOptions = buildTransportOptions(smtp);

  try {
    return await nodemailer.createTransport(primaryOptions).sendMail(message);
  } catch (error) {
    const msg = String(error?.message || '');
    const wrongVersion = /wrong version number/i.test(msg);
    const shouldRetryAsStartTls = wrongVersion && primaryOptions.secure && smtp.port !== 465;
    const shouldRetryAsImplicitTls = wrongVersion && !primaryOptions.secure && smtp.port === 465;

    if (!shouldRetryAsStartTls && !shouldRetryAsImplicitTls) throw error;

    const fallbackOptions = { ...primaryOptions, secure: !primaryOptions.secure };
    if (fallbackOptions.secure) delete fallbackOptions.requireTLS;
    else fallbackOptions.requireTLS = false;

    return nodemailer.createTransport(fallbackOptions).sendMail(message);
  }
}

router.get('/config', auth, requireAdmin, async (req, res) => {
  try {
    const smtp = (await getSetting('smtp_config')) || {};
    const templates = (await getSetting('email_templates')) || defaultTemplates();
    const triggers = (await getSetting('email_triggers')) || defaultTriggers();
    res.json({ smtp, templates, triggers });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/smtp', auth, requireAdmin, async (req, res) => {
  try {
    const { host, port, secure, username, password, from_name, from_email } = req.body;
    await setSetting('smtp_config', normalizeSmtpConfig({
      host,
      port,
      secure: !!secure,
      username,
      password,
      from_name,
      from_email,
    }));
    res.json({ message: 'SMTP config saved' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/templates', auth, requireAdmin, async (req, res) => {
  try {
    await setSetting('email_templates', req.body);
    res.json({ message: 'Templates saved' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/triggers', auth, requireAdmin, async (req, res) => {
  try {
    await setSetting('email_triggers', req.body);
    res.json({ message: 'Triggers saved' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/test', auth, requireAdmin, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient email required' });

  try {
    const smtp = normalizeSmtpConfig(await getSetting('smtp_config'));
    if (!smtp?.host) return res.status(400).json({ error: 'SMTP not configured yet' });

    await sendMailWithConfig(smtp, {
      from: `"${smtp.from_name || 'InfraInventory'}" <${smtp.from_email || smtp.username}>`,
      to,
      subject: 'InfraInventory - SMTP Test',
      html: `<p>Your email notifications are configured correctly.</p><p>Server: <strong>${smtp.host}:${smtp.port}</strong></p>`,
    });

    res.json({ message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Send failed' });
  }
});

router.post('/send', auth, async (req, res) => {
  try {
    await triggerNotification(req.body.event, req.body.asset);
    res.json({ message: 'Sent' });
  } catch {
    res.json({ message: 'Skipped' });
  }
});

async function triggerNotification(event, asset) {
  try {
    const smtp = normalizeSmtpConfig(await getSetting('smtp_config'));
    const triggers = (await getSetting('email_triggers')) || defaultTriggers();
    const templates = (await getSetting('email_templates')) || defaultTemplates();

    const trigger = triggers.find((t) => t.event === event && t.enabled);
    if (!trigger || !trigger.recipients?.length) return;
    if (!smtp?.host) return;

    const template = templates.find((t) => t.id === trigger.template_id) || templates[0];
    const html = renderTemplate(template.body_html, asset);
    const subject = renderTemplate(template.subject, asset);

    await sendMailWithConfig(smtp, {
      from: `"${smtp.from_name || 'InfraInventory'}" <${smtp.from_email || smtp.username}>`,
      to: trigger.recipients.join(', '),
      subject,
      html,
    });
  } catch (e) {
    console.warn('Email notification failed:', e.message);
  }
}

function renderTemplate(tmpl, asset) {
  if (!tmpl || !asset) return tmpl || '';
  return tmpl
    .replace(/\{\{vm_name\}\}/g, asset.vm_name || asset.os_hostname || '-')
    .replace(/\{\{ip_address\}\}/g, asset.ip_address || '-')
    .replace(/\{\{asset_type\}\}/g, asset.asset_type || '-')
    .replace(/\{\{department\}\}/g, asset.department || '-')
    .replace(/\{\{location\}\}/g, asset.location || '-')
    .replace(/\{\{status\}\}/g, asset.server_status || '-')
    .replace(/\{\{submitted_by\}\}/g, asset.submitted_by || '-')
    .replace(/\{\{os_type\}\}/g, asset.os_type || '-')
    .replace(/\{\{os_version\}\}/g, asset.os_version || '-')
    .replace(/\{\{serial\}\}/g, asset.serial_number || '-')
    .replace(/\{\{asset_tag\}\}/g, asset.asset_tag || '-');
}

function defaultTriggers() {
  return [
    { id: 'new_asset', event: 'new_asset', label: 'New Asset Added', enabled: false, recipients: [], template_id: 'tpl_new' },
    { id: 'asset_updated', event: 'asset_updated', label: 'Asset Updated', enabled: false, recipients: [], template_id: 'tpl_update' },
    { id: 'new_ext_asset', event: 'new_ext_asset', label: 'New Ext. Asset', enabled: false, recipients: [], template_id: 'tpl_ext_new' },
    { id: 'transfer', event: 'transfer', label: 'Asset Transferred', enabled: false, recipients: [], template_id: 'tpl_transfer' },
  ];
}

function defaultTemplates() {
  return [
    {
      id: 'tpl_new',
      name: 'New Asset Added',
      subject: '[InfraInventory] New Asset: {{vm_name}} ({{ip_address}})',
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<h2 style="background:#1e40af;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0">New Asset Registered</h2>
<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#6b7280;width:140px">VM / Asset Name</td><td style="padding:6px 0;font-weight:600">{{vm_name}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">IP Address</td><td style="padding:6px 0;font-family:monospace">{{ip_address}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Asset Type</td><td style="padding:6px 0">{{asset_type}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Department</td><td style="padding:6px 0">{{department}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Location</td><td style="padding:6px 0">{{location}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Status</td><td style="padding:6px 0">{{status}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Submitted By</td><td style="padding:6px 0">{{submitted_by}}</td></tr>
</table>
</div></div>`,
    },
    {
      id: 'tpl_update',
      name: 'Asset Updated',
      subject: '[InfraInventory] Asset Updated: {{vm_name}} ({{ip_address}})',
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<h2 style="background:#059669;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0">Asset Record Updated</h2>
<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">
<p style="color:#374151;margin-top:0">An asset record has been updated in the inventory.</p>
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#6b7280;width:140px">VM / Asset Name</td><td style="padding:6px 0;font-weight:600">{{vm_name}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">IP Address</td><td style="padding:6px 0;font-family:monospace">{{ip_address}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Department</td><td style="padding:6px 0">{{department}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Updated By</td><td style="padding:6px 0">{{submitted_by}}</td></tr>
</table>
</div></div>`,
    },
    {
      id: 'tpl_ext_new',
      name: 'New Ext. Asset',
      subject: '[InfraInventory] New Extended Asset: {{vm_name}} ({{ip_address}})',
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<h2 style="background:#4f46e5;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0">New Extended Inventory Record</h2>
<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#6b7280;width:140px">Asset Name</td><td style="padding:6px 0;font-weight:600">{{vm_name}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">IP Address</td><td style="padding:6px 0;font-family:monospace">{{ip_address}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Department</td><td style="padding:6px 0">{{department}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Submitted By</td><td style="padding:6px 0">{{submitted_by}}</td></tr>
</table>
</div></div>`,
    },
    {
      id: 'tpl_transfer',
      name: 'Asset Transferred',
      subject: '[InfraInventory] Asset Transferred to Inventory: {{vm_name}}',
      body_html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
<h2 style="background:#d97706;color:white;padding:16px 20px;margin:0;border-radius:8px 8px 0 0">Asset Transferred to Main Inventory</h2>
<div style="border:1px solid #e5e7eb;border-top:0;padding:20px;border-radius:0 0 8px 8px">
<table style="width:100%;border-collapse:collapse">
<tr><td style="padding:6px 0;color:#6b7280;width:140px">Asset Name</td><td style="padding:6px 0;font-weight:600">{{vm_name}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">IP Address</td><td style="padding:6px 0;font-family:monospace">{{ip_address}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Asset Tag</td><td style="padding:6px 0">{{asset_tag}}</td></tr>
<tr><td style="padding:6px 0;color:#6b7280">Transferred By</td><td style="padding:6px 0">{{submitted_by}}</td></tr>
</table>
</div></div>`,
    },
  ];
}

module.exports = router;
module.exports.triggerNotification = triggerNotification;