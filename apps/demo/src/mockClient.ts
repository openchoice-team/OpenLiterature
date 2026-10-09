import type {
  AcademicDiscoverySearchResponse,
  AcademicFulltextJob,
  AcademicIntelligenceMapData,
  AcademicIntelligenceMapFilters,
  AcademicLiteratureCoverage,
  AcademicLiteratureState,
  AcademicLiteratureTopic,
  AcademicLiteratureWork,
  AcademicResearchOrigins,
  LiteratureCenterClient,
} from "@opendhu/literature-center";

const now = new Date("2026-10-09T10:20:00.000Z");
const iso = (offsetMinutes: number) =>
  new Date(now.getTime() - offsetMinutes * 60_000).toISOString();

const TOPIC_ID = "topic-comammox";

const topics: AcademicLiteratureTopic[] = [
  {
    id: TOPIC_ID,
    org_id: "demo-org",
    course_id: "demo-course",
    name: "comammox",
    query_text: "comammox Nitrospira niche differentiation",
    description: "完全氨氧化菌的生态位分化与工程应用",
    auto_refresh: true,
    refresh_interval_minutes: 60,
    last_run_at: iso(95),
    last_success_at: iso(95),
    next_run_at: null,
    last_run_status: "succeeded",
    last_run_new_count: 3,
    last_error_summary: null,
    created_by: "demo-user",
    created_at: iso(4_000),
    updated_at: iso(95),
    work_count: 11,
    unread_count: 11,
  },
  {
    id: "topic-nitrifier-salt",
    org_id: "demo-org",
    course_id: "demo-course",
    name: "硝化菌耐盐机制",
    query_text: "nitrifier salt tolerance mechanism wastewater",
    description: "高盐废水硝化过程的微生物适应机制",
    auto_refresh: false,
    refresh_interval_minutes: 60,
    last_run_at: null,
    last_success_at: null,
    next_run_at: null,
    last_run_status: null,
    last_run_new_count: 0,
    last_error_summary: null,
    created_by: "demo-user",
    created_at: iso(900),
    updated_at: iso(900),
    work_count: 0,
    unread_count: 0,
  },
  {
    id: "topic-args",
    org_id: "demo-org",
    course_id: "demo-course",
    name: "抗生素抗性基因",
    query_text: "antibiotic resistance genes wastewater treatment",
    description: "污水处理系统中的 ARGs 传播与去除",
    auto_refresh: false,
    refresh_interval_minutes: 60,
    last_run_at: null,
    last_success_at: null,
    next_run_at: null,
    last_run_status: null,
    last_run_new_count: 0,
    last_error_summary: null,
    created_by: "demo-user",
    created_at: iso(1_200),
    updated_at: iso(1_200),
    work_count: 0,
    unread_count: 0,
  },
];

const authorship = (
  names: string[],
  institutions: Array<{ id: string; name: string; country: string }>,
) =>
  names.map((name, index) => ({
    ordinal: index + 1,
    author_name: name,
    author_external_id: null,
    institution_name: institutions[index % institutions.length].name,
    institution_external_id: institutions[index % institutions.length].id,
    country_code: institutions[index % institutions.length].country,
    is_corresponding: index === 0,
  }));

const RADBOUD = { id: "inst-radboud", name: "Radboud University Nijmegen", country: "NL" };
const AIMST = { id: "inst-aimst", name: "AIMST University", country: "MY" };
const CHUNGBUK = { id: "inst-chungbuk", name: "Chungbuk National University", country: "KR" };
const WATER_AU = { id: "inst-water-au", name: "Department of Water", country: "AU" };
const FUDAN = { id: "inst-fudan", name: "Fudan University", country: "CN" };
const NORTHWESTERN = { id: "inst-northwestern", name: "Northwestern University", country: "US" };
const HKU = { id: "inst-hku", name: "The University of Hong Kong", country: "HK" };
const VIENNA = { id: "inst-vienna", name: "University of Vienna", country: "AT" };
const DTU = { id: "inst-dtu", name: "Technical University of Denmark", country: "DK" };

