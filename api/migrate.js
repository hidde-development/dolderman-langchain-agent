import { createContentAgent } from '../lib/agent.js';

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

  const { urls = [], completed = [], batchSize = 3, pageType = "dienstpagina", keywords = "" } = req.body || {};

  const remaining = urls.filter(u => !completed.includes(u));
  const batch = remaining.slice(0, batchSize);

  if (!batch.length) {
    return res.status(200).json({ done: true, completed, remaining: [], results: [], progress: { total: urls.length, done: urls.length } });
  }

  const agent = createContentAgent();
  const results = [];

  for (const url of batch) {
    try {
      const input = "Haal de pagina op, herschrijf deze volledig op basis van de merkregels en templates, en publiceer als concept.\nURL: " + url + "\nPaginatype: " + pageType + "\nZoekwoorden: " + keywords;
      const result = await agent.invoke({ input });
      results.push({ url, success: true, content: result.output });
    } catch (err) {
      results.push({ url, success: false, error: err.message });
    }
  }

  const newCompleted = [...completed, ...batch];
  const done = newCompleted.length >= urls.length;

  return res.status(200).json({
    done,
    completed: newCompleted,
    remaining: remaining.slice(batchSize),
    results,
    progress: { total: urls.length, done: newCompleted.length },
  });
}