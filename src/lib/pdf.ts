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
  columnWeights?: number[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
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
    const weights = columnWeights ?? headers.map(() => 1);
    const weightSum = weights.reduce((a, b) => a + b, 0);
    const columnWidths = weights.map((w) => (usableWidth * w) / weightSum);
    const columnX = columnWidths.reduce<number[]>((acc, w, i) => {
      acc.push(i === 0 ? startX : acc[i - 1] + columnWidths[i - 1]);
      return acc;
    }, []);
    const rowHeight = 20;

    function drawRow(cells: unknown[], y: number, bold: boolean) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000");
      cells.forEach((cell, i) => {
        doc.text(String(cell ?? ""), columnX[i], y, {
          width: columnWidths[i] - 6,
          ellipsis: true,
          lineBreak: false,
        });
      });
    }

    let y = doc.y;
    drawRow(headers, y, true);
    y += rowHeight;
    doc
      .moveTo(startX, y - 4)
      .lineTo(startX + usableWidth, y - 4)
      .strokeColor("#ccc")
      .stroke();

    for (const row of rows) {
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      drawRow(row, y, false);
      y += rowHeight;
    }

    doc.end();
  });
}
