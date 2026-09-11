# Sådan får du GOAT til at køre på NAS'en — trin for trin

Skrevet så det kan følges uden teknisk baggrund. Engangsopsætningen tager
15–20 minutter. Derefter opdaterer NAS'en sig selv — du skal aldrig gøre
noget igen.

## Hvad sker der egentlig? (30 sekunder)

- **GitHub** er der, hvor app'ens kode bor.
- Hver gang koden ændres, pakker en robot hos GitHub automatisk app'en som en
  **færdigpakke** (et "Docker-image").
- På NAS'en installerer du app'en én gang ud fra den pakke — plus en lille
  **vagt** (Watchtower), der hver time kigger efter en ny pakke og installerer
  den af sig selv.
- **Dine tal og data er ALDRIG med i pakken.** De ligger i en almindelig mappe
  på NAS'en (`/volume1/docker/goat/data`) og overlever alle opdateringer.

## Offentlig eller privat pakke — hvad er konsekvensen?

Pakken indeholder kun selve app'en: koden, designet, gede-ikonet. Ikke ét
tal, ikke ét navn fra din portefølje.

| | **Offentlig pakke (anbefalet)** | Privat pakke |
|---|---|---|
| Dine investeringsdata | Sikre — er aldrig i pakken | Sikre — er aldrig i pakken |
| Hvem kan hente selve app'en? | Alle, der kender navnet, kan downloade den tomme app og se, hvordan den er skruet sammen | Kun dig |
| Besvær | Ét ekstra klik på GitHub | Kræver adgangsnøgle, login på NAS'en via kommandolinje m.m. |

**Anbefaling: offentlig.** Det, en fremmed i værste fald kan se, er en tom
udgave af app'en — ikke en krone af dine data. Vil du alligevel have privat,
så følg tillægget nederst.

## Trin for trin

### Del 1 — på GitHub (i browseren)

1. **Få koden på `main`.** Koden ligger klar på en arbejdsgren; merg den via
   pull requesten (den grønne **Merge pull request**-knap), eller bed Claude
   oprette PR'en, hvis den ikke findes.
2. **Vent på robotten.** Åbn fanen **Actions** øverst i repoet. Efter et par
   minutter står der et grønt flueben ved *"Publish Docker image"*. Så ligger
   pakken klar.
3. **Gør pakken offentlig.** Gå til repoets forside → i højre spalte, klik
   **Packages** → klik på **goat** → klik **Package settings** (til højre) →
   rul helt ned til *Danger Zone* → **Change visibility** → vælg **Public**
   → bekræft ved at skrive pakkens navn.

### Del 2 — på NAS'en (i DSM, Synologys webinterface)

4. **Opret datamappen.** Åbn **File Station** → gå til mappen `docker` (opret
   den, hvis den ikke findes) → opret undermappen `goat`, og inde i den
   undermappen `data`. Resultat: `docker/goat/data`.
   - *Kun hvis app'en allerede kører et sted med rigtige data:* kopiér den
     gamle `data`-mappes indhold (`goat-data.json`, `backups`, evt.
     `documents`) ind i den nye `data`-mappe først.
5. **Installér app'en.** Åbn **Container Manager** (hedder Docker på ældre
   DSM) → vælg **Projekt** i venstremenuen → **Opret**:
   - Projektnavn: `goat`
   - Sti: vælg mappen `/docker/goat`
   - Kilde: **Opret docker-compose.yml** → kopiér hele indholdet af filen
     [`docker-compose.nas.yml`](docker-compose.nas.yml) fra repoet ind i
     feltet.
   - Klik **Næste** / **Udfør** hele vejen igennem.
6. **Tjek at den kører.** Under **Container** skal der nu stå to grønne:
   `goat` og `goat-watchtower`.
7. **Åbn app'en.** I browseren: samme adresse som du bruger til NAS'en, men
   med `:8420` bagpå — fx `http://192.168.1.50:8420` (NAS'ens IP står i
   DSM under Kontrolpanel → Netværk, eller i din Synology-app).

### Del 3 — på iPad'en

8. Åbn adressen fra trin 7 i **Safari** → tryk på **Del-knappen** (firkanten
   med pil op) → **Føj til hjemmeskærm**. Genvejen får automatisk det grønne
   G-med-horn-ikon. *(Har du en gammel genvej liggende: slet den og lav en
   ny — iPad'en husker ellers det gamle ikon.)*

## Det var det

- Opdateringer sker nu automatisk inden for en time, efter ny kode er merget
  til `main`. Du mærker det højst som et par sekunders genstart.
- **Utålmodig?** Container Manager → Projekt → `goat` → menuen **Handling**
  → *Genopbyg* henter nyeste version med det samme.
- **Noget gik i stykker efter en opdatering?** Hver pakke gemmes også under
  et versionsnummer (commit-hash). Skriv til Claude, hvilken dato det gik
  galt, så låser vi compose-filen til den forrige version.

> Sikkerhed: app'en har intet login, så lad den blive på hjemmenetværket.
> Åbn ikke port 8420 i din router. Det er hele privatlivs-idéen: intet på
> internettet, alt på NAS'en.

---

## Tillæg — hvis pakken skal være privat

Kun for den grundige: spring trin 3 over og gør i stedet dette.

1. På GitHub: profilbillede → **Settings** → **Developer settings** →
   **Personal access tokens** → **Tokens (classic)** → *Generate new token*.
   Kryds kun **`read:packages`** af, sæt lang udløbstid, kopiér tokenet
   (det er en slags adgangskode — gem det).
2. I Container Manager: **Registrering** → **Indstillinger** → **Tilføj** →
   URL `https://ghcr.io`, brugernavn `denislarsen`, adgangskode = tokenet.
3. Watchtower skal også kunne logge ind: slå SSH til (Kontrolpanel →
   Terminal & SNMP), log ind fra en computer (`ssh dig@NAS-IP`) og kør
   `docker login ghcr.io` med samme brugernavn/token. Kør derefter:
   `mkdir -p /volume1/docker/goat/.docker && cp ~/.docker/config.json /volume1/docker/goat/.docker/`
4. Fjern `#` foran config.json-linjen i compose-filen (se kommentaren i
   `docker-compose.nas.yml`) og genopbyg projektet.
