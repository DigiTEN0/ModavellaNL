# Modavella Catalog Importer + SEO Booster

Neem de **volledige catalogus** van een Shopify-bronwinkel over — producten, varianten,
prijzen, afbeeldingen, size charts én **categorieën** — en importeer alles in **Modavella**
met **top-notch SEO** die er "gevestigd en vertrouwd" uitziet. Zonder dure extensie,
zonder API-key, en met een **veilige, transparante** codebase (nul externe runtime-dependencies).

> Kort: scrape → verrijk (SEO) → importeer in Shopify. Categorieën komen automatisch mee.

---

## Waarom deze aanpak ~100% accuraat is

De meeste "web scrapers" raden data uit de HTML van een pagina — fragiel en foutgevoelig.
Deze tool leest in plaats daarvan de **eigen gestructureerde JSON** van Shopify:

| Endpoint | Levert |
|---|---|
| `/{winkel}/products.json` | alle producten: titel, body, varianten, opties, prijzen, afbeeldingen |
| `/{winkel}/collections.json` | alle (gepubliceerde) collecties |
| `/{winkel}/collections/<handle>/products.json` | welke producten in welke collectie zitten → **categorie-behoud** |

Omdat dit exact de data is die de winkel zelf serveert, is er geen giswerk. Wat de tool
**wél** overneemt: titels, beschrijvingen (incl. size-chart-tabellen), varianten (kleur/maat/…),
SKU's, prijzen, compare-at-prijzen, gewicht, afbeeldingen, tags en collectie-indeling.

