import { runReview } from '../lib/review.js';
import { writePageTool } from '../lib/tools/write-page.js';
import { fetchUrlTool } from '../lib/tools/fetch-url.js';
import { consolidateTool } from '../lib/tools/consolidate.js';

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

  const {
    url, pageType = "dienstpagina", keywords = "",
    brief = "", sources = [], style = "feitelijk",
    templateCode = null,
  } = req.body || {};

  try {
    const sourceDocs = [];
    if (Array.isArray(sources) && sources.length) {
      for (const sourceUrl of sources) {
        const fetchedRaw = await fetchUrlTool.func({ url: sourceUrl });
        const fetched = typeof fetchedRaw === 'string' ? JSON.parse(fetchedRaw) : fetchedRaw;
        if (!fetched.success) throw new Error('fetch_url_content failed for ' + sourceUrl + ': ' + fetched.error);
        sourceDocs.push({ url: fetched.url, title: fetched.title, content: fetched.content });
      }
    }

    let effectiveBrief = brief;
    if (sourceDocs.length) {
      const consolidatedRaw = await consolidateTool.func({ sources: sourceDocs, topic: pageType });
      const consolidated = typeof consolidatedRaw === 'string' ? JSON.parse(consolidatedRaw) : consolidatedRaw;
      if (!consolidated.success) throw new Error(consolidated.error || 'consolidate_sources failed');
      effectiveBrief = consolidated.brief + '\n\nOpdracht:\n' + brief;
    }

    // 1. Writer → v1 using the structured write_page tool directly
    const v1raw = await writePageTool.func({ brief: effectiveBrief, pageType, url, keywords, templateCode });
    const v1 = typeof v1raw === 'string' ? JSON.parse(v1raw) : v1raw;
    if (!v1.success) throw new Error(v1.error || 'write_page failed');
    const pageV1 = v1.page || { content: '' };
    const contentV1 = pageV1.content || '';

    // 2. Review (3 critics parallel + synthesizer)
    const review = await runReview({ content: contentV1, brief: { url, pageType, keywords, brief, style } });

    let finalPage = pageV1;
    let finalContent = contentV1;
    let revised = false;

    // 3. Auto-revise bij oranje (max 1x)
    if (review.verdict === "orange" && review.revisionPrompt) {
      const revisedBrief = brief + "\n\nREVISIE-INSTRUCTIE: " + review.revisionPrompt + "\n\nBESTAANDE OUTPUT:\n" + contentV1;
      const v2raw = await writePageTool.func({ brief: revisedBrief, pageType, url, keywords, templateCode });
      const v2 = typeof v2raw === 'string' ? JSON.parse(v2raw) : v2raw;
      if (!v2.success) throw new Error(v2.error || 'write_page revision failed');
      const pageV2 = v2.page || { content: '' };
      finalPage = pageV2;
      finalContent = pageV2.content || '';
      revised = true;
    }

    return res.status(200).json({
      success: true,
      content: finalContent,
      page: finalPage,
      verdict: review.verdict,
      reports: review.reports,
      summary: review.summary,
      revised,
      style,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}