# 🚀 Deploya Finns i sjön på Railway + GitHub

## Förberedelser (gör en gång)

### 1. Skapa GitHub-konto
Gå till [github.com](https://github.com) och skapa ett konto om du inte har ett.

### 2. Installera Git på din dator
Om du inte har Git installerat:
- **Mac:** `xcode-select --install`
- **Windows:** Ladda ner från [git-scm.com](https://git-scm.com)

### 3. Logga in på GitHub via terminalen
```bash
git config --global user.name "Ditt Namn"
git config --global user.email "din@email.com"
```

---

## Steg 1: Pusha koden till GitHub

Öppna terminalen i projektmappen (`finns i sjon`) och kör dessa kommandon:

```bash
# 1. Gå till projektmappen
cd "finns i sjon"

# 2. Initiera Git (om det inte redan finns)
git init

# 3. Lägg till alla filer
git add .

# 4. Gör första commit
git commit -m "Första commit - Finns i sjön"

# 5. Skapa repo på GitHub (gör detta via webben)
#    Gå till github.com → New Repository → Name: finns-i-sjon → Create

# 6. Koppla din lokala mapp till GitHub (byt ut DITT-ANVÄNDARNAMN)
git remote add origin https://github.com/DITT-ANVÄNDARNAMN/finns-i-sjon.git

# 7. Pusha koden
git branch -M main
git push -u origin main
```

✅ Nu ligger koden på GitHub!

---

## Steg 2: Skapa Railway-konto

1. Gå till [railway.app](https://railway.app)
2. Klicka "Start a New Project"
3. Välj "Deploy from GitHub repo"
4. Logga in med ditt GitHub-konto och godkänn åtkomst

---

## Steg 3: Deploya från GitHub

1. I Railway: Klicka "New Project"
2. Välj "Deploy from GitHub repo"
3. Välj ditt `finns-i-sjon`-repo
4. Railway detekterar `package.json` och `Procfile` automatiskt
5. Klicka "Deploy"

⏳ Vänta 1–2 minuter medan Railway bygger och startar.

---

## Steg 4: Lägg till miljövariabler

1. I Railway, klicka på din app
2. Gå till fliken **Variables**
3. Lägg till dessa variabler (klicka "New Variable"):

| Variabel | Värde |
|----------|-------|
| `JWT_SECRET` | `byt-ut-denna-till-en-lång-slumpmässig-sträng` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |

4. Railway startar om appen automatiskt

---

## Steg 5: Öppna spelet

1. I Railway, gå till fliken **Settings**
2. Under **Environment** hittar du din URL, t.ex.:
   ```
   https://finns-i-sjon.up.railway.app
   ```
3. Klicka på den — spelet ska ladda! 🎉

---

## Steg 6: Koppla din domän (valfritt)

Om du vill använda `finnsisjon.online` istället för Railway-URL:

1. I Railway → Settings → **Domains**
2. Klicka "Generate Domain" för Railway-URL, eller "Custom Domain" för din egen
3. Om du väljer custom domain:
   - Skriv in: `finnsisjon.online`
   - Railway visar ett DNS-värde (t.ex. `cname.railway.app`)
   - Gå till Loopia (där du köpt domänen) → DNS → lägg till en **CNAME**-peka:
     - Namn: `@` eller `www`
     - Typ: `CNAME`
     - Värde: det Railway ger dig

---

## Viktigt om databasen på Railway

På Railway's **gratisplan** är filsystemet "ephemeral" — det betyder att SQLite-databasen **nollställs vid varje deploy/omstart**.

### Alternativ:
1. **OK för provkörning** — konton och spelhistorik försvinner vid omstart
2. **Lägg till Railway PostgreSQL** (gratis, upp till 500 MB):
   - I Railway → "New" → "Database" → "Add PostgreSQL"
   - Ändra `DATABASE_URL` till PostgreSQL-anslutningssträngen (kräver kodändring)

För en permanent lösning med sparad data rekommenderas att migrera från SQLite till PostgreSQL.

---

## Uppdatera koden efter ändringar

När du gjort ändringar lokalt och vill uppdatera Railway:

```bash
cd "finns i sjon"
git add .
git commit -m "Beskrivning av ändring"
git push origin main
```

Railway deployar automatiskt vid varje push till `main`!

---

## Felsökning

| Problem | Lösning |
|---------|---------|
| "Application failed to start" | Kolla **Deploy Logs** i Railway för fel |
| "Cannot GET /" | Servern startade men statiska filer hittades inte — kolla att `public_html` finns i repot |
| Spelet laddar men inte multiplayer | WebSocket-anslutning misslyckas — kontrollera att `wss://` används (Railway hanterar detta automatiskt) |
