# Faktura-Modul

Faktura ist ein optionales Modul für Notorious, das ein Rechnungswesen/eine Buchhaltung für ein
einzelnes Unternehmen (ein Workspace = ein Mandant) bereitstellt: Kunden- und Lieferantenverwaltung,
Produkte/Preise, eine vollständige Belegkette (Angebot → Auftrag → Rechnung → Gutschrift),
Zahlungserfassung, ein automatisiertes Mahnwesen, eine vereinfachte doppelte Buchführung mit
DATEV-Export sowie ein touch-optimiertes Kassensystem (POS) für den Verkauf vor Ort.

Es wird schrittweise in Phasen entwickelt (siehe `docs/ROADMAP.md` bzw. die Faktura-Planungshistorie
für den aktuellen Stand). Dieses Dokument beschreibt den fachlichen Umfang und – besonders wichtig –
**wo dieses Modul rechtlich an seine Grenzen stößt.**

## Funktionsumfang (Stand: Phase 1–3)

- **Stammdaten**: Kunden (Firma/Privatperson, mehrere Kontakte/Adressen), Lieferanten,
  Produkte/Dienstleistungen mit Staffel- und kundenspezifischen Preisen.
- **Belegkette**: Angebot, Auftrag, Rechnung (auch freihändig), Gutschrift – als PDF, mit
  serverseitig berechneten, unveränderlichen Summen und lückenlosen Nummernkreisen ab dem Zeitpunkt
  des Ausstellens.
- **Zahlungen & Mahnwesen**: manuelle Zahlungserfassung, automatische Erkennung überfälliger
  Rechnungen mit vorgeschlagener Mahnstufe (Zahlungserinnerung/1./2. Mahnung), Versand nur nach
  manueller Bestätigung.
- **Buchhaltung**: reduzierter Kontenrahmen (SKR03/SKR04, wählbar), automatische
  Buchungsvorschläge aus Rechnungen/Zahlungen/Ausgaben, ein Bestätigungs-Workflow (Buchungs-Inbox),
  unveränderliche Buchungen nach Bestätigung (Korrektur nur per Storno-Buchung), DATEV-EXTF-CSV-Export.
- **Kassensystem (POS)**: Produktraster mit Favoriten und frei sortierbaren, farbigen Kacheln,
  Kassenbuch (Kasse öffnen/schließen mit Soll-Ist-Abgleich), Barzahlungs-Rechner mit Rückgeld,
  QR-Code zum Bon-Download fürs Kundenhandy, Storno-Funktion für einzelne Kassenverkäufe.
- **Testmodus & Zurücksetzen**: eine Checkbox in den Firmeneinstellungen, mit der sich das gesamte
  Modul gefahrlos ausprobieren lässt, sowie eine doppelt abgesicherte Funktion, um alle
  Geschäftsdaten wieder auf null zu setzen (siehe eigener Abschnitt unten).

## Testmodus

In den Firmeneinstellungen (`Testmodus`) gibt es eine Checkbox „Testmodus aktiv". Ist sie gesetzt,
druckt der Renderer auf **jedes** erzeugte PDF – Angebote, Aufträge, Rechnungen, Gutschriften,
Mahnungen und Kassenbons – ein deutlich sichtbares rotes Banner „TESTMODUS – KEIN ECHTER BELEG".
So können sich Nutzer:innen mit dem kompletten Ablauf (Belege erstellen, Kasse bedienen, Mahnungen
auslösen …) vertraut machen, ohne dass dabei Dokumente entstehen, die wie echte, rechtsverbindlich
ausgestellte Belege aussehen. Nummernkreise werden im Testmodus **nicht** separat geführt – vergebene
Nummern zählen normal weiter. Vor dem produktiven Einsatz muss der Testmodus deaktiviert werden.

## Faktura-Daten zurücksetzen

Unten in den Firmeneinstellungen befindet sich unter „Gefahrenzone" eine Funktion, um **alle**
Geschäftsdaten dieses Workspace-Mandanten unwiderruflich zu löschen: Kunden, Lieferanten, Produkte,
Angebote/Aufträge/Rechnungen/Gutschriften/Kassenbons, Zahlungen, Mahnungen, Ausgaben, Buchungen,
Kassenschichten und alle zugehörigen Anhänge/Bon-PDFs. **Erhalten bleiben** die Firmeneinstellungen
selbst (Adresse, Steuerdaten, Bankverbindung), der gewählte Kontenrahmen, die
Belegnummernkreis-Präfixe und der Testmodus-Status – ein Reset erfordert also nicht, das
Firmenprofil erneut einzurichten.

Die Aktion ist zweifach abgesichert, damit sie nicht versehentlich ausgelöst werden kann:

1. Ein modaler Bestätigungsdialog mit einer klaren Warnung.
2. Eine Texteingabe, die exakt das Wort **„ZURÜCKSETZEN"** enthalten muss, bevor der endgültige
   Löschen-Button überhaupt aktiv wird.

Der Vorgang ist **nicht rückgängig zu machen** – es gibt kein Backup/Undo innerhalb des Moduls
(unabhängig von etwaigen App-weiten ZIP-Backups). Nach dem Zurücksetzen bleibt ein einzelner
Audit-Log-Eintrag bestehen, der Zeitpunkt und ausführende Person des Resets dokumentiert.

## ⚠️ Rechtliche Einordnung – bitte vor Nutzung lesen

Dieses Modul unterstützt bei der Rechnungsstellung und Buchführung, **ersetzt aber keine rechtliche
oder steuerliche Beratung** und ist **nicht** durch eine unabhängige Stelle zertifiziert oder
geprüft. Konkret bekannte Lücken/Einschränkungen:

- **GoBD**: Das Modul bildet zentrale GoBD-Prinzipien technisch nach (unveränderliche Belege und
  Buchungen nach Ausstellung/Bestätigung, lückenlose Nummernkreise, Storno statt Löschen,
  Audit-Log). Es gab jedoch **keine Prüfung durch einen Steuerberater, Wirtschaftsprüfer oder das
  Finanzamt**, und es existiert keine Verfahrensdokumentation, wie sie eine vollständige
  GoBD-Konformität in der Praxis üblicherweise voraussetzt.
- **E-Rechnung (XRechnung/ZUGFeRD)**: **Nicht implementiert.** Wenn deine Pflicht zur Ausstellung
  strukturierter E-Rechnungen bereits gilt oder absehbar greift, deckt dieses Modul das aktuell
  nicht ab.
- **DATEV-Export**: Das EXTF-CSV-Format wurde nach bestem verfügbaren Wissen umgesetzt, **ohne
  Zugriff auf die aktuelle offizielle DATEV-Formatspezifikation** und ohne einen realen Test-Import
  in eine DATEV-Installation. Vor dem produktiven Einsatz unbedingt mit deinem Steuerberater bzw.
  einer echten DATEV-Umgebung testen.
- **Doppelte Buchführung**: Der mitgelieferte Kontenrahmen ist eine **reduzierte** Auswahl (~20
  Konten je SKR03/SKR04), kein vollständiger amtlicher Kontenrahmen. Buchungsvorschläge folgen
  einer vereinfachten Systematik (u. a. ein Sammel-Debitorenkonto statt Personenkonten je Kunde).
  Für eine vollständige, prüfungssichere Buchführung ist fachkundige Kontrolle erforderlich.
- **Umsatzsteuer-Logik** (Standard-USt., Kleinunternehmerregelung §19 UStG, Reverse-Charge §13b
  UStG): nach bestem Verständnis der gesetzlichen Regelungen umgesetzt, aber **nicht durch einen
  Steuerberater verifiziert**. Insbesondere bei grenzüberschreitenden Sachverhalten (EU-Ausland,
  Drittland) können Sonderfälle nicht abgedeckt sein.
- **Kassensystem (POS) – KassenSichV**: Das Kassenmodul ist **ausdrücklich nicht
  kassensicherungsverordnungskonform**. Es fehlt eine zertifizierte TSE (Technische
  Sicherheitseinrichtung), ein DSFinV-K-Export sowie die Mitteilungspflicht elektronischer
  Aufzeichnungssysteme gegenüber dem Finanzamt. **Verwende das Kassenmodul nicht für echte,
  prüfungsrelevante Bareinnahmen**, solange keine echte TSE angebunden ist – sonst drohen
  Bußgelder nach § 379 AO. Das Datenmodell enthält bereits ungenutzte Platzhalterfelder für eine
  spätere echte TSE-Anbindung.
- **Datenschutz (DSGVO)**: Das Modul speichert personenbezogene Daten (Kunden-, Lieferanten-,
  Kontaktdaten). Als Betreiber bist du für alle datenschutzrechtlichen Pflichten selbst
  verantwortlich (Rechtsgrundlage, Aufbewahrungsfristen, Auskunfts-/Löschrechte, ggf.
  Auftragsverarbeitung) – das Modul nimmt dir das nicht ab.
- **Öffentliche Bon-Download-Links**: Der QR-Code zum Kassenbon verweist auf eine unauthentifizierte,
  aber nicht erratbare Download-URL (zufälliges Token). Wer den Link/QR-Code kennt, kann den
  jeweiligen Bon herunterladen – das ist bewusst so gebaut (Kunde braucht keinen Login), aber dir
  als Betreiber sollte dieses Modell bekannt sein.

## Haftungsausschluss

**Dieses Modul wird ohne jegliche Gewährleistung bereitgestellt. Die Nutzung erfolgt vollständig
auf eigenes Risiko.** Es besteht kein Anspruch darauf, dass die Software fehlerfrei ist, geltendem
Recht (insbesondere Steuer-, Handels- und Buchführungsrecht sowie der Kassensicherungsverordnung)
entspricht oder für einen bestimmten Zweck geeignet ist. Die Entwickler übernehmen keine Haftung für
Schäden, Bußgelder, Steuernachforderungen oder sonstige Nachteile, die aus der Nutzung dieses Moduls
entstehen.

**Es liegt in der alleinigen Verantwortung der nutzenden Person bzw. des nutzenden Unternehmens, vor
dem produktiven Einsatz eigenständig zu prüfen, ob die Software den für sie geltenden lokalen
gesetzlichen, steuerlichen und branchenspezifischen Anforderungen entspricht** – bei Zweifeln oder
vor dem ersten produktiven Einsatz sollte grundsätzlich ein Steuerberater bzw. eine fachkundige
Stelle hinzugezogen werden.
