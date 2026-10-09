type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export type RehypeStreamTailOptions = {
  /** Character lengths of each revealed chunk, oldest first. */
  chunkLengths?: number[];
};

const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption"]);

/**
 * Wraps streamed text in one fading span per revealed chunk while keeping the
 * markdown tree intact, so markdown still renders live.
 *
 * Table content is deliberately left as plain text: table cells are re-created
 * by React while rows stream in, so mount-triggered animations restart there
 * constantly and would leave cell text invisible. Chunk accounting still
 * advances across table text so later paragraphs stay aligned.
 */
export function rehypeStreamTail(options: RehypeStreamTailOptions) {
  const chunkLengths = (options.chunkLengths ?? [])
    .map((length) => Math.floor(length))
    .filter((length) => length > 0);
  if (chunkLengths.length === 0) {
    return (tree: HastNode) => tree;
  }

  return (tree: HastNode) => {
    const textNodes: Array<{ parent: HastNode; node: HastNode; inTable: boolean }> = [];
    const collect = (parent: HastNode, inTable: boolean) => {
      for (const child of parent.children ?? []) {
        if (child.type === "text" && typeof child.value === "string" && child.value.length > 0) {
          textNodes.push({ parent, node: child, inTable });
        } else if (child.children?.length) {
          collect(child, inTable || TABLE_TAGS.has(child.tagName ?? ""));
        }
      }
    };
    collect(tree, false);

    let chunkIndex = 0;
    let remainingInChunk = chunkLengths[0];

    for (const { parent, node, inTable } of textNodes) {
      const value = node.value ?? "";
      const pieces: HastNode[] = [];
      let offset = 0;
      while (offset < value.length) {
        if (chunkIndex >= chunkLengths.length) {
          if (!inTable) {
            pieces.push({ type: "text", value: value.slice(offset) });
          }
          break;
        }
        const take = Math.min(remainingInChunk, value.length - offset);
        const piece = value.slice(offset, offset + take);
        if (!inTable) {
          pieces.push({
            type: "element",
            tagName: "span",
            properties: { className: ["stream-token"] },
            children: [{ type: "text", value: piece }],
          });
        }
        offset += take;
        remainingInChunk -= take;
        if (remainingInChunk <= 0) {
          chunkIndex += 1;
          remainingInChunk = chunkLengths[chunkIndex] ?? 0;
        }
      }

      if (inTable) {
        continue;
      }
      const children = parent.children ?? [];
      const position = children.indexOf(node);
      if (position === -1) {
        continue;
      }
      if (pieces.length === 1 && pieces[0].type === "text") {
        continue;
      }
      children.splice(position, 1, ...pieces);
    }
  };
}
