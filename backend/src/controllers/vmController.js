const { exportVmInventoryCsv, resolveConfig } = require('../services/vmwareService');

async function exportVmCsv(req, res) {
  try {
    const config = resolveConfig(req.query || {});
    const { csv, count } = await exportVmInventoryCsv(config);
    const fileName = `vmware-vm-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-VM-Count', String(count));
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'VM export failed' });
  }
}

module.exports = { exportVmCsv };
