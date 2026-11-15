# Datenschutzhinweise

Stand: {version}

Diese Hinweise erklären, welche personenbezogenen Daten der Discord-Bot **{botName}** verarbeitet, wenn du an einem Event teilnimmst (z. B. einem Build Battle), dich als Judge beteiligst oder das Dashboard nutzt, und welche Rechte du hast.

## 1. Verantwortlicher

Verantwortlich im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:

{operatorName}
{operatorAddress}
E-Mail: {operatorEmail}

Ein Datenschutzbeauftragter ist nicht bestellt, da keine Pflicht dazu besteht.

Die Events werden gemeinsam mit den beteiligten Communities durchgeführt (z. B. BTE Germany und BTE Poland). Deren Team- und Judge-Mitglieder sehen die unten genannten Event-Daten, soweit das für Durchführung und Bewertung nötig ist. Für deine Anfragen ist immer der oben genannte Verantwortliche dein Ansprechpartner.

## 2. Welche Daten wir verarbeiten

**Discord-Daten**
- deine Discord-Nutzer-ID, dein Nutzer- bzw. Anzeigename und – nur für die Profilkarte, ohne Speicherung – dein Profilbild
- die ID des Servers und Kanals, in dem du den Bot nutzt
- die Spracheinstellung deines Discord-Clients (nur zur Anzeige in deiner Sprache, ohne Speicherung)

**Registrierung**
- dein Minecraft-Name und dein Team
- Zeitpunkt und Version der von dir akzeptierten Nutzungsbedingungen
- ob du von einem Event ausgeschlossen wurdest

**Einreichungen**
- Koordinaten, Art und Link der Referenz, optional die gebaute Fläche
- deine Screenshots
- Hinweise, die du für die Judges hinterlegst
- Status, Bewertungen, Ablehnungsgründe und Korrekturen

**Judges**
- Discord-ID und Name, Team bzw. neutrale Gruppe
- abgegebene Bewertungen, Ablehnungen und Korrekturen samt Begründung

**Aktivitätsprotokoll**
- Registrierungen, Einreichungen, Bewertungen, Korrekturen und Löschungen mit Zeitpunkt, beteiligter Person und Punkteänderung

**Dashboard (nur Administratoren)**
- ein Sitzungs-Cookie, das für die Anmeldung technisch notwendig ist (Gültigkeit 12 Stunden)

**Server-Logs**
- technische Protokolle des Bot-Servers mit Zeitpunkt, Discord-ID, Namen und Fehlermeldungen

## 3. Zwecke und Rechtsgrundlagen

- **Durchführung des Events** (Registrierung, Einreichung, Bewertung, Punktevergabe, Benachrichtigungen): Art. 6 Abs. 1 lit. b DSGVO – die Teilnahme erfolgt auf Grundlage der Nutzungsbedingungen.
- **Veröffentlichung von Einreichungen und Ranglisten** in den Discord-Kanälen der beteiligten Server, in Ankündigungen und im Event-Abschluss: Art. 6 Abs. 1 lit. b DSGVO, da die öffentliche Wertung Teil des Wettbewerbs ist.
- **Öffentliche Rangliste über die Web-Schnittstelle** (siehe Abschnitt 5): Art. 6 Abs. 1 lit. f DSGVO – unser berechtigtes Interesse ist, die Event-Ergebnisse z. B. auf Websites und im Minecraft-Server (/lb) anzuzeigen.
- **Aktivitätsprotokoll und Server-Logs**: Art. 6 Abs. 1 lit. f DSGVO – berechtigtes Interesse an fairen, nachvollziehbaren Bewertungen, an der Aufklärung von Missbrauch und an einem stabilen Betrieb.
- **Nachweis der akzeptierten Nutzungsbedingungen**: Art. 6 Abs. 1 lit. f DSGVO und Art. 6 Abs. 1 lit. b DSGVO.
- **Sitzungs-Cookie im Dashboard**: § 25 Abs. 2 Nr. 2 TDDDG (technisch notwendig) und Art. 6 Abs. 1 lit. f DSGVO.

Wir treffen keine automatisierten Entscheidungen im Sinne von Art. 22 DSGVO. Bewertungen werden von Menschen (den Judges) vorgenommen; der Bot berechnet daraus nur die Durchschnitte.

## 4. Empfänger

