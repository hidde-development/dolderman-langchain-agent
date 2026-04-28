/**
 * TOOL: export_redirects
 * Databron: redirect-map (output van map_redirects)
 * Gebruik wanneer: een redirect-map klaar is en als configuratiebestand geëxporteerd moet worden
 * Gebruik NIET voor: het aanmaken of matchen van redirects
 * Input: { redirects: [{from,to}][], permanent?: boolean }
 * Succes: { success: true, content: string, filename: string, count: number }
 * Fout:   { success: false, error: string }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const REDIRECT_FORMAT = 'vercel';

export const exportRedirectsTool = tool(
  async ({ redirects, permanent = true }) => {
    try {
      let content, filename;
      if (REDIRECT_FORMAT === 'vercel') {
        const json = { redirects: redirects.map(r => ({
          source: r.from.startsWith('/') ? r.from : '/' + r.from,
          destination: r.to.startsWith('/') ? r.to : '/' + r.to,
          permanent,
        })) };
        content = JSON.stringify(json, null, 2);
        filename = 'vercel-redirects.json';
      } else if (REDIRECT_FORMAT === 'netlify') {
        content = redirects.map(r => r.from + '  ' + r.to + '  ' + (permanent ? '301' : '302')).join('\n');
        filename = '_redirects';
      } else if (REDIRECT_FORMAT === 'htaccess') {
        const lines = ['<IfModule mod_rewrite.c>', 'RewriteEngine On'];
        redirects.forEach(r => lines.push('Redirect ' + (permanent ? '301' : '302') + ' ' + r.from + ' ' + r.to));
        lines.push('</IfModule>');
        content = lines.join('\n');
        filename = '.htaccess';
      } else if (REDIRECT_FORMAT === 'nginx') {
        content = redirects.map(r => 'location = ' + r.from + ' { return ' + (permanent ? '301' : '302') + ' ' + r.to + '; }').join('\n');
        filename = 'nginx-redirects.conf';
      }
      return JSON.stringify({ success: true, content, filename: filename || 'vercel.json', count: redirects.length });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'export_redirects',
    description: 'Exporteer een redirect-map als vercel.json. Gebruik na map_redirects.',
    schema: z.object({
      redirects: z.array(z.object({ from: z.string(), to: z.string() })).describe('Redirect-paren'),
      permanent: z.boolean().optional().describe('301 permanent (true) of 302 tijdelijk (false)')
    })
  }
);