import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/** sheet row index (0-based) → media filename inside xl/media */
export function extractWidgetImageMap(xlsxPath: string): Map<number, string> {
  const tmp = path.join(path.dirname(xlsxPath), 'data', '_xlsx_tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`tar -xf "${xlsxPath}" -C "${tmp}"`);

  const ridToMedia = new Map<string, string>();
  const relsPath = path.join(tmp, 'xl', 'drawings', '_rels', 'drawing1.xml.rels');
  if (fs.existsSync(relsPath)) {
    const relsXml = fs.readFileSync(relsPath, 'utf8');
    for (const m of relsXml.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) {
      ridToMedia.set(m[1], path.basename(m[2]));
    }
  }

  const map = new Map<number, string>();
  const drawingPath = path.join(tmp, 'xl', 'drawings', 'drawing1.xml');
  if (fs.existsSync(drawingPath)) {
    const drawingXml = fs.readFileSync(drawingPath, 'utf8');
    const blocks = [...drawingXml.matchAll(/<xdr:(?:twoCell|oneCell)Anchor[\s\S]*?<\/xdr:(?:twoCell|oneCell)Anchor>/g)];
    for (const block of blocks) {
      const rowM = block[0].match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
      const ridM = block[0].match(/r:embed="(rId\d+)"/);
      if (!rowM || !ridM) continue;
      const row = Number(rowM[1]);
      const media = ridToMedia.get(ridM[1]);
      if (media && !map.has(row)) map.set(row, media);
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  return map;
}

/** Copy embedded images to uploads/widgets; returns sheet row → relative path (widgets/...) */
export function copyWidgetImages(
  xlsxPath: string,
  outDir: string,
  rowToMedia: Map<number, string>,
): Map<number, string> {
  const tmp = path.join(path.dirname(xlsxPath), 'data', '_xlsx_tmp');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execSync(`tar -xf "${xlsxPath}" -C "${tmp}"`);

  const widgetsDir = path.join(outDir, 'widgets');
  fs.rmSync(widgetsDir, { recursive: true, force: true });
  fs.mkdirSync(widgetsDir, { recursive: true });

  const result = new Map<number, string>();
  for (const [row, mediaFile] of rowToMedia) {
    const src = path.join(tmp, 'xl', 'media', mediaFile);
    if (!fs.existsSync(src)) continue;
    const ext = path.extname(mediaFile) || '.png';
    const destName = `widget-row-${row}${ext}`;
    fs.copyFileSync(src, path.join(widgetsDir, destName));
    result.set(row, `widgets/${destName}`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

export function imagePathForWidgetRow(
  rowIndex: number,
  anchorMap: Map<number, string>,
  copied: Map<number, string>,
): string | null {
  const anchorRow = anchorMap.has(rowIndex + 1) ? rowIndex + 1
    : anchorMap.has(rowIndex) ? rowIndex
    : anchorMap.has(rowIndex - 1) ? rowIndex - 1
    : null;
  if (anchorRow == null) return null;
  return copied.get(anchorRow) ?? null;
}
