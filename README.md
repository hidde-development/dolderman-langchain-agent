# Dolderman Letselschade Advocaten — LangChain Content Agent

Gegenereerd door Goldfizh Content Agent Builder voor **Goldfizh**.
_Review-pipeline actief: writer → SEO/GEO + Brand + Strategy critics parallel → synthesizer → auto-revise bij oranje._
_Inclusief migratie-module (redirects, bulk CMS, Excel import/export)._

## Vereisten

- Node.js 18+
- Vercel CLI (`npm i -g vercel`)
- Claude API key

## Installatie

```bash
npm install
cp .env.example .env.local
# Vul Claude en WEBFLOW_API_KEY in .env.local
```

## Deployen op Vercel

```bash
vercel deploy
# Voeg environment variables toe in het Vercel dashboard
```

## API-endpoints

### `POST /api/agent` — Schrijf één pagina
```json
{ "url": "https://www.voorbeeld.nl/diensten/...", "pageType": "dienstpagina", "style": "feitelijk", "keywords": "...", "brief": "..." }
```
Response bevat `content`, `page` (JSON), `verdict` (green/orange/red), `reports` (per critic) en `revised` (bool — true als de writer na oranje opnieuw heeft geschreven).

### `POST /api/publish` — Concept publiceren in CMS
```json
{ "page": { ... }, "verdict": "green", "pageType": "dienstpagina" }
```
Publiceert alleen als verdict niet `red` is. Rode output wordt geblokkeerd met HTTP 403.

### `POST /api/migrate` — Batch migratie (continuation token)
```json
{ "urls": ["https://oud.nl/pagina-1"], "completed": [], "batchSize": 3 }
```
Herhaal tot `done: true` in de response.

### `POST /api/redirects` — Redirect-mapping genereren
```json
{ "oldUrls": ["/oud/pad"], "newUrls": ["/nieuw/pad"], "permanent": true }
```
Geeft de inhoud van `vercel.json` terug als string (`content`) plus de gematchte redirect-paren.

### `POST /api/cms-export` — CMS exporteren naar Excel
```json
{ "collectionId": "optional", "format": "excel" }
```
Geeft `{ base64, filename, rows, columns }` terug. Decodeer base64 om de Excel te downloaden.

### `POST /api/cms-import` — Excel/CSV importeren in CMS (met continuation token)
```json
{ "data": "<base64-excel>", "mimeType": "excel", "operation": "create", "completed": [], "batchSize": 10 }
```
Herhaal tot `done: true`. Ondersteunt `create`, `update` (vereist kolom `_id`) en `upsert`.

> **Excel-tip voor bulk upload:** zorg dat de kolomnamen exact overeenkomen met de veldsluggen in Webflow. Exporteer eerst via `/api/cms-export` voor de juiste headers.

## Content-tools (6)

| Tool | Wanneer |
|------|---------|
| `fetch_url_content` | Inhoud van een bestaande URL ophalen |
| `consolidate_sources` | Meerdere bronpagina's samenvoegen |
| `write_page` | Nieuwe pagina schrijven |
| `validate_output` | SEO + brand check |
| `load_knowledge` | Merk- of productinfo opzoeken |
| `publish_to_cms` | Publiceren naar Webflow |

## Migratie-tools (7)

| Tool | Wanneer |
|------|---------|
| `parse_input` | Sitemap XML / CSV / Excel → URL-lijst |
| `map_redirects` | Oud URL → nieuw URL matchen (AI) |
| `export_redirects` | Redirect-map → vercel.json |
| `cms_read` | Alle items uit CMS ophalen |
| `excel_export` | Data → downloadbare Excel |
| `excel_import` | Geüploade Excel/CSV → rijen |
| `cms_bulk_write` | Rijen → CMS aanmaken/bijwerken |

## Review-pipeline

Na elke aanroep van `/api/agent` lopen drie critics parallel:

| Critic | Wat controleert hij |
|--------|----------------------|
| **SEO/GEO** | Meta-titel, description, headings, keyword-coverage, citeerbaarheid |
| **Brand** | Toon, aanspreekvorm, verboden woorden, merkwaarden, guardrails |
| **Strategy** | Paginatype-alignment, doelgroep-tone, CTA-logica, pijler-aanwezigheid |

Plus domein-critic(s): **Juridisch (NL)**. Deze gebruiken `knowledge/domain-<name>.md` als kennisbron.

De **synthesizer** beslist op basis van alle rapporten:
- **Groen** → publish-ready, roep `/api/publish` aan
- **Oranje** → writer heeft één auto-revisie gedaan; controleer de reports voor publiceren
- **Rood** → human review vereist; `/api/publish` blokkeert

Zet de pipeline uit door `api/agent.js` aan te passen (laat `runReview` achterwege) — niet aanbevolen.

## CMS

Platform: **Webflow**
Endpoint: _zie `lib/tools/publish-cms.js`_
API-key: `process.env.WEBFLOW_API_KEY`