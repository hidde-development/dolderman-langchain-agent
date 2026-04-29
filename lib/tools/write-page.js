/**
 * TOOL: write_page
 * Databron: knowledge/-map (brand, seo, templates, knowledge)
 * Gebruik wanneer: je een nieuwe productieklare webpagina moet schrijven
 * Gebruik NIET voor: informatie ophalen of output valideren
 * Input: { brief, pageType, url, keywords }
 * Succes: { success: true, page: { meta_title, meta_description, slug, content } }
 * Fout:   { success: false, error }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { readKnowledge, readTemplate, readBriefing } from './load-knowledge.js';

const model = new ChatAnthropic({ apiKey: process.env.Claude ?? process.env.ANTHROPIC_API_KEY, model: 'claude-sonnet-4-6', temperature: null, topP: 1, maxTokens: 4096 });

export const writePageTool = tool(
  async ({ brief, pageType, url, keywords, templateCode = null }) => {
    try {
      const { brand, seo, templates, knowledge } = await readKnowledge();
      const isCaseType = pageType === 'case' || pageType === 'social proof snippet';

      // Klantspecifieke template uit templates/Tnn.md (heeft voorrang op generieke templates.md)
      const customTpl = templateCode ? readTemplate(templateCode) : null;
      const tplBlock = customTpl
        ? '## KLANTSPECIFIEKE TEMPLATE (' + templateCode + ') — leidend voor structuur\n\n' + customTpl + '\n\n---\n\n## Generieke fallback (alleen als sheet-template een aspect niet dekt)\n\n' + templates
        : templates;

      // Per-URL briefing uit briefings.md (geeft de agent contextuele intel: parent, kinderen, primair zoekwoord, opmerking)
      const urlBriefing = url ? readBriefing(url) : null;
      const briefingBlock = urlBriefing ? '\n\n---\n\n## URL-briefing (uit SEO-strategie)\n\n' + urlBriefing : '';

      const systemContent = isCaseType
        ? brand + "\n\n---\n\n" + tplBlock + "\n\n---\n\n" + knowledge + briefingBlock
        : brand + "\n\n---\n\n" + seo + "\n\n---\n\n" + tplBlock + "\n\n---\n\n" + knowledge + briefingBlock;
      const userPrompt = isCaseType
        ? 'Schrijf ' + (pageType === 'case' ? 'een casepagina' : 'een social proof snippet') + ' volgens het case/social proof schrijfregime in templates.md.\nSEO-regels zijn NIET van toepassing.\nURL (indien van toepassing): ' + url + '\n\nOpdracht:\n' + brief + '\n\nGeef ALLEEN dit JSON-object terug (geen markdown, geen uitleg):\n{"title":"...","content":"...(volledige Markdown-tekst)"}' 
        : 'Schrijf een complete webpagina.\nURL: ' + url + '\nPaginatype: ' + pageType + (templateCode ? '\nKlantspecifieke template: ' + templateCode + ' — volg de sectie-volgorde uit de KLANTSPECIFIEKE TEMPLATE bovenaan.' : '') + '\nZoekwoorden: ' + keywords + '\n\nOpdracht:\n' + brief + '\n\nGeef ALLEEN dit JSON-object terug (geen markdown code blocks, geen uitleg):\n{"meta_title":"...","meta_description":"...","slug":"...","content":"...(volledige Markdown-tekst)"}';
      const response = await model.invoke([
        { role: 'system', content: systemContent },
        { role: 'user',   content: userPrompt }
      ]);
      const raw = typeof response.content === 'string' ? response.content : (response.content[0]?.text || '');
      const match = raw.match(/{[\s\S]*}/);
      const page = match ? (() => { try { return JSON.parse(match[0]); } catch { return { content: raw }; } })() : { content: raw };
      return JSON.stringify({ success: true, page: { ...page, ai_generated: true, generated_at: new Date().toISOString(), template_used: templateCode || null } });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'write_page',
    description: 'Schrijf een complete webpagina op basis van een brief. Gebruikt brand-, SEO- en templateregels automatisch. Geef templateCode mee (bv. T01) wanneer een klantspecifieke paginastructuur uit templates/-map gebruikt moet worden.',
    schema: z.object({
      brief:        z.string().describe('Schrijfopdracht of geconsolideerde brief'),
      pageType:     z.enum(['dienstpagina','productpagina','artikelpagina','case','social proof snippet','overig']),
      url:          z.string().describe('Toekomstige URL van de pagina'),
      keywords:     z.string().describe('Zoekwoorden, kommagescheiden — mag leeg zijn voor case/social proof'),
      templateCode: z.string().nullable().optional().describe('Optionele klantspecifieke template-code uit de SEO-strategie (T01, T02, ...). Laat leeg voor generieke paginatypen.')
    })
  }
);