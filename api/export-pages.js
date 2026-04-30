import { excelExportTool } from '../lib/tools/excel-export.js';

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

  const { pages, rows, filename = 'generated-pages.xlsx' } = req.body || {};
  const exportRows = Array.isArray(rows) ? rows : Array.isArray(pages) ? pages : null;
  if (!exportRows || !exportRows.length) {
    return res.status(400).json({ error: 'pages of rows array is verplicht' });
  }

  try {
    const resultRaw = await excelExportTool.func({ rows: exportRows, filename });
    const result = typeof resultRaw === 'string' ? JSON.parse(resultRaw) : resultRaw;
    if (!result.success) return res.status(500).json({ success: false, error: result.error || 'Excel export failed' });
    const fileBuffer = Buffer.from(result.base64, 'base64');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(fileBuffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
