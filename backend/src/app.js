require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth',               require('./routes/auth'));
app.use('/api/dashboard',          require('./routes/dashboard'));
app.use('/api/assets',             require('./routes/assets'));
app.use('/api/dropdowns',          require('./routes/dropdowns'));
app.use('/api/users',              require('./routes/users'));
app.use('/api/settings',           require('./routes/settings'));
app.use('/api/physical-assets',    require('./routes/physical_assets'));
app.use('/api/extended-inventory', require('./routes/extended_inventory'));
app.use('/api/asset-tags',         require('./routes/asset_tags'));
app.use('/api/dept-ranges',        require('./routes/dept_ranges'));
app.use('/api/backup',             require('./routes/backup'));
app.use('/api/notifications',      require('./routes/notifications'));
app.use('/api/audit',              require('./routes/audit'));
app.use('/api/import-audit',       require('./routes/import_audit'));
app.use('/api/saved-views',        require('./routes/saved_views'));
app.use('/api/deployment',         require('./routes/deployment'));
const vmwareRoutes = require('./routes/vmware');
app.use('/api/vmware',             vmwareRoutes);
app.use('/api/vm',                 require('./routes/vm'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 InfraInventory API on port ${PORT}`));
if (typeof vmwareRoutes.startScheduler === 'function') vmwareRoutes.startScheduler();
module.exports = app;

