import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { geoBounds, geoCentroid, geoInterpolate } from "d3-geo";
import countries from "i18n-iso-countries";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  Filter,
  Globe2,
  Landmark,
  LibraryBig,
  Link2,
  Loader2,
  MapPin,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type LayerProps,
  type MapMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { feature as topojsonFeature } from "topojson-client";
import worldAtlas from "world-atlas/countries-50m.json";
import { toast } from "sonner";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import { useLiteratureCenterClient } from "./api/client";
import { queryKeys } from "./api/queryKeys";
import type {
  AcademicIntelligenceCountry,
  AcademicIntelligenceInstitution,
  AcademicIntelligenceMapData as AcademicIntelligenceMapResponse,
  AcademicIntelligenceWork,
  AcademicLiteratureState,
} from "./api/types";
import {
  countryDisplayName,
  downloadTextFile,
  exportIntelligenceMapPng,
  exportTimestamp,
  intelligenceCountriesCsv,
  intelligenceInstitutionsCsv,
  intelligenceMapGeoJson,
  intelligenceMapJson,
  intelligenceWorksCsv,
} from "./lib/mapExport";
import { cn, getErrorMessage } from "./lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import "maplibre-gl/dist/maplibre-gl.css";

// MapLibre's default worker URL is derived from the entry chunk filename,
// which does not exist after Vite hashing. `?worker&url` also bundles the
// worker's shared module instead of copying an unresolved sibling import.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

type AcademicIntelligenceMapProps = {
  courseId: string;
  onOpenDiscovery: () => void;
  onOpenReader: (itemId: string) => void;
  topicId?: string | null;
  pulseKey?: string | null;
  embedded?: boolean;
};

type MapContext =
  | { kind: "country"; id: string }
  | { kind: "region"; id: string; countryCode: string }
  | { kind: "institution"; id: string }
  | { kind: "work"; id: string }
  | null;

type RegionGroup = {
  key: string;
  label: string;
  cities: string[];
  institutions: AcademicIntelligenceInstitution[];
  works: AcademicIntelligenceWork[];
};

type SaveAction = {
  work: AcademicIntelligenceWork;
  openAfterSave: boolean;
};

type ExportKind = "png" | "countries" | "institutions" | "works" | "geojson" | "json";

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "academic-map-background",
      type: "background",
      paint: { "background-color": "#0b1424" },
    },
  ],
};

