# Security & verantwoord gebruik

## Ontwerpprincipes

### 1. Geen externe runtime-dependencies
De tool gebruikt uitsluitend de standaardbibliotheek van Node.js (`fetch`, `fs`, `path`,
`util`). De enige npm-pakketten zijn **devDependencies** (`typescript`, `@types/node`) die
alleen bij het compileren nodig zijn — ze draaien nooit mee in productie en raken jouw
data niet aan. Dit elimineert het grootste deel van het supply-chain-risico dat bij typische
scraper-tools speelt.

Controleer zelf:
```bash
npm audit            # verwacht: 0 vulnerabilities
npm ls --prod        # verwacht: (leeg) — geen productie-dependencies
```

### 2. Alle gescrapete HTML wordt gesaneerd
Productbeschrijvingen van een externe winkel zijn **onvertrouwde invoer**. Voordat er iets
mee gebeurt, gaat de HTML door een strikte allowlist-sanitizer (`src/util/html.ts`):

- **Verwijderd:** `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<form>`,
  event-handlers (`onclick`, `onerror`, …), inline `style=`-attributen en HTML-comments.
- **Geblokkeerd:** `javascript:`, `data:`, `vbscript:`-URL's in `href`/`src`.
- **Behouden:** veilige, inhoudelijke tags — paragrafen, lijsten, koppen en **tabellen**
  (zodat size charts intact blijven).

Dezelfde sanitizer draait ook bij `seo:apply`, zodat zelfs door AI aangeleverde copy nooit
blind wordt vertrouwd.

### 3. Geen secrets, geen API-keys
Er zijn geen API-keys nodig. Configuratie gaat via een `.env`-bestand dat door
`.gitignore` wordt uitgesloten van versiebeheer. Er worden geen credentials gelogd.

### 4. Nette netiquette bij het scrapen
- Eigen, herkenbare `User-Agent` (instelbaar).
- Instelbare vertraging tussen requests (`SCRAPE_DELAY_MS`, standaard 600 ms).
- Beperkte parallelle requests (`SCRAPE_CONCURRENCY`, standaard 3).
- Retries met exponentiële backoff en respect voor `Retry-After` bij HTTP 429.
- Harde bovengrens op het aantal pagina's om oneindige loops te voorkomen.

## Verantwoord gebruik (belangrijk)

Neem uitsluitend producten over van winkels waarvan je de **rechten** hebt:

- je **eigen** winkel (migratie),
- een **leverancier/merk** waarmee je een afspraak hebt, of
- een winkel die je **expliciete toestemming** heeft gegeven.

Respecteer de gebruiksvoorwaarden en `robots.txt` van de bronwinkel. Productteksten en
-afbeeldingen kunnen auteursrechtelijk beschermd zijn. Deze tool is bedoeld voor legitieme
catalogusmigratie en -synchronisatie — niet voor het klakkeloos kopiëren van andermans merk,
huisstijl of content. Bij twijfel: vraag toestemming.
