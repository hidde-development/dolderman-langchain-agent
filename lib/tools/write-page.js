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
import { readKnowledge } from './load-knowledge.js';

const model = new ChatAnthropic({ model: 'claude-sonnet-4-6', maxTokens: 4096 });

export const writePageTool = tool(
  async ({ brief, pageType, url, keywords }) => {
    try {
      const { brand, seo, templates, knowledge } = await readKnowledge();
      const isCaseType = pageType === 'case' || pageType === 'social proof snippet';
      const systemContent = isCaseType
        ? brand + "\n\n---\n\n" + templates + "\n\n---\n\n" + knowledge
        : brand + "\n\n---\n\n" + seo + "\n\n---\n\n" + templates + "\n\n---\n\n" + knowledge;
      const userPrompt = isCaseType
        ? 'Schrijf ' + (pageType === 'case' ? 'een casepagina' : 'een social proof snippet') + ' volgens het case/social proof schrijfregime in templates.md.\nSEO-regels zijn NIET van toepassing.\nURL (indien van toepassing): ' + url + '\n\nOpdracht:\n' + brief + '\n\nGeef ALLEEN dit JSON-object terug (geen markdown, geen uitleg):\n{"title":"...","content":"...(volledige Markdown-tekst)"}' 
        : 'Schrijf een complete webpagina.\nURL: ' + url + '\nPaginatype: ' + pageType + '\nZoekwoorden: ' + keywords + '\n\nOpdracht:\n' + brief + '\n\nGeef ALLEEN dit JSON-object terug (geen markdown code blocks, geen uitleg):\n{"meta_title":"...","meta_description":"...","slug":"...","content":"...(volledige Markdown-tekst)"}';
      const response = await model.invoke([
        { role: 'system', content: systemContent },
        { role: 'user',   content: userPrompt }
      ]);
      const raw = typeof response.content === 'string' ? response.content : (response.content[0]?.text || '');
      const match = raw.match(/{[\s\S]*}/);
      const page = match ? (() => { try { return JSON.parse(match[0]); } catch { return { content: raw }; } })() : { content: raw };
      return JSON.stringify({ success: true, page: { ...page, ai_generated: true, generated_at: new Date().toISOString() } });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'write_page',
    description: 'Schrijf een complete webpagina op basis van een brief. Gebruikt brand-, SEO- en templateregels automatisch. Gebruik NIET voor het ophalen van bronmateriaal.',
    schema: z.object({
      brief:    z.string().describe('Schrijfopdracht of geconsolideerde brief'),
      pageType: z.enum(['dienstpagina','productpagina','artikelpagina','case','social proof snippet','overig']),
      url:      z.string().describe('Toekomstige URL van de pagina'),
      keywords: z.string().describe('Zoekwoorden, kommagescheiden — mag leeg zijn voor case/social proof')
    })
  }
);