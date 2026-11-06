# GOAT på NAS'en — sådan hænger det sammen

Skrevet så det kan følges uden teknisk baggrund.

**Kort fortalt: GOAT kører allerede, og den opdaterer sig selv.** Du skal
kun merge en pull request på GitHub. Resten af denne side er til, hvis noget
en dag skal ændres eller sættes op forfra.

## Hvad sker der egentlig? (30 sekunder)

- **GitHub** er der, hvor app'ens kode bor.
- Hver gang der merges til `main`, pakker en robot hos GitHub automatisk
  app'en som en **færdigpakke** (et "Docker-image"):
  `ghcr.io/denislarsen/goat:latest`.
- På NAS'en kører en lille **vagt** (Watchtower), der hver time kigger efter
  en ny pakke og installerer den af sig selv. Du mærker det højst som et par
  sekunders genstart.
- **Dine tal og data er ALDRIG med i pakken.** De ligger i en almindelig
  mappe på NAS'en og overlever alle opdateringer.

## Din opsætning (sådan ser det ud i dag)

| Hvad | Hvor |
|---|---|
| App'ens adresse | `http://192.168.0.120:8420` |
| Projektet i Container Manager | `goat` |
| Projektets mappe | `/volume1/docker/Gorecki/GOAT_goreckiofflineassettracker-main 6` |
| **Dine rigtige data** | **`/volume1/docker/Gorecki/data`** |
| Sikkerhedskopier (de sidste 30 gemninger) | `/volume1/docker/Gorecki/data/backups` |

> **Vigtigt:** Dine data ligger *ikke* inde i projektets mappe, men i
> `Gorecki/data` ved siden af. Derfor står der en fuld sti (en "absolut sti")
> i opsætningen:
>
> `- /volume1/docker/Gorecki/data:/data`
>
> Den linje betyder: "app'en skal bruge mappen `Gorecki/data` på NAS'en".
> **Den linje må ikke ændres.** Står der i stedet `./data:/data`, kigger
> app'en i en tom mappe inde i projektmappen, og så ser GOAT tom ud. (Dine
> data er ikke væk i det tilfælde — app'en kigger bare det forkerte sted.)
>
> Filen [`docker-compose.nas.yml`](docker-compose.nas.yml) i repoet har
> præcis den rigtige linje, så den kan kopieres direkte ind.

## Det daglige: få en ændring ud på NAS'en

1. Claude laver ændringen og en pull request på GitHub.
2. Du åbner pull requesten og klikker den grønne knap **Merge pull request**
   → **Confirm merge**. *Konsekvens:* ændringen kommer på `main`.
3. Robotten bygger en ny pakke (2–5 minutter). Du kan følge med under fanen
   **Actions** øverst i repoet — et grønt flueben ved *"Publish Docker
   image"* betyder, at pakken er klar.
4. Inden for en time henter NAS'en den selv. Du skal ikke gøre mere.

**Utålmodig?** Container Manager viser ikke "Update available" for pakker
fra GitHub, så gør sådan for at hente den nye udgave med det samme:

1. **Container Manager** → **Projekt** i venstremenuen → højreklik på
   `goat` → **Stop**.
2. Højreklik igen → **Ryd** (Clean). Det fjerner kun de gamle "kasser",
   app'en kørte i — dine data i `Gorecki/data` røres ikke.
3. Gå til **Billede** (Image) i venstremenuen, og slet
   `ghcr.io/denislarsen/goat`.
4. Tilbage i **Projekt**: højreklik på `goat` → **Byg** (Build). Den
   nyeste udgave hentes nu fra GitHub.

**Noget gik i stykker efter en opdatering?** Hver pakke gemmes også under et
versionsnummer. Skriv til Claude, hvilken dato det gik galt, så låser vi
opsætningen til den forrige version.

## Hvis opsætningen på NAS'en skal ændres

Det er sjældent nødvendigt. Men hvis Claude beder dig om at skifte
"opskriften" (filen `docker-compose.nas.yml`), så gør sådan:

1. **Tag en sikkerhedskopi.** Åbn **File Station** → gå til `docker` →
   `Gorecki` → højreklik på mappen `data` → **Komprimer til "data.zip"**.
   Så har du en kopi af alle dine tal, uanset hvad der sker.
2. **Stop projektet.** Container Manager → **Projekt** → højreklik på `goat`
   → **Stop**. Klik **Luk**, når den er færdig. Prikken foran navnet bliver
   rød.
