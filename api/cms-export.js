import * as XLSX from 'xlsx';

export const config = { maxDuration: 60 };

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
  let rows = [];
  try {
    const collectionId = req.body?.collectionId || process.env.WEBFLOW_COLLECTION_ID || '';
    if (!collectionId) return res.status(400).json({ error: 'Geef collectionId mee of stel WEBFLOW_COLLECTION_ID in' });
    let allItems = [], offset = 0;
    while (true) {
      const r = await fetch('https://api.webflow.com/v2/collections/' + collectionId + '/items?limit=100&offset=' + offset, {
        headers: { 'Authorization': 'Bearer ' + process.env.Claude }
      });
      if (!r.ok) return res.status(500).json({ error: 'Webflow fout: ' + r.status });
      const d = await r.json();
      allItems.push(...(d.items || []));
      if (!d.pagination?.next) break;
      offset += 100;
    }
    rows = allItems.map(it => ({ _id: it.id, ...it.fieldData }));
    if (!rows.length) return res.status(200).json({ base64: '', filename: 'export.xlsx', rows: 0, columns: [] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Export');
    const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return res.status(200).json({ base64, filename: 'cms-export.xlsx', rows: rows.length, columns: Object.keys(rows[0]) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}