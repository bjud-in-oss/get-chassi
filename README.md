# Installationsguide: get-chassi för Chromebook (Linux)

Denna guide beskriver steg för steg hur du sätter upp utvecklingsmiljön, installerar Node.js korrekt och startar applikationen `get-chassi` i Linux-miljön (Crostini) på en Chromebook. Guiden löser specifikt problemet med felmeddelandet `npm placeholder: command install not implemented` som är vanligt på ChromeOS.

## 1. Rensa bort ChromeOS inbyggda platshållare
ChromeOS levereras ibland med "döda" genvägar för Node och npm som blockerar riktiga installationer. Börja med att rensa bort dessa:

```bash
# Avinstallera eventuella systempaket av Node/npm
sudo apt remove -y nodejs npm

# Tvinga bort platshållarfilerna från systemet
sudo rm -f /usr/bin/npm /usr/local/bin/npm /usr/bin/node /usr/local/bin/node

# Rensa terminalens minne av gamla sökvägar
hash -r
```

## 2. Installera NVM (Node Version Manager)
Det säkraste och smidigaste sättet att installera Node.js i Linux är via NVM.

```bash
# Ladda ner och installera NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Ladda in NVM i den nuvarande terminalsessionen
source ~/.bashrc
```

## 3. Installera Node.js och säkerställ rätt PATH
Installera den senaste stabila versionen (LTS) av Node.js.

```bash
# Installera senaste LTS-versionen av Node.js
nvm install --lts
```

**Viktigt för Chromebook:** För att säkerställa att terminalen alltid prioriterar NVM:s version av npm istället för att leta efter ChromeOS platshållare, uppdatera din PATH:

```bash
# Tvinga terminalen att prioritera NVM:s bin-mapp i PATH
echo 'export PATH="$HOME/.nvm/versions/node/$(nvm current)/bin:$PATH"' >> ~/.bashrc

# Ladda om terminalprofilen
source ~/.bashrc
```

Kontrollera att installationen lyckades genom att köra `npm -v`. Det ska nu visa ett riktigt versionsnummer (t.ex. `10.8.2`) och *inte* ett "placeholder"-meddelande.

## 4. Hämta källkoden (om du inte redan har den)
Om du behöver ladda ner projektet på nytt från Git:

```bash
# Installera git om det saknas på datorn
sudo apt update && sudo apt install -y git

# Klona projektet (byt ut länk till repot nedan)
git clone <länk-till-git-repo> ~/get-chassi
```

## 5. Installera beroenden och kör applikationen
Navigera in i projektmappen, installera alla nödvändiga Node-moduler och starta servern.

```bash
# Gå till projektmappen
cd ~/get-chassi

# Installera projektets beroenden (Detta skapar mappen node_modules)
npm install

# Starta webbservern
npm start
```
*(Skulle paketet sakna ett npm start-skript kan du starta servern direkt med `node server.js`)*.

När servern är igång och indikerar att den lyssnar på en port, öppna webbläsaren i din Chromebook och navigera till:
**http://localhost:3000** *(eller den port som anges i terminalen)*.
