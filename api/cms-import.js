import * as XLSX from 'xlsx';

export const config = { maxDuration: 300 };

function checkAuth(req, res) {
  const key = process.env.AGENT_API_KEY;
  if (!key) return true;
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (token !== key) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkAuth(req, res)) return;
  const body = req.body || {};
  const { data, mimeType = 'excel', operation = 'create', completed = [], batchSize = 10 } = body;
  if (!data) return res.status(400).json({ error: 'data (base64 Excel of CSV tekst) is verplicht' });
  let allRows;
  try {
    const wb = mimeType === 'csv' ? XLSX.read(data, { type: 'string' }) : XLSX.read(data, { type: 'base64' });
    allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } catch (err) {
    return res.status(400).json({ error: 'Kon bestand niet parsen: ' + err.message });
  }
  const remaining = allRows.filter((_, i) => !completed.includes(i));
  const batch = remaining.slice(0, batchSize);
  if (!batch.length) {
    return res.status(200).json({ done: true, completed, remaining: 0, results: [], progress: { total: allRows.length, done: allRows.length } });
  }
  let created = 0, updated = 0, failed = 0;
  const results = [];
  try {
    const collectionId = body.collectionId || process.env.WEBFLOW_COLLECTION_ID || '';
    if (!collectionId) return res.status(400).json({ error: 'Geef collectionId mee of stel WEBFLOW_COLLECTION_ID in' });
    for (const item of batch) {
      const { _id, _collectionId, ...fieldData } = item;
      const isUpdate = operation !== 'create' && _id;
      const url = isUpdate
        ? 'https://api.webflow.com/v2/collections/' + collectionId + '/items/' + _id
        : 'https://api.webflow.com/v2/collections/' + collectionId + '/items';
      const r = await fetch(url, {
        method: isUpdate ? 'PATCH' : 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.Claude, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false, isDraft: true, fieldData }),
      });
      if (r.ok) {
        const d = await r.json();
        results.push({ success: true, id: d.id, row: item.name || item.slug || item._id || '?' });
        isUpdate ? updated++ : created++;
      } else {
        const e = await r.text();
        results.push({ success: false, error: 'HTTP ' + r.status + ': ' + e.slice(0, 150), row: item.name || item.slug || '?' });
        failed++;
      }
      await new Promise(r => setTimeout(r, 250));
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
  const newCompleted = [...completed, ...Array.from({ length: batch.length }, (_, i) => completed.length + i)];
  const done = newCompleted.length >= allRows.length;
  return res.status(200).json({
    done,
    completed: newCompleted,
    remaining: allRows.length - newCompleted.length,
    results,
    progress: { total: allRows.length, done: newCompleted.length },
    summary: { created, updated, failed },
  });
}