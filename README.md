# Get-Chassi – Installations- och användarguide för Chromebook (Linux)

Denna guide sammanfogar de projektspecifika inställningarna för **Get-Chassi** med lösningen för ChromeOS-specifika problem (t.ex. `npm placeholder`-felet).

---

## 1. Förberedelse: Åtgärda ChromeOS Node/npm-platshållare
ChromeOS har inbyggda "döda" genvägar för Node och npm. Rensa dem först och installera Node via NVM:

```bash
# 1. Ta bort gamla systempaket och platshållare
sudo apt remove -y nodejs npm
sudo rm -f /usr/bin/npm /usr/local/bin/npm /usr/bin/node /usr/local/bin/node
hash -r

# 2. Installera NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# 3. Installera Node.js (LTS) och lås sök-sökvägen (PATH) för NVM
nvm install --lts
echo 'export PATH="$HOME/.nvm/versions/node/$(nvm current)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```
*Verifiera genom att köra `npm -v`. Det ska visa ett giltigt versionsnummer.*

---

## 2. Klona och Installera Get-Chassi

1. **Klona projektet**:
   ```bash
   git clone https://github.com/bjud-in-oss/get-chassi
   cd get-chassi
   ```

2. **Installera beroenden**:
   ```bash
   npm install
   ```

   > **Obs vid fel:** Om du får felmeddelandet `ReferenceError: File is not defined`, kör följande kommando för att installera rätt version av Cheerio:
   > ```bash
   > npm install cheerio@1.0.0-rc.12
   > ```

---

## 3. Starta Applikationen

Starta servern med:
```bash
npm start
```

När servern är igång visas meddelandet:
`🚗 Get-Chassi körs på http://localhost:3131`

Öppna din webbläsare på Chromebooken och gå till:
**[http://localhost:3131](http://localhost:3131)**

---

## 4. Stänga av servern

När du vill avsluta programmet och frigöra systemresurser:
1. Gå till terminalfönstret där servern körs.
2. Tryck **`Ctrl + C`**.

Detta gör en säker nedstängning som stänger Puppeteer-webbläsaren, Express-servern och frigör minnet.

---

## 5. Synkronisering (`gs`)

Om du använder `gs` för synkronisering kan du kopiera denna dokumentation till din synkmapp:

```bash
cp README.md ~/[SYNC_FOLDER]/
```

---

## Tekniska Detaljer
- **Port**: 3131
- **Webbläsare**: Puppeteer (Chromium)
- **Motor**: Node.js
