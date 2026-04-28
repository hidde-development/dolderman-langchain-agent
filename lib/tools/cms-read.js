/**
 * TOOL: cms_read
 * Databron: Webflow Data API v2
 * Gebruik wanneer: je alle items uit een CMS-collectie wil ophalen (voor export of analyse)
 * Gebruik NIET voor: aanmaken of bijwerken van items
 * Input: { collectionId?: string, limit?: number }
 * Succes: { success: true, rows: object[], fields: string[], count: number }
 * Fout:   { success: false, error: string }
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const cmsReadTool = tool(
  async ({ collectionId, limit = 1000 }) => {
    const col = collectionId || '';
    let rows = [], fields = [];
    try {
      const collectionId = col || process.env.WEBFLOW_COLLECTION_ID || '';
      if (!collectionId) throw new Error('Stel WEBFLOW_COLLECTION_ID in als env var of geef collectionId mee.');
      let allItems = [], offset = 0;
      while (true) {
        const res = await fetch('https://api.webflow.com/v2/collections/' + collectionId + '/items?limit=100&offset=' + offset, {
          headers: { 'Authorization': 'Bearer ' + process.env.WEBFLOW_API_KEY }
        });
        if (!res.ok) throw new Error('Webflow API fout: ' + res.status);
        const data = await res.json();
        allItems.push(...(data.items || []));
        if (!data.pagination?.next) break;
        offset += 100;
      }
      rows  = allItems.map(it => ({ _id: it.id, ...it.fieldData }));
      fields = rows.length ? Object.keys(rows[0]) : [];
      return JSON.stringify({ success: true, rows: rows.slice(0, limit), fields, count: rows.length });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'cms_read',
    description: 'Haal alle items op uit een CMS-collectie. Gebruik voor export of als basis voor bulk-bewerkingen.',
    schema: z.object({
      collectionId: z.string().optional().describe('CMS collectie-ID (optioneel als env var ingesteld is)'),
      limit:        z.number().optional().describe('Max. items, standaard 1000')
    })
  }
);