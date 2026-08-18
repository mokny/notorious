const h2Class = "text-lg font-semibold text-ink";
const h3Class = "text-sm font-semibold text-ink";
const pClass = "text-sm leading-relaxed text-ink-muted";
const sectionClass = "space-y-2 rounded-lg border border-border p-4";
const listClass = "list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted";

/**
 * Anleitung/Erste-Schritte: beginnerfreundlicher, beruhigender Einstieg für Vermieter ohne
 * Software-Erfahrung. Rein statischer JSX-Inhalt (keine eigene Markdown/Rich-Content-Engine
 * nötig, siehe Modul-Brief) - beschreibt ausschließlich real existierende Seiten/Felder/
 * Buttons dieses Moduls, nichts Erfundenes.
 */
function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Anleitung: So richtest du Notorious für deine Vermietung ein</h1>
        <p className={pClass}>
          Diese Seite führt dich einmal in Ruhe durch die Einrichtung – vom Anlegen deiner ersten Immobilie bis zur fertigen
          Nebenkostenabrechnung. Du musst nichts davon auswendig lernen: Komm einfach wieder her, wenn du nicht weiterweißt.
          Und keine Sorge – fast nichts hier ist in Stein gemeißelt. Solange eine Abrechnung noch als „Entwurf" markiert ist,
          kannst du sie jederzeit löschen und neu erstellen. Nur ein finaler Klick auf „Finalisieren" macht eine Abrechnung
          endgültig. Alles andere (Immobilien, Einheiten, Mieter, Beträge, Zählerstände) lässt sich jederzeit nachträglich
          bearbeiten.
        </p>
      </div>

      <section className={sectionClass}>
        <h2 className={h2Class}>1. Immobilie anlegen</h2>
        <p className={pClass}>
          Gehe zu <strong>Immobilien</strong> und klicke auf „Neue Immobilie". Trage Adresse, Baujahr und Kaufpreis ein.
        </p>
        <p className={pClass}>
          Baujahr und Kaufpreis brauchst du nicht sofort perfekt zu wissen – trage sie ein, sobald du sie zur Hand hast. Sie
          werden später für den kleinen Steuer-Rechner im Bereich <strong>Steuer</strong> gebraucht: Dort wird aus Kaufpreis
          und Baujahr automatisch die jährliche „Abschreibung" (AfA, eine steuerliche Wertminderung des Gebäudes über die
          Jahre) berechnet. Je nachdem, ob dein Haus vor oder nach 1925 gebaut wurde, setzt der Gesetzgeber dafür einen
          anderen Prozentsatz an – das musst du nicht selbst wissen, das übernimmt die App für dich. Mehr Steuerrecht steckt
          an dieser Stelle nicht dahinter.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>2. Einheiten anlegen</h2>
        <p className={pClass}>
          Auf der Detailseite deiner Immobilie findest du den Bereich <strong>Einheiten</strong>. Hier legst du jede
          vermietbare Wohnung oder Gewerbeeinheit einzeln an (Bezeichnung, Etage, Wohnfläche, Zimmer, Heizungsart).
        </p>
        <p className={pClass}>
          Die <strong>Wohnfläche in m² ist Pflicht</strong>, weil sie die Grundlage für die häufigste Verteilung der
          Nebenkosten ist: Die meisten Kostenarten (z. B. Gebäudeversicherung, Hausmeister, Grundsteuer) werden anteilig
          nach Wohnfläche auf die Einheiten umgelegt. Ohne diese Zahl kann die App später keine Abrechnung berechnen.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>3. Abrechnungskreise verstehen (meistens kannst du das überspringen)</h2>
        <p className={pClass}>
          Jede Immobilie hat automatisch einen Standard-Abrechnungskreis „Gesamtes Objekt", der alle deine Einheiten
          umfasst. Für die allermeisten Vermieter reicht das völlig aus – du musst hier nichts einstellen und kannst direkt
          zu Schritt 4 weitergehen.
        </p>
        <p className={pClass}>
          Ein „Abrechnungskreis" legt fest, welche Einheiten sich einen Kostentopf teilen. Den brauchst du nur, wenn nicht
          alle Wohnungen an denselben Kosten beteiligt sind. Klassisches Beispiel: Drei Wohnungen hängen an der
          Zentralheizung, eine vierte Wohnung hat einen eigenen elektrischen Durchlauferhitzer und heizt komplett unabhängig
          mit eigenem Stromzähler. Dann wäre es unfair, diese vierte Wohnung an den Heizkosten der anderen drei zu
          beteiligen – dafür legst du im Bereich <strong>Abrechnungskreise</strong> auf der Immobilien-Detailseite einen
          zusätzlichen Kreis „Zentralheizung" an und ordnest ihm nur die drei betroffenen Einheiten zu.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>4. Zähler &amp; Zählerstände (nur wenn du selbst abliest)</h2>
        <p className={pClass}>
          Klappe eine Einheit im Bereich <strong>Einheiten</strong> auf, um ihre Zähler zu verwalten (z. B. Heizung,
          Kaltwasser, Warmwasser, Strom). Trage dort Zählerstände mit Datum ein – daraus berechnet die App später den
          tatsächlichen Verbrauch je Einheit.
        </p>
        <p className={pClass}>
          Das ist komplett optional. Falls ein externer Dienstleister wie Techem oder ista das für dich übernimmt und dir
          am Jahresende eine fertige Abrechnung mit den Kosten pro Wohnung schickt, musst du hier gar nichts eintragen –
          sieh dir stattdessen Abschnitt „Techem/ista: fertige Abrechnungen eintragen" weiter unten an. Auch wenn du weder
          selbst abliest noch einen externen Dienstleister hast, ist das kein Problem: Die App kann fehlende Verbrauchswerte
          automatisch nach den gesetzlichen Ersatzverfahren schätzen (z. B. anhand des Vorjahresverbrauchs oder
          vergleichbarer Wohnungen) und weist das in der Abrechnung transparent mit einem Sternchen aus.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>Techem/ista: fertige Abrechnungen eintragen</h2>
        <p className={pClass}>
          Wenn ein externer Dienstleister wie Techem oder ista die Heizkosten abliest und dir eine fertige Abrechnung mit
          den Kosten pro Wohnung schickt, musst du keine eigenen Zählerstände erfassen. Trage stattdessen die Beträge aus
          dieser Abrechnung direkt ein: Öffne bei der betroffenen Immobilie den Bereich <strong>Abrechnungskreise</strong>,
          klicke beim passenden Kreis auf „Erweitert" und stelle die Kostenkategorie (meist „Heizung" oder
          „Wasser/Abwasser") von „Selbst berechnet" auf „Extern abgerechnet (Techem/ista o. ä.)" um. Danach kannst du über
          „Beträge verwalten" für jede Einheit den Betrag, den Zeitraum und optional eine Referenznummer aus der
          Dienstleister-Abrechnung eintragen. Diese Beträge werden dann unverändert für die jeweilige Einheit übernommen,
          statt selbst berechnet zu werden.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>5. Mieter &amp; Mietverträge anlegen</h2>
        <p className={pClass}>
          Lege unter <strong>Mieter</strong> zunächst die Personen an, die bei dir wohnen (Name, E-Mail, Telefon). Danach
          erstellst du unter <strong>Mietverträge</strong> einen neuen Vertrag: Einheit auswählen, Mieter zuordnen,
          Mietbeginn, Kaltmiete und Nebenkosten-Vorauszahlung eintragen.
        </p>
        <ul className={listClass}>
          <li>
            <strong>Kaltmiete</strong> ist die reine Miete ohne Nebenkosten.
          </li>
          <li>
            <strong>NK-Vorauszahlung</strong> ist der monatliche Betrag, den der Mieter zusätzlich für Nebenkosten (Heizung,
            Wasser, Hausmeister usw.) im Voraus zahlt. Am Jahresende vergleicht die Abrechnung diese Vorauszahlungen mit
            den tatsächlichen Kosten – daraus ergibt sich eine Nachzahlung oder ein Guthaben für den Mieter.
          </li>
          <li>
            <strong>Anzahl Personen</strong> gibt an, wie viele Personen im Haushalt leben – das kann von der Anzahl der
            namentlich genannten Mieter abweichen (z. B. wohnen auch Kinder mit im Haushalt). Diese Zahl ist nur wichtig,
            wenn eine Kostenkategorie „nach Personenzahl" abgerechnet wird, zum Beispiel oft die Müllabfuhr. Für alle
            anderen Kostenarten spielt sie keine Rolle.
          </li>
        </ul>
        <p className={pClass}>
          Später kannst du auf der Vertragsseite auch Mieterhöhungen mit Wirkungsdatum erfassen (Button „Miete anpassen")
          und monatliche Mietzahlungen als bezahlt markieren.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>6. Belege erfassen</h2>
        <p className={pClass}>
          Unter <strong>Belege</strong> trägst du jede Ausgabe ein, die auf die Mieter umgelegt werden soll oder die du
          steuerlich absetzen willst – z. B. Rechnungen für Hausmeister, Versicherung, Müllabfuhr oder Reparaturen. Wähle
          Immobilie, Kostenkategorie, Betrag und Datum, danach kannst du auf der Belegseite Fotos oder PDFs dazu hochladen.
        </p>
        <p className={pClass}>
          Du hast zwei Wege, ein Dokument anzuhängen: „Scannen" öffnet direkt die Kamera (praktisch für Papierbelege, die du
          gerade in der Hand hast), „Hochladen" nimmt eine bereits vorhandene Datei, z. B. eine PDF-Rechnung aus deinem
          E-Mail-Postfach. Nutze die Texterkennung („OCR starten"), wenn du dir das Abtippen von Betrag, Datum oder
          Rechnungsempfänger sparen willst – die App macht dir dann einen Vorschlag, den du erst noch bestätigen musst,
          bevor er übernommen wird. Falls du dich bei der Kategorie oder dem Betrag vertust: Alles auf der Belegseite lässt
          sich jederzeit nachträglich korrigieren.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>7. Abrechnung erstellen</h2>
        <p className={pClass}>
          Unter <strong>Abrechnungen</strong> klickst du auf „Abrechnung erstellen", wählst die Immobilie und den Zeitraum
          (z. B. ein Kalenderjahr) und klickst auf „Abrechnung generieren". Die App sammelt dann automatisch alle Belege
          und Zählerstände in diesem Zeitraum, verteilt sie nach den passenden Umlageschlüsseln auf die Einheiten und
          berechnet je Mieter, ob eine Nachzahlung fällig ist oder ein Guthaben entsteht.
        </p>
        <p className={pClass}>
          Jede neu erstellte Abrechnung startet als <strong>„Entwurf"</strong>. In diesem Zustand kannst du sie dir in Ruhe
          anschauen, das PDF probeweise herunterladen und bei Bedarf komplett löschen und mit anderen Belegen neu
          generieren – nichts geht dabei kaputt. Erst ein Klick auf <strong>„Finalisieren"</strong> setzt den Status auf
          „Finalisiert" und macht die Abrechnung endgültig; ab dann kann sie nicht mehr gelöscht werden. Nimm dir also ruhig
          Zeit, bevor du finalisierst.
        </p>
        <p className={pClass}>
          Bei den Mieter-Salden liest du das Ergebnis so: Ein rot markierter Betrag mit „Nachzahlung" bedeutet, der Mieter
          hat zu wenig vorausgezahlt und muss nachzahlen. Ein grün markiertes „Guthaben" bedeutet, der Mieter hat mehr
          vorausgezahlt, als tatsächlich an Kosten angefallen ist, und bekommt Geld zurück. Über den Button
          „PDF herunterladen" erzeugt die App automatisch das fertige Abrechnungs-Dokument für deine Mieter.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>8. Was am Ende beim Mieter ankommt</h2>
        <p className={pClass}>
          Das PDF enthält für jeden Mieter (bzw. jeden Mieterabschnitt, falls während des Zeitraums ein Mieterwechsel
          stattgefunden hat) einen eigenen Abschnitt mit: der Adresse deiner Immobilie und deinen Kontaktdaten als
          Vermieter, einer Tabelle mit allen Kostenarten und dem jeweiligen Anteil dieser Wohnung daran, einem
          verständlichen Fließtext, der genau erklärt, wie sich jeder Betrag errechnet (z. B. „Ihre Einheit hat 62,5 m²
          Wohnfläche von insgesamt 310 m² im Abrechnungskreis, das entspricht 20,16 % der Gesamtkosten"), und am Ende der
          Gegenüberstellung von geleisteten Vorauszahlungen und tatsächlichen Kosten mit dem Ergebnis (Nachzahlung oder
          Guthaben). Kosten, die extern über Techem/ista abgerechnet wurden, sind darin klar als solche gekennzeichnet und
          nicht als Schätzung missverständlich markiert. Zusätzlich kannst du über „Belege für Mieter exportieren" ein
          weiteres PDF erzeugen, das alle zugrunde liegenden Belege als Nachweis anhängt.
        </p>
      </section>

      <section className={sectionClass}>
        <h2 className={h3Class}>Häufige Sorgen</h2>
        <div className="space-y-3">
          <div>
            <h3 className={h3Class}>„Was, wenn ich einen Fehler gemacht habe?"</h3>
            <p className={pClass}>
              Fast alles lässt sich korrigieren. Immobilien, Einheiten, Mieter, Belege und Zählerstände kannst du jederzeit
              bearbeiten. Eine Abrechnung im Status „Entwurf" kannst du komplett löschen und mit korrigierten Daten neu
              erstellen. Einzig eine bereits <strong>finalisierte</strong> Abrechnung lässt sich nicht mehr löschen – prüfe
              deshalb vor dem Klick auf „Finalisieren" noch einmal in Ruhe die Zahlen im Entwurf.
            </p>
          </div>
          <div>
            <h3 className={h3Class}>„Muss ich alles auf einmal einrichten?"</h3>
            <p className={pClass}>
              Nein. Du kannst mit einer einzigen Immobilie und einer einzigen Einheit anfangen und den Rest nach und nach
              ergänzen, sobald du Zeit hast. Abrechnungskreise, externe Dienstleister-Abrechnungen und die Steuerübersicht
              brauchst du überhaupt nur, wenn dein Fall das erfordert – für ein normales Einfamilienhaus mit einer Mietpartei
              reichen Schritte 1, 2, 5, 6 und 7.
            </p>
          </div>
          <div>
            <h3 className={h3Class}>„Was, wenn manche Wohnungen unterschiedlich abgerechnet werden?"</h3>
            <p className={pClass}>
              Dafür gibt es die Abrechnungskreise aus Schritt 3: Lege einen zusätzlichen Kreis für die Einheiten an, die
              einen abweichenden Kostentopf haben (z. B. eigener Durchlauferhitzer statt Zentralheizung), und ordne ihm nur
              diese Einheiten zu. Alle übrigen Einheiten bleiben im Standard-Kreis „Gesamtes Objekt" und werden ganz normal
              gemeinsam abgerechnet.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export { GuidePage };