3. **Skift opskriften.** Dobbeltklik på `goat`, og find fanen med **YAML**.
   Klik **Rediger**, markér al teksten og slet den, og indsæt hele indholdet
   af [`docker-compose.nas.yml`](docker-compose.nas.yml). Klik **Gem**.
   Spørger den, om projektet skal bygges med det samme, så vælg kun at gemme.
4. **Tjek den vigtige linje**, før du går videre. Der skal stå:
   `- /volume1/docker/Gorecki/data:/data`
5. **Ryd og byg.** Højreklik på `goat` → **Ryd** → bekræft. Højreklik igen
   → **Byg**. Det tager et minut eller to. Klik **Luk**, når den er færdig.
   Prikken bliver grøn.
6. **Tjek.** Under **Container** skal både `goat` og `goat-watchtower` køre.
   Åbn `http://192.168.0.120:8420` — du skal se dine investeringer som
   før.

**Er app'en tom efter trin 6?** Bare rolig: dine data er ikke væk. Tjek
først linjen fra trin 4. Står den rigtigt, så stop projektet og skriv til
Claude.

## Genvej på iPad'en

Åbn `http://192.168.0.120:8420` i **Safari** → tryk på **Del-knappen**
(firkanten med pil op) → **Føj til hjemmeskærm**. Genvejen får automatisk
guld-G'et med gedehorn. *(Har du en gammel genvej: slet den først og lav en
ny — ellers husker iPad'en det gamle ikon.)*

> Sikkerhed: app'en har intet login, så lad den blive på hjemmenetværket.
> Åbn ikke port 8420 i din router. Det er hele privatlivs-idéen: intet på
> internettet, alt på NAS'en.

---

## Tillæg A — sætte GOAT op forfra (fx på en ny NAS)

Kun hvis alt skal installeres helt fra bunden.

1. **Gør pakken offentlig på GitHub** (er allerede gjort i dag). Repoets
   forside → højre spalte **Packages** → **goat** → **Package settings** →
   rul ned til *Danger Zone* → **Change visibility** → **Public**.
   *Konsekvens:* alle kan hente den tomme app — men aldrig dine data, for de
   er ikke i pakken. (Vil du hellere have den privat, så se Tillæg B.)
2. **Opret datamappen.** **File Station** → `docker` → opret mappen
   `Gorecki`, og inde i den mappen `data`. Har du data fra en gammel
   installation (`goat-data.json`, `backups`, evt. `documents`), så kopiér
   dem ind i den nye `data`-mappe nu.
3. **Opret en projektmappe**, fx `docker/Gorecki/goat`.
4. **Installér app'en.** **Container Manager** → **Projekt** → **Opret**:
   - Projektnavn: `goat` (med små bogstaver; store bogstaver afvises)
   - Sti: projektmappen fra trin 3
   - Kilde: **Opret docker-compose.yml** → indsæt hele indholdet af
     [`docker-compose.nas.yml`](docker-compose.nas.yml).
   - Klik **Næste** / **Udfør** hele vejen igennem.
5. **Tjek**, at `goat` og `goat-watchtower` kører under **Container**, og
   lav genvejen på iPad'en som beskrevet ovenfor.

## Tillæg B — hvis pakken skal være privat

Kun for den grundige. Kræver kommandolinje på NAS'en.

1. På GitHub: profilbillede → **Settings** → **Developer settings** →
   **Personal access tokens** → **Tokens (classic)** → *Generate new token*.
   Kryds kun **`read:packages`** af, sæt lang udløbstid, og kopiér tokenet
   (det er en slags adgangskode — gem det).
2. I Container Manager: **Registrering** → **Indstillinger** → **Tilføj** →
   URL `https://ghcr.io`, brugernavn `denislarsen`, adgangskode = tokenet.
3. Watchtower skal også kunne logge ind: slå SSH til (Kontrolpanel →
   Terminal & SNMP), log ind fra en computer (`ssh dig@192.168.0.120`), og
   kør `docker login ghcr.io` med samme brugernavn og token. Kopiér derefter
   login-filen over:
   `mkdir -p /volume1/docker/Gorecki/.docker && cp ~/.docker/config.json /volume1/docker/Gorecki/.docker/`
4. Fjern `#` foran config.json-linjen i compose-filen (se kommentaren i
   `docker-compose.nas.yml`), og byg projektet igen: **Stop** → **Ryd** →
   **Byg**.
