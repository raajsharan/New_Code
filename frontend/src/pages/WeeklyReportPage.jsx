import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { reportAPI } from '../services/api';
import { Download, RefreshCw, FileText, Zap } from 'lucide-react';

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';
const pct = (num, den) => (den ? ((num / den) * 100).toFixed(2) : '0.00');

function normalize(v) {
  return String(v || '').trim().toLowerCase();
}

function isActiveServerStatus(v) {
  const s = normalize(v);
  if (!s) return false;
  if (s.includes('powered off') || s.includes('not alive') || s.includes('inactive') || s.includes('decommissioned')) return false;
  return true;
}

function findNameConflictsByField(rows, field) {
  const counts = new Map();
  rows.forEach((r) => {
    const key = normalize(r?.[field]);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  let conflictRows = 0;
  counts.forEach((count) => {
    if (count > 1) conflictRows += count;
  });
  return conflictRows;
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight = 28) {
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineHeight));
  return lines.length * lineHeight;
}

const ASSET_PATCH_SCOPE = new Set(['vm', 'physical server', 'bare metal server', 'bare metal']);

function getPatchingBucket(v) {
  const s = normalize(v);
  if (!s) return null;
  if (s.includes('auto')) return 'auto';
  if (s.includes('beijing it team')) return 'beijing_it_team';
  if (s.includes('eol') && s.includes('patch')) return 'eol_no_patches';
  if (s.includes('exception')) return 'exception';
  if (s.includes('manual')) return 'manual';
  if (s.includes('on hold')) return 'on_hold';
  if (s.includes('onboard pending')) return 'onboard_pending';
  return null;
}

function createPatchingRow(location) {
  return {
    location,
    alive_powered_off: 0,
    auto: 0,
    beijing_it_team: 0,
    eol_no_patches: 0,
    exception: 0,
    manual: 0,
    on_hold: 0,
    onboard_pending: 0,
    uncategorized: 0,
    total_records: 0,
    total: 0,
    percentage: '0.00',
    overall_percentage: '0.00',
  };
}

function isNotApplicablePatching(v) {
  const s = normalize(v);
  return s.includes('not applicable') || s === 'na' || s === 'n/a';
}

function createPatchTotals() {
  return {
    alive_powered_off: 0,
    auto: 0,
    beijing_it_team: 0,
    eol_no_patches: 0,
    exception: 0,
    manual: 0,
    on_hold: 0,
    onboard_pending: 0,
    uncategorized: 0,
    total_records: 0,
    total: 0,
    percentage: '0.00',
    overall_percentage: '0.00',
  };
}

function finalizePatchTotals(row) {
  const categorizedTotal = row.alive_powered_off + row.auto + row.beijing_it_team + row.eol_no_patches + row.exception + row.manual + row.on_hold + row.onboard_pending;
  const totalRecords = row.total_records || categorizedTotal;
  const pctDenominator = row.auto + row.manual + row.onboard_pending + row.on_hold + row.alive_powered_off;
  return {
    ...row,
    total: categorizedTotal,
    total_records: totalRecords,
    percentage: pct(row.auto + row.manual, pctDenominator),
    overall_percentage: pct(row.auto + row.manual, pctDenominator),
  };
}

function addPatchBucket(target, patchingType) {
  const bucket = getPatchingBucket(patchingType);
  if (!bucket) return false;
  target[bucket] += 1;
  return true;
}