const work = (
  id: string,
  title: string,
  year: number,
  journal: string,
  doi: string,
  citedBy: number,
  openAccess: boolean,
  names: string[],
  institutions: Array<{ id: string; name: string; country: string }>,
): AcademicLiteratureWork => ({
  id,
  canonical_title: title,
  abstract_text:
    "完全氨氧化菌（comammox）在单一细胞中完成氨氧化与亚硝酸盐氧化，改变了传统两段式硝化的认知。本研究结合宏基因组与富集培养，比较其在不同氨浓度与氧条件下的生态位分化。",
  publication_year: year,
  publication_date: `${year}-06-01`,
  publication_title: journal,
  work_type: "article",
  language: "en",
  doi,
  primary_url: `https://doi.org/${doi}`,
  cited_by_count: citedBy,
  is_open_access: openAccess,
  open_access_url: openAccess ? `https://doi.org/${doi}` : null,
  oa_status: openAccess ? "gold" : "closed",
  license: openAccess ? "cc-by" : null,
  lifecycle_status: "active",
  lifecycle_source: "crossref",
  lifecycle_checked_at: iso(120),
  state: "discovered",
  relevance_score: 0.92,
  relevance_reason: "直接研究 comammox 的生态位分化机制，是本主题的核心证据。",
  discovered_via: "openalex",
  literature_item_id: null,
  last_discovered_at: iso(95),
  updated_at: iso(95),
  authors: authorship(names, institutions),
  institutions: institutions.map((institution, index) => ({
    institution_id: institution.id,
    institution_name: institution.name,
    country_code: institution.country,
    ror_id: null,
    openalex_id: null,
    author_count: Math.max(1, names.length - index),
    corresponding_author_count: index === 0 ? 1 : 0,
    fractional_weight: Math.round((1 / institutions.length) * 100) / 100,
  })),
  relations: [],
  fulltext: null,
  is_unread: true,
});

const works: AcademicLiteratureWork[] = [
  work(
    "work-1",
    "Comparative genomics sheds light on niche differentiation and the evolutionary history of comammox Nitrospira",
    2018,
    "The ISME Journal",
    "10.1038/s41396-018-0119-8",
    374,
    true,
    ["Alejandro Palomo", "Anders Gorm Pedersen", "Jane Fowler", "Arnaud Dechesne"],
    [DTU],
  ),
  work(
    "work-2",
    "AmoA-Targeted Polymerase Chain Reaction Primers for the Specific Detection and Quantification of Comammox Nitrospira in the Environment",
    2017,
    "Frontiers in Microbiology",
    "10.3389/fmicb.2017.01508",
    431,
    true,
    ["Petra Pjevac", "Clemens Schauberger", "Lianna Poghosyan", "Craig W. Herbold"],
    [VIENNA],
  ),
  work(
    "work-3",
    "Comammox Nitrospira are abundant ammonia oxidizers in diverse groundwater-fed rapid sand filter communities",
    2018,
    "Environmental Microbiology",
    "10.1111/1462-2920.14033",
    266,
    true,
    ["Alejandro Palomo", "Jane Fowler", "Arnaud Dechesne", "Barth F. Smets"],
    [DTU, RADBOUD],
  ),
  work(
    "work-4",
    "Kinetic analysis of a complete nitrifier reveals an oligotrophic lifestyle",
    2017,
    "Nature",
    "10.1038/nature23679",
    612,
    false,
    ["K. Dimitri Kits", "Michael C. Sedlacek", "Eva Spieck"],
    [RADBOUD, VIENNA],
  ),
  work(
    "work-5",
    "Niche differentiation of comammox Nitrospira and canonical ammonia oxidizers in paddy soils",
    2020,
    "Soil Biology and Biochemistry",
    "10.1016/j.soilbio.2020.107802",
    188,
    false,
    ["Hang-Wei Hu", "Jun-Tao Wang", "Bao-Kai Zhou"],
    [FUDAN],
  ),
  work(
    "work-6",
    "Comammox Nitrospira dominate nitrification in a tropical aquaculture system",
    2021,
    "Water Research",
    "10.1016/j.watres.2021.117102",
    96,
    true,
    ["Kian Mau Goh", "Siew Moi Phang", "Kok Jun Liew"],
    [AIMST, CHUNGBUK],
  ),
  work(
    "work-7",
    "Enrichment and physiological characterization of comammox Nitrospira from a full-scale wastewater treatment plant",
    2022,
    "Microbiome",
    "10.1186/s40168-022-01322-y",
    54,
    true,
    ["Wan Liu", "Yan Chen", "Tong Zhang"],
    [HKU, FUDAN],
  ),
  work(
    "work-8",
    "Global distribution and environmental drivers of comammox Nitrospira in engineered systems",
    2023,
    "Environmental Science & Technology",
    "10.1021/acs.est.3c01234",
    27,
    false,
    ["Emily Cross", "David Holmes", "Michael Wagner"],
    [NORTHWESTERN, WATER_AU],
  ),
];

