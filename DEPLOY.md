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
- **Dine tal og data er ALDRIG med i pakken.** De ligger i mappen `data`
  inde i projektets mappe på NAS'en (typisk `docker/goat/data`) og overlever
  alle opdateringer.

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
   *(Står der ingen **Packages** i højre spalte, så klik på dit profilbillede
   øverst til højre → **Your profile** → fanen **Packages** — pakken ligger
   også dér.)*

### Del 2 — på NAS'en (i DSM, Synologys webinterface)

> **Kører GOAT allerede på NAS'en?** (Fx fordi du allerede har en genvej til
> den på iPad'en.) Så spring trin 4–5 over, og følg i stedet
> [Opdater en eksisterende installation](#opdater-en-eksisterende-installation)
> længere nede. Opretter du et nyt projekt, afviser NAS'en navnet `goat`,
> fordi den gamle installation allerede bruger det.

4. **Opret datamappen.** Åbn **File Station** → gå til mappen `docker` (opret
   den, hvis den ikke findes) → opret undermappen `goat`, og inde i den
   undermappen `data`. Resultat: `docker/goat/data`.
   - *Kun hvis app'en allerede kører et sted med rigtige data:* kopiér den
     gamle `data`-mappes indhold (`goat-data.json`, `backups`, evt.
     `documents`) ind i den nye `data`-mappe først.
5. **Installér app'en.** Åbn **Container Manager** (hedder Docker på ældre
   DSM) → vælg **Projekt** i venstremenuen → **Opret**:
   - Projektnavn: `goat` (med små bogstaver; store bogstaver afvises)
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

## Opdater en eksisterende installation

Brug denne vej, hvis GOAT allerede kører på NAS'en. Du opretter ikke noget
nyt; du skifter bare "opskriften" i det projekt, der allerede findes. Dine
data bliver liggende, hvor de er.

Knapperne står med det engelske navn og det danske i parentes, hvis din NAS
kører på dansk.

1. **Find projektet.** Åbn **Container Manager** → **Project** (Projekt) i
   venstremenuen. Find projektet (typisk `goat`), og notér, hvilken mappe
   det ligger i (typisk `docker/goat`).
2. **Tag en sikkerhedskopi.** Åbn **File Station** → gå til projektets mappe
   → højreklik på mappen `data` → **Compress to "data.zip"** (Komprimer til
   "data.zip"). Så har du en kopi af alle dine tal, uanset hvad der sker.
3. **Stop projektet.** Container Manager → **Project** → højreklik på `goat`
   → **Stop**. Klik **Close** (Luk), når den er færdig. Prikken foran navnet
   bliver rød.
4. **Skift opskriften.** Dobbeltklik på projektet for at åbne det, og find
   fanen med **YAML**. Klik **Edit** (Rediger), markér al teksten og slet
   den, og indsæt hele indholdet af
   [`docker-compose.nas.yml`](docker-compose.nas.yml). Klik **Save** (Gem).
   Spørger den, om projektet skal bygges med det samme, så vælg kun at gemme.
5. **Ryd det gamle væk.** Højreklik på `goat` → **Clean** (Ryd) → bekræft.
   Det fjerner kun de gamle "kasser", app'en kørte i. Dine data ligger i
   `data`-mappen og røres ikke.
6. **Byg det nye.** Højreklik på `goat` → **Build** (Byg). NAS'en henter nu
   den nye app fra GitHub; det tager et minut eller to. Klik **Close** (Luk),
   når den er færdig. Prikken bliver grøn.
7. **Tjek.** Under **Container** skal både `goat` og `goat-watchtower` køre.
   Åbn app'en, som du plejer: du skal se det nye dashboard med de tre trin
   og alle dine investeringer.
8. **Nyt ikon på iPad'en:** se trin 8 ovenfor.

**Er app'en tom efter trin 7?** Bare rolig: dine data er ikke væk. De ligger i
`data.zip` og i den gamle mappe. Stop projektet igen, og skriv til Claude, så
finder vi ud af, hvilken mappe app'en kigger i.

## Det var det

- Opdateringer sker nu automatisk inden for en time, efter ny kode er merget
  til `main`. Du mærker det højst som et par sekunders genstart.
- **Utålmodig?** Container Manager viser ikke "Update available" for pakker
  fra GitHub, så gør sådan: **Project** → højreklik på `goat` → **Stop** →
  højreklik igen → **Clean** (Ryd). Gå til **Image** (Billede), og slet
  `ghcr.io/denislarsen/goat`. Tilbage i **Project**: højreklik på `goat` →
  **Build** (Byg). Så hentes den nyeste udgave med det samme.
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
   `docker login ghcr.io` med samme brugernavn/token. Kopiér derefter
   login-filen ind i projektmappen (her den typiske `/volume1/docker/goat`):
   `mkdir -p /volume1/docker/goat/.docker && cp ~/.docker/config.json /volume1/docker/goat/.docker/`
4. Fjern `#` foran config.json-linjen i compose-filen (se kommentaren i
   `docker-compose.nas.yml`), og byg projektet igen: **Stop** → **Clean** →
   **Build**.
