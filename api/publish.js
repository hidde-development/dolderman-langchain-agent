import { publishCmsTool } from '../lib/tools/publish-cms.js';

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

  const { page, verdict, pageType = "dienstpagina" } = req.body || {};
  if (!page) return res.status(400).json({ error: 'page is verplicht' });
  if (verdict === 'red') return res.status(403).json({ error: 'Kan rode output niet publiceren — vereist human review/edit.' });

  try {
    const result = await publishCmsTool.invoke({ page, pageType });
    const parsed = typeof result === "string" ? JSON.parse(result) : result;
    return res.status(parsed.success ? 200 : 500).json(parsed);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}