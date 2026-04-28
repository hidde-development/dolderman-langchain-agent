import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
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
import { SYSTEM_PROMPT } from './prompts.js';

// Claude heeft native tool-calling — gebruik createToolCallingAgent (niet ReAct)
const model = new ChatAnthropic({
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
});

const tools = [fetchUrlTool, consolidateTool, writePageTool, validateTool, loadKnowledgeTool, publishCmsTool, parseInputTool, mapRedirectsTool, exportRedirectsTool, cmsReadTool, excelExportTool, excelImportTool, cmsBulkWriteTool];

// Prompt-template: system-instructies + menselijke input + scratchpad voor tool-calls
const prompt = ChatPromptTemplate.fromMessages([
  ['system', SYSTEM_PROMPT],
  ['human', '{input}'],
  new MessagesPlaceholder('agent_scratchpad'),
]);

export function createContentAgent() {
  const agent = createToolCallingAgent({ llm: model, tools, prompt });
  return new AgentExecutor({ agent, tools, maxIterations: 10, verbose: false });
}