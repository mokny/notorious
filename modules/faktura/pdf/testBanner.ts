/**
 * Draws a prominent "TESTMODUS" banner across the top of the current page -
 * called once per page (including after every `doc.addPage()`) whenever
 * `faktura_company_settings.test_mode` is on, so a document produced while
 * trying out the module can never be mistaken for a real, legally-issued
 * one. See services/companySettings.ts's `testMode` field.
 */
export function drawTestBanner(doc: PDFKit.PDFDocument, pageWidth: number): void {
  const bannerHeight = 18;
  doc.save();
  doc.rect(0, 0, pageWidth, bannerHeight).fill("#dc2626");
  doc
    .fontSize(10)
    .fillColor("#ffffff")
    .text("TESTMODUS – KEIN ECHTER BELEG", 0, 4, { width: pageWidth, align: "center" });
  doc.restore();
}
