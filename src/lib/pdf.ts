import PDFDocument from "pdfkit";

export function pdfResponse(filename: string, pdf: Buffer) {
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function renderTablePdf(
  title: string,
  subtitle: string | null,
  headers: string[],
  rows: unknown[][],
  columnWeights?: number[],
  options?: { landscape?: boolean }
): Promise<Buffer> {
  return renderMultiTablePdf(
    title,
    subtitle,
    [{ headers, rows, columnWeights }],
    options
  );
}

export interface PdfSection {
  heading?: string;
  headers: string[];
  rows: unknown[][];
  columnWeights?: number[];
}

// Palette reprise du site (voir --color-* dans globals.css), pour que les
// exports PDF s'accordent avec l'habillage web plutôt que de rester en noir
// et blanc administratif.
const PDF_COLORS = {
  navy: "#2b3a67",
  gold: "#9c7124",
  text: "#1c1f2a",
  muted: "#5b5f6f",
  headerText: "#ffffff",
  zebra: "#eef0f7",
  rule: "#d8ceb3",
};

// Comme renderTablePdf, mais pour plusieurs tableaux à la suite dans le même
// document (un par poule, par exemple), chacun précédé d'un sous-titre
// optionnel — utile pour un classement par poules plutôt qu'un unique
// classement général.
export function renderMultiTablePdf(
  title: string,
  subtitle: string | null,
  sections: PdfSection[],
  options?: { landscape?: boolean }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
      layout: options?.landscape ? "landscape" : "portrait",
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const startX = doc.page.margins.left;
    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.font("Helvetica-Bold").fontSize(18).fillColor(PDF_COLORS.navy).text(title);
    if (subtitle) {
      doc.font("Helvetica").fontSize(10).fillColor(PDF_COLORS.muted).text(subtitle);
    }
    doc.moveDown(0.6);
    doc
      .moveTo(startX, doc.y)
      .lineTo(startX + usableWidth, doc.y)
      .lineWidth(2)
      .strokeColor(PDF_COLORS.gold)
      .stroke();
    doc.moveDown(0.8);

    const minRowHeight = 22;
    const rowPadding = 6;

    let y = doc.y;

    for (const [sectionIndex, section] of sections.entries()) {
      const weights = section.columnWeights ?? section.headers.map(() => 1);
      const weightSum = weights.reduce((a, b) => a + b, 0);
      const columnWidths = weights.map((w) => (usableWidth * w) / weightSum);
      const columnX = columnWidths.reduce<number[]>((acc, w, i) => {
        acc.push(i === 0 ? startX : acc[i - 1] + columnWidths[i - 1]);
        return acc;
      }, []);

      // Une cellule peut passer sur plusieurs lignes (nom de club long,
      // catégorie...) : la hauteur de la ligne s'adapte à la cellule la plus
      // haute plutôt qu'une hauteur fixe, pour ne jamais chevaucher la ligne
      // suivante.
      function measureRowHeight(cells: unknown[], bold: boolean): number {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        const heights = cells.map((cell, i) =>
          doc.heightOfString(String(cell ?? ""), { width: columnWidths[i] - 6 })
        );
        return Math.max(minRowHeight, ...heights) + rowPadding;
      }

      function drawRow(cells: unknown[], rowY: number, height: number, style: "header" | "shaded" | "plain") {
        if (style === "header") {
          doc.rect(startX, rowY, usableWidth, height).fill(PDF_COLORS.navy);
        } else if (style === "shaded") {
          doc.rect(startX, rowY, usableWidth, height).fill(PDF_COLORS.zebra);
        }
        const textY = rowY + rowPadding / 2;
        doc
          .font(style === "header" ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .fillColor(style === "header" ? PDF_COLORS.headerText : PDF_COLORS.text);
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? ""), columnX[i] + 3, textY, {
            width: columnWidths[i] - 6,
          });
        });
      }

      if (sectionIndex > 0) y += 16;

      if (section.heading) {
        if (y + 20 > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        doc.rect(startX, y + 2, 4, 12).fill(PDF_COLORS.gold);
        doc.font("Helvetica-Bold").fontSize(12).fillColor(PDF_COLORS.navy).text(section.heading, startX + 10, y);
        y += 20;
      }

      const headerHeight = measureRowHeight(section.headers, true);
      if (y + headerHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      drawRow(section.headers, y, headerHeight, "header");
      y += headerHeight;

      section.rows.forEach((row, rowIndex) => {
        const height = measureRowHeight(row, false);
        if (y + height > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          // Répète l'en-tête de colonnes en haut de chaque nouvelle page :
          // sans ça, un tableau qui déborde sur plusieurs pages devient
          // illisible dès la deuxième (plus aucun repère pour savoir quelle
          // colonne représente quoi).
          drawRow(section.headers, y, headerHeight, "header");
          y += headerHeight;
        }
        drawRow(row, y, height, rowIndex % 2 === 0 ? "plain" : "shaded");
        y += height;
      });

      doc
        .moveTo(startX, y)
        .lineTo(startX + usableWidth, y)
        .lineWidth(1)
        .strokeColor(PDF_COLORS.rule)
        .stroke();
    }

    doc.end();
  });
}
