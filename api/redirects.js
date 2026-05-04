import { ChatAnthropic } from '@langchain/anthropic';

export const config = { maxDuration: 300 };

function checkAuth(req, res) {
  const key = process.env.AGENT_API_KEY;
  if (!key) return true;
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (token !== key) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

const model = new ChatAnthropic({ apiKey: process.env.Claude ?? process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5-20251001', maxTokens: 4096, temperature: null, topP: 1 });

async function mapUrls(oldUrls, newUrls) {
  const batchSize = 50;
  const allRedirects = [], allUnmatched = [];
  for (let i = 0; i < oldUrls.length; i += batchSize) {
    const batch = oldUrls.slice(i, i + batchSize);
    const prompt = 'Match elke oude URL aan de meest passende nieuwe URL.\n' +
      'Geef terug als JSON: {"redirects":[{"from":"/oud","to":"/nieuw","confidence":0-100}],"unmatched":[]}\n\n' +
      'OUD:\n' + batch.join('\n') + '\n\nNIEUW:\n' + newUrls.join('\n') + '\n\nAlleen JSON.';
    const resp = await model.invoke([{ role: 'user', content: prompt }]);
    const m = resp.content.match(/{[\s\S]*}/);
    if (m) { const p = JSON.parse(m[0]); allRedirects.push(...(p.redirects||[])); allUnmatched.push(...(p.unmatched||[])); }
  }
  return { redirects: allRedirects, unmatched: allUnmatched };
}

function formatFile(redirects, permanent) {
  if ('vercel' === 'vercel') {
    return JSON.stringify({ redirects: redirects.map(r => ({
      source: r.from.startsWith('/') ? r.from : '/' + r.from,
      destination: r.to.startsWith('/') ? r.to : '/' + r.to,
      permanent,
    })) }, null, 2);
  } else if ('vercel' === 'netlify') {
    return redirects.map(r => r.from + '  ' + r.to + '  ' + (permanent ? '301' : '302')).join('\n');
  } else if ('vercel' === 'htaccess') {
    return ['<IfModule mod_rewrite.c>','RewriteEngine On',...redirects.map(r => 'Redirect ' + (permanent?'301':'302') + ' ' + r.from + ' ' + r.to),'</IfModule>'].join('\n');
  } else if ('vercel' === 'nginx') {
    return redirects.map(r => 'location = ' + r.from + ' { return ' + (permanent?'301':'302') + ' ' + r.to + '; }').join('\n');
  }
  return '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkAuth(req, res)) return;
  const { oldUrls = [], newUrls = [], permanent = true } = req.body || {};
  if (!oldUrls.length || !newUrls.length) return res.status(400).json({ error: 'oldUrls en newUrls zijn verplicht' });
  try {
    const { redirects, unmatched } = await mapUrls(oldUrls, newUrls);
    const content = formatFile(redirects, permanent);
    return res.status(200).json({ content, filename: 'vercel-redirects.json', count: redirects.length, unmatched, redirects });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}