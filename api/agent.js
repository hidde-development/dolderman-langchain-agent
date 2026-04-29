import { createContentAgent } from '../lib/agent.js';
import { runReview } from '../lib/review.js';

export const config = { maxDuration: 300 };

function checkAuth(req, res) {
  const key = process.env.AGENT_API_KEY;
  if (!key) return true;
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (token !== key) { res.status(401).json({ error: 'Unauthorized' }); return false; }
  return true;
}

function buildInput({ url, pageType, keywords, brief, sources, style, templateCode }) {
  const tplLine = templateCode ? "\nKlantspecifieke template: " + templateCode + " (gebruik via write_page templateCode-veld)." : "";
  return sources.length
    ? "Consolideer de volgende " + sources.length + " bronpagina's en schrijf één sterke pagina.\nStijl: " + style + "\nURL: " + url + "\nPaginatype: " + pageType + "\nZoekwoorden: " + keywords + tplLine + "\nBronnen om op te halen: " + sources.join(", ")
    : "Schrijf een " + pageType + ".\nStijl: " + style + "\nURL: " + url + "\nZoekwoorden: " + keywords + tplLine + "\nOpdracht: " + brief;
}

function extractPage(output) {
  if (typeof output !== "string") return { content: String(output || "") };
  const match = output.match(/\{[\s\S]*\}/);
  if (!match) return { content: output };
  try { return JSON.parse(match[0]); } catch { return { content: output }; }
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
    const agent = createContentAgent();
    // 1. Writer → v1
    const v1 = await agent.invoke({ input: buildInput({ url, pageType, keywords, brief, sources, style, templateCode }) });
    const pageV1 = extractPage(v1.output);
    const contentV1 = pageV1.content || v1.output;

    // 2. Review (3 critics parallel + synthesizer)
    const review = await runReview({ content: contentV1, brief: { url, pageType, keywords, brief, style } });

    let finalPage = pageV1;
    let finalContent = contentV1;
    let revised = false;

    // 3. Auto-revise bij oranje (max 1x)
    if (review.verdict === "orange" && review.revisionPrompt) {
      const reviseInput = buildInput({ url, pageType, keywords, brief, sources, style, templateCode }) +
        "\n\nREVISIE-INSTRUCTIE: " + review.revisionPrompt +
        "\n\nBESTAANDE OUTPUT:\n" + contentV1;
      const v2 = await agent.invoke({ input: reviseInput });
      const pageV2 = extractPage(v2.output);
      finalPage = pageV2;
      finalContent = pageV2.content || v2.output;
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