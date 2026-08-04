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

    doc.font("Helvetica-Bold").fontSize(16).text(title);
    if (subtitle) {
      doc.font("Helvetica").fontSize(10).fillColor("#555").text(subtitle);
    }
    doc.moveDown(1);

    const startX = doc.page.margins.left;
    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const minRowHeight = 20;
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

      function drawRow(cells: unknown[], rowY: number, bold: boolean) {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000");
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? ""), columnX[i], rowY, {
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
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text(section.heading, startX, y);
        y += 20;
      }

      const headerHeight = measureRowHeight(section.headers, true);
      if (y + headerHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      drawRow(section.headers, y, true);
      y += headerHeight;
      doc
        .moveTo(startX, y - 4)
        .lineTo(startX + usableWidth, y - 4)
        .strokeColor("#ccc")
        .stroke();

      for (const row of section.rows) {
        const height = measureRowHeight(row, false);
        if (y + height > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        drawRow(row, y, false);
        y += height;
      }
    }

    doc.end();
  });
}