const coverage: AcademicLiteratureCoverage = {
  work_count: works.length,
  doi_count: 8,
  abstract_count: Math.round(works.length * 0.36),
  institution_count: Math.round(works.length * 0.55),
  country_count: Math.round(works.length * 0.55),
  open_access_count: 5,
  saved_count: 0,
  risk_count: 0,
  latest_sync_at: iso(95),
};

const origins: AcademicResearchOrigins = {
  work_count: 11,
  institution_work_count: 6,
  institutions: [
    { institution_id: RADBOUD.id, institution_name: RADBOUD.name, country_code: RADBOUD.country, full_count: 2, fractional_count: 1.6, corresponding_count: 1, ror_id: null, openalex_id: null },
    { institution_id: AIMST.id, institution_name: AIMST.name, country_code: AIMST.country, full_count: 1, fractional_count: 0.8, corresponding_count: 1, ror_id: null, openalex_id: null },
    { institution_id: CHUNGBUK.id, institution_name: CHUNGBUK.name, country_code: CHUNGBUK.country, full_count: 1, fractional_count: 0.8, corresponding_count: 0, ror_id: null, openalex_id: null },
    { institution_id: WATER_AU.id, institution_name: WATER_AU.name, country_code: WATER_AU.country, full_count: 1, fractional_count: 0.7, corresponding_count: 0, ror_id: null, openalex_id: null },
    { institution_id: FUDAN.id, institution_name: FUDAN.name, country_code: FUDAN.country, full_count: 1, fractional_count: 0.9, corresponding_count: 1, ror_id: null, openalex_id: null },
    { institution_id: NORTHWESTERN.id, institution_name: NORTHWESTERN.name, country_code: NORTHWESTERN.country, full_count: 1, fractional_count: 0.6, corresponding_count: 0, ror_id: null, openalex_id: null },
  ],
  countries: [
    { country_code: "NL", full_count: 2, fractional_count: 1.6, corresponding_count: 1 },
    { country_code: "CN", full_count: 1, fractional_count: 0.9, corresponding_count: 1 },
    { country_code: "DK", full_count: 1, fractional_count: 0.8, corresponding_count: 1 },
    { country_code: "AT", full_count: 1, fractional_count: 0.7, corresponding_count: 0 },
    { country_code: "AU", full_count: 1, fractional_count: 0.7, corresponding_count: 0 },
    { country_code: "US", full_count: 1, fractional_count: 0.6, corresponding_count: 0 },
  ],
};

