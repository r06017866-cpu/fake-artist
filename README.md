# Fake Artist 🎨🤫 + Umfrage-Tool 📊

Auf diesem Server laufen drei Dinge:
- **Fake Artist** unter `/` (das Spiel)
- **Umfrage-Tool** unter `/umfrage` (Abstimmungen ohne Konto)
- **Poker** unter `/poker` (Texas Hold'em mit Spielchips)

Ein Zeichen- und Bluff-Spiel fürs Handy, für 3–10 Leute (am besten 4–8).
Alle zeichnen gemeinsam ein geheimes Wort, Strich für Strich. Nur einer, der **Fake**, kennt das Wort nicht und muss so tun, als ob.

## So wird gespielt
1. Eine Person erstellt einen Raum und teilt den Link oder den 4-stelligen Code.
2. Alle halten die Geheimkarte gedrückt: Ihr seht die **Kategorie** und das **Wort**. Der Fake sieht nur die Kategorie.
3. Reihum zeichnet jeder **einen einzigen Strich** (Finger nicht absetzen). Insgesamt zwei Runden.
4. Abstimmen: Wer ist der Fake?
5. Wird der Fake erwischt, darf er das Wort raten. Ist es richtig, gewinnt er trotzdem.

**Punkte:** Gewinnt der Fake, bekommt er +2 Punkte. Wird er erwischt und rät falsch, bekommen alle anderen +1 Punkt.
Gleichstand bei der Abstimmung bedeutet: Der Fake kommt davon.

In der Lobby kann der Host **eigene Begriffe** eintragen (eine Zeile pro Begriff, z.B. `Lehrer: Herr Müller`). Das ist perfekt für Insider aus der Klasse.

---

## Online stellen (gratis mit Render)

Damit deine Kollegen von überall mitspielen können, braucht das Spiel einen Server. Render ist dafür gratis.

### 1. Code auf GitHub hochladen
1. Melde dich bei https://github.com an oder erstelle ein Konto.
2. Oben rechts auf **+**, dann **New repository** wählen. Gib einen Namen ein, z.B. `fake-artist`, wähle **Public** und klicke **Create repository**.
3. Auf der neuen Seite klickst du auf **uploading an existing file**.
4. Ziehe **alle Dateien und Ordner aus diesem Ordner** ins Fenster: `server.js`, `polls.js`, `words.js`, `package.json`, `package-lock.json`, `README.md`, `.gitignore` und den Ordner `public`.
   Lade **nicht** den Ordner `node_modules` hoch, falls du einen hast.
5. Klicke unten auf **Commit changes**.

> Tipp: Wenn `.gitignore` nicht sichtbar ist, ist das egal. Wichtig sind `server.js`, `words.js`, `package.json` und `public/index.html`.

### 2. Auf Render starten
1. Gehe zu https://render.com und melde dich mit deinem **GitHub-Konto** an.
2. Klicke **New +**, dann **Web Service**, und wähle dein Repository `fake-artist`.
3. Einstellungen:
   - **Language / Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Klicke **Create Web Service** (oder **Deploy**). Nach ein bis zwei Minuten steht oben ein Link wie `https://fake-artist-xxxx.onrender.com`.
5. Das ist euer Spiel-Link. Öffne ihn auf dem Handy, erstelle einen Raum und teile den Link.

### Gut zu wissen
- Der Gratis-Server **schläft nach 15 Minuten ohne Nutzung ein**. Der erste Aufruf danach dauert bis zu etwa einer Minute. Öffne den Link also kurz bevor ihr spielen wollt.
- Räume werden nicht dauerhaft gespeichert. Wenn der Server neu startet, erstellt ihr einfach einen neuen Raum.
- Wenn du auf GitHub etwas änderst (z.B. neue Wörter in `words.js`), aktualisiert Render das Spiel automatisch.

---

## Umfrage-Tool 📊
Öffne `/umfrage`, z.B. `https://dein-link.onrender.com/umfrage`.
- Frage und Antworten eingeben, Umfrage erstellen und den Link teilen.
- Optionen: mehrere Antworten erlauben, Namen zeigen, Ergebnisse erst nach Abstimmen.
- Wer die Umfrage erstellt hat, kann sie schliessen, wieder öffnen oder löschen.
- Niemand braucht ein Konto. Jedes Gerät bekommt eine zufällige ID, damit man nur einmal abstimmt (Stimme ändern geht).
- Umfragen werden nach 60 Tagen automatisch gelöscht.

### Datenbank verbinden (damit Umfragen nicht verloren gehen)
Ohne Datenbank speichert der Server Umfragen nur im Arbeitsspeicher. Wenn der Gratis-Server einschläft, sind sie weg.
1. Auf https://neon.com ein Gratis-Konto erstellen (Anmeldung mit GitHub geht).
2. Ein Projekt erstellen (Name z.B. `umfragen`, Region möglichst gleich wie bei Render).
3. Auf **Connect** klicken und den **Connection string** kopieren (beginnt mit `postgresql://`).
4. In Render beim Web Service auf **Environment** gehen, **Add Environment Variable** wählen:
   - Key: `DATABASE_URL`
   - Value: den kopierten Link einfügen
5. Speichern und neu deployen. Im Log sollte stehen: `Umfragen werden gespeichert in: Postgres-Datenbank`.

## Poker 🃏
Öffne `/poker`, eröffne einen Tisch und teile den Link. Texas Hold'em No-Limit als Cash-Game, 2–9 Spieler, nur Spielchips.
- Der Host stellt Start-Chips, Blinds und die Zeit pro Zug ein (im Menü auch später änderbar, gilt ab der nächsten Hand).
- Wer pleite ist, kann nachkaufen. Die Statistik (📊) zählt für den Tisch, die Hand-Rangliste (🃏) zeigt, welche Hand gewinnt.
- Dateien: `poker-engine.js` (Spielregeln), `poker.js` (Tische und Timer), `public/poker.html` (Oberfläche).

## Auf dem eigenen Computer testen
Dafür brauchst du [Node.js](https://nodejs.org), Version 18 oder neuer.

```
npm install
npm start
```

Danach öffnest du http://localhost:3000. Um alleine zu testen, öffne drei Browser-Fenster, eins davon im Inkognito-Modus. Jedes Fenster ist dann ein eigener Spieler.

## Dateien
- `server.js`: der Spielserver (Räume, Runden, Abstimmung, Punkte)
- `words.js`: alle Begriffe. Hier kannst du Kategorien und Wörter ergänzen.
- `public/index.html`: die Handy-Oberfläche von Fake Artist
- `polls.js`: der Server-Teil vom Umfrage-Tool (Speichern, Abstimmen)
- `public/umfrage.html`: die Oberfläche vom Umfrage-Tool
- `poker-engine.js`, `poker.js`, `public/poker.html`: Poker
