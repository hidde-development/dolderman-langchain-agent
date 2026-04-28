/**
 * TOOL: parse_input
 * Databron: sitemap XML tekst, CSV tekst of base64-encoded Excel
 * Gebruik wanneer: je een URL-lijst nodig hebt uit een sitemap, CSV of Excel
 * Gebruik NIET voor: al verwerkte URL-lijsten of individuele URLs
 * Input: { type: "sitemap"|"csv"|"excel", data: string, urlColumn?: string }
 * Succes: { success: true, urls: string[], count: number }
 * Fout:   { success: false, error: string }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';

export const parseInputTool = tool(
  async ({ type, data, urlColumn = 'Address' }) => {
    try {
      let urls = [];
      if (type === 'sitemap') {
        const parser = new XMLParser({ ignoreAttributes: false });
        const result = parser.parse(data);
        const entries = result.urlset?.url || result.sitemapindex?.sitemap || [];
        const arr = Array.isArray(entries) ? entries : [entries];
        urls = arr.map(e => e.loc || '').filter(Boolean);
      } else if (type === 'csv') {
        const lines = data.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const idx = Math.max(0, headers.findIndex(h => h === urlColumn || h.toLowerCase() === 'address' || h.toLowerCase() === 'url'));
        urls = lines.slice(1)
          .map(l => (l.split(',')[idx] || '').trim().replace(/^"|"$/g, ''))
          .filter(u => u.startsWith('http'));
      } else if (type === 'excel') {
        const wb = XLSX.read(data, { type: 'base64' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const key = Object.keys(rows[0] || {}).find(k => k === urlColumn || k.toLowerCase() === 'address' || k.toLowerCase() === 'url') || Object.keys(rows[0] || {})[0];
        urls = rows.map(r => String(r[key] || '')).filter(u => u.startsWith('http'));
      }
      return JSON.stringify({ success: true, urls, count: urls.length });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'parse_input',
    description: 'Extraheer een URL-lijst uit een sitemap XML, CSV of Excel. Gebruik dit als eerste stap bij redirect-mapping of bulk-migraties.',
    schema: z.object({
      type:      z.enum(['sitemap','csv','excel']),
      data:      z.string().describe('Sitemap XML als tekst, CSV als tekst, of Excel als base64'),
      urlColumn: z.string().optional().describe('Kolomnaam met URL. Standaard: Address (Screaming Frog)')
    })
  }
);