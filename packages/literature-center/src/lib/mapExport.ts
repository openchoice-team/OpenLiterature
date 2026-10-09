import countriesIso from "i18n-iso-countries";
import zhLocale from "i18n-iso-countries/langs/zh.json";
import type { Map as MapLibreMap } from "maplibre-gl";

import type { AcademicIntelligenceMapData } from "../api/types";

countriesIso.registerLocale(zhLocale);

export function countryDisplayName(code?: string | null) {
  if (!code) return "地区待识别";
  return countriesIso.getName(code.toUpperCase(), "zh", { select: "official" }) || code.toUpperCase();
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export function downloadTextFile(fileName: string, text: string, mime: string) {
  downloadBlob(fileName, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function exportTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
  ].join("");
}

export function intelligenceCountriesCsv(data: AcademicIntelligenceMapData) {
  return toCsv(
    [
      "country_code",
      "country_name",
      "work_count",
      "fractional_count",
      "corresponding_count",
      "open_access_count",
      "saved_count",
      "cited_by_count",
      "year_min",
      "year_max",
    ],
    data.countries.map((country) => [
      country.country_code,
      countryDisplayName(country.country_code),
      country.work_count,
      country.fractional_count,
      country.corresponding_count,
      country.open_access_count,
      country.saved_count,
      country.cited_by_count,
      country.year_min,
      country.year_max,
    ]),
  );
}

export function intelligenceInstitutionsCsv(data: AcademicIntelligenceMapData) {
  return toCsv(
    [
      "institution_id",
      "institution_name",
      "country_code",
      "country_name",
      "region",
      "city",
      "latitude",
      "longitude",
      "work_count",
      "fractional_count",
      "corresponding_count",
      "open_access_count",
      "saved_count",
      "cited_by_count",
    ],
    data.institutions.map((institution) => [
      institution.institution_id,
      institution.institution_name,
      institution.country_code,
      countryDisplayName(institution.country_code),
      institution.region,
      institution.city,
      institution.latitude,
      institution.longitude,
      institution.work_count,
      institution.fractional_count,
      institution.corresponding_count,
      institution.open_access_count,
      institution.saved_count,
      institution.cited_by_count,
    ]),
  );
}

export function intelligenceWorksCsv(data: AcademicIntelligenceMapData) {
  return toCsv(
    [
      "work_id",
      "title",
      "publication_year",
      "publication_title",
      "doi",
      "primary_url",
      "cited_by_count",
      "is_open_access",
      "state",
      "countries",
    ],
    data.works.map((work) => [
      work.id,
      work.canonical_title,
      work.publication_year,
      work.publication_title,
      work.doi,
      work.primary_url,
      work.cited_by_count,
      work.is_open_access,
      work.state,
      work.country_codes.join(" "),
    ]),
  );
}

export function intelligenceMapJson(data: AcademicIntelligenceMapData) {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      generator: "OpenDHU Literature Center",
      summary: data.summary,
      countries: data.countries,
      institutions: data.institutions,
      timeline: data.timeline,
      collaborations: data.collaborations,
      works: data.works,
    },
    null,
    2,
  );
}

type GeoJsonGeometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: Array<[number, number]> };

export function intelligenceMapGeoJson(data: AcademicIntelligenceMapData) {
  const features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: GeoJsonGeometry;
  }> = [];

  for (const institution of data.institutions) {
    if (typeof institution.latitude !== "number" || typeof institution.longitude !== "number") continue;
    features.push({
      type: "Feature",
      properties: {
        kind: "institution",
        institution_id: institution.institution_id,
        institution_name: institution.institution_name,
        country_code: institution.country_code ?? "",
        region: institution.region ?? "",
        city: institution.city ?? "",
        work_count: institution.work_count,
        cited_by_count: institution.cited_by_count,
      },
      geometry: { type: "Point", coordinates: [institution.longitude, institution.latitude] },
    });
  }

  const countryCentroids = new Map<string, { longitude: number; latitude: number; count: number }>();
  for (const institution of data.institutions) {
    const code = institution.country_code?.toUpperCase();
    if (!code || typeof institution.latitude !== "number" || typeof institution.longitude !== "number") continue;
    const current = countryCentroids.get(code) ?? { longitude: 0, latitude: 0, count: 0 };
    current.longitude += institution.longitude;
    current.latitude += institution.latitude;
    current.count += 1;
    countryCentroids.set(code, current);
  }
  for (const [code, value] of countryCentroids) {
    if (value.count === 0) continue;
    features.push({
      type: "Feature",
      properties: {
        kind: "country",
        country_code: code,
        country_name: countryDisplayName(code),
        work_count: data.countries.find((country) => country.country_code.toUpperCase() === code)?.work_count ?? 0,
      },
      geometry: {
        type: "Point",
        coordinates: [value.longitude / value.count, value.latitude / value.count],
      },
    });
  }

  for (const collaboration of data.collaborations) {
    const source = countryCentroids.get(collaboration.source_country_code.toUpperCase());
    const target = countryCentroids.get(collaboration.target_country_code.toUpperCase());
    if (!source || !target || source.count === 0 || target.count === 0) continue;
    features.push({
      type: "Feature",
      properties: {
        kind: "collaboration",
        source_country_code: collaboration.source_country_code.toUpperCase(),
        target_country_code: collaboration.target_country_code.toUpperCase(),
        work_count: collaboration.work_count,
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [source.longitude / source.count, source.latitude / source.count],
          [target.longitude / target.count, target.latitude / target.count],
        ],
      },
    });
  }

  return JSON.stringify({ type: "FeatureCollection", features }, null, 2);
}

export type MapPngExportOptions = {
  title?: string;
  subtitle?: string;
  fileName?: string;
};

// MapLibre clears its WebGL backbuffer right after compositing, so the canvas
// is only readable inside a render frame (unless preserveDrawingBuffer is set
// at map construction). Copy it synchronously on the next `render` event.
function captureMapCanvas(map: MapLibreMap) {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const copy = () => {
      const source = map.getCanvas();
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height;
      const context = output.getContext("2d");
      if (!context) {
        reject(new Error("当前环境不支持导出地图图片"));
        return;
      }
      context.drawImage(source, 0, 0);
      resolve(output);
    };
    const timeout = window.setTimeout(() => {
      map.off("render", onRender);
      copy();
    }, 1_500);
    const onRender = () => {
      window.clearTimeout(timeout);
      copy();
    };
    map.once("render", onRender);
    map.triggerRepaint();
  });
}

export async function exportIntelligenceMapPng(
  map: MapLibreMap,
  { title = "全球研究分布", subtitle, fileName }: MapPngExportOptions = {},
) {
  const output = await captureMapCanvas(map);
  const width = output.width;
  const height = output.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("当前环境不支持导出地图图片");

  const dpr = width / (map.getCanvas().clientWidth || width);
  const padding = 24 * dpr;
  const fontFamily = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

  const gradient = context.createLinearGradient(0, 0, 0, 150 * dpr);
  gradient.addColorStop(0, "rgba(4, 12, 24, 0.88)");
  gradient.addColorStop(1, "rgba(4, 12, 24, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, 150 * dpr);

  context.fillStyle = "#e2e8f0";
  context.font = `600 ${18 * dpr}px ${fontFamily}`;
  context.fillText(title, padding, 40 * dpr);

  if (subtitle) {
    context.font = `400 ${13 * dpr}px ${fontFamily}`;
    context.fillStyle = "rgba(226, 232, 240, 0.78)";
    context.fillText(subtitle, padding, 64 * dpr);
  }

  context.font = `400 ${11 * dpr}px ${fontFamily}`;
  context.fillStyle = "rgba(148, 163, 184, 0.85)";
  context.fillText(
    `OpenDHU Literature Center · ${new Date().toLocaleString("zh-CN")}`,
    padding,
    height - 18 * dpr,
  );

  const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("导出地图图片失败");
  downloadBlob(fileName ?? `literature-map-${exportTimestamp()}.png`, blob);
}