function PatchingStatusCard({ title, stats }) {
  const overallPct = Number(stats.overall_percentage || 0);
  const donutStyle = {
    background: `conic-gradient(#2563eb ${overallPct * 3.6}deg, #dbeafe ${overallPct * 3.6}deg 360deg)`,
  };
  const tiles = [
    { label: 'Auto', value: stats.auto, cls: 'bg-green-100 text-green-700' },
    { label: 'Manual', value: stats.manual, cls: 'bg-blue-100 text-blue-700' },
    { label: 'Exception', value: stats.exception, cls: 'bg-amber-100 text-amber-700' },
    { label: 'Beijing IT', value: stats.beijing_it_team, cls: 'bg-purple-100 text-purple-700' },
    { label: 'EOL - No Patches', value: stats.eol_no_patches, cls: 'bg-red-100 text-red-700' },
    { label: 'Pending', value: stats.onboard_pending, cls: 'bg-cyan-100 text-cyan-700' },
    { label: 'On Hold', value: stats.on_hold, cls: 'bg-gray-100 text-gray-700' },
    { label: 'Alive Powered Off', value: stats.alive_powered_off, cls: 'bg-orange-100 text-orange-700' },
  ];
  return (
    <div className="h-full rounded-2xl border border-gray-200 p-3 sm:p-4 bg-white shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
          <Zap size={18} className="text-blue-700" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-gray-800">{title}</p>
          <p className="text-sm text-gray-400">Patching type distribution</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,1fr)] gap-3 sm:gap-4">
        <div className="flex flex-col items-center justify-center">
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full p-3 sm:p-4" style={donutStyle}>
            <div className="w-full h-full rounded-full bg-white flex flex-col items-center justify-center text-center">
              <p className="text-xl sm:text-2xl font-bold text-gray-800">{Math.round(overallPct)}%</p>
              <p className="text-xs sm:text-sm text-gray-500">Auto + Manual</p>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-2 sm:mt-3">{stats.total_records} total records</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 content-start">
          {tiles.map((t) => (
            <div key={t.label} className={`rounded-xl sm:rounded-2xl px-2.5 sm:px-4 py-2.5 sm:py-3 ${t.cls}`}>
              <p className="text-base sm:text-lg font-bold leading-none">{t.value}</p>
              <p className="text-xs sm:text-sm mt-1.5 sm:mt-2 leading-tight">{t.label}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs sm:text-sm text-gray-700 mt-3 sm:mt-4">
        Overall: <span className="font-semibold">{stats.auto + stats.manual}</span> / (Auto + Manual + Pending + On Hold + Alive Powered Off) = <span className="font-semibold">{stats.overall_percentage}%</span>
      </p>
    </div>
  );
}

export default function WeeklyReportPage({ embedded = false }) {
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState([]);
  const [extAssets, setExtAssets] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [a, e] = await Promise.all([reportAPI.getAssets(), reportAPI.getExtAssets()]);
      setAssets(Array.isArray(a.data) ? a.data : []);
      setExtAssets(Array.isArray(e.data) ? e.data : []);
      setLastRefreshed(new Date().toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to load weekly report data');
    } finally {
      setLoading(false);
    }
  }, []);

  const metrics = useMemo(() => {
    const assetTotal = assets.length;
    const extTotal = extAssets.length;
    const assetPatchRows = assets.filter((r) => !isNotApplicablePatching(r.patching_type));
    const extPatchRows = extAssets.filter((r) => !isNotApplicablePatching(r.patching_type));
    const combinedPatchRows = [...assetPatchRows, ...extPatchRows];

    const assetActive = assets.filter((r) => isActiveServerStatus(r.server_status)).length;
    const extActive = extAssets.filter((r) => normalize(r.status) === 'active').length;

    const assetPwdMissing = assets.filter((r) => isBlank(r.asset_password)).length;
    const extPwdMissing = extAssets.filter((r) => isBlank(r.asset_password)).length;
    const assetWithPassword = assetTotal - assetPwdMissing;
    const extWithPassword = extTotal - extPwdMissing;
    const extMeInstalled = extAssets.filter((r) => !!r.me_installed_status).length;

    const assetHostedMissing = assets.filter((r) => isActiveServerStatus(r.server_status) && isBlank(r.hosted_ip)).length;
    const extHostedMissing = extAssets.filter((r) => normalize(r.status) === 'active' && isBlank(r.hosted_ip)).length;

    const assetOsHostnameConflicts = findNameConflictsByField(assets, 'os_hostname');

    const extAutoPatch = extPatchRows.filter((r) => normalize(r.patching_type).includes('auto')).length;
    const extManualPatch = extPatchRows.filter((r) => normalize(r.patching_type).includes('manual')).length;

    const assetPatchStatusRows = assetPatchRows.filter((r) => ASSET_PATCH_SCOPE.has(normalize(r.asset_type || '')));
    const assetPatchingTotals = createPatchTotals();
    assetPatchingTotals.total_records = assetPatchStatusRows.length;
    assetPatchStatusRows.forEach((r) => {
      if (normalize(r.server_status || '').includes('powered off')) assetPatchingTotals.alive_powered_off += 1;
      if (!addPatchBucket(assetPatchingTotals, r.patching_type)) {
        assetPatchingTotals.uncategorized += 1;
      }
    });
    const finalizedAssetPatchingTotals = finalizePatchTotals(assetPatchingTotals);

    const extPatchingTotals = createPatchTotals();
    extPatchingTotals.total_records = extPatchRows.length;
    extPatchRows.forEach((r) => {
      if (normalize(r.server_status || '') === 'powered off') extPatchingTotals.alive_powered_off += 1;
      if (!addPatchBucket(extPatchingTotals, r.patching_type)) {
        extPatchingTotals.uncategorized += 1;
      }
    });
    const finalizedExtPatchingTotals = finalizePatchTotals(extPatchingTotals);

    const overallPatchingTotals = createPatchTotals();
    overallPatchingTotals.total_records = combinedPatchRows.length;
    combinedPatchRows.forEach((r) => {
      if (normalize(r.server_status || '').includes('powered off')) overallPatchingTotals.alive_powered_off += 1;
      if (!addPatchBucket(overallPatchingTotals, r.patching_type)) {
        overallPatchingTotals.uncategorized += 1;
      }
    });
    const finalizedOverallPatchingTotals = finalizePatchTotals(overallPatchingTotals);

    const patchingByLocation = new Map();
    assetPatchRows.forEach((r) => {
      const location = (r.location || 'Unassigned').toString();
      if (!patchingByLocation.has(location)) {
        patchingByLocation.set(location, createPatchingRow(location));
      }
      const row = patchingByLocation.get(location);
      row.total_records += 1;
      if (!addPatchBucket(row, r.patching_type)) {
        row.uncategorized += 1;
      }
    });

    const locationPatchingRows = Array.from(patchingByLocation.values())
      .sort((a, b) => a.location.localeCompare(b.location))
      .map((row) => finalizePatchTotals(row));

    const locationPatchingTotals = locationPatchingRows.reduce((acc, row) => ({
      alive_powered_off: acc.alive_powered_off + row.alive_powered_off,
      auto: acc.auto + row.auto,
      beijing_it_team: acc.beijing_it_team + row.beijing_it_team,
      eol_no_patches: acc.eol_no_patches + row.eol_no_patches,
      exception: acc.exception + row.exception,
      manual: acc.manual + row.manual,
      on_hold: acc.on_hold + row.on_hold,
      onboard_pending: acc.onboard_pending + row.onboard_pending,
      total: acc.total + row.total,
    }), {
      alive_powered_off: 0,
      auto: 0,
      beijing_it_team: 0,
      eol_no_patches: 0,
      exception: 0,
      manual: 0,
      on_hold: 0,
      onboard_pending: 0,
      total: 0,
    });
    locationPatchingTotals.percentage = pct(locationPatchingTotals.auto + locationPatchingTotals.manual, locationPatchingTotals.total);

    const patchingByDepartment = new Map();
    assetPatchRows.forEach((r) => {
      const department = (r.department || 'Unassigned').toString();
      if (!patchingByDepartment.has(department)) {
        patchingByDepartment.set(department, createPatchingRow(department));
      }
      const row = patchingByDepartment.get(department);
      row.total_records += 1;
      if (!addPatchBucket(row, r.patching_type)) {
        row.uncategorized += 1;
      }
    });
    const departmentPatchingRows = Array.from(patchingByDepartment.values())
      .sort((a, b) => a.location.localeCompare(b.location))
      .map((row) => finalizePatchTotals(row));

    const departmentPatchingTotals = departmentPatchingRows.reduce((acc, row) => ({
      alive_powered_off: acc.alive_powered_off + row.alive_powered_off,
      auto: acc.auto + row.auto,
      beijing_it_team: acc.beijing_it_team + row.beijing_it_team,
      eol_no_patches: acc.eol_no_patches + row.eol_no_patches,
      exception: acc.exception + row.exception,
      manual: acc.manual + row.manual,
      on_hold: acc.on_hold + row.on_hold,
      onboard_pending: acc.onboard_pending + row.onboard_pending,
      total: acc.total + row.total,
    }), {
      alive_powered_off: 0,
      auto: 0,
      beijing_it_team: 0,
      eol_no_patches: 0,
      exception: 0,
      manual: 0,
      on_hold: 0,
      onboard_pending: 0,
      total: 0,
    });
    departmentPatchingTotals.percentage = pct(departmentPatchingTotals.auto + departmentPatchingTotals.manual, departmentPatchingTotals.total);

    return {
      assetTotal,
      extTotal,
      totalAll: assetTotal + extTotal,
      assetActive,
      extActive,
      totalActive: assetActive + extActive,
      assetWithPassword,
      extWithPassword,
      extMeInstalled,
      totalWithPassword: assetWithPassword + extWithPassword,
      assetPwdMissing,
      extPwdMissing,
      assetHostedMissing,
      extHostedMissing,
      assetOsHostnameConflicts,
      extAutoPatch,
      extManualPatch,
      assetPatchingTotals: finalizedAssetPatchingTotals,
      extPatchingTotals: finalizedExtPatchingTotals,
      overallPatchingTotals: finalizedOverallPatchingTotals,
      locationPatchingRows,
      locationPatchingTotals,
      departmentPatchingRows,
      departmentPatchingTotals,
      assetPasswordCoveragePct: pct(assetWithPassword, assetTotal),
      extPasswordCoveragePct: pct(extWithPassword, extTotal),
      overallPasswordCoveragePct: pct(assetWithPassword + extWithPassword, assetTotal + extTotal),
    };
  }, [assets, extAssets]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const downloadPng = useCallback(() => {
    if (!metrics.totalAll) {
      toast.error('Load report data first');
      return;
    }
    const rowH = 38;
    const section1H = 520;
    const patchRowsCount = metrics.locationPatchingRows.length + 1;
    const patchHeaderH = 46;
    const patchTableH = patchHeaderH + (patchRowsCount * rowH);
    const section2H = 350 + patchTableH;
    const width = 1600;
    const height = section1H + section2H + 80;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const leftColW = 280;
    const xPad = 18;
    const top = 30;

    // Outer table
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, top, width - 40, section1H + section2H);
    ctx.beginPath();
    ctx.moveTo(20 + leftColW, top);
    ctx.lineTo(20 + leftColW, top + section1H + section2H);
    ctx.moveTo(20, top + section1H);
    ctx.lineTo(width - 20, top + section1H);
    ctx.stroke();

    // Left labels
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 34px DejaVu Sans, sans-serif';
    ctx.fillText('Inventory & MSL', 40, top + 58);
    ctx.fillText('Extended Inventory', 40, top + section1H + 58);

    // Right section titles
    const rightX = 20 + leftColW + xPad;
    const rightW = width - rightX - 38;
    ctx.font = '700 34px DejaVu Sans, sans-serif';
    ctx.fillText('MSL OVERALL ACTIVE COUNT STATUS', rightX, top + 58);

    ctx.font = '500 30px DejaVu Sans, sans-serif';
    let y = top + 108;
    y += drawWrapped(ctx, `Total Inventory MSL Compliance`, rightX, y, rightW, 38);
    ctx.font = '700 32px DejaVu Sans, sans-serif';
    y += drawWrapped(ctx, `Asset Inventory Overall: ${metrics.assetWithPassword} out of ${metrics.assetTotal} X 100 = ${metrics.assetPasswordCoveragePct}%`, rightX, y + 10, rightW, 38);
    y += drawWrapped(ctx, `Ext. Asset Inventory Overall: ${metrics.extWithPassword} out of ${metrics.extTotal} X 100 = ${metrics.extPasswordCoveragePct}%`, rightX, y + 8, rightW, 38);
    y += drawWrapped(ctx, `Asset + Ext Overall: ${metrics.totalWithPassword} out of ${metrics.totalAll} X 100 = ${metrics.overallPasswordCoveragePct}%`, rightX, y + 12, rightW, 40);

    ctx.font = '500 28px DejaVu Sans, sans-serif';
    y += drawWrapped(ctx, `Total Asset Inventory Count: ${metrics.assetTotal}`, rightX, y + 8, rightW, 36);
    y += drawWrapped(ctx, `Asset inventory without password info: ${metrics.assetPwdMissing}`, rightX, y + 8, rightW, 36);
    y += drawWrapped(ctx, `Active assets missing Hosted/Hypervisor info: ${metrics.assetHostedMissing + metrics.extHostedMissing}`, rightX, y + 8, rightW, 36);
    y += drawWrapped(ctx, `Asset name conflicts by OS Hostname: ${metrics.assetOsHostnameConflicts}`, rightX, y + 8, rightW, 36);

    // Extended section
    const s2Y = top + section1H + 100;
    ctx.font = '700 32px DejaVu Sans, sans-serif';
    let y2 = s2Y;
    y2 += drawWrapped(ctx, `Total ${metrics.extTotal} endpoints`, rightX, y2, rightW, 38);
    y2 += drawWrapped(ctx, `Compliance: ${metrics.extWithPassword} out of ${metrics.extTotal} = ${metrics.extPasswordCoveragePct}%`, rightX, y2 + 8, rightW, 38);

    ctx.font = '500 28px DejaVu Sans, sans-serif';
    y2 += drawWrapped(ctx, `Password info received: ${metrics.extWithPassword} endpoints`, rightX, y2 + 8, rightW, 34);
    y2 += drawWrapped(ctx, `Auto patching: ${metrics.extAutoPatch} endpoints`, rightX, y2 + 6, rightW, 34);
    y2 += drawWrapped(ctx, `Manual patching: ${metrics.extManualPatch} endpoints`, rightX, y2 + 6, rightW, 34);
    y2 += drawWrapped(ctx, `ME Agent installed: ${metrics.extMeInstalled} endpoints`, rightX, y2 + 6, rightW, 34);

    // Location-wise patching table
    const tblX = rightX;
    const tblY = y2 + 24;
    const cols = [
      { key: 'location', label: 'Location \\ Patching Type', width: 210, align: 'left' },
      { key: 'alive_powered_off', label: 'Alive But Powered Off', width: 95, align: 'center' },
      { key: 'auto', label: 'Auto', width: 85, align: 'center' },
      { key: 'beijing_it_team', label: 'Beijing IT Team', width: 100, align: 'center' },
      { key: 'eol_no_patches', label: 'EOL - No Patches', width: 100, align: 'center' },
      { key: 'exception', label: 'Exception', width: 90, align: 'center' },
      { key: 'manual', label: 'Manual', width: 90, align: 'center' },
      { key: 'on_hold', label: 'On Hold', width: 90, align: 'center' },
      { key: 'onboard_pending', label: 'Onboard Pending', width: 95, align: 'center' },
      { key: 'total', label: 'Total', width: 85, align: 'center' },
      { key: 'percentage', label: 'Percentage', width: 100, align: 'center' },
    ];
    const tblW = cols.reduce((sum, col) => sum + col.width, 0);
    const rows = [
      ...metrics.locationPatchingRows,
      { location: 'Total', ...metrics.locationPatchingTotals },
    ];
    const tblH = patchHeaderH + (rows.length * rowH);

    ctx.fillStyle = '#e7eef8';
    ctx.fillRect(tblX, tblY, tblW, tblH);
    ctx.fillStyle = '#6aa5dd';
    ctx.fillRect(tblX, tblY, tblW, patchHeaderH);

    ctx.strokeStyle = '#334155';
    ctx.strokeRect(tblX, tblY, tblW, tblH);

    let x = tblX;
    cols.forEach((col) => {
      ctx.beginPath();
      ctx.moveTo(x, tblY);
      ctx.lineTo(x, tblY + tblH);
      ctx.stroke();
      x += col.width;
    });
    ctx.beginPath();
    ctx.moveTo(tblX + tblW, tblY);
    ctx.lineTo(tblX + tblW, tblY + tblH);
    ctx.stroke();

    for (let i = 0; i <= rows.length; i += 1) {
      const yLine = tblY + patchHeaderH + (i * rowH);
      ctx.beginPath();
      ctx.moveTo(tblX, yLine);
      ctx.lineTo(tblX + tblW, yLine);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 18px DejaVu Sans, sans-serif';
    x = tblX;
    cols.forEach((col) => {
      const tx = col.align === 'left' ? x + 8 : x + (col.width / 2);
      ctx.textAlign = col.align === 'left' ? 'left' : 'center';
      ctx.fillText(col.label, tx, tblY + 30);
      x += col.width;
    });

    ctx.fillStyle = '#0f172a';
    ctx.font = '600 18px DejaVu Sans, sans-serif';
    rows.forEach((row, rowIdx) => {
      x = tblX;
      const isTotal = row.location === 'Total';
      cols.forEach((col) => {
        const value = col.key === 'percentage' ? `${row[col.key]}%` : String(row[col.key] ?? '0');
        const tx = col.align === 'left' ? x + 8 : x + (col.width / 2);
        ctx.textAlign = col.align === 'left' ? 'left' : 'center';
        ctx.font = isTotal ? '700 18px DejaVu Sans, sans-serif' : '600 18px DejaVu Sans, sans-serif';
        ctx.fillText(value, tx, tblY + patchHeaderH + (rowIdx * rowH) + 25);
        x += col.width;
      });
    });
    ctx.textAlign = 'left';

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `weekly-report-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }, [metrics]);

  return (
    <div className="text-sm">
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-800 rounded-xl flex items-center justify-center">
              <FileText size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">Weekly Report</h1>
              <p className="text-sm text-gray-500 mt-0.5">Progress snapshot for Asset Inventory and Ext. Asset Inventory</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadData} className="btn-secondary text-xs" disabled={loading}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Loading...' : 'Refresh Data'}
            </button>
            <button onClick={downloadPng} className="btn-primary text-xs" disabled={!metrics.totalAll}>
              <Download size={13} />
              Download PNG
            </button>
          </div>
        </div>
      )}

      {embedded && null}

      <div className="text-xs text-gray-500 mb-3 mt-3">
        Last refreshed: {lastRefreshed || 'Not loaded'}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <tbody>
            <tr className="border-b border-gray-200">
              <td className="w-[230px] align-top px-4 py-4 border-r border-gray-200">
                <p className="font-semibold text-gray-800">Asset Inventory</p>
              </td>
              <td className="align-top px-4 py-4">
                <p className="font-bold text-gray-800 underline mb-3">MSL OVERALL ACTIVE COUNT STATUS</p>
                <p className="text-gray-700 mb-2">Total Inventory MSL Compliance:</p>
                <p className="text-gray-900 font-semibold">Asset Inventory Overall: {metrics.assetWithPassword} out of {metrics.assetTotal} X 100 = {metrics.assetPasswordCoveragePct}%</p>
                <p className="text-gray-900 font-semibold">Ext. Asset Inventory Overall: {metrics.extWithPassword} out of {metrics.extTotal} X 100 = {metrics.extPasswordCoveragePct}%</p>
                <p className="text-gray-900 font-bold mt-1">Asset + Ext Overall: {metrics.totalWithPassword} out of {metrics.totalAll} X 100 = {metrics.overallPasswordCoveragePct}%</p>

                <p className="text-gray-700 mt-4">Total Asset Inventory Count is <strong>{metrics.assetTotal}</strong></p>
                <p className="text-gray-700 mt-2">From active inventory, pending/follow-ups:</p>
                <p className="text-gray-700 mt-1">- <strong>{metrics.assetPwdMissing}</strong> assets do not have password info.</p>
                <p className="text-gray-700 mt-1">- Around <strong>{metrics.assetHostedMissing + metrics.extHostedMissing}</strong> active assets are missing hosted/hypervisor details.</p>
                <p className="text-gray-700 mt-1">- <strong>{metrics.assetOsHostnameConflicts}</strong> endpoints currently have name conflicts from OS Hostname.</p>
                <p className="text-gray-700 mt-1 font-semibold">- Follow-ups are in progress for pending info, name conflicts, and password issues.</p>
              </td>
            </tr>
            <tr>
              <td className="w-[230px] align-top px-4 py-4 border-r border-gray-200">
                <p className="font-semibold text-gray-800">Extended Inventory</p>
              </td>
              <td className="align-top px-4 py-4">
                <p className="text-gray-900 font-bold">Total {metrics.extTotal} endpoints</p>
                <p className="text-gray-700 mt-1">For <strong>{metrics.extWithPassword}</strong> endpoints, password info is received.</p>
                <p className="text-gray-900 font-bold mt-3">Compliance: {metrics.extWithPassword} out of {metrics.extTotal} = {metrics.extPasswordCoveragePct}%</p>
                <p className="text-gray-700 mt-2">- <strong>{metrics.extAutoPatch}</strong> VMs have been added to auto patching.</p>
                <p className="text-gray-700 mt-1">- <strong>{metrics.extManualPatch}</strong> VMs are marked as manual patching.</p>
                <p className="text-gray-700 mt-1">- <strong>{metrics.extMeInstalled}</strong> VMs have ME Agent installed.</p>
              </td>
            </tr>

            <tr>
              <td className="w-[170px] sm:w-[230px] align-top px-3 sm:px-4 py-4 border-r border-gray-200">
                <p className="font-semibold text-gray-800">Patch Management Solution</p>
              </td>
              <td className="align-top px-4 py-4">
                <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs sm:text-sm text-blue-900 leading-relaxed">
                  Overall Patch Compliance (Auto + Manual): <span className="font-bold">{metrics.overallPatchingTotals.auto + metrics.overallPatchingTotals.manual}</span> / {metrics.overallPatchingTotals.total_records} = <span className="font-bold">{metrics.overallPatchingTotals.overall_percentage}%</span>
                  <span className="text-xs text-blue-700 ml-2">(Not Applicable excluded)</span>
                </div>
                <div className="grid grid-cols-1 2xl:grid-cols-2 auto-rows-fr gap-3 mb-4">
                  <PatchingStatusCard title="Asset Inventory Patching Status" stats={metrics.assetPatchingTotals} />
                  <PatchingStatusCard title="Ext. Inventory Patching Status" stats={metrics.extPatchingTotals} />
                </div>

                <p className="text-sm font-bold text-blue-900 underline mb-2 break-words">Location wise auto/Manual-patching status:</p>
                <div className="overflow-x-auto mb-4 rounded-2xl border border-blue-100 shadow-sm">
                  <table className="w-full min-w-[980px] xl:min-w-[1180px] text-xs sm:text-sm overflow-hidden">
                    <thead className="bg-gradient-to-r from-blue-600 to-sky-500 text-white">
                      <tr>
                        <th className="text-left px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Location \ Patching Type</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Alive But Powered Off</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Auto</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Beijing IT Team</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">EOL - No Patches</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Exception</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Manual</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">On Hold</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Onboard Pending</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Total</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-blue-300 font-semibold whitespace-nowrap">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900">
                      {metrics.locationPatchingRows.map((row, idx) => (
                        <tr key={row.location} className={`${idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-900'} hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-gray-900 dark:text-slate-100 whitespace-nowrap">{row.location}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.alive_powered_off || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-semibold text-green-700 dark:text-green-400">{row.auto || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.beijing_it_team || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.eol_no_patches || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.exception || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-semibold text-blue-700 dark:text-blue-400">{row.manual || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.on_hold || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.onboard_pending || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white">{row.total}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white">{row.percentage}%</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 dark:bg-slate-700/60">
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 font-bold text-gray-900 dark:text-white">Total</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.locationPatchingTotals.alive_powered_off || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-green-700 dark:text-green-400">{metrics.locationPatchingTotals.auto || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.locationPatchingTotals.beijing_it_team || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.locationPatchingTotals.eol_no_patches || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.locationPatchingTotals.exception || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-blue-700 dark:text-blue-400">{metrics.locationPatchingTotals.manual || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.locationPatchingTotals.on_hold || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.locationPatchingTotals.onboard_pending || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-slate-900 dark:text-white">{metrics.locationPatchingTotals.total}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-slate-900 dark:text-white">{metrics.locationPatchingTotals.percentage}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-sm font-bold text-blue-900 underline mb-2 break-words">DEPARTMENTS PATCHING ONBOARDING STATUS:</p>
                <div className="overflow-x-auto rounded-2xl border border-blue-100 shadow-sm">
                  <table className="w-full min-w-[980px] xl:min-w-[1180px] text-xs sm:text-sm overflow-hidden">
                    <thead className="bg-gradient-to-r from-indigo-600 to-blue-500 text-white">
                      <tr>
                        <th className="text-left px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Department \ Patching Type</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Alive But Powered Off</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Auto</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Beijing IT Team</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">EOL - No Patches</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Exception</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Manual</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">On Hold</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Onboard Pending</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Total</th>
                        <th className="text-center px-2 sm:px-3 py-2.5 sm:py-3 border-b border-indigo-300 font-semibold whitespace-nowrap">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-900">
                      {metrics.departmentPatchingRows.map((row, idx) => (
                        <tr key={row.location} className={`${idx % 2 === 0 ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-900'} hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors`}>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 font-semibold text-gray-900 dark:text-slate-100 whitespace-nowrap">{row.location}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.alive_powered_off || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-semibold text-green-700 dark:text-green-400">{row.auto || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.beijing_it_team || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.eol_no_patches || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.exception || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-semibold text-blue-700 dark:text-blue-400">{row.manual || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.on_hold || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center dark:text-slate-300">{row.onboard_pending || '-'}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white">{row.total}</td>
                          <td className="px-2 sm:px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 text-center font-bold text-slate-900 dark:text-white">{row.percentage}%</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100 dark:bg-slate-700/60">
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 font-bold text-gray-900 dark:text-white">Total</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.departmentPatchingTotals.alive_powered_off || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-green-700 dark:text-green-400">{metrics.departmentPatchingTotals.auto || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.departmentPatchingTotals.beijing_it_team || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.departmentPatchingTotals.eol_no_patches || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.departmentPatchingTotals.exception || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-blue-700 dark:text-blue-400">{metrics.departmentPatchingTotals.manual || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.departmentPatchingTotals.on_hold || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold dark:text-slate-200">{metrics.departmentPatchingTotals.onboard_pending || '-'}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-slate-900 dark:text-white">{metrics.departmentPatchingTotals.total}</td>
                        <td className="px-3 py-3 border-t border-slate-300 dark:border-slate-600 text-center font-bold text-slate-900 dark:text-white">{metrics.departmentPatchingTotals.percentage}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