const GRATICULE_GEOJSON = (() => {
  const features: Array<Record<string, unknown>> = [];
  for (let longitude = -180; longitude <= 180; longitude += 20) {
    const coordinates: number[][] = [];
    for (let latitude = -80; latitude <= 80; latitude += 4) {
      coordinates.push([longitude, latitude]);
    }
    features.push({
      type: "Feature",
      properties: { kind: "meridian" },
      geometry: { type: "LineString", coordinates },
    });
  }
  for (let latitude = -60; latitude <= 60; latitude += 20) {
    const coordinates: number[][] = [];
    for (let longitude = -180; longitude <= 180; longitude += 4) {
      coordinates.push([longitude, latitude]);
    }
    features.push({
      type: "Feature",
      properties: { kind: "parallel" },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
})();

const GRATICULE_LAYER: LayerProps = {
  id: "academic-graticule",
  type: "line",
  paint: {
    "line-color": "#7dd3fc",
    "line-opacity": 0.06,
    "line-width": 0.6,
  },
};

const COUNTRY_FILL_LAYER: LayerProps = {
  id: "academic-country-fill",
  type: "fill",
  paint: {
    "fill-color": [
      "case",
      ["boolean", ["get", "selected"], false],
      "#22d3ee",
      ["!", ["boolean", ["get", "has_data"], false]],
      "#16233a",
      [
        "interpolate",
        ["linear"],
        ["number", ["get", "heat_ratio"], 0],
        0,
        "#1d3b4d",
        0.4,
        "#176b78",
        0.75,
        "#1fa0a8",
        1,
        "#5eead4",
      ],
    ],
    "fill-opacity": [
      "case",
      ["boolean", ["get", "selected"], false],
      0.92,
      ["boolean", ["get", "focus_dimmed"], false],
      0.22,
      ["boolean", ["get", "has_data"], false],
      0.82,
      0.72,
    ],
  },
};

const COUNTRY_LINE_LAYER: LayerProps = {
  id: "academic-country-line",
  type: "line",
  paint: {
    "line-color": [
      "case",
      ["boolean", ["get", "selected"], false],
      "#67e8f9",
      "#243b5c",
    ],
    "line-opacity": [
      "case",
      ["boolean", ["get", "selected"], false],
      1,
      ["boolean", ["get", "focus_dimmed"], false],
      0.3,
      0.85,
    ],
    "line-width": ["case", ["boolean", ["get", "selected"], false], 1.6, 0.5],
  },
};

const COLLABORATION_LAYER: LayerProps = {
  id: "academic-collaboration-lines",
  type: "line",
  layout: {
    "line-cap": "round",
    "line-join": "round",
  },
  paint: {
    "line-color": [
      "case",
      ["boolean", ["get", "selected"], false],
      "#fbbf24",
      "#38bdf8",
    ],
    "line-opacity": [
      "case",
      ["boolean", ["get", "selected"], false],
      0.95,
      ["boolean", ["get", "focus_dimmed"], false],
      0.08,
      [
        "interpolate",
        ["linear"],
        ["number", ["get", "weight_ratio"], 0],
        0,
        0.18,
        1,
        0.55,
      ],
    ],
    "line-width": [
      "case",
      ["boolean", ["get", "selected"], false],
      3.4,
      [
        "interpolate",
        ["linear"],
        ["number", ["get", "weight_ratio"], 0],
        0,
        0.6,
        1,
        2.4,
      ],
    ],
    "line-blur": ["case", ["boolean", ["get", "selected"], false], 1.2, 0],
  },
};

const COUNTRY_BUBBLE_HALO_LAYER: LayerProps = {
  id: "academic-country-bubble-halo",
  type: "circle",
  paint: {
    "circle-radius": [
      "interpolate",
      ["linear"],
      ["number", ["get", "heat_ratio"], 0],
      0,
      10,
      1,
      30,
    ],
    "circle-color": "#22d3ee",
    "circle-blur": 1,
    "circle-opacity": [
      "case",
      ["boolean", ["get", "focus_dimmed"], false],
      0.05,
      0.22,
    ],
  },
};

const COUNTRY_BUBBLE_LAYER: LayerProps = {
  id: "academic-country-bubbles",
  type: "circle",
  paint: {
    "circle-radius": [
      "case",
      ["boolean", ["get", "selected"], false],
      [
        "interpolate",
        ["linear"],
        ["number", ["get", "heat_ratio"], 0],
        0,
        6,
        1,
        17,
      ],
      [
        "interpolate",
        ["linear"],
        ["number", ["get", "heat_ratio"], 0],
        0,
        4.5,
        1,
        14,
      ],
    ],
    "circle-color": [
      "case",
      ["boolean", ["get", "selected"], false],
      "#a5f3fc",
      "#22d3ee",
    ],
    "circle-stroke-color": "#04121f",
    "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 2.2, 1.2],
    "circle-opacity": [
      "case",
      ["boolean", ["get", "selected"], false],
      1,
      ["boolean", ["get", "focus_dimmed"], false],
      0.2,
      0.92,
    ],
  },
};

const COUNTRY_LABEL_LAYER: LayerProps = {
  id: "academic-country-labels",
  type: "symbol",
  minzoom: 1.8,
  layout: {
    "text-field": ["get", "country_code"],
    "text-size": 10,
    "text-offset": [0, 1.6],
    "text-allow-overlap": false,
  },
  paint: {
    "text-color": "#cbd9f0",
    "text-halo-color": "#0b1424",
    "text-halo-width": 1.4,
    "text-opacity": [
      "case",
      ["boolean", ["get", "selected"], false],
      1,
      ["boolean", ["get", "focus_dimmed"], false],
      0.25,
      0.85,
    ],
  },
};

type AtlasFeature = {
  type: "Feature";
  id?: string | number;
  properties?: { name?: string } | null;
  geometry: unknown;
};

type AtlasGeometry = {
  type: string;
  coordinates?: unknown;
};

function unwrapAntimeridianRing(ring: number[][]) {
  if (ring.length < 2) return ring;
  const hasDatelineJump = ring.some((position, index) => (
    index > 0 && Math.abs(position[0] - ring[index - 1][0]) > 180
  ));
  if (!hasDatelineJump) return ring;

  let previousLongitude = ring[0][0];
  const unwrapped = ring.map((position, index) => {
    if (index === 0) return [...position];
    let longitude = position[0];
    while (longitude - previousLongitude > 180) longitude -= 360;
    while (longitude - previousLongitude < -180) longitude += 360;
    previousLongitude = longitude;
    return [longitude, ...position.slice(1)];
  });

  // Polar rings cannot be represented as one flat continuous ring. Keep those
  // untouched; MapLibre clips them outside the visible academic map bounds.
  if (Math.abs(unwrapped[0][0] - unwrapped[unwrapped.length - 1][0]) > 1e-6) {
    return ring;
  }
  return unwrapped;
}

function unwrapAntimeridianGeometry(geometry: unknown): unknown {
  const value = geometry as AtlasGeometry | null;
  if (!value || !Array.isArray(value.coordinates)) return geometry;

  if (value.type === "Polygon") {
    return {
      ...value,
      coordinates: (value.coordinates as number[][][]).map(unwrapAntimeridianRing),
    };
  }
  if (value.type === "MultiPolygon") {
    return {
      ...value,
      coordinates: (value.coordinates as number[][][][]).map((polygon) =>
        polygon.map(unwrapAntimeridianRing)),
    };
  }
  return geometry;
}

const rawAtlasFeatures = topojsonFeature(
  worldAtlas as never,
  worldAtlas.objects.countries as never,
) as unknown as AtlasFeature | { type: "FeatureCollection"; features: AtlasFeature[] };
const atlasFeatures = "features" in rawAtlasFeatures
  ? rawAtlasFeatures.features
  : [rawAtlasFeatures];

function atlasCountryCode(id: string | number | undefined, name?: string) {
  if (id !== undefined) {
    const numeric = String(id).padStart(3, "0");
    const code = countries.numericToAlpha2(numeric);
    if (code) return code.toUpperCase();
  }
  if (name === "Kosovo") return "XK";
  return null;
}

const COUNTRY_CENTROIDS = new Map<string, [number, number]>();
const ATLAS_FEATURES_BY_CODE = new Map<string, AtlasFeature>();
for (const atlasFeature of atlasFeatures) {
  const code = atlasCountryCode(
    typeof atlasFeature.id === "string" || typeof atlasFeature.id === "number"
      ? atlasFeature.id
      : undefined,
    atlasFeature.properties?.name,
  );
  if (!code) continue;
  ATLAS_FEATURES_BY_CODE.set(code, atlasFeature);
  const centroid = geoCentroid(atlasFeature as never);
  if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
    COUNTRY_CENTROIDS.set(code, centroid as [number, number]);
  }
}

function formatCount(value: number) {
  return new Intl.NumberFormat("zh-CN", { notation: value >= 10_000 ? "compact" : "standard" }).format(value);
}

function workSourceUrl(work: AcademicIntelligenceWork) {
  if (work.primary_url) return work.primary_url;
  if (work.doi) return `https://doi.org/${work.doi}`;
  return null;
}

function collaborationArc(
  start: [number, number],
  end: [number, number],
) {
  const interpolate = geoInterpolate(start, end);
  const coordinates: [number, number][] = [];
  let previousLongitude: number | null = null;
  for (let index = 0; index <= 28; index += 1) {
    const [rawLongitude, latitude] = interpolate(index / 28);
    let longitude = rawLongitude;
    if (previousLongitude !== null) {
      while (longitude - previousLongitude > 180) longitude -= 360;
      while (longitude - previousLongitude < -180) longitude += 360;
    }
    coordinates.push([longitude, latitude]);
    previousLongitude = longitude;
  }
  return coordinates;
}

function countryPairKey(left: string, right: string) {
  return [left.toUpperCase(), right.toUpperCase()].sort().join(":");
}

function unwrapLongitude(longitude: number, reference: number) {
  let unwrapped = longitude;
  while (unwrapped - reference > 180) unwrapped -= 360;
  while (unwrapped - reference < -180) unwrapped += 360;
  return unwrapped;
}

function institutionMarkerOffset(index: number): [number, number] {
  const ring = Math.floor(index / 6);
  const position = index % 6;
  const angle = position * (Math.PI * 2 / 6) - Math.PI / 2;
  const radius = 42 + ring * 30;
  return [
    Math.round(Math.cos(angle) * radius),
    Math.round(Math.sin(angle) * radius * 0.72),
  ];
}

function institutionCoordinates(institution: AcademicIntelligenceInstitution) {
  const latitude = institution.latitude;
  const longitude = institution.longitude;
  if (
    typeof latitude !== "number"
    || typeof longitude !== "number"
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function institutionRegionLabel(institution: AcademicIntelligenceInstitution) {
  return institution.region?.trim() || institution.city?.trim() || "位置待补充";
}

function institutionLocationLabel(institution: AcademicIntelligenceInstitution) {
  const precision = institution.location_precision;
  if (!precision) return "国家级定位";
  if (precision === "campus") return "校园级定位";
  if (precision === "institution") return "机构级定位";
  if (precision === "inferred") return "推断定位";
  if (precision === "city") return institution.city ? `城市级定位 · ${institution.city}` : "城市级定位";
  return "国家级定位";
}

function institutionLocationSource(source: string | null | undefined) {
  switch (source) {
    case "openalex":
      return "OpenAlex";
    case "ror":
      return "ROR";
    case "wikidata":
      return "Wikidata";
    case "osm":
      return "OpenStreetMap";
    case "official":
      return "机构官网";
    case "manual":
      return "人工校准";
    default:
      return null;
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  return ref;
}

function stateLabel(state: string) {
  switch (state) {
    case "saved":
      return "已收藏";
    case "shortlisted":
      return "稍后处理";
    case "archived":
      return "已归档";
    default:
      return "新发现";
  }
}

export function AcademicIntelligenceMap({
  courseId,
  onOpenDiscovery,
  onOpenReader,
  topicId,
  pulseKey,
  embedded = false,
}: AcademicIntelligenceMapProps) {
  const literature = useLiteratureCenterClient();
  const queryClient = useQueryClient();
  const mapRef = useRef<MapRef | null>(null);
  const reducedMotion = useReducedMotion();
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | AcademicLiteratureState>("all");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showCollaborations, setShowCollaborations] = useState(true);
  const [showInstitutions, setShowInstitutions] = useState(true);
  const [context, setContext] = useState<MapContext>(null);
  const [pulseActive, setPulseActive] = useState(false);
  const filterRef = useDismissable(filterOpen, () => setFilterOpen(false));
  const exportRef = useDismissable(exportOpen, () => setExportOpen(false));

  useEffect(() => {
    if (!pulseKey) return;
    setPulseActive(true);
    const timer = window.setTimeout(() => setPulseActive(false), 6_500);
    return () => window.clearTimeout(timer);
  }, [pulseKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(searchDraft.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const validYearFrom = /^\d{4}$/.test(yearFrom) ? Number(yearFrom) : undefined;
  const validYearTo = /^\d{4}$/.test(yearTo) ? Number(yearTo) : undefined;
  const mapKey = [
    "courses",
    courseId,
    "literature",
    "academic-intelligence-map",
    topicId ?? "all-topics",
    stateFilter,
    searchQuery,
    validYearFrom ?? "all",
    validYearTo ?? "all",
    openAccessOnly,
  ] as const;
  const intelligenceQuery = useQuery({
    queryKey: mapKey,
    queryFn: () =>
      literature.getAcademicIntelligenceMap(courseId, {
        state: stateFilter === "all" ? undefined : stateFilter,
        q: searchQuery || undefined,
        topic_id: topicId ?? undefined,
        year_from: validYearFrom,
        year_to: validYearTo,
        open_access_only: openAccessOnly,
        work_limit: 300,
      }),
    enabled: Boolean(courseId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const data = intelligenceQuery.data;
  const institutionMarkerPoints = useMemo(() => {
    const countryIndexes = new Map<string, number>();
    return (data?.institutions ?? []).flatMap((institution) => {
      const countryCode = institution.country_code?.toUpperCase();
      const countryCenter = countryCode ? COUNTRY_CENTROIDS.get(countryCode) : undefined;
      if (!countryCode || !countryCenter) return [];
      const coordinates = institutionCoordinates(institution);
      const countryIndex = countryIndexes.get(countryCode) ?? 0;
      countryIndexes.set(countryCode, countryIndex + 1);
      return [{
        institution,
        countryCode,
        countryCenter,
        coordinates,
        isResolved: Boolean(coordinates),
        offset: institutionMarkerOffset(countryIndex),
      }];
    });
  }, [data?.institutions]);
  const countriesByCode = useMemo(
    () => new Map((data?.countries ?? []).map((country) => [country.country_code.toUpperCase(), country])),
    [data?.countries],
  );
  const maxCountryWorks = Math.max(1, ...(data?.countries ?? []).map((country) => country.work_count));
  const selectedInstitution = context?.kind === "institution"
    ? data?.institutions.find((institution) => institution.institution_id === context.id) ?? null
    : null;
  const selectedWork = context?.kind === "work"
    ? data?.works.find((work) => work.id === context.id) ?? null
    : null;
  const selectedCountryCode = context?.kind === "country"
    ? context.id
    : context?.kind === "region"
      ? context.countryCode
      : context?.kind === "institution"
        ? selectedInstitution?.country_code?.toUpperCase() ?? null
        : null;
  const focusedCountryCodes = useMemo(() => {
    if (selectedWork) {
      return new Set(selectedWork.country_codes.map((code) => code.toUpperCase()));
    }
    if (selectedCountryCode) return new Set([selectedCountryCode]);
    return new Set<string>();
  }, [selectedCountryCode, selectedWork]);
  const workCollaborationFocus = Boolean(selectedWork && focusedCountryCodes.size > 1);

  const countryGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: atlasFeatures.map((atlasFeature) => {
        const code = atlasCountryCode(
          typeof atlasFeature.id === "string" || typeof atlasFeature.id === "number"
            ? atlasFeature.id
            : undefined,
          atlasFeature.properties?.name,
        );
        const metric = code ? countriesByCode.get(code) : undefined;
        const selected = Boolean(code && focusedCountryCodes.has(code));
        return {
          ...atlasFeature,
          geometry: unwrapAntimeridianGeometry(atlasFeature.geometry),
          properties: {
            ...atlasFeature.properties,
            country_code: code ?? "",
            country_name: code ? countryDisplayName(code) : atlasFeature.properties?.name ?? "",
            work_count: metric?.work_count ?? 0,
            heat_ratio: metric ? metric.work_count / maxCountryWorks : 0,
            has_data: Boolean(metric),
            selected,
            focus_dimmed: workCollaborationFocus && !selected,
          },
        };
      }),
    }),
    [countriesByCode, focusedCountryCodes, maxCountryWorks, workCollaborationFocus],
  );

  const bubbleGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: (data?.countries ?? []).flatMap((country) => {
        const code = country.country_code.toUpperCase();
        const coordinates = COUNTRY_CENTROIDS.get(code);
        if (!coordinates) return [];
        return [{
          type: "Feature" as const,
          properties: {
            country_code: code,
            country_name: countryDisplayName(code),
            work_count: country.work_count,
            heat_ratio: country.work_count / maxCountryWorks,
            selected: focusedCountryCodes.has(code),
            focus_dimmed: workCollaborationFocus && !focusedCountryCodes.has(code),
          },
          geometry: { type: "Point" as const, coordinates },
        }];
      }),
    }),
    [data?.countries, focusedCountryCodes, maxCountryWorks, workCollaborationFocus],
  );

  const collaborationGeoJson = useMemo(() => {
    const rows = [...(data?.collaborations ?? [])];
    if (workCollaborationFocus) {
      const existingPairs = new Set(rows.map((row) =>
        countryPairKey(row.source_country_code, row.target_country_code)));
      const focusedCodes = [...focusedCountryCodes];
      for (let sourceIndex = 0; sourceIndex < focusedCodes.length; sourceIndex += 1) {
        for (let targetIndex = sourceIndex + 1; targetIndex < focusedCodes.length; targetIndex += 1) {
          const source = focusedCodes[sourceIndex];
          const target = focusedCodes[targetIndex];
          const pair = countryPairKey(source, target);
          if (!existingPairs.has(pair)) {
            rows.push({
              source_country_code: source,
              target_country_code: target,
              work_count: 1,
            });
            existingPairs.add(pair);
          }
        }
      }
    }

    const maxWeight = Math.max(1, ...rows.map((row) => row.work_count));
    return {
      type: "FeatureCollection" as const,
      features: rows.flatMap((row) => {
        const sourceCode = row.source_country_code.toUpperCase();
        const targetCode = row.target_country_code.toUpperCase();
        const start = COUNTRY_CENTROIDS.get(sourceCode);
        const end = COUNTRY_CENTROIDS.get(targetCode);
        if (!start || !end) return [];
        const selected = workCollaborationFocus
          && focusedCountryCodes.has(sourceCode)
          && focusedCountryCodes.has(targetCode);
        return [{
          type: "Feature" as const,
          properties: {
            source_country_code: sourceCode,
            target_country_code: targetCode,
            work_count: row.work_count,
            weight_ratio: row.work_count / maxWeight,
            selected,
            focus_dimmed: workCollaborationFocus && !selected,
          },
          geometry: {
            type: "LineString" as const,
            coordinates: collaborationArc(start, end),
          },
        }];
      }),
    };
  }, [data?.collaborations, focusedCountryCodes, workCollaborationFocus]);

  const selectedCountry = selectedCountryCode
    ? countriesByCode.get(selectedCountryCode) ?? null
    : null;
  const countryInstitutions = useMemo(() => {
    if (!data || !selectedCountryCode) return [];
    return data.institutions
      .filter((institution) => institution.country_code?.toUpperCase() === selectedCountryCode)
      .sort((left, right) => right.work_count - left.work_count);
  }, [data, selectedCountryCode]);

  const regionGroups = useMemo<RegionGroup[]>(() => {
    if (!data || !selectedCountryCode) return [];
    const groups = new Map<string, {
      key: string;
      label: string;
      cities: Set<string>;
      institutions: AcademicIntelligenceInstitution[];
    }>();
    for (const institution of countryInstitutions) {
      const city = institution.city?.trim() ?? "";
      const region = institution.region?.trim() ?? "";
      const label = region || city || "位置待补充";
      const key = `${selectedCountryCode}:${label}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, label, cities: new Set<string>(), institutions: [] };
        groups.set(key, group);
      }
      if (city && region && city !== label) group.cities.add(city);
      group.institutions.push(institution);
    }
    return [...groups.values()]
      .map((group) => {
        const institutionIds = new Set(group.institutions.map((institution) => institution.institution_id));
        const works = (data.works ?? []).filter((work) =>
          work.institution_ids.some((id) => institutionIds.has(id)));
        return {
          key: group.key,
          label: group.label,
          cities: [...group.cities],
          institutions: group.institutions,
          works,
        };
      })
      .sort((left, right) =>
        right.institutions.length - left.institutions.length
        || right.works.length - left.works.length
        || left.label.localeCompare(right.label, "zh"));
  }, [countryInstitutions, data, selectedCountryCode]);

  const selectedRegion = context?.kind === "region"
    ? regionGroups.find((group) => group.key === context.id) ?? null
    : null;

  const visibleInstitutionMarkerPoints = useMemo(() => {
    if (!selectedCountryCode) return [];
    const base = institutionMarkerPoints.filter((point) => point.countryCode === selectedCountryCode);
    const regionIds = selectedRegion
      ? new Set(selectedRegion.institutions.map((institution) => institution.institution_id))
      : null;
    return base
      .filter((point) => !regionIds || regionIds.has(point.institution.institution_id))
      .sort((left, right) =>
        Number(right.isResolved) - Number(left.isResolved)
        || right.institution.work_count - left.institution.work_count)
      .slice(0, 40);
  }, [institutionMarkerPoints, selectedCountryCode, selectedRegion]);

  const countryInstitutionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const institution of data?.institutions ?? []) {
      const countryCode = institution.country_code?.toUpperCase();
      if (countryCode) counts.set(countryCode, (counts.get(countryCode) ?? 0) + 1);
    }
    return counts;
  }, [data?.institutions]);

  const drawerPadding = () => window.innerWidth >= 768
    ? { top: 76, right: 456, bottom: 76, left: 76 }
    : 24;

  const selectCountry = (countryCode: string) => {
    const code = countryCode.toUpperCase();
    setContext({ kind: "country", id: code });
    const map = mapRef.current;
    if (!map) return;
    const feature = ATLAS_FEATURES_BY_CODE.get(code);
    if (feature) {
      const [[west, south], [east, north]] = geoBounds(feature as never) as [[number, number], [number, number]];
      if (Number.isFinite(west) && Number.isFinite(east) && Number.isFinite(south) && Number.isFinite(north) && west <= east) {
        map.fitBounds([[west, south], [east, north]], {
          padding: drawerPadding(),
          maxZoom: 5.4,
          duration: reducedMotion ? 0 : 700,
        });
        return;
      }
    }
    const center = COUNTRY_CENTROIDS.get(code);
    if (center) {
      map.flyTo({
        center,
        zoom: 3.2,
        padding: drawerPadding(),
        duration: reducedMotion ? 0 : 650,
      });
    }
  };

  const selectRegion = (group: RegionGroup) => {
    const countryCode = selectedCountryCode ?? "";
    setContext({ kind: "region", id: group.key, countryCode });
    const map = mapRef.current;
    if (!map) return;
    const located = group.institutions
      .map(institutionCoordinates)
      .filter((value): value is { latitude: number; longitude: number } => Boolean(value));
    if (located.length === 0) return;
    if (located.length === 1) {
      map.flyTo({
        center: [located[0].longitude, located[0].latitude],
        zoom: 6.8,
        padding: drawerPadding(),
        duration: reducedMotion ? 0 : 650,
      });
      return;
    }
    const longitudes = located.map((value) => value.longitude);
    const latitudes = located.map((value) => value.latitude);
    map.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: drawerPadding(),
        maxZoom: 7,
        duration: reducedMotion ? 0 : 700,
      },
    );
  };

  const selectInstitution = (institution: AcademicIntelligenceInstitution) => {
    setContext({ kind: "institution", id: institution.institution_id });
    const code = institution.country_code?.toUpperCase();
    const coordinates = institutionCoordinates(institution);
    const center = coordinates
      ? [coordinates.longitude, coordinates.latitude] as [number, number]
      : code ? COUNTRY_CENTROIDS.get(code) : undefined;
    if (center) {
      mapRef.current?.flyTo({
        center,
        zoom: coordinates ? 6.5 : 3.7,
        padding: drawerPadding(),
        duration: reducedMotion ? 0 : 650,
      });
    }
  };

  const selectWork = (work: AcademicIntelligenceWork) => {
    setContext({ kind: "work", id: work.id });
    const centers = [...new Set(work.country_codes.map((code) => code.toUpperCase()))]
      .flatMap((code) => {
        const center = COUNTRY_CENTROIDS.get(code);
        return center ? [center] : [];
      });
    if (centers.length === 0) return;
    if (centers.length === 1) {
      mapRef.current?.flyTo({
        center: centers[0],
        zoom: 3.2,
        padding: drawerPadding(),
        duration: reducedMotion ? 0 : 650,
      });
      return;
    }

    setShowCollaborations(true);
    const referenceLongitude = centers[0][0];
    const unwrappedCenters = centers.map(([longitude, latitude]) => [
      unwrapLongitude(longitude, referenceLongitude),
      latitude,
    ] as [number, number]);
    const longitudes = unwrappedCenters.map(([longitude]) => longitude);
    const latitudes = unwrappedCenters.map(([, latitude]) => latitude);
    mapRef.current?.fitBounds(
      [
        [Math.min(...longitudes), Math.min(...latitudes)],
        [Math.max(...longitudes), Math.max(...latitudes)],
      ],
      {
        padding: drawerPadding(),
        maxZoom: 3.4,
        duration: reducedMotion ? 0 : 700,
      },
    );
  };

  const applyGlobalView = () => {
    setContext(null);
    mapRef.current?.flyTo({
      center: [12, 12],
      zoom: 0.95,
      padding: 0,
      duration: reducedMotion ? 0 : 600,
    });
  };

  const handleBack = () => {
    if (selectedWork) {
      const firstCountry = selectedWork.country_codes[0]?.toUpperCase();
      if (firstCountry) selectCountry(firstCountry);
      else setContext(null);
      return;
    }
    if (selectedInstitution) {
      const countryCode = selectedInstitution.country_code?.toUpperCase();
      if (countryCode) {
        const region = regionGroups.find((group) =>
          group.institutions.some((row) => row.institution_id === selectedInstitution.institution_id));
        if (region) {
          setContext({ kind: "region", id: region.key, countryCode });
          return;
        }
        setContext({ kind: "country", id: countryCode });
        return;
      }
      setContext(null);
      return;
    }
    if (selectedRegion) {
      selectCountry(selectedRegion.key.split(":")[0] || "");
      return;
    }
    setContext(null);
  };

  const onMapClick = (event: MapMouseEvent) => {
    const code = event.features?.[0]?.properties?.country_code;
    if (typeof code !== "string" || !code) return;
    const normalizedCode = code.toUpperCase();
    if (countriesByCode.has(normalizedCode)) selectCountry(normalizedCode);
  };

  const saveMutation = useMutation({
    mutationFn: async ({ work }: SaveAction) => {
      if (work.state === "saved") return null;
      return literature.updateAcademicWorkState(courseId, work.id, "saved");
    },
    onSuccess: async (updated, action) => {
      const itemId = updated?.literature_item_id ?? action.work.literature_item_id ?? null;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["courses", courseId, "literature", "academic-intelligence-map"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["courses", courseId, "literature", "academic-works"],
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.literatureItems(courseId) }),
      ]);
      if (action.openAfterSave && itemId) {
        onOpenReader(itemId);
      } else if (action.openAfterSave) {
        onOpenDiscovery();
      } else if (updated) {
        toast.success("已收藏文献；开放全文会自动进入解析流程");
      }
    },
    onError: (error) => toast.error(getErrorMessage(error, "收藏文献失败")),
  });

  const resetFilters = () => {
    setSearchDraft("");
    setSearchQuery("");
    setStateFilter("all");
    setYearFrom("");
    setYearTo("");
    setOpenAccessOnly(false);
  };

  const contextWorks = useMemo(() => {
    if (!data) return [];
    if (selectedWork) return [selectedWork];
    if (selectedInstitution) {
      return data.works.filter((work) => work.institution_ids.includes(selectedInstitution.institution_id));
    }
    if (selectedRegion) return selectedRegion.works;
    if (selectedCountry) {
      return data.works.filter((work) =>
        work.country_codes.some((code) => code.toUpperCase() === selectedCountry.country_code.toUpperCase()),
      );
    }
    return [];
  }, [data, selectedCountry, selectedInstitution, selectedRegion, selectedWork]);

  const hasFilters = Boolean(
    searchDraft || stateFilter !== "all" || yearFrom || yearTo || openAccessOnly,
  );
  const mapTitle = topicId ? "当前主题的全球研究分布" : "全部主题的全球研究分布";
  const canExport = Boolean(data && data.summary.work_count > 0);

  const runExport = async (kind: ExportKind) => {
    if (!data) return;
    setExportOpen(false);
    try {
      if (kind === "png") {
        const map = mapRef.current?.getMap();
        if (!map) throw new Error("地图尚未就绪");
        setExporting(true);
        await exportIntelligenceMapPng(map, {
          title: mapTitle,
          subtitle: `${data.summary.work_count} 篇文献 · ${data.summary.country_count} 个国家 · ${data.summary.institution_count} 所机构${hasFilters ? " · 已应用筛选" : ""}`,
        });
      } else if (kind === "countries") {
        downloadTextFile(`literature-countries-${exportTimestamp()}.csv`, intelligenceCountriesCsv(data), "text/csv");
      } else if (kind === "institutions") {
        downloadTextFile(`literature-institutions-${exportTimestamp()}.csv`, intelligenceInstitutionsCsv(data), "text/csv");
      } else if (kind === "works") {
        downloadTextFile(`literature-works-${exportTimestamp()}.csv`, intelligenceWorksCsv(data), "text/csv");
      } else if (kind === "geojson") {
        downloadTextFile(`literature-map-${exportTimestamp()}.geojson`, intelligenceMapGeoJson(data), "application/geo+json");
      } else {
        downloadTextFile(`literature-map-${exportTimestamp()}.json`, intelligenceMapJson(data), "application/json");
      }
      toast.success("已导出当前地图数据");
    } catch (error) {
      toast.error(getErrorMessage(error, "导出失败"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#0b1424]">
      <div className="academic-map absolute inset-0 hidden md:block">
        <MapGL
          ref={mapRef}
          mapLib={maplibregl}
          style={{ width: "100%", height: "100%" }}
          initialViewState={{ longitude: 12, latitude: 12, zoom: 0.95 }}
          minZoom={0.7}
          maxZoom={7}
          maxPitch={0}
          dragRotate={false}
          touchPitch={false}
          mapStyle={MAP_STYLE}
          interactiveLayerIds={["academic-country-fill", "academic-country-bubbles"]}
          onClick={onMapClick}
          cursor="pointer"
          attributionControl={false}
        >
          <Source id="academic-graticule" type="geojson" data={GRATICULE_GEOJSON as never}>
            <Layer {...GRATICULE_LAYER} />
          </Source>
          <Source id="academic-countries" type="geojson" data={countryGeoJson as never}>
            <Layer {...COUNTRY_FILL_LAYER} />
            <Layer {...COUNTRY_LINE_LAYER} />
          </Source>
          {showCollaborations ? (
            <Source id="academic-collaborations" type="geojson" data={collaborationGeoJson}>
              <Layer {...COLLABORATION_LAYER} />
            </Source>
          ) : null}
          <Source id="academic-country-bubbles" type="geojson" data={bubbleGeoJson}>
            <Layer {...COUNTRY_BUBBLE_HALO_LAYER} />
            <Layer {...COUNTRY_BUBBLE_LAYER} />
            <Layer {...COUNTRY_LABEL_LAYER} />
          </Source>
          {pulseActive ? data?.countries.slice(0, 8).map((country, index) => {
            const center = COUNTRY_CENTROIDS.get(country.country_code.toUpperCase());
            if (!center) return null;
            return (
              <Marker
                key={`pulse-country-${country.country_code}`}
                longitude={center[0]}
                latitude={center[1]}
                anchor="bottom"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectCountry(country.country_code);
                  }}
                  className="group relative mb-2 cursor-pointer rounded-full border border-amber-300/50 bg-[#1a1408]/92 px-2.5 py-1 text-[11px] font-semibold text-amber-100 shadow-[0_10px_28px_-12px_rgba(0,0,0,0.9)] animate-in zoom-in-75 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 65}ms` }}
                  aria-label={`查看${countryDisplayName(country.country_code)}的${country.work_count}篇文献`}
                >
                  <span className="absolute inset-0 -z-10 rounded-full bg-warning-300/35 animate-ping motion-reduce:animate-none" />
                  {countryDisplayName(country.country_code)} · {country.work_count} 篇
                  {(countryInstitutionCounts.get(country.country_code.toUpperCase()) ?? 0) > 0
                    ? ` · ${countryInstitutionCounts.get(country.country_code.toUpperCase())} 所机构`
                    : ""}
                </button>
              </Marker>
            );
          }) : null}
          {showInstitutions ? visibleInstitutionMarkerPoints.map((point, index) => {
            const selected = context?.kind === "institution"
              && context.id === point.institution.institution_id;
            const dimmed = workCollaborationFocus && !focusedCountryCodes.has(point.countryCode);
            const tooltipPosition = point.countryCenter[0] < -60
              ? "left-full ml-2"
              : point.countryCenter[0] > 100
                ? "right-full mr-2"
                : "left-1/2 -translate-x-1/2";
            return (
              <Marker
                key={`institution-${point.institution.institution_id}-${pulseActive ? pulseKey : "steady"}`}
                longitude={point.coordinates?.longitude ?? point.countryCenter[0]}
                latitude={point.coordinates?.latitude ?? point.countryCenter[1]}
                anchor="center"
              >
                <div
                  className="relative"
                  style={point.isResolved ? undefined : { transform: `translate(${point.offset[0]}px, ${point.offset[1]}px)` }}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      selectInstitution(point.institution);
                    }}
                    className={cn(
                      "group relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border shadow-[0_8px_18px_-8px_rgba(15,118,110,0.9)] transition-[opacity,border-color,background-color,transform] duration-200 hover:z-20 hover:scale-110 motion-reduce:transition-none",
                      selected
                        ? "border-cyan-200 bg-cyan-400 text-[#062730]"
                        : "border-cyan-300/50 bg-[#0f2233]/92 text-cyan-100 hover:border-cyan-200 hover:bg-[#12314a]",
                      dimmed && "opacity-30",
                      pulseActive && "animate-in zoom-in-75 slide-in-from-bottom-2 duration-500 motion-reduce:animate-none",
                    )}
                    style={{ animationDelay: pulseActive ? `${180 + index * 55}ms` : undefined }}
                    title={`${point.institution.institution_name} · ${institutionLocationLabel(point.institution)}`}
                    aria-label={`查看机构${point.institution.institution_name}`}
                  >
                    {pulseActive ? (
                      <span className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-cyan-300/30 animate-ping motion-reduce:animate-none" />
                    ) : null}
                    <Building2 className="h-3.5 w-3.5" />
                    <span
                      className={cn(
                        "pointer-events-none absolute bottom-full z-30 mb-2 hidden max-w-56 items-center gap-2 whitespace-nowrap rounded-full border border-cyan-300/30 bg-[#0f1b2e]/95 px-2.5 py-1 text-[10px] font-medium text-cyan-50 shadow-[0_12px_28px_-12px_rgba(0,0,0,0.9)] group-hover:flex group-focus-visible:flex",
                        tooltipPosition,
                      )}
                    >
                      <span className="max-w-44 truncate">{point.institution.institution_name}</span>
                      <span className="tabular-nums text-success-700">
                        {point.institution.work_count}
                      </span>
                    </span>
                    <span className={cn(
                      "absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white px-1 text-[8px] font-bold leading-none",
                      selected ? "bg-amber-300 text-[#2a1c02]" : "bg-cyan-400 text-[#062730]",
                    )}>
                      {point.institution.work_count}
                    </span>
                  </button>
                </div>
              </Marker>
            );
          }) : null}
          <NavigationControl position="bottom-left" showCompass={false} visualizePitch={false} />
        </MapGL>
      </div>

      <div className="absolute inset-0 overflow-y-auto bg-background p-4 md:hidden">
        {intelligenceQuery.isLoading ? (
          <MapLoading />
        ) : intelligenceQuery.isError ? (
          <MapError onRetry={() => intelligenceQuery.refetch()} />
        ) : data?.countries.length ? (
          <div className="divide-y divide-border border-y border-border">
            {data.countries.map((country) => (
              <button
                key={country.country_code}
                type="button"
                onClick={() => selectCountry(country.country_code)}
                className="flex min-h-16 w-full items-center gap-3 py-3 text-left transition-colors active:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/8 font-semibold text-primary">
                  {country.country_code.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-foreground">{countryDisplayName(country.country_code)}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {country.open_access_count} 篇开放获取 · {country.saved_count} 篇已收藏
                  </span>
                </span>
                <span className="tabular-nums text-sm font-semibold text-foreground">{country.work_count}</span>
              </button>
            ))}
          </div>
        ) : (
          <MapEmpty onDiscover={onOpenDiscovery} />
        )}
      </div>

      {intelligenceQuery.isLoading ? (
        <div className="absolute inset-0 z-20 hidden items-center justify-center bg-[#0b1424]/75 md:flex">
          <MapLoading />
        </div>
      ) : null}
      {intelligenceQuery.isError ? (
        <div className="absolute inset-0 z-20 hidden items-center justify-center bg-[#0b1424]/80 md:flex">
          <MapError onRetry={() => intelligenceQuery.refetch()} />
        </div>
      ) : null}
      {!intelligenceQuery.isLoading && !intelligenceQuery.isError && data?.summary.work_count === 0 ? (
        <div className="absolute inset-0 z-20 hidden items-center justify-center bg-[#0b1424]/65 md:flex">
          <MapEmpty onDiscover={onOpenDiscovery} />
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-4 top-4 z-10 hidden md:flex">
        <div className="pointer-events-auto max-w-[min(420px,calc(100vw-380px))] rounded-xl border border-white/10 bg-[#0d192b]/88 px-3.5 py-2.5 shadow-[0_18px_44px_-28px_rgba(0,0,0,0.9)] backdrop-blur-md">
          {!embedded ? (
            <p className="truncate text-xs font-semibold text-slate-100">{mapTitle}</p>
          ) : null}
          <p className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-300",
            !embedded && "mt-1",
          )}>
            <span><strong className="tabular-nums text-white">{data?.summary.work_count ?? 0}</strong> 篇</span>
            <i className="h-3 w-px bg-white/15" />
            <span><strong className="tabular-nums text-white">{data?.summary.country_count ?? 0}</strong> 国</span>
            <i className="h-3 w-px bg-white/15" />
            <span><strong className="tabular-nums text-white">{data?.summary.institution_count ?? 0}</strong> 所机构</span>
            {!context && data?.summary.work_count ? (
              <>
                <i className="h-3 w-px bg-white/15" />
                <span className="text-slate-400">点击国家查看地域与机构</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "absolute right-4 top-4 z-30 hidden items-center gap-2 transition-[right] duration-200 motion-reduce:transition-none md:flex",
          context && "md:right-[424px]",
        )}
      >
        {context ? (
          <MapToolButton icon={Globe2} label="返回全球" onClick={applyGlobalView} />
        ) : null}
        <div ref={filterRef} className="relative">
          <MapToolButton
            icon={Filter}
            label="筛选"
            active={filterOpen || hasFilters}
            onClick={() => setFilterOpen((current) => !current)}
          />
          {filterOpen ? (
            <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-white/10 bg-[#0d192b]/97 p-3 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
              <label className="relative block">
                <span className="sr-only">检索题名、主题或 DOI</span>
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="检索题名、主题或 DOI"
                  className="h-9 border-white/10 bg-white/5 pl-8 text-xs text-slate-100 placeholder:text-slate-500"
                />
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label>
                  <span className="sr-only">处理状态</span>
                  <select
                    value={stateFilter}
                    onChange={(event) => setStateFilter(event.target.value as typeof stateFilter)}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-slate-100 outline-none transition-colors focus:border-cyan-300/50"
                  >
                    <option value="all">全部状态</option>
                    <option value="discovered">新发现</option>
                    <option value="shortlisted">稍后处理</option>
                    <option value="saved">已收藏</option>
                    <option value="archived">已归档</option>
                  </select>
                </label>
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    checked={openAccessOnly}
                    onChange={(event) => setOpenAccessOnly(event.target.checked)}
                    className="h-3.5 w-3.5 accent-cyan-400"
                  />
                  开放获取
                </label>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label>
                  <span className="sr-only">起始年份</span>
                  <Input
                    inputMode="numeric"
                    value={yearFrom}
                    maxLength={4}
                    onChange={(event) => setYearFrom(event.target.value.replace(/\D/g, ""))}
                    placeholder="起始年"
                    className="h-9 border-white/10 bg-white/5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </label>
                <label>
                  <span className="sr-only">结束年份</span>
                  <Input
                    inputMode="numeric"
                    value={yearTo}
                    maxLength={4}
                    onChange={(event) => setYearTo(event.target.value.replace(/\D/g, ""))}
                    placeholder="结束年"
                    className="h-9 border-white/10 bg-white/5 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  {data ? `${data.summary.work_count} 篇命中` : ""}
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={!hasFilters}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-slate-300 transition-colors hover:text-white disabled:opacity-40"
                >
                  <RotateCcw className="h-3 w-3" />重置筛选
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <MapToolButton
          icon={Building2}
          label="机构"
          active={showInstitutions}
          onClick={() => setShowInstitutions((current) => !current)}
        />
        <MapToolButton
          icon={Network}
          label="合作"
          active={showCollaborations}
          onClick={() => setShowCollaborations((current) => !current)}
        />
        <div ref={exportRef} className="relative">
          <MapToolButton
            icon={exporting ? Loader2 : Download}
            label="导出"
            spinning={exporting}
            disabled={!canExport}
            onClick={() => setExportOpen((current) => !current)}
          />
          {exportOpen ? (
            <ExportMenu exporting={exporting} onExport={runExport} />
          ) : null}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-[#0d192b]/85 px-4 py-1.5 text-[11px] text-slate-300 backdrop-blur-md md:flex">
        <span className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-cyan-300 ring-2 ring-cyan-300/25" />
          文献量
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-px w-4 bg-sky-400" />
          跨国合作
        </span>
      </div>

      {context && data ? (
        <ContextDrawer
          context={context}
          country={selectedCountry}
          region={selectedRegion}
          institution={selectedInstitution}
          work={selectedWork}
          works={contextWorks}
          institutions={countryInstitutions}
          regions={regionGroups}
          savingWorkId={saveMutation.isPending ? saveMutation.variables?.work.id ?? null : null}
          onClose={applyGlobalView}
          onSelectRegion={selectRegion}
          onSelectInstitution={selectInstitution}
          onSelectWork={selectWork}
          onBack={handleBack}
          onSave={(work, openAfterSave) => saveMutation.mutate({ work, openAfterSave })}
          onOpenReader={onOpenReader}
        />
      ) : null}
    </main>
  );
}

function MapToolButton({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  spinning = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  spinning?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium backdrop-blur-md transition-colors",
        active
          ? "border-cyan-300/45 bg-cyan-400/15 text-cyan-50"
          : "border-white/10 bg-[#0d192b]/88 text-slate-200 hover:border-cyan-300/35 hover:text-white",
        disabled && "cursor-not-allowed opacity-40 hover:border-white/10 hover:text-slate-200",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
      {label}
    </button>
  );
}

function ExportMenu({
  exporting,
  onExport,
}: {
  exporting: boolean;
  onExport: (kind: ExportKind) => void;
}) {
  const items: Array<{ kind: ExportKind; icon: LucideIcon; label: string; hint?: string }> = [
    { kind: "png", icon: FileImage, label: "地图 PNG", hint: "含标题统计" },
    { kind: "countries", icon: FileSpreadsheet, label: "国家数据 CSV" },
    { kind: "institutions", icon: FileSpreadsheet, label: "机构数据 CSV" },
    { kind: "works", icon: FileSpreadsheet, label: "文献清单 CSV" },
    { kind: "geojson", icon: FileCode2, label: "GeoJSON" },
    { kind: "json", icon: FileJson, label: "完整 JSON" },
  ];
  return (
    <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0d192b]/97 p-1 shadow-[0_28px_60px_-30px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      {items.map((item) => (
        <button
          key={item.kind}
          type="button"
          disabled={exporting}
          onClick={() => onExport(item.kind)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-slate-200 transition-colors hover:bg-white/8 disabled:opacity-50"
        >
          {item.kind === "png" && exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
          ) : (
            <item.icon className="h-3.5 w-3.5 text-cyan-300" />
          )}
          <span className="flex-1">{item.label}</span>
          {item.hint ? <span className="text-[10px] text-slate-500">{item.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ContextDrawer({
  context,
  country,
  region,
  institution,
  work,
  works,
  institutions,
  regions,
  savingWorkId,
  onClose,
  onSelectRegion,
  onSelectInstitution,
  onSelectWork,
  onBack,
  onSave,
  onOpenReader,
}: {
  context: Exclude<MapContext, null>;
  country: AcademicIntelligenceCountry | null;
  region: RegionGroup | null;
  institution: AcademicIntelligenceInstitution | null;
  work: AcademicIntelligenceWork | null;
  works: AcademicIntelligenceWork[];
  institutions: AcademicIntelligenceInstitution[];
  regions: RegionGroup[];
  savingWorkId: string | null;
  onClose: () => void;
  onSelectRegion: (group: RegionGroup) => void;
  onSelectInstitution: (institution: AcademicIntelligenceInstitution) => void;
  onSelectWork: (work: AcademicIntelligenceWork) => void;
  onBack: () => void;
  onSave: (work: AcademicIntelligenceWork, openAfterSave: boolean) => void;
  onOpenReader: (itemId: string) => void;
}) {
  const title = work?.canonical_title
    ?? institution?.institution_name
    ?? region?.label
    ?? (country ? countryDisplayName(country.country_code) : "学术情报");
  const kindLabel = context.kind === "work"
    ? "代表文献"
    : context.kind === "institution"
      ? "研究机构"
      : context.kind === "region"
        ? "研究地域"
        : "国家与地区";
  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 flex max-h-[calc(100dvh-12rem)] flex-col overscroll-contain border-t border-border bg-background shadow-[0_-24px_60px_-36px_rgba(15,23,42,0.55)] animate-in slide-in-from-bottom-3 duration-200 motion-reduce:animate-none md:absolute md:bottom-4 md:left-auto md:right-4 md:top-4 md:max-h-none md:w-[400px] md:rounded-2xl md:border md:shadow-[-24px_0_60px_-42px_rgba(15,23,42,0.75)] md:slide-in-from-right-3">
      <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {context.kind !== "country" ? (
              <button type="button" onClick={onBack} className="hover:text-foreground">返回上一级</button>
            ) : null}
            <span>{kindLabel}</span>
            {region && country ? (
              <span className="truncate text-muted-foreground/70">{countryDisplayName(country.country_code)}</span>
            ) : null}
          </div>
          <h2 className="mt-1 text-base font-semibold leading-6 text-foreground">{title}</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onClose} aria-label="关闭详情">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {country && !region && !institution && !work ? (
          <>
            <div className="grid grid-cols-4 divide-x divide-border border-y border-border py-3 text-center">
              <DrawerMetric label="文献" value={country.work_count} />
              <DrawerMetric label="开放" value={country.open_access_count} />
              <DrawerMetric label="已收藏" value={country.saved_count} />
              <DrawerMetric label="被引" value={country.cited_by_count} />
            </div>
            {regions.length > 0 ? (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-foreground">地域分布</h3>
                <div className="mt-2 divide-y divide-border border-y border-border">
                  {regions.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => onSelectRegion(group)}
                      className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/45"
                    >
                      <MapPin className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{group.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {[
                            group.cities.join(" · "),
                            `${group.institutions.length} 所机构`,
                            `${group.works.length} 篇文献`,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {institutions.length > 0 ? (
              <section className="mt-5">
                <h3 className="text-sm font-semibold text-foreground">主要机构</h3>
                <InstitutionList institutions={institutions} onSelect={onSelectInstitution} />
              </section>
            ) : null}
          </>
        ) : null}

        {region && !institution && !work ? (
          <>
            <div className="grid grid-cols-3 divide-x divide-border border-y border-border py-3 text-center">
              <DrawerMetric label="文献" value={region.works.length} />
              <DrawerMetric label="机构" value={region.institutions.length} />
              <DrawerMetric label="开放" value={region.works.filter((row) => row.is_open_access).length} />
            </div>
            <section className="mt-5">
              <h3 className="text-sm font-semibold text-foreground">地域内机构</h3>
              <InstitutionList institutions={region.institutions} onSelect={onSelectInstitution} />
            </section>
          </>
        ) : null}

        {institution && !work ? (
          <>
            <div className="flex items-start gap-3 border-b border-border pb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary">
                <Landmark className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{countryDisplayName(institution.country_code)}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  地图位置精度：{institutionLocationLabel(institution)}。{institutionLocationSource(institution.location_source)
                    ? ` 来源：${institutionLocationSource(institution.location_source)}。`
                    : " 当前没有可靠经纬度，因此保留国家级降级。"}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border py-3 text-center">
              <DrawerMetric label="文献" value={institution.work_count} />
              <DrawerMetric label="开放" value={institution.open_access_count} />
              <DrawerMetric label="被引" value={institution.cited_by_count} />
            </div>
            {institution.ror_id || institution.openalex_id ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {institution.ror_id ? (
                  <a
                    href={institution.ror_id.startsWith("http") ? institution.ror_id : `https://ror.org/${institution.ror_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-medium text-foreground hover:border-primary/30 hover:text-primary"
                  >
                    ROR <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                {institution.openalex_id ? (
                  <a
                    href={institution.openalex_id.startsWith("http") ? institution.openalex_id : `https://openalex.org/${institution.openalex_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-border px-2.5 text-xs font-medium text-foreground hover:border-primary/30 hover:text-primary"
                  >
                    OpenAlex <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {work ? (
          <WorkDetail
            work={work}
            saving={savingWorkId === work.id}
            onSave={onSave}
            onOpenReader={onOpenReader}
          />
        ) : null}

        {!work ? (
          <section className="mt-5">
            <h3 className="text-sm font-semibold text-foreground">代表文献</h3>
            {works.length > 0 ? (
              <div className="mt-2 divide-y divide-border border-y border-border">
                {works.slice(0, 12).map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onSelectWork(row)}
                    className="w-full py-3 text-left transition-colors hover:bg-muted/45"
                  >
                    <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground">{row.canonical_title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{row.publication_year ?? "年份待补充"}</span>
                      <span>被引 {formatCount(row.cited_by_count ?? 0)}</span>
                      {row.is_open_access ? <span className="text-success-700">开放获取</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 border-y border-border py-5 text-sm text-muted-foreground">当前范围内没有可展示的代表文献。</p>
            )}
          </section>
        ) : null}
      </div>
    </aside>
  );
}

function InstitutionList({
  institutions,
  onSelect,
}: {
  institutions: AcademicIntelligenceInstitution[];
  onSelect: (institution: AcademicIntelligenceInstitution) => void;
}) {
  return (
    <div className="mt-2 divide-y divide-border border-y border-border">
      {institutions.slice(0, 12).map((row) => (
        <button
          key={row.institution_id}
          type="button"
          onClick={() => onSelect(row)}
          className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/45"
        >
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block line-clamp-2 text-sm font-medium text-foreground">{row.institution_name}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {[row.city, `被引 ${formatCount(row.cited_by_count)}`].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span className="tabular-nums text-xs font-semibold text-foreground">{row.work_count}</span>
        </button>
      ))}
    </div>
  );
}

function WorkDetail({
  work,
  saving,
  onSave,
  onOpenReader,
}: {
  work: AcademicIntelligenceWork;
  saving: boolean;
  onSave: (work: AcademicIntelligenceWork, openAfterSave: boolean) => void;
  onOpenReader: (itemId: string) => void;
}) {
  const sourceUrl = workSourceUrl(work);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={work.state === "saved" ? "secondary" : "outline"}>{stateLabel(work.state)}</Badge>
        {work.is_open_access ? <Badge variant="success">开放获取</Badge> : null}
        {work.lifecycle_status !== "active" ? <Badge variant="warning">版本需关注</Badge> : null}
      </div>
      <dl className="mt-4 divide-y divide-border border-y border-border text-sm">
        <div className="grid grid-cols-[88px_1fr] gap-3 py-3">
          <dt className="text-muted-foreground">出版信息</dt>
          <dd className="text-foreground">{[work.publication_title, work.publication_year].filter(Boolean).join(" · ") || "待补充"}</dd>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-3 py-3">
          <dt className="text-muted-foreground">研究来源</dt>
          <dd className="text-foreground">{work.country_codes.map((code) => countryDisplayName(code)).join("、") || "待识别"}</dd>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-3 py-3">
          <dt className="text-muted-foreground">影响力</dt>
          <dd className="tabular-nums text-foreground">被引 {formatCount(work.cited_by_count ?? 0)} · {work.institution_count} 所机构</dd>
        </div>
        {work.doi ? (
          <div className="grid grid-cols-[88px_1fr] gap-3 py-3">
            <dt className="text-muted-foreground">DOI</dt>
            <dd className="break-all text-foreground">{work.doi}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-5 space-y-2">
        {work.state === "saved" && work.literature_item_id ? (
          <Button className="w-full" onClick={() => onOpenReader(work.literature_item_id as string)}>
            <BookOpen className="h-4 w-4" />打开全文
          </Button>
        ) : (
          <Button className="w-full" disabled={saving} onClick={() => onSave(work, false)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LibraryBig className="h-4 w-4" />}
            收藏文献
          </Button>
        )}
        {sourceUrl ? (
          <Button variant="outline" className="w-full" asChild>
            <a href={sourceUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />查看来源
            </a>
          </Button>
        ) : null}
      </div>
      <div className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
        {work.lifecycle_status === "active" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-600" /> : <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-600" />}
        <p>收藏后可继续使用全文获取、解析与文献比较能力。</p>
      </div>
    </div>
  );
}

function DrawerMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1">
      <p className="tabular-nums text-base font-semibold text-foreground">{formatCount(value)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function MapLoading() {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-border bg-white/95 px-8 py-6 text-center shadow-[0_24px_60px_-40px_rgba(2,8,23,0.9)]" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />
      <p className="mt-3 text-sm font-medium text-foreground">正在汇总全球研究来源</p>
      <p className="mt-1 text-xs text-muted-foreground">计算国家、机构、合作关系与年度分布</p>
    </div>
  );
}

function MapError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-sm rounded-2xl border border-border bg-white/95 p-5 text-center shadow-[0_24px_60px_-40px_rgba(2,8,23,0.9)]">
      <CircleAlert className="mx-auto h-6 w-6 text-warning-600" />
      <p className="mt-3 text-sm font-semibold text-foreground">全球情报暂时无法加载</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">已收藏文献不会受影响，可以重试聚合或返回文献页。</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" />重试
      </Button>
    </div>
  );
}

function MapEmpty({ onDiscover }: { onDiscover: () => void }) {
  return (
    <div className="max-w-sm rounded-2xl border border-border bg-white/95 p-6 text-center shadow-[0_24px_60px_-40px_rgba(2,8,23,0.9)]">
      <Globe2 className="mx-auto h-7 w-7 text-primary" />
      <p className="mt-3 text-sm font-semibold text-foreground">还没有可绘制的学术来源</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">先检索相关文献，机构与国家信息会自动进入全球视图。</p>
      <Button size="sm" className="mt-4" onClick={onDiscover}>
        <Link2 className="h-4 w-4" />发现文献
      </Button>
    </div>
  );
}