const intelligenceMap: AcademicIntelligenceMapData = {
  summary: {
    work_count: 11,
    institution_count: 13,
    country_count: 9,
    open_access_count: 5,
    saved_count: 0,
    risk_count: 0,
    total_citations: 2_048,
    year_min: 2017,
    year_max: 2023,
  },
  countries: [
    { country_code: "NL", work_count: 2, fractional_count: 1.6, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 878, year_min: 2017, year_max: 2018 },
    { country_code: "CN", work_count: 1, fractional_count: 0.9, corresponding_count: 1, open_access_count: 0, saved_count: 0, cited_by_count: 188, year_min: 2020, year_max: 2020 },
    { country_code: "DK", work_count: 1, fractional_count: 0.8, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 374, year_min: 2018, year_max: 2018 },
    { country_code: "AT", work_count: 1, fractional_count: 0.7, corresponding_count: 0, open_access_count: 1, saved_count: 0, cited_by_count: 431, year_min: 2017, year_max: 2017 },
    { country_code: "AU", work_count: 1, fractional_count: 0.7, corresponding_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 27, year_min: 2023, year_max: 2023 },
    { country_code: "US", work_count: 1, fractional_count: 0.6, corresponding_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 27, year_min: 2023, year_max: 2023 },
    { country_code: "HK", work_count: 1, fractional_count: 0.5, corresponding_count: 0, open_access_count: 1, saved_count: 0, cited_by_count: 54, year_min: 2022, year_max: 2022 },
    { country_code: "MY", work_count: 1, fractional_count: 0.5, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 96, year_min: 2021, year_max: 2021 },
    { country_code: "KR", work_count: 1, fractional_count: 0.4, corresponding_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 96, year_min: 2021, year_max: 2021 },
  ],
  institutions: [
    { institution_id: RADBOUD.id, institution_name: RADBOUD.name, country_code: RADBOUD.country, city: "Nijmegen", region: "Gelderland", latitude: 51.8126, longitude: 5.8372, location_source: "ror", location_precision: "city", location_confidence: 0.9, work_count: 2, fractional_count: 1.6, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 878 },
    { institution_id: FUDAN.id, institution_name: FUDAN.name, country_code: FUDAN.country, city: "Shanghai", region: "Shanghai", latitude: 31.2989, longitude: 121.5033, location_source: "ror", location_precision: "city", location_confidence: 0.9, work_count: 2, fractional_count: 1.2, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 242 },
    { institution_id: CHUNGBUK.id, institution_name: CHUNGBUK.name, country_code: CHUNGBUK.country, city: "Cheongju", region: "Chungcheongbuk-do", latitude: 36.6287, longitude: 127.4573, location_source: "ror", location_precision: "city", location_confidence: 0.8, work_count: 1, fractional_count: 0.4, corresponding_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 96 },
    { institution_id: AIMST.id, institution_name: AIMST.name, country_code: AIMST.country, city: "Bedong", region: "Kedah", latitude: 5.7582, longitude: 100.4662, location_source: "ror", location_precision: "city", location_confidence: 0.8, work_count: 1, fractional_count: 0.5, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 96 },
    { institution_id: WATER_AU.id, institution_name: WATER_AU.name, country_code: WATER_AU.country, city: "Perth", region: "Western Australia", latitude: -31.9523, longitude: 115.8613, location_source: "ror", location_precision: "city", location_confidence: 0.7, work_count: 1, fractional_count: 0.7, corresponding_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 27 },
    { institution_id: NORTHWESTERN.id, institution_name: NORTHWESTERN.name, country_code: NORTHWESTERN.country, city: "Evanston", region: "Illinois", latitude: 42.0565, longitude: -87.6753, location_source: "ror", location_precision: "city", location_confidence: 0.9, work_count: 1, fractional_count: 0.6, corresponding_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 27 },
    { institution_id: HKU.id, institution_name: HKU.name, country_code: HKU.country, city: "Hong Kong", region: "Hong Kong", latitude: 22.283, longitude: 114.137, location_source: "ror", location_precision: "city", location_confidence: 0.8, work_count: 1, fractional_count: 0.5, corresponding_count: 0, open_access_count: 1, saved_count: 0, cited_by_count: 54 },
    { institution_id: VIENNA.id, institution_name: VIENNA.name, country_code: VIENNA.country, city: "Vienna", region: "Vienna", latitude: 48.2085, longitude: 16.3555, location_source: "ror", location_precision: "city", location_confidence: 0.9, work_count: 1, fractional_count: 0.7, corresponding_count: 0, open_access_count: 1, saved_count: 0, cited_by_count: 431 },
    { institution_id: DTU.id, institution_name: DTU.name, country_code: DTU.country, city: "Kongens Lyngby", region: "Capital Region", latitude: 55.7866, longitude: 12.5216, location_source: "ror", location_precision: "city", location_confidence: 0.9, work_count: 1, fractional_count: 0.8, corresponding_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 374 },
  ],
  timeline: [
    { publication_year: 2017, work_count: 2, open_access_count: 1, saved_count: 0, cited_by_count: 1_043 },
    { publication_year: 2018, work_count: 2, open_access_count: 2, saved_count: 0, cited_by_count: 640 },
    { publication_year: 2019, work_count: 0, open_access_count: 0, saved_count: 0, cited_by_count: 0 },
    { publication_year: 2020, work_count: 1, open_access_count: 0, saved_count: 0, cited_by_count: 188 },
    { publication_year: 2021, work_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 96 },
    { publication_year: 2022, work_count: 1, open_access_count: 1, saved_count: 0, cited_by_count: 54 },
    { publication_year: 2023, work_count: 1, open_access_count: 0, saved_count: 0, cited_by_count: 27 },
  ],
  collaborations: [
    { source_country_code: "NL", target_country_code: "CN", work_count: 2 },
    { source_country_code: "CN", target_country_code: "US", work_count: 1 },
    { source_country_code: "DK", target_country_code: "AU", work_count: 1 },
    { source_country_code: "MY", target_country_code: "KR", work_count: 1 },
    { source_country_code: "HK", target_country_code: "CN", work_count: 1 },
    { source_country_code: "AT", target_country_code: "NL", work_count: 1 },
  ],
  works: works.map((item) => ({
    id: item.id,
    canonical_title: item.canonical_title,
    publication_year: item.publication_year,
    publication_title: item.publication_title,
    doi: item.doi,
    primary_url: item.primary_url,
    cited_by_count: item.cited_by_count,
    is_open_access: item.is_open_access,
    lifecycle_status: item.lifecycle_status,
    state: item.state,
    relevance_score: item.relevance_score,
    literature_item_id: null,
    institution_count: item.institutions.length,
    country_codes: item.institutions.map((institution) => institution.country_code ?? ""),
    institution_ids: item.institutions.map((institution) => institution.institution_id),
  })),
};

