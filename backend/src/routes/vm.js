const router = require('express').Router();
const { auth, requireAdmin } = require('../middleware/auth');
const { exportVmCsv } = require('../controllers/vmController');

router.get('/export', auth, requireAdmin, exportVmCsv);

module.exports = router;
