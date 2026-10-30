# mo-tion time

**live:** [time.mo-tion.at](https://time.mo-tion.at) · **source:** [github.com/moon-int/time](https://github.com/moon-int/time) · MIT licence

Vollbild-Uhr für Events mit Live-Ablaufplan und zeitgesteuerten HTTP-Cues
(Webhooks, Bitfocus Companion, eigene APIs).

- Digitale Uhr mit Sekundenring, Zeitzonen, 12/24 h, 4 Sprachen (DE/EN/FR/ES)
- Hintergrund passt sich der Tageszeit an (oder statische Farbe)
- Ablaufplan mit Cues (täglich / wöchentlich / einmalig), manuell oder automatisch senden
- Live-Ablauf-Ansicht (runterscrollen) mit Countdown zum nächsten Cue
- Eigenes CSS / Mod-Script, Konfiguration als JSON export-/importierbar
- Alle Einstellungen werden im Browser gespeichert (`localStorage`, pro Domain)

Keine Abhängigkeiten, kein Build-Schritt — reines HTML/CSS/JS in `public/`.

## Lokal starten

```bash
npm start            # http://localhost:3000 — nur die Web-App
npm run relay        # http://localhost:4100 — Web-App + lokaler Relay
npm run relay:headless   # nur der Relay-Endpunkt
```

## Deployment auf Vercel

1. Repository auf GitHub pushen und in Vercel importieren (**Add New → Project**).
   Framework-Preset „Other“; Build-Einstellungen kommen aus `vercel.json`
   (kein Build, Ausgabeverzeichnis `public/`).
2. Optional: Umgebungsvariable `RELAY_TOKEN` setzen (beliebiger langer Zufallswert),
   um den Serverless-Relay `/api/relay` zu aktivieren. Ohne Token ist er deaktiviert.
3. Deploy. Alternativ per CLI: `npx vercel` (Preview) bzw. `npx vercel --prod`.

## Wie Cues gesendet werden

| Ziel | Einstellung „Lokaler Relay“ |
| --- | --- |
| Öffentliche API mit CORS-Headern | leer lassen — direkt aus dem Browser |
| Öffentliche API ohne CORS | Relay-URL = eigene Vercel-URL, Token = `RELAY_TOKEN` |
| Gerät im LAN (z.B. Companion) | `npm run relay:headless` auf einem Rechner im LAN starten, Relay-URL = `http://localhost:4100`, Token aus dem Terminal |

Hinweis: Eine https-Seite (Vercel) darf keine `http://`-Ziele im LAN direkt
aufrufen (Mixed Content). `http://localhost` ist davon ausgenommen — daher den
lokalen Relay auf demselben Rechner laufen lassen, auf dem die Seite geöffnet
ist. Der Serverless-Relay auf Vercel erreicht keine privaten Netzwerke.

Automatisches Senden funktioniert nur, solange die Seite in einem Browser-Tab
geöffnet ist.
