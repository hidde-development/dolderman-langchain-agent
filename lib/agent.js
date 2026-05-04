import { ChatAnthropic } from '@langchain/anthropic';
import { fetchUrlTool }      from './tools/fetch-url.js';
import { consolidateTool }   from './tools/consolidate.js';
import { writePageTool }     from './tools/write-page.js';
import { validateTool }      from './tools/validate.js';
import { loadKnowledgeTool } from './tools/load-knowledge.js';
import { publishCmsTool }    from './tools/publish-cms.js';
import { parseInputTool }       from './tools/parse-input.js';
import { mapRedirectsTool }     from './tools/map-redirects.js';
import { exportRedirectsTool }  from './tools/export-redirects.js';
import { cmsReadTool }          from './tools/cms-read.js';
import { excelExportTool }      from './tools/excel-export.js';
import { excelImportTool }      from './tools/excel-import.js';
import { cmsBulkWriteTool }     from './tools/cms-bulk-write.js';

// Gedeeld ChatAnthropic-model — importeerbaar door api/* en lib/*.
const model = new ChatAnthropic({
  apiKey: process.env.Claude ?? process.env.ANTHROPIC_API_KEY,
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
  temperature: null, topP: 1,
});

const tools = [fetchUrlTool, consolidateTool, writePageTool, validateTool, loadKnowledgeTool, publishCmsTool, parseInputTool, mapRedirectsTool, exportRedirectsTool, cmsReadTool, excelExportTool, excelImportTool, cmsBulkWriteTool];

// Gedeelde model- en toolsinstanties — importeerbaar door api/* en lib/*.
// Agent-executor patroon is vervangen door directe tool-calls in api/agent.js en api/migrate.js.