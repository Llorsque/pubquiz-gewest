# Pubquiz Scoreboard (Admin + Display, realtime)

Een superlicht punten-systeem voor een pubquiz:
- **Admin-scherm**: teams aanmaken, hernoemen, punten +/-, resetten
- **Display-scherm**: grote, visuele tussenstand (geschikt voor 75" schermen)
- **Realtime sync** via Socket.IO: invoeren op laptop A, presenteren op laptop B

## Vereisten
- Node.js 18+ (of 16+ werkt meestal ook)

## Installeren
```bash
npm install
```

## Starten
```bash
npm start
```

Standaard draait hij op `http://localhost:3000`.

## Openen
- **Admin (met pin):** `http://localhost:3000/admin.html?pin=1234`
- **Display:** `http://localhost:3000/display.html`

> Tip: zet je eigen pin via environment variable:
```bash
# mac/linux
ADMIN_PIN=9876 npm start

# windows powershell
$env:ADMIN_PIN="9876"; npm start
```

## Gebruik op 2 laptops (zelfde netwerk)
1. Start de server op laptop A (of een kleine mini-pc).
2. Zoek het lokale IP-adres van laptop A (bijv. `192.168.1.20`).
3. Open op **laptop A** (admin):  
   `http://192.168.1.20:3000/admin.html?pin=9876`
4. Open op **laptop B** (presentatie):  
   `http://192.168.1.20:3000/display.html`

Zodra je punten wijzigt in admin, update het display automatisch.

## Data opslag
De huidige stand wordt automatisch opgeslagen in `data/state.json`.  
Bij herstart gaat hij verder waar je gebleven was.

## Extra tips voor presentatie
- Zet de display pagina in **fullscreen** (F11).
- Gebruik browser zoom als je nóg groter wilt.
- Klik op het tandwieltje rechtsboven in display om de **schaal** aan te passen.

---

## GitHub workflow (advies)
Maak een `dev` branch voor wijzigingen en merge pas naar `main` als alles werkt.