const searchResponse = (query: string): AcademicDiscoverySearchResponse => ({
  run: {
    id: `run-${Date.now()}`,
    status: "succeeded",
    query_text: query,
    provider_keys: ["openalex", "crossref"],
    discovered_count: works.length,
    persisted_count: works.length,
    duplicate_count: 0,
    error_class: null,
    error_summary: null,
    started_at: iso(1),
    finished_at: iso(0),
  },
  works,
  trace_summary: [
    { provider: "openalex", status: "succeeded", detail: `检索到 ${works.length} 篇` },
    { provider: "crossref", status: "succeeded", detail: "DOI 与出版信息已合并" },
  ],
});

export function createMockLiteratureCenterClient(): LiteratureCenterClient {
  let topicState = topics.map((topic) => ({ ...topic }));
  const workState = works.map((item) => ({ ...item }));

  return {
    getAcademicIntelligenceMap: async (_courseId: string, _params?: AcademicIntelligenceMapFilters) =>
      intelligenceMap,
    getAcademicCoverage: async () => coverage,
    getAcademicResearchOrigins: async () => origins,
    searchAcademicWorks: async (_courseId, payload) => searchResponse(payload.query),
    listAcademicWorks: async (_courseId, params) =>
      params?.topic_id === TOPIC_ID || !params?.topic_id ? workState : [],
    listAcademicTopics: async () => topicState,
    createAcademicTopic: async (_courseId, payload) => {
      const created: AcademicLiteratureTopic = {
        id: `topic-${Date.now()}`,
        org_id: "demo-org",
        course_id: "demo-course",
        name: payload.name,
        query_text: payload.query_text,
        description: payload.description ?? "",
        auto_refresh: payload.auto_refresh ?? false,
        refresh_interval_minutes: 60,
        last_run_at: null,
        last_success_at: null,
        next_run_at: null,
        last_run_status: null,
        last_run_new_count: 0,
        last_error_summary: null,
        created_by: "demo-user",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        work_count: 0,
        unread_count: 0,
      };
      topicState = [created, ...topicState];
      return created;
    },
    updateAcademicTopic: async (_courseId, topicId, payload) => {
      topicState = topicState.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              name: payload.name,
              query_text: payload.query_text,
              description: payload.description ?? topic.description,
              auto_refresh: payload.auto_refresh ?? topic.auto_refresh,
              updated_at: new Date().toISOString(),
            }
          : topic,
      );
      return topicState.find((topic) => topic.id === topicId) ?? topicState[0];
    },
    deleteAcademicTopic: async (_courseId, topicId) => {
      topicState = topicState.filter((topic) => topic.id !== topicId);
      return { deleted: true };
    },
    refreshAcademicTopic: async (_courseId, topicId) => {
      topicState = topicState.map((topic) =>
        topic.id === topicId
          ? {
              ...topic,
              last_run_status: "succeeded",
              last_run_at: new Date().toISOString(),
              last_success_at: new Date().toISOString(),
              last_run_new_count: 0,
            }
          : topic,
      );
      return searchResponse("comammox Nitrospira niche differentiation");
    },
    markAcademicTopicRead: async (_courseId, topicId) => {
      topicState = topicState.map((topic) =>
        topic.id === topicId ? { ...topic, unread_count: 0 } : topic,
      );
      return topicState.find((topic) => topic.id === topicId) ?? topicState[0];
    },
    updateAcademicWorkState: async (_courseId, workId, state: AcademicLiteratureState) => {
      const index = workState.findIndex((item) => item.id === workId);
      if (index >= 0) {
        workState[index] = { ...workState[index], state, is_unread: false };
        return workState[index];
      }
      return workState[0];
    },
    enqueueAcademicFulltext: async (_courseId, workId): Promise<AcademicFulltextJob> => ({
      id: `fulltext-${workId}`,
      org_id: "demo-org",
      course_id: "demo-course",
      work_id: workId,
      literature_item_id: `item-${workId}`,
      requested_by: "demo-user",
      source_kind: "openalex_oa",
      source_url: "https://example.org/fulltext.pdf",
      status: "downloading",
      attempt_count: 1,
      file_name: "fulltext.pdf",
      mime: "application/pdf",
      size_bytes: 2_400_000,
      checksum_sha256: null,
      rag_document_id: null,
      rag_ingest_job_id: null,
      error_class: null,
      error_summary: null,
      metadata_json: {},
      started_at: new Date().toISOString(),
      finished_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    cancelAcademicFulltext: async (_courseId, workId, jobId): Promise<AcademicFulltextJob> => ({
      id: jobId,
      org_id: "demo-org",
      course_id: "demo-course",
      work_id: workId,
      literature_item_id: `item-${workId}`,
      requested_by: "demo-user",
      source_kind: "openalex_oa",
      source_url: "https://example.org/fulltext.pdf",
      status: "cancelled",
      attempt_count: 1,
      file_name: null,
      mime: null,
      size_bytes: null,
      checksum_sha256: null,
      rag_document_id: null,
      rag_ingest_job_id: null,
      error_class: null,
      error_summary: null,
      metadata_json: {},
      started_at: null,
      finished_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  };
}
