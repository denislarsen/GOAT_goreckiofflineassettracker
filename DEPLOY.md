# Sådan kører (og opdaterer) GOAT på Synology-NAS'en

Dansk walkthrough — engangsopsætning tager ca. 15 minutter, og derefter
opdaterer NAS'en **sig selv**, hver gang der lander ny kode på `main`.

## Sådan hænger det sammen

1. Ny kode merges til `main` på GitHub.
2. GitHub Actions (`.github/workflows/publish.yml`) bygger automatisk et
   Docker-image og lægger det på GitHub Container Registry som
   `ghcr.io/denislarsen/goat:latest`.
3. På NAS'en kører **Watchtower** ved siden af GOAT. Den tjekker en gang i
   timen, om der er et nyere image — og hvis ja: henter det, genstarter GOAT
   med den nye version og rydder det gamle image op.

Dine data røres aldrig: de ligger i `/volume1/docker/goat/data` på NAS'en og
overlever alle opdateringer (app'en gemmer desuden selv de sidste 30
versioner i `data/backups/`).

## Engangsopsætning

### Trin 1 — Aktivér image-bygningen

Den kører af sig selv første gang, denne branch merges til `main`. Tjek under
fanen **Actions** på GitHub-repoet, at "Publish Docker image" bliver grøn.
(Der skal ikke oprettes nogen secrets — workflowet bruger GitHubs indbyggede
token.)

### Trin 2 — Vælg om imaget skal være privat eller offentligt

Imaget indeholder app'ens kode (men **aldrig** dine data). To muligheder:

- **Offentligt image (nemmest):** GitHub → repoet → **Packages** → `goat` →
  **Package settings** → **Change visibility** → Public. Så kan NAS'en hente
  det uden login, og du kan springe login-delen i trin 3 over.
- **Privat image (anbefalet, mest privatliv):** lad det være privat og giv
  NAS'en adgang med et token:
  1. GitHub → din profil → **Settings** → **Developer settings** →
     **Personal access tokens** → **Tokens (classic)** → *Generate new token*.
     Kryds kun **`read:packages`** af, sæt lang udløbstid, og gem tokenet.
  2. På NAS'en: **Container Manager** → **Registrering (Registry)** →
     **Indstillinger** → **Tilføj** → URL `https://ghcr.io`, brugernavn
     `denislarsen`, adgangskode = tokenet.
  3. Watchtower skal også kunne logge ind. SSH ind på NAS'en og kør
     `docker login ghcr.io` (samme brugernavn/token) — og kopiér derefter
     login-filen til projektmappen:
     `mkdir -p /volume1/docker/goat/.docker && cp ~/.docker/config.json /volume1/docker/goat/.docker/`
     (Det er den fil, `docker-compose.nas.yml` binder ind i Watchtower.
     Kører du med offentligt image, så slet bare den volume-linje.)

### Trin 3 — Opret projektet i Container Manager

1. Opret mappen `/volume1/docker/goat/data` i File Station.
   *(Flytter du fra en eksisterende installation: kopiér din nuværende
   `data`-mappe — `goat-data.json` + `backups/` + evt. `documents/` — herind
   først.)*
2. **Container Manager** → **Projekt** → **Opret**:
   - Projektnavn: `goat`
   - Sti: `/volume1/docker/goat`
   - Kilde: *Opret docker-compose.yml* → indsæt indholdet af
     `docker-compose.nas.yml` fra dette repo.
3. Tryk **Udfør**. Efter et øjeblik kører to containere: `goat` og
   `goat-watchtower`.
4. Åbn `http://<NAS-ens-IP>:8420` i en browser — færdig. Tilføj genvejen til
   iPad-hjemmeskærmen herfra (ikonet følger med automatisk).

## Hverdagen derefter

- **Ingenting.** Watchtower tjekker hver time og ruller nye versioner ud af
  sig selv. En opdatering giver få sekunders afbrydelse — data er urørt.
- **Vil du opdatere NU:** Container Manager → Projekt → `goat` → **Handling**
  → *Genopbyg* (eller via SSH: `docker compose -f docker-compose.nas.yml pull
  && docker compose -f docker-compose.nas.yml up -d` fra projektmappen).
- **Rulle tilbage:** hvert image tagges også med commit-hash
  (`ghcr.io/denislarsen/goat:<sha>`), så du kan pinne en bestemt version i
  compose-filen, hvis en opdatering driller.

## Plan B — uden Docker

App'en er ren Node uden npm-pakker, så den kan også køre direkte:

1. Installér **Node.js v20+** fra Synology Package Center.
2. Læg repoet i `/volume1/docker/goat-src` (fx via `git clone`).
3. **Kontrolpanel** → **Opgaveplanlægning** → *Udløst opgave* (ved opstart):
   `cd /volume1/docker/goat-src && DATA_DIR=/volume1/docker/goat/data PORT=8420 node server.js`
4. Automatiske opdateringer: endnu en planlagt opgave (fx dagligt kl. 04):
   `cd /volume1/docker/goat-src && git pull && synoschedtask --run <opstartsopgavens-id>`
   — men Docker-vejen ovenfor er mere robust og anbefales.

> Som altid: app'en har intet login, så lad port 8420 blive på hjemmenetværket
> — åbn den ikke i routeren.