- **Discord Inc.** (USA) – über Discord läuft die gesamte Kommunikation mit dem Bot. Es gelten die Datenschutzbestimmungen von Discord.
- **Mitglieder der beteiligten Discord-Server** – sehen deine Einreichungen, Bewertungen und Ranglisten in den jeweiligen Kanälen. Judge-Ansichten (Einzelbewertungen, Hinweise, Korrekturen) sehen nur Personen mit Zugriff auf den Judge-Kanal.
- **Microsoft (Azure Blob Storage)** – speichert deine Screenshots, sofern der Bildspeicher aktiviert ist. Andernfalls verbleiben sie bei Discord.
- **{hostingProvider}** – betreibt den Server, auf dem Bot und Datenbank laufen (Auftragsverarbeitung nach Art. 28 DSGVO).
- **Empfänger eines optional eingerichteten Statistik-Webhooks** – erhalten die öffentlichen Ranglistendaten (Abschnitt 5).

Discord und Microsoft können Daten in den USA verarbeiten. Beide sind unter dem EU-US Data Privacy Framework zertifiziert; die Übermittlung stützt sich auf den Angemessenheitsbeschluss der EU-Kommission (Art. 45 DSGVO).

## 5. Öffentlich einsehbare Daten

Folgende Daten sind für alle Mitglieder der beteiligten Discord-Server und über die öffentliche Web-Schnittstelle ({publicUrl}/leaderboard) für jedermann abrufbar:

- Discord-ID und Minecraft-Name von Teilnehmenden mit Punkten sowie deren Punktestand
- zu jeder Einreichung: Koordinaten, Referenz-Link und -Art, Screenshots, Bewertung je Kategorie, Discord-IDs der bewertenden Judges und Zeitpunkt der Einreichung

Nicht öffentlich sind: Hinweise an die Judges, Ablehnungsgründe (außer im Panel deiner eigenen Einreichung), Korrekturgründe und das Aktivitätsprotokoll.

## 6. Speicherdauer

- **Event-Daten** (Registrierung, Einreichungen, Bewertungen, Aktivitätsprotokoll) werden spätestens {retentionMonths} Monate nach dem Ende des Events automatisch gelöscht. Screenshots im Bildspeicher werden dabei ebenfalls gelöscht.
- Löschen Judges eine Einreichung, werden Daten und Screenshots sofort entfernt.
- **Server-Logs** werden spätestens nach 30 Tagen gelöscht.
- **Anmelde-Links** für das Dashboard verfallen nach 10 Minuten, **Sitzungen** nach 12 Stunden.
- Bereits in Discord gesendete Nachrichten (z. B. Ankündigungen) bleiben bestehen, bis sie in Discord gelöscht werden.

## 7. Pflicht zur Bereitstellung

Die Angabe deines Minecraft-Namens und die Daten deiner Einreichungen sind für die Teilnahme erforderlich. Ohne sie ist eine Teilnahme nicht möglich. Eine gesetzliche Pflicht zur Bereitstellung besteht nicht.

## 8. Deine Rechte

Du hast das Recht auf:
- Auskunft über deine gespeicherten Daten (Art. 15 DSGVO)
- Berichtigung unrichtiger Daten (Art. 16 DSGVO)
- Löschung (Art. 17 DSGVO)
- Einschränkung der Verarbeitung (Art. 18 DSGVO)
- Datenübertragbarkeit (Art. 20 DSGVO)

Wende dich dazu per E-Mail an {operatorEmail}. Gib dabei bitte deine Discord-ID an, damit wir dich zuordnen können.

**Widerspruchsrecht (Art. 21 DSGVO):** Soweit wir Daten auf Grundlage berechtigter Interessen verarbeiten (Art. 6 Abs. 1 lit. f DSGVO), kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen – insbesondere gegen die Veröffentlichung über die Web-Schnittstelle.

Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, etwa bei der Behörde deines Wohnorts. Für uns zuständig ist das Bayerische Landesamt für Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach.

## 9. Minderjährige

Am Bot dürfen alle teilnehmen, die Discord nach dessen Bedingungen in ihrem Land nutzen dürfen. Die Verarbeitung stützt sich nicht auf eine Einwilligung, sondern auf die Teilnahme am Event. Bist du unter 18 Jahre alt, sprich bitte vor der Teilnahme mit deinen Eltern bzw. Erziehungsberechtigten.

## 10. Änderungen

Wir passen diese Hinweise an, wenn sich der Bot oder die Rechtslage ändert. Die aktuelle Fassung kannst du jederzeit mit `/legal` abrufen. Bei wesentlichen Änderungen informiert dich der Bot vor deiner nächsten Einreichung.
