import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (d) => api.post('/auth/login', d),
  register: (d) => api.post('/auth/register', d),
  me: () => api.get('/auth/me'),
  updateProfile: (d) => api.put('/auth/profile', d),
  uploadAvatar: (file) => {
    const fd = new FormData(); fd.append('avatar', file);
    return api.post('/auth/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteAvatar: () => api.delete('/auth/profile/avatar'),
  changePassword: (d) => api.put('/auth/change-password', d),
  verifyPassword: (password) => api.post('/auth/verify-password', { password }),
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
  getVmCountByDepartment: () => api.get('/dashboard/vm-count-by-department'),
  getVmCountByLocation: () => api.get('/dashboard/vm-count-by-location'),
};

export const deploymentAPI = {
  getEndpoints: (params) => api.get('/deployment/endpoints', { params }),
  test: (d) => api.post('/deployment/test', d),
  deploy: (d) => api.post('/deployment/deploy', d),
  verifyInstallation: (d) => api.post('/deployment/verify-installation', d),
  getJob: (id) => api.get(`/deployment/jobs/${id}`),
  checkDuplicates: (endpoint_ids) => api.post('/deployment/check-duplicates', { endpoint_ids }),
  getMeConfig: () => api.get('/deployment/me-config'),
  saveMeConfig: (d) => api.put('/deployment/me-config', d),
  testMeConnection: (d) => api.post('/deployment/me-test-connection', d),
  getMeAgentStatus: (params) => api.get('/deployment/me-agent-status', { params }),
};

export const serviceStatusAPI = {
  getVmStatuses: (params) => api.get('/service-status/vms', { params }),
  liveCheck: (d) => api.post('/service-status/live-check', d),
};

export const assetsAPI = {
  getAll: (params) => api.get('/assets', { params }),
  getById: (id) => api.get(`/assets/${id}`),
  create: (d) => api.post('/assets', d),
  update: (id, d) => api.put(`/assets/${id}`, d),
  delete: (id) => api.delete(`/assets/${id}`),
  bulkDelete: (ids) => api.delete('/assets/bulk', { data: { ids } }),
  bulkUpdate: (d) => api.post('/assets/bulk-update', d),
  getBulkJob: (jobId) => api.get(`/assets/bulk-update/${jobId}`),
  checkDuplicate: (params) => api.get('/assets/check-duplicate', { params }),
  exportCSV: (params) => api.get('/assets/export/csv', { params, responseType: 'blob' }),
  downloadTemplate: () => api.get('/assets/export/csv-template', { responseType: 'blob' }),
  importCSV: (file, meta = {}) => {
    const fd = new FormData(); fd.append('file', file);
    Object.entries(meta || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    return api.post('/assets/import/csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  previewImportCSV: (file, meta = {}) => {
    const fd = new FormData(); fd.append('file', file);
    Object.entries(meta || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    return api.post('/assets/import/csv/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importSelectedCSVRows: (rows, options = {}) =>
    api.post('/assets/import/csv/import-selected', { rows, ...options }),
};

export const dropdownsAPI = {
  getAll: () => api.get('/dropdowns/all'),
  addItem: (table, d) => api.post(`/dropdowns/${table}`, d),
  updateItem: (table, id, d) => api.put(`/dropdowns/${table}/${id}`, d),
  deleteItem: (table, id) => api.delete(`/dropdowns/${table}/${id}`),
  addOsVersion: (d) => api.post('/dropdowns/os_versions/add', d),
  updateOsVersion: (id, d) => api.put(`/dropdowns/os_versions/${id}`, d),
  deleteOsVersion: (id) => api.delete(`/dropdowns/os_versions/${id}`),
};

export const usersAPI = {
  getAll: () => api.get('/users'),
  create: (d) => api.post('/users/create', d),
  update: (id, d) => api.put(`/users/${id}`, d),
  delete: (id) => api.delete(`/users/${id}`),
  updatePagePerms: (id, d) => api.put(`/users/${id}/page-permissions`, d),
  updatePasswordVisibility: (id, d) => api.put(`/users/${id}/password-visibility`, d),
  resetPassword: (id, d) => api.put(`/users/${id}/reset-password`, d),
  getAllPermissions: () => api.get('/users/permissions/all'),
};

export const settingsAPI = {
  getBranding: () => api.get('/settings/branding'),
  updateBranding: (d) => api.put('/settings/branding', d),
  uploadLogo: (file) => {
    const fd = new FormData(); fd.append('logo', file);
    return api.post('/settings/branding/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteLogo: () => api.delete('/settings/branding/logo'),
  getCustomFields: () => api.get('/settings/custom-fields'),
  createCustomField: (d) => api.post('/settings/custom-fields', d),
  updateCustomField: (id, d) => api.put(`/settings/custom-fields/${id}`, d),
  deleteCustomField: (id) => api.delete(`/settings/custom-fields/${id}`),
  getOmeOptions:            ()       => api.get('/settings/ome-options'),
  saveOmeOptions:           (opts)   => api.put('/settings/ome-options', opts),
  // Backward-compatible aliases.
  getOemOptions:            ()       => api.get('/settings/ome-options'),
  saveOemOptions:           (opts)   => api.put('/settings/ome-options', opts),
  getBuiltinFieldTypes:     (scope)  => api.get(`/settings/builtin-field-types/${scope}`),
  saveBuiltinFieldTypes:    (scope, d) => api.put(`/settings/builtin-field-types/${scope}`, d),
  getFieldLayout:           () => api.get('/settings/field-layout'),
  updateFieldLayout:        (layout) => api.put('/settings/field-layout', layout),
  getPhysicalFieldLayout:   () => api.get('/settings/physical-field-layout'),
  updatePhysicalFieldLayout:(layout) => api.put('/settings/physical-field-layout', layout),
  getExtFieldLayout:        () => api.get('/settings/ext-field-layout'),
  updateExtFieldLayout:     (layout) => api.put('/settings/ext-field-layout', layout),
  getDbCommands: () => api.get('/settings/db-commands'),
  getDashboardIcons: () => api.get('/settings/dashboard-icons'),
  saveDashboardIcons: (icons) => api.put('/settings/dashboard-icons', icons),
  getPageIcons:  () => api.get('/settings/page-icons'),
  savePageIcons: (icons) => api.put('/settings/page-icons', icons),
  getColumnConfig:  (scope) => api.get(`/settings/column-config/${scope}`),
  saveColumnConfig: (scope, cfg) => api.put(`/settings/column-config/${scope}`, cfg),
  getDashboardComplianceConfig: () => api.get('/settings/dashboard-compliance-config'),
  saveDashboardComplianceConfig: (cfg) => api.put('/settings/dashboard-compliance-config', cfg),
};

export default api;

export const physicalAssetsAPI = {
  getAll: () => api.get('/physical-assets'),
  getByIP: (ip) => api.get(`/physical-assets/by-ip/${encodeURIComponent(ip)}`),
  getById: (id) => api.get(`/physical-assets/${id}`),
  create: (d) => api.post('/physical-assets', d),
  update: (id, d) => api.put(`/physical-assets/${id}`, d),
  delete: (id) => api.delete(`/physical-assets/${id}`),
  getModels: () => api.get('/physical-assets/models/all'),
  addModel: (d) => api.post('/physical-assets/models/add', d),
  updateModel: (id, d) => api.put(`/physical-assets/models/${id}`, d),
  deleteModel: (id) => api.delete(`/physical-assets/models/${id}`),
  getCustomFields: () => api.get('/physical-assets/custom-fields/all'),
  createCustomField: (d) => api.post('/physical-assets/custom-fields/add', d),
  updateCustomField: (id, d) => api.put(`/physical-assets/custom-fields/${id}`, d),
  deleteCustomField: (id) => api.delete(`/physical-assets/custom-fields/${id}`),
  // Import / Export
  exportCSV:       (params) => api.get('/physical-assets/export/csv', { params, responseType: 'blob' }),
  downloadTemplate: ()      => api.get('/physical-assets/export/csv-template', { responseType: 'blob' }),
  importCSV: (file) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/physical-assets/import/csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
};

export const extendedInventoryAPI = {
  getAll:   (params) => api.get('/extended-inventory', { params }),
  getById:  (id)     => api.get(`/extended-inventory/${id}`),
  create: (d) => api.post('/extended-inventory', d),
  update: (id, d) => api.put(`/extended-inventory/${id}`, d),
  delete: (id) => api.delete(`/extended-inventory/${id}`),
  bulkDelete: (ids) => api.delete('/extended-inventory/bulk', { data: { ids } }),
  checkDuplicate: (params) => api.get('/extended-inventory/check-duplicate', { params }),
  exportCSV: (params) => api.get('/extended-inventory/export/csv', { params, responseType: 'blob' }),
  downloadTemplate: () => api.get('/extended-inventory/export/csv-template', { responseType: 'blob' }),
  importCSV: (file, meta = {}) => {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    return api.post('/extended-inventory/import/csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  previewImportCSV: (file, meta = {}) => {
    const fd = new FormData(); fd.append('file', file);
    Object.entries(meta || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) fd.append(k, String(v));
    });
    return api.post('/extended-inventory/import/csv/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importSelectedCSVRows: (rows, options = {}) =>
    api.post('/extended-inventory/import/csv/import-selected', { rows, ...options }),
  getCustomFields: () => api.get('/extended-inventory/custom-fields/all'),
  createCustomField: (d) => api.post('/extended-inventory/custom-fields/add', d),
  updateCustomField: (id, d) => api.put(`/extended-inventory/custom-fields/${id}`, d),
  deleteCustomField: (id) => api.delete(`/extended-inventory/custom-fields/${id}`),
  bulkUpdate: (d) => api.post('/extended-inventory/bulk-update', d),
  getBulkJob: (jobId) => api.get(`/extended-inventory/bulk-update/${jobId}`),
};

export const reportAPI = {
  getAssets:   () => api.get('/assets/report'),
  getExtAssets:() => api.get('/extended-inventory/report'),
};

export const assetTagsAPI = {
  getRanges:           ()       => api.get('/asset-tags/ranges'),
  getAvailable:        (dept)   => api.get(`/asset-tags/available/${encodeURIComponent(dept)}`),
  getDepartmentStats:  (params) => api.get('/asset-tags/department-stats', { params }),
  validate:            (params) => api.get('/asset-tags/validate', { params }),
};

// Transfer log and not-transferred list (additions to extendedInventoryAPI)
// These are appended to the existing extendedInventoryAPI object but since it's
// already declared, we export them separately for use in TransferPage
export const transferAPI = {
  getNotTransferred: () => api.get('/extended-inventory/not-transferred'),
  getTransferLog:    () => api.get('/extended-inventory/transfer-log'),
  transfer: (id, data) => api.post(`/extended-inventory/${id}/transfer`, data),
};

export const deptRangesAPI = {
  getAll:          ()         => api.get('/dept-ranges'),
  getDepartments:  ()         => api.get('/dept-ranges/departments'),
  getTagUsage:     (dept)     => api.get(`/dept-ranges/tag-usage/${encodeURIComponent(dept)}`),
  save:            (data)     => api.post('/dept-ranges', data),
  update:          (id, data) => api.put(`/dept-ranges/${id}`, data),
  delete:          (id, force)=> api.delete(`/dept-ranges/${id}${force ? '?force=1' : ''}`),
  validate:        (data)     => api.post('/dept-ranges/validate', data),
};

export const backupAPI = {
  getSchedule:  ()     => api.get('/backup/schedule'),
  saveSchedule: (d)    => api.put('/backup/schedule', d),
  getLog:       ()     => api.get('/backup/log'),
  pgDump:       ()     => api.post('/backup/pg-dump', {}, { responseType: 'blob' }),
  csvExport:    (opts) => api.post('/backup/csv-export', opts),
};

export const notificationsAPI = {
  getConfig:     ()    => api.get('/notifications/config'),
  saveSmtp:      (d)   => api.put('/notifications/smtp', d),
  saveTemplates: (d)   => api.put('/notifications/templates', d),
  saveTriggers:  (d)   => api.put('/notifications/triggers', d),
  testSend:      (d)   => api.post('/notifications/test', d),
};

export const vmwareAPI = {
  getSources: () => api.get('/vmware/sources'),
  createSource: (d) => api.post('/vmware/sources', d),
  updateSource: (id, d) => api.put(`/vmware/sources/${id}`, d),
  deleteSource: (id) => api.delete(`/vmware/sources/${id}`),
  getSchedule: () => api.get('/vmware/schedule'),
  saveSchedule: (d) => api.put('/vmware/schedule', d),
  scan: (source_id = null) =>
    api.post(
      '/vmware/scan',
      source_id === null || source_id === undefined || String(source_id).trim() === ''
        ? {}
        : { source_id }
    ),
  getCandidates: (status = 'new') => api.get('/vmware/candidates', { params: { status } }),
  importToExt: (candidate_ids) => api.post('/vmware/import-to-ext', { candidate_ids }),
  downloadCsvTemplate: () => api.get('/vmware/csv-template', { responseType: 'blob' }),
  testConnection: (d) => api.post('/vmware/test-connection', d),
  importCsvCandidates: (file) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/vmware/import-csv-candidates', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  // Legacy endpoints retained for compatibility with older screens.
  discover: (d) => api.post('/vmware/discover', d),
  importVMs: (d) => api.post('/vmware/import', d),
};

export const auditAPI = {
  getLogs: (params) => api.get('/audit', { params }),
  getEntityLogs: (entityType, entityId, params) =>
    api.get(`/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, { params }),
};

export const importAuditAPI = {
  getReports: (params) => api.get('/import-audit', { params }),
};

export const beijingAssetsAPI = {
  getAll:           (params) => api.get('/beijing-assets', { params }),
  getById:          (id)     => api.get(`/beijing-assets/${id}`),
  create:           (data)   => api.post('/beijing-assets', data),
  update:           (id, d)  => api.put(`/beijing-assets/${id}`, d),
  exportCSV:        (params) => api.get('/beijing-assets/export/csv', { params, responseType: 'blob' }),
  remove:           (id)     => api.delete(`/beijing-assets/${id}`),
  bulkDelete:       (ids)    => api.delete('/beijing-assets/bulk', { data: { ids } }),
  migrate:          (ids, migration_comment) => api.post('/beijing-assets/migrate', { ids, migration_comment }),
  checkDuplicate:   (params) => api.get('/beijing-assets/check-duplicate', { params }),
  downloadTemplate: ()       => api.get('/beijing-assets/template', { responseType: 'blob' }),
  importFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/beijing-assets/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  previewFile: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/beijing-assets/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importSelected: (rows) => api.post('/beijing-assets/import-selected', { rows }),
  getBatches:         ()          => api.get('/beijing-assets/batches'),
  getCustomFields:    ()          => api.get('/beijing-assets/custom-fields'),
  addCustomField:     (d)         => api.post('/beijing-assets/custom-fields/add', d),
  updateCustomField:  (id, d)     => api.put(`/beijing-assets/custom-fields/${id}`, d),
  deleteCustomField:  (id)        => api.delete(`/beijing-assets/custom-fields/${id}`),
};

export const deletedItemsAPI = {
  getAll:    (params) => api.get('/deleted-items', { params }),
  hardDelete:(id)     => api.delete(`/deleted-items/${id}`),
  restore:   (id)     => api.post(`/deleted-items/restore/${id}`),
};

export const savedViewsAPI = {
  getAll:  (scope)         => api.get('/saved-views', { params: { scope } }),
  create:  (d)             => api.post('/saved-views', d),
  update:  (id, d)         => api.put(`/saved-views/${id}`, d),
  remove:  (id)            => api.delete(`/saved-views/${id}`),
};

export const tenableAPI = {
  import: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post('/tenable/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getImports:   ()  => api.get('/tenable/imports'),
  deleteImport: (id) => api.delete(`/tenable/imports/${id}`),
  getReport:    ()  => api.get('/tenable/report'),
  getTotalIPs:  ()  => api.get('/tenable/total-ips'),
};