Wat Shopify **niet** publiek aanbiedt (en dus aandacht vraagt): exacte voorraadaantallen,
metafields, en losse "size guide"-pagina's die niet in de productbeschrijving staan. Zie
[Aandachtspunten](#aandachtspunten).

---

## Vereisten

- **Node.js 18.17+** (getest op Node 22). Check met `node --version`.
- Toegang tot internet op de machine waar je scrapet (jouw laptop of server).
- Voor de import: een Shopify-winkel (Modavella) waar je producten mag importeren.

---

## Installatie

```bash
git clone <deze-repo>
cd ModavellaNL
npm install      # installeert alleen TypeScript (devDependency) — geen runtime-deps
npm run build    # compileert naar dist/
```

Kopieer daarna de config en pas hem aan:

```bash
cp .env.example .env
# open .env en zet SHOP_NAME, taal, en (optioneel) je verzend-/retourteksten
```

---

## Snelstart

```bash
# Alles in één keer: scrape de bron + genereer alle importbestanden
npm run cli -- all --url https://de-bronwinkel.nl --out ./output
```

Resultaat in `./output/`:

| Bestand | Wat het is |
|---|---|
| `products.csv` | **Native Shopify product-import** (Producten → Importeren). Geen app nodig. |
| `smart-collections.csv` | Slimme collecties die je categorieën **automatisch** herbouwen. |
| `catalog.json` | De volledige, genormaliseerde dataset (bron voor SEO-stappen). |
| `report.md` / `report.json` | Kwaliteits-/accuratesse-rapport. |
| `seo/structured-data.jsonl` | JSON-LD per product voor rich snippets in Google. |

---

## Stap voor stap

### 1. Scrapen

```bash
npm run cli -- scrape --url https://de-bronwinkel.nl --out ./output
```

De tool controleert eerst of het een scrapebare Shopify-winkel is, haalt daarna netjes
(met rate-limiting en retries) alle producten + collecties op en koppelt producten aan
hun collecties. Output: `output/catalog.json`.

### 2. Verrijken + exporteren (SEO-engine)

```bash
npm run cli -- build --in ./output --out ./output
```

Dit draait de **deterministische SEO-engine** over de hele catalogus en schrijft de
importbestanden. Wil je de afbeeldingen ook lokaal opslaan (zelf hosten i.p.v. hotlinken)?

```bash
npm run cli -- build --in ./output --out ./output --download-images
```

### 3. Importeren in Shopify (Modavella)

**Belangrijk: importeer in deze volgorde.**

1. **Producten eerst.** Shopify-admin → **Producten → Importeren** → upload `products.csv`.
   - Elke variant/afbeelding staat op de juiste rij (Shopify's multi-row-formaat).
   - SEO-titel en meta-description staan al ingevuld per product.
   - Elk product krijgt tags per broncollectie, bv. `collectie:dames-schoenen`.
2. **Daarna de collecties.** Zie [Categorie-behoud](#categorie-behoud-zonder-handmatig-sorteren).

---

## Categorie-behoud (zonder handmatig sorteren)

Dit is de kern van je vraag: duizenden producten mogen **niet** handmatig in collecties.
De tool lost dat op met **tags + slimme collecties**:

1. Bij de import krijgt elk product een tag per broncollectie: `collectie:<handle>`
   (bv. een damesschoen krijgt `collectie:dames-schoenen`).
2. `smart-collections.csv` bevat per broncollectie één **slimme collectie** met de regel:

   > Producttag **is gelijk aan** `collectie:<handle>`

Zodra die slimme collecties bestaan, sorteert Shopify **automatisch** elk product in de
juiste categorie — vandaag én voor alles wat je later toevoegt. Nul handwerk.

**Twee manieren om de slimme collecties aan te maken:**

- **A. Automatisch (aanbevolen bij veel collecties):** importeer `smart-collections.csv`
  met de gratis app **Matrixify** (Excelify). Eén upload, klaar.
- **B. Handmatig (prima bij een handvol collecties):** maak in Shopify per collectie een
  *automated collection* met de regel `Product tag is equal to collectie:<handle>`. Duurt
  ~20 seconden per collectie. `report.md` en `smart-collections.csv` geven exact welke tag.

> Zo hoef je nooit duizenden producten te sorteren — hooguit een paar collectie-regels te bevestigen.

---

## Rebranding: van bronwinkel naar jóuw merk

Je neemt een catalogus over, maar de winkel moet **Modavella** uitstralen — niet de bron.
De tool doet daarom bij elke `build` automatisch een rebrand-pass:

- **Vendor override:** elk product krijgt jouw vendor (standaard = `SHOP_NAME`), zodat de
  bronmerknaam nooit in Shopify's Vendor-kolom of in de "Merk"-regel belandt.
- **Merknaam-schrobben:** vermeldingen van het bronmerk in titels, beschrijvingen,
  alt-teksten en tags worden verwijderd (titels/tags) of vervangen door jouw naam
  (lopende tekst). **Afbeeldings-URL's worden nooit aangeraakt** — er breekt niets.

De bron-vendornamen worden automatisch gedetecteerd en geschrobd. Staan er in de teksten
ook spellingsvarianten (bv. een gestileerde naam of domein), voeg die dan toe in `.env`:

```bash
VENDOR_NAME=Modavella
SOURCE_BRANDS=Nora Mae, Nora-Mae, NoraMae
```

Wil je juist de originele merken per product behouden (bv. multi-merk retailer)? Zet dan
`KEEP_SOURCE_VENDOR=true` en/of `BRAND_SCRUB=false`.

## SEO: top-notch, zonder API-key

Je krijgt **twee lagen**, die samenwerken:

### Laag 1 — Deterministische SEO-engine (standaard, nul kosten)

Voor **elk** product genereert de engine, op basis van de **échte** producteigenschappen
(geen verzinsels, geen AI-slop):

- **SEO-titel** ≤ 60 tekens, zoekwoord vooraan, eindigt op `| Modavella`.
- **Meta-description** 140–158 tekens, **uniek** per product (gevarieerde templates zodat
  Google geen duplicate-patroon ziet), met een echte USP + zachte call-to-action.
- **Schone, unieke slug** (handle), automatisch ontdubbeld.
- **Verrijkte productbeschrijving**: de originele tekst wordt **veilig opgeschoond** en
  aangevuld met een `Kenmerken`-lijst (materiaal, kleuren, maten, categorie) en een
  vertrouwens-blok (verzending/retour). Een **size-chart-tabel** uit de bron blijft behouden.
- **JSON-LD structured data** (`Product` met prijs/voorraad/merk) voor rich snippets.

Voorbeeld (uit `examples/`):

```
Titel : Dames Wollen Winterjas Camel – Jassen | Modavella          (49 tekens)
Meta  : Ontdek de Dames Wollen Winterjas Camel bij Modavella. Gemaakt van
        polyester en wol, maat S t/m XL. Gratis verzending vanaf €50. …   (151 tekens)
```

### Laag 2 — Claude-Code batch-modus (premium copy, óók zonder API-key)

Wil je voor je toppers écht handgeschreven premium copy? Dan wordt **jouw Claude Code-plan
de motor** — geen losse API-key nodig:

```bash
# 1. Zet de producten klaar als batch + een kant-en-klare opdracht
npm run cli -- seo:batch --in ./output --out ./output
#    → output/seo-batch.jsonl  +  output/PROMPT.md
```

2. Open een **Claude Code-sessie**, laat Claude `PROMPT.md` volgen en per product premium
   copy schrijven naar `seo-batch.out.jsonl` (in batches van bv. 25–50 producten; begin met
   je bestsellers — de rest houdt gewoon de sterke engine-SEO).

```bash
# 3. Voeg de premium copy terug in en her-exporteer
npm run cli -- seo:apply --in ./output --batch ./output/seo-batch.out.jsonl
```

De ingelezen HTML wordt bij het toepassen **opnieuw gesaneerd** — ook copy van buitenaf
wordt nooit blind vertrouwd.

---

## Verificatie

```bash
npm run cli -- verify --in ./output
```

Toont onder andere: aantal producten/varianten/afbeeldingen, hoeveel producten in een
collectie zitten, of er dubbele handles zijn (moet 0 zijn), en of de meta-descriptions
binnen de aanbevolen lengte vallen. Zo controleer je de volledigheid vóór de import.

---

## Security

Je vroeg expliciet om een veilige aanpak. Wat er is gedaan:

- **Nul externe runtime-dependencies.** De tool draait op Node's ingebouwde functies.
  Er is geen enkel pakket van derden dat jouw data of winkel aanraakt → geen
  supply-chain-risico. `npm audit` = 0 kwetsbaarheden.
- **Alle gescrapete HTML wordt gesaneerd** met een strikte allowlist: `<script>`,
  `<iframe>`, inline `style=`, en `on...=`-handlers worden verwijderd, `javascript:`-URL's
  geblokkeerd. Alleen veilige, inhoudelijke tags (incl. tabellen voor size charts) blijven.
- **Geen secrets in code.** Config gaat via `.env` (git-ignored). Er zijn geen API-keys nodig.
- **Nette netiquette bij het scrapen**: eigen User-Agent, instelbare vertraging, beperkte
  concurrency, retries met backoff en respect voor `Retry-After`.

Zie ook [`docs/SECURITY.md`](docs/SECURITY.md).

---

## Aandachtspunten

- **Voorraadaantallen** staan niet in `products.json`. Producten worden geïmporteerd als
  *untracked* (dus verkoopbaar). Koppel daarna je eigen voorraadbeheer.
- **Metafields / losse size-guide-pagina's** worden niet meegenomen als ze niet in de
  productbeschrijving of afbeeldingen staan.
- **Sommige winkels zetten `products.json` uit.** Dan meldt de tool dat netjes; scrapen is
  dan niet mogelijk zonder toestemming/andere toegang.
- **Rechten & respect.** Neem alleen producten over van winkels waarvan je de **rechten**
  hebt (eigen winkel, leverancier, of expliciete toestemming). Respecteer de
  gebruiksvoorwaarden en `robots.txt` van de bron. Deze tool is bedoeld voor legitieme
  migratie/synchronisatie, niet voor het klakkeloos kopiëren van andermans merk.

---

## Commando-overzicht

```
modavella scrape    --url <url> [--out ./output]
modavella build     [--in ./output] [--out ./output] [--download-images]
modavella all       --url <url> [--out ./output] [--download-images]
modavella seo:batch [--in ./output] [--out ./output]
modavella seo:apply [--in ./output] --batch <seo-batch.out.jsonl>
modavella verify    [--in ./output]
```

(Draai ze via `npm run cli -- <command> …`, of maak de CLI globaal met `npm link`.)

---

## Ontwikkeling

```bash
npm run build      # compileer
npm run selftest   # draai de end-to-end pipeline-test op fixtures (offline)
```

De map `examples/` bevat echte voorbeeldoutput, gegenereerd uit `fixtures/`.
