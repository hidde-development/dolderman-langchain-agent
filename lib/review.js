import { ChatAnthropic } from '@langchain/anthropic';
import { readKnowledge } from './tools/load-knowledge.js';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const ACTIVE_DOMAIN_CRITICS = ["legal"];

const model = new ChatAnthropic({ apiKey: process.env.Claude, model: 'claude-sonnet-4-6', temperature: null, topP: 1, maxTokens: 2048 });

async function readDomainPack(name) {
  try {
    const p = path.join(rootDir, 'knowledge', 'domain-' + name + '.md');
    return await readFile(p, 'utf8');
  } catch { return null; }
}

function parseJson(raw) {
  if (typeof raw !== 'string') raw = String(raw || '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callReviewer({ role, system, content, brief }) {
  const user = 'BRIEF:\n' + JSON.stringify(brief, null, 2) +
    '\n\n---\n\nPAGINA:\n' + content +
    '\n\n---\n\nGeef ALLEEN dit JSON terug (geen uitleg, geen markdown):\n' +
    '{"role":"' + role + '","flags":[{"severity":"blocker|revise|optional","issue":"...","suggestion":"..."}],"summary":"één zin samenvatting"}';
  try {
    const resp = await model.invoke([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
    const raw = typeof resp.content === 'string' ? resp.content : (resp.content?.[0]?.text || '');
    const parsed = parseJson(raw);
    return parsed || { role, flags: [], summary: 'Critic kon geen geldig rapport produceren.' };
  } catch (err) {
    return { role, flags: [], summary: 'Critic-fout: ' + err.message };
  }
}

const SEO_SYSTEM = `Je bent een SEO/GEO-reviewer. Je beoordeelt content strikt op technische SEO en Generative Engine Optimization.

CHECKS (flag als iets fout is):
- Meta-titel: ≤60 tekens, bevat primair keyword, uniek en zinvol
- Meta-description: 140–160 tekens, call-to-action aanwezig
- H1 aanwezig, uniek, bevat primair keyword
- Heading-hiërarchie correct (H1 > H2 > H3, geen sprongen)
- Primair keyword in eerste 100 woorden van body
- Interne linking: minstens 1 interne link zichtbaar (of plekken voor links gemarkeerd)
- Alt-teksten: bij image-referenties beschrijvend, niet stuffed
- Semantic entity coverage (GEO): gerelateerde entiteiten en vakbegrippen genoemd
- Question-answer structuur voor AI-zoekresultaten (FAQ-achtige secties waar passend)
- Citeerbaarheid: concrete cijfers, bronnen of definities die AI-zoekmachines kunnen citeren

SEO- EN GEO-KENNIS (aanvullende richtlijnen van deze klant):
${'$'}{seoKnowledge}

Blocker = mag nooit live (verplicht element ontbreekt).
Revise = moet scherper voordat het live kan.
Optional = kan live, maar beter kan.`;

const BRAND_SYSTEM = `Je bent een merkredacteur. Je beoordeelt content strikt op trouw aan de merkregels van deze klant.

CHECKS:
- Aanspreekvorm consistent (geen drift tussen je/u)
- Toon matcht de voorgeschreven stijl
- Geen verboden woorden
- Merkwaarden herkenbaar in de copy
- Jargon-beleid gerespecteerd (minimaal/branche-specifiek/ruim)
- Stilistische drift: geen zinnen die "als een telecomprovider" klinken waar het een advocaat betreft (context-gevoelig)
- Guardrails niet overtreden

MERKREGELS (brand.md van deze klant):
${'$'}{brandKnowledge}

Blocker = schendt guardrail of verboden woord of fundamenteel off-brand.
Revise = past niet bij de toon maar is niet disqualificerend.
Optional = kan scherper.`;

const STRATEGY_SYSTEM = `Je bent een contentstrateeg. Je beoordeelt of deze pagina zijn strategische doel bereikt.

CHECKS:
- Is dit echt het opgegeven paginatype (dienstpagina/artikelpagina/case/etc.)? Of is het stiekem iets anders geworden?
- Spreekt het de doelgroep in hun eigen taal aan (zie doelgroep in brand.md)?
- Is de CTA passend bij de funnel-positie van deze pagina?
- Ondersteunt het een van de merkpijlers?
- Zijn de geclaimde uitkomsten/benefits concreet en onderbouwd?
- Past het in de bredere contentstrategie van deze klant?

MERKREGELS + STRATEGIE (brand.md van deze klant):
${'$'}{brandKnowledge}

Blocker = verkeerd paginatype of spreekt verkeerde doelgroep aan.
Revise = mist strategische scherpte (CTA onduidelijk, pijler onzichtbaar).
Optional = kan strategischer.`;

const DOMAIN_SYSTEMS = {
  legal: `Je bent een juridisch reviewer voor Nederlandse content.

CHECKS (hard blockers):
- Geen resultaatgaranties ("wij winnen altijd", "u krijgt gegarandeerd X")
- Geen onjuiste wetsverwijzingen of verouderde artikelnummers
- Geen stellige juridische claims zonder onderbouwing
- Geen NOvA-gedragsregels overtredingen (voor advocaten)
- Voldoende anonimisering bij casuïstiek (geen herleidbare persoonsgegevens)

CHECKS (revise):
- Juridische terminologie correct gebruikt (smartengeld vs. schadevergoeding vs. letselschade)
- No-cure-no-pay formulering precies juist
- Doorlooptijden en kansen realistisch geformuleerd
- Disclaimer aanwezig bij generieke advies-content

JURIDISCHE KENNIS (domein-pack):
${'$'}{domainKnowledge}`,

  medical: `Je bent een medisch reviewer voor Nederlandse content.

CHECKS (hard blockers):
- Geen medische claims zonder onderbouwing of BIG-registratie-context
- Geen genezingsbeloftes of diagnostische uitspraken
- Reclamecode voor Medische Zelfzorg Hulpmiddelen gerespecteerd
- Geen onderbouwde gezondheidsclaims in strijd met EU-Regulation 1924/2006

CHECKS (revise):
- Disclaimer ("geen vervanging voor medisch advies") aanwezig waar nodig
- Terminologie correct (symptomen vs. aandoening vs. diagnose)
- Verwijzing naar zorgprofessional bij serieuze klachten

MEDISCHE KENNIS (domein-pack):
${'$'}{domainKnowledge}`,

  financial: `Je bent een compliance-reviewer financiële dienstverlening (AFM/DNB).

CHECKS (hard blockers):
- Geen beleggingsadvies zonder vergunning / zonder disclaimer
- Geen rendementsbeloftes
- Risico-waarschuwing aanwezig bij beleggingsproducten
- Geen garanties over waardeontwikkeling

CHECKS (revise):
- AFM-verplichte disclaimers aanwezig
- Terminologie correct (rendement vs. waardeontwikkeling vs. opbrengst)
- Kosten transparant genoemd
- Doelgroepbescherming gerespecteerd (geen high-risk producten naar retail zonder warnings)

FINANCIËLE KENNIS (domein-pack):
${'$'}{domainKnowledge}`,

  claims: `Je bent een claims-reviewer voor food/cosmetics content (EU-regels).

CHECKS (hard blockers):
- Gezondheidsclaims voldoen aan EU-Regulation 1924/2006 (alleen goedgekeurde claims)
- Geen cosmetische claims die medisch werk suggereren (Cosmetics Regulation 1223/2009)
- Geen misleidende productvergelijkingen

CHECKS (revise):
- Claims onderbouwd met concrete ingredienten of studies
- Terminologie consistent met productlabel
- Geen overdreven "natuurlijk/biologisch/puur" zonder certificering

CLAIMS-KENNIS (domein-pack):
${'$'}{domainKnowledge}`,
};

const SYNTHESIZER_SYSTEM = `Je bent de hoofdredacteur. Je krijgt de output van een writer plus rapporten van 3 tot 5 specialist-critics (SEO/GEO, Brand, Strategy, en soms een domein-critic).

JOUW TAAK:
1. Lees de pagina
2. Lees alle critic-rapporten
3. Beslis: groen / oranje / rood

BESLISREGELS:
- ROOD als één of meer rapporten een "blocker" bevatten (iets wat nooit live mag)
- ORANJE als meerdere "revise" flags zijn of één kritische revise in Brand/Strategy/domein
- GROEN als alle rapporten alleen "optional" flags hebben of leeg zijn

BIJ ORANJE geef je een revisie-instructie: één bondige paragraaf die de writer vertelt wat er precies moet veranderen — alleen de belangrijkste punten, niet alle flags.

Geef ALLEEN dit JSON terug:
{"verdict":"green|orange|red","revision_prompt":"...bij oranje, anders lege string","summary":"één zin waarom deze verdict"}`;

async function callSynthesizer({ content, reports, brief }) {
  const user = 'PAGINA:\n' + content +
    '\n\n---\n\nCRITIC-RAPPORTEN:\n' + JSON.stringify(reports, null, 2) +
    '\n\n---\n\nBRIEF:\n' + JSON.stringify(brief, null, 2);
  try {
    const resp = await model.invoke([
      { role: 'system', content: SYNTHESIZER_SYSTEM },
      { role: 'user', content: user },
    ]);
    const raw = typeof resp.content === 'string' ? resp.content : (resp.content?.[0]?.text || '');
    const parsed = parseJson(raw);
    if (!parsed) return { verdict: 'orange', revision_prompt: 'Synthesizer kon geen verdict produceren — handmatige review aanbevolen.', summary: 'Synthesizer parse-fout.' };
    return parsed;
  } catch (err) {
    return { verdict: 'red', revision_prompt: '', summary: 'Synthesizer-fout: ' + err.message };
  }
}

export async function runReview({ content, brief }) {
  const { brand, seo } = await readKnowledge();

  // SEO en Brand/Strategy systems krijgen knowledge ingeprikt
  const seoSystem = SEO_SYSTEM.replace('${seoKnowledge}', seo || '(geen seo.md gevonden)');
  const brandSystem = BRAND_SYSTEM.replace('${brandKnowledge}', brand || '(geen brand.md gevonden)');
  const strategySystem = STRATEGY_SYSTEM.replace('${brandKnowledge}', brand || '(geen brand.md gevonden)');

  // Core critics parallel
  const corePromises = [
    callReviewer({ role: 'seo', system: seoSystem, content, brief }),
    callReviewer({ role: 'brand', system: brandSystem, content, brief }),
    callReviewer({ role: 'strategy', system: strategySystem, content, brief }),
  ];

  // Optionele domain critics
  const domainPromises = ACTIVE_DOMAIN_CRITICS.map(async dc => {
    const pack = await readDomainPack(dc);
    if (!pack) return null;
    const system = (DOMAIN_SYSTEMS[dc] || '').replace('${domainKnowledge}', pack);
    if (!system) return null;
    return callReviewer({ role: dc, system, content, brief });
  });

  const allResults = await Promise.all([...corePromises, ...domainPromises]);
  const [seoRep, brandRep, strategyRep, ...domainReps] = allResults;

  const reports = { seo: seoRep, brand: brandRep, strategy: strategyRep };
  ACTIVE_DOMAIN_CRITICS.forEach((dc, i) => {
    if (domainReps[i]) reports[dc] = domainReps[i];
  });

  const synth = await callSynthesizer({ content, reports, brief });

  return {
    reports,
    verdict: synth.verdict || 'orange',
    revisionPrompt: synth.revision_prompt || '',
    summary: synth.summary || '',
  };
}
