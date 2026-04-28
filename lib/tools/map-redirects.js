/**
 * TOOL: map_redirects
 * Databron: twee URL-lijsten (oud + nieuw)
 * Gebruik wanneer: je 301-redirects wil aanmaken van oude naar nieuwe sitestructuur
 * Gebruik NIET voor: 1-op-1 URL-vervangingen of al bekende redirect-paren
 * Input: { oldUrls: string[], newUrls: string[] }
 * Succes: { success: true, redirects: [{from,to,confidence,reason}][], unmatched: string[] }
 * Fout:   { success: false, error: string }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({
  apiKey: process.env.Claude ?? process.env.ANTHROPIC_API_KEY,
  topP: undefined,
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 4096,
});

export const mapRedirectsTool = tool(
  async ({ oldUrls, newUrls }) => {
    try {
      const batchSize = 50;
      const allRedirects = [];
      const allUnmatched = [];
      for (let i = 0; i < oldUrls.length; i += batchSize) {
        const batch = oldUrls.slice(i, i + batchSize);
        const prompt = 'Match elke oude URL aan de meest passende nieuwe URL op basis van slug en pad.\n' +
          'Geef terug als JSON: {"redirects":[{"from":"/oud","to":"/nieuw","confidence":0-100,"reason":"..."}],"unmatched":[]}\n' +
          'Geen match mogelijk → zet in unmatched.\n\n' +
          'OUDE URLS:\n' + batch.join('\n') + '\n\nNIEUWE URLS:\n' + newUrls.join('\n') +
          '\n\nGeef ALLEEN JSON terug.';
        const response = await model.invoke([{ role: 'user', content: prompt }]);
        const match = response.content.match(/{[\s\S]*}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          allRedirects.push(...(parsed.redirects || []));
          allUnmatched.push(...(parsed.unmatched || []));
        }
      }
      return JSON.stringify({ success: true, redirects: allRedirects, unmatched: allUnmatched });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'map_redirects',
    description: 'Match oude URLs aan nieuwe URLs voor 301-redirects via AI. Verwerkt in batches van 50.',
    schema: z.object({
      oldUrls: z.array(z.string()).describe('Lijst van oude URLs of paden'),
      newUrls: z.array(z.string()).describe('Lijst van nieuwe URLs of paden')
    })
  }
);