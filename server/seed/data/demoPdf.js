// Builds a tiny, valid one-page PDF with a few lines of text, used as the "scanned document"
// for seeded credentials so admins can open them. No library needed: a PDF is a text format
// made of numbered objects, plus a table (xref) of where each object starts in the file.
export function makeDemoPdf(lines) {
  const escape = (text) => text.replace(/[\\()]/g, '\\$&'); // ( ) and \ are special in PDF strings
  const textOps = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 60 ${770 - i * 28} Td (${escape(line)}) Tj ET`)
    .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(textOps)} >>\nstream\n${textOps}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf)); // byte position where object i+1 starts
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf);
}
