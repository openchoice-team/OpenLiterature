export type PdfSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PdfTextSelection = {
  text: string;
  pageNumber: number;
  rects: PdfSelectionRect[];
  viewportRect: PdfViewportRect;
};

export type PdfTextHighlight = {
  id: string;
  pageNumber: number;
  rects: PdfSelectionRect[];
  color?: string;
};
