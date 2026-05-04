import { writePageTool } from '../lib/tools/write-page.js';
import { fetchUrlTool } from '../lib/tools/fetch-url.js';
import { consolidateTool } from '../lib/tools/consolidate.js';
import { runReview } from '../lib/review.js';

export const config = { maxDuration: 300 };

function checkAuth(req, res) {
  const key = process.env.AGENT_API_KEY;
  if (!key) return true;
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (token !== key) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

// Bronpagina's ophalen + consolideren tot één werkbare brief.
// Retourneert { brief, failed } — failed bevat URLs die niet bereikbaar waren (403/timeout).
// Geen sources → brief blijft zoals hij is.
// 1 source  → bronpagina als context aan brief toegevoegd.
// 2+ sources → consolidate_sources samenvatting + brief als aanvulling.
async function prepareBrief({ brief, sources, pageType, url }) {
  if (!sources || !sources.length) return { brief: brief || "", failed: [] };
  const fetched = [];
  const failed = [];
  for (const u of sources) {
    try {
      const r = JSON.parse(await fetchUrlTool.func({ url: u }));
      if (r.success) fetched.push({ url: u, title: r.title || "", content: r.content || "" });
      else failed.push(u);
    } catch (_) { failed.push(u); }
  }
  if (fetched.length >= 2) {
    try {
      const c = JSON.parse(await consolidateTool.func({ sources: fetched, topic: pageType + " over " + url }));
      if (c.success) return { brief: c.brief + (brief ? "\n\nAanvullende opdracht:\n" + brief : ""), failed };
    } catch (_) {}
  }
  if (fetched.length === 1) {
    return { brief: "Bronpagina:\n" + fetched[0].content + (brief ? "\n\nAanvullende opdracht:\n" + brief : ""), failed };
  }
  return { brief: brief || "", failed };
}

// write_page direct aanroepen (niet via agent.invoke). Voorkomt schema-mismatches:
// LangChain liet de LLM tool-args invullen op basis van natuurlijke taal,
// waarbij verplichte velden incidenteel ontbraken. Direct aanroepen passeert
// alle gestructureerde velden 1-op-1.
async function callWritePage({ brief, pageType, url, keywords, templateCode, style }) {
  const styledBrief = (brief || "") + (style ? "\n\nStijl: " + style : "");
  const out = JSON.parse(await writePageTool.func({
    brief: styledBrief, pageType, url, keywords: keywords || "", templateCode: templateCode || null
  }));
  if (!out.success) throw new Error(out.error || "write_page faalde");
  return out.page;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!checkAuth(req, res)) return;

  const {
    url, pageType = "dienstpagina", keywords = "",
    brief = "", sources = [], style = "feitelijk",
    templateCode = null,
  } = req.body || {};
  // Invoerlimieten — voorkomt onverwacht grote Claude-calls en kostenoverschrijding.
  const safeBrief    = String(brief    || "").slice(0, 8000);
  const safeKeywords = String(keywords || "").slice(0, 500);
  const safeSources  = Array.isArray(sources) ? sources.slice(0, 5) : [];

  try {
    // 1. Brief verrijken (sources fetch + consolidate)
    const { brief: enrichedBrief, failed: sourcesFailed } = await prepareBrief({ brief: safeBrief, sources: safeSources, pageType, url });

    // 2. Writer → v1
    const pageV1 = await callWritePage({ brief: enrichedBrief, pageType, url, keywords, templateCode, style });
    const contentV1 = pageV1.content || "";

    // 3. Review (graceful: als review-pipeline faalt, lever v1 + reviewWarning)
    let review = null;
    let reviewWarning = null;
    try {
      review = await runReview({ content: contentV1, brief: { url, pageType, keywords: safeKeywords, brief: safeBrief, style } });
    } catch (reviewErr) {
      reviewWarning = "Review-pipeline tijdelijk niet beschikbaar — pagina geleverd zonder automatische review: " + reviewErr.message;
    }

    let finalPage = pageV1;
    let finalContent = contentV1;
    let revised = false;

    // 4. Auto-revise bij oranje (max 1x) — alleen als review succesvol was
    if (review && review.verdict === "orange" && review.revisionPrompt) {
      try {
        const revisedBrief = enrichedBrief + "\n\nREVISIE-INSTRUCTIE: " + review.revisionPrompt + "\n\nBESTAANDE OUTPUT:\n" + contentV1;
        const pageV2 = await callWritePage({ brief: revisedBrief, pageType, url, keywords: safeKeywords, templateCode, style });
        finalPage = pageV2;
        finalContent = pageV2.content || "";
        revised = true;
      } catch (_) { /* revise mislukt → lever v1 */ }
    }

    return res.status(200).json({
      success: true,
      content: finalContent,
      page: finalPage,
      ...(review ? { verdict: review.verdict, reports: review.reports, summary: review.summary, revised } : {}),
      style,
      ...(reviewWarning ? { reviewWarning } : {}),
      ...(sourcesFailed.length ? { sourceWarnings: sourcesFailed } : {}),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}