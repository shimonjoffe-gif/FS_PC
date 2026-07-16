export interface TreeNumberItem {
  id: number;
  parent_id: number | null;
  sort_order: number;
}

function childCode(parentCode: string, childIndex: number): string {
  const inner = parentCode.replace(/\.$/, '');
  return `${inner}.${childIndex}.`;
}

export function assignTreeCodes(items: TreeNumberItem[]): Map<number, string> {
  const idSet = new Set(items.map(i => i.id));
  const byParent = new Map<number | null, TreeNumberItem[]>();
  for (const item of items) {
    const key = item.parent_id != null && idSet.has(item.parent_id) ? item.parent_id : null;
    const list = byParent.get(key) ?? [];
    list.push(item);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  }

  const codes = new Map<number, string>();

  function walk(parentId: number | null, parentCode: string | null): void {
    const children = byParent.get(parentId) ?? [];
    children.forEach((child, idx) => {
      const code = parentCode == null ? `${idx + 1}.` : childCode(parentCode, idx + 1);
      codes.set(child.id, code);
      walk(child.id, code);
    });
  }

  walk(null, null);
  return codes;
}

/** Display without trailing dot: `1.` → `1`, `1.2.` → `1.2` */
export function formatTreeCode(code: string | null | undefined): string {
  if (!code) return '';
  return code.replace(/\.$/, '');
}
