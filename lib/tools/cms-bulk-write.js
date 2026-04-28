/**
 * TOOL: cms_bulk_write
 * Databron: CMS API (webflow)
 * Gebruik wanneer: je meerdere rijen (uit excel_import) naar het CMS wil schrijven
 * Gebruik NIET voor: individuele pagina-publicaties (gebruik publish_to_cms)
 * Input: { items: object[], operation: "create"|"update"|"upsert", batchSize?: number }
 * Succes: { success: true, created, updated, failed, total, results[] }
 * Fout:   { success: false, error: string }
 *
 * Tip: zorg dat Excel-kolomnamen overeenkomen met CMS-veldsluggen.
 * Voor update/upsert: voeg een kolom "_id" toe met het bestaande CMS item-ID.
 */
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const cmsBulkWriteTool = tool(
  async ({ items, operation = 'create', batchSize = 10 }) => {
    const batch = items.slice(0, batchSize);
    let created = 0, updated = 0, failed = 0;
    const results = [];
    try {
      const collectionId = items[0]?._collectionId || process.env.WEBFLOW_COLLECTION_ID || '';
      if (!collectionId) throw new Error('Stel WEBFLOW_COLLECTION_ID in of voeg _collectionId toe aan de rijen.');
      for (const item of batch) {
        const { _id, _collectionId, ...fieldData } = item;
        const isUpdate = operation !== 'create' && _id;
        const url = isUpdate
          ? 'https://api.webflow.com/v2/collections/' + collectionId + '/items/' + _id
          : 'https://api.webflow.com/v2/collections/' + collectionId + '/items';
        const res = await fetch(url, {
          method: isUpdate ? 'PATCH' : 'POST',
          headers: {
            'Authorization': 'Bearer ' + process.env.WEBFLOW_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isArchived: false, isDraft: true, fieldData }),
        });
        if (res.ok) {
          const data = await res.json();
          results.push({ row: item, success: true, id: data.id });
          isUpdate ? updated++ : created++;
        } else {
          const err = await res.text();
          results.push({ row: item, success: false, error: 'HTTP ' + res.status + ': ' + err.slice(0, 200) });
          failed++;
        }
        await new Promise(r => setTimeout(r, 250)); // Webflow rate limit
      }
      return JSON.stringify({ success: true, created, updated, failed, total: batch.length, results });
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
  {
    name: 'cms_bulk_write',
    description: 'Schrijf meerdere rijen naar het CMS. Verwerkt max. batchSize items per aanroep. Gebruik na excel_import.',
    schema: z.object({
      items:     z.array(z.record(z.any())).describe('Rijen om te importeren'),
      operation: z.enum(['create','update','upsert']).optional(),
      batchSize: z.number().optional().describe('Max. items per aanroep, standaard 10')
    })
  }
);