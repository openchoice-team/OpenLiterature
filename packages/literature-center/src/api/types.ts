export type LiteratureFile = {
  id: string;
  item_id: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  preview_url: string;
  created_at: string;
};

export type LiteratureProgress = {
  progress_pct: number;
  page_no: number;
  total_pages?: number | null;
  meta_json?: Record<string, unknown>;
  updated_at: string;
};

export type LiteratureViewerState = {
  item_id: string;
  user_id: string;
  state_json: Record<string, unknown>;
  annotation_count: number;
  last_page_no?: number | null;
  total_pages?: number | null;
  revision: number;
  updated_at?: string | null;
};

export type LiteratureItem = {
  id: string;
  course_id: string;
  owner_user_id: string;
  title: string;
  authors: string[];
  year?: number | null;
  doi?: string | null;
  source_url?: string | null;
  abstract_text?: string | null;
  publication_title?: string | null;
  status: string;
  ingestion_status: string;
  personal_rag_enabled: boolean;
  rag_document_id?: string | null;
  rag_ingest_job_id?: string | null;
  academic_work_id?: string | null;
  visibility: "private" | "course" | string;
  file?: LiteratureFile | null;
  progress?: LiteratureProgress | null;
  annotation_count: number;
  created_at: string;
  updated_at: string;
};

export type LiteratureAnnotation = {
  id: string;
  item_id: string;
  user_id: string;
  page_no: number;
  kind: "highlight" | "note" | "question" | string;
  selected_text?: string | null;
  note_text?: string | null;
  color: string;
  rects_json?: unknown;
  anchor_json?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LiteratureTarget = {
  id: string;
  course_id: string;
  node_id?: string | null;
  title: string;
  description?: string | null;
  required_item_ids: string[];
  min_progress_pct: number;
  min_annotation_count: number;
  require_note: boolean;
  published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type LiteratureTaskSubmission = {
  id: string;
  task_id: string;
  student_id: string;
  summary_text?: string | null;
  status: "not_started" | "in_progress" | "submitted" | "completed" | string;
  submitted_at?: string | null;
  updated_at: string;
};

export type LiteratureTaskItemTarget = {
  item_id: string;
  title?: string | null;
  goal?: string | null;
  min_progress_pct?: number | null;
  min_annotation_count?: number | null;
};

export type LiteratureTask = {
  id: string;
  course_id: string;
  title: string;
  description?: string | null;
  status: "draft" | "published" | "archived" | string;
  due_at?: string | null;
  min_progress_pct: number;
  min_annotation_count: number;
  require_summary: boolean;
  required_item_ids: string[];
  item_targets?: LiteratureTaskItemTarget[];
  created_by: string;
  created_at: string;
  updated_at: string;
  my_submission?: LiteratureTaskSubmission | null;
};

export type LiteratureTaskProgress = {
  task_id: string;
  student_id: string;
  student_email: string;
  student_name?: string | null;
  avg_progress_pct: number;
  annotation_count: number;
  required_count: number;
  completed_item_count: number;
  summary_text?: string | null;
  submission_status: string;
  submitted_at?: string | null;
  last_activity_at?: string | null;
  completed: boolean;
};

export type LiteratureAssistResponse = {
  mode: string;
  answer: string;
};

export type LiteratureKnowledgeScope =
  | "current_item"
  | "my_library"
  | "course_library"
  | "task_literature";

export type LiteratureKnowledgeSource = {
  evidence_id: string;
  source_type: string;
  citation_label: string;
  item_id?: string | null;
  document_id: string;
  chunk_id: string;
  title: string;
  chunk_index: number;
  page_no?: number | null;
  snippet: string;
  score: number;
  preview_path?: string | null;
};

export type LiteratureKnowledgeAskResponse = {
  scope: LiteratureKnowledgeScope | string;
  answer: string;
  sources: LiteratureKnowledgeSource[];
};

export type LiteratureComparisonResponse = {
  scope: string;
  question: string;
  answer: string;
  sources: LiteratureKnowledgeSource[];
  documents: Array<{
    item_id: string;
    title: string;
    evidence_count: number;
    pages: number[];
  }>;
  knowledge_candidate: {
    knowledge_type: string;
    title: string;
    summary: string;
    content: string;
    structured_content: Record<string, unknown>;
    applicability_json: Record<string, unknown>;
    source_evidence_ids: string[];
  };
};

export type AcademicAuthorship = {
  ordinal: number;
  author_name: string;
  author_external_id?: string | null;
  institution_name?: string | null;
  institution_external_id?: string | null;
  country_code?: string | null;
  is_corresponding?: boolean | null;
};

export type AcademicWorkInstitution = {
  institution_id: string;
  institution_name: string;
  country_code?: string | null;
  ror_id?: string | null;
  openalex_id?: string | null;
  author_count: number;
  corresponding_author_count: number;
  fractional_weight: number;
};

export type AcademicLiteratureState =
  | "discovered"
  | "shortlisted"
  | "saved"
  | "ignored"
  | "archived";

export type AcademicWorkRelation = {
  id: string;
  work_id: string;
  related_work_id?: string | null;
  source_work_doi?: string | null;
  related_work_doi?: string | null;
  provider: string;
  relation_type: string;
  relation_kind:
    | "retraction"
    | "correction"
    | "expression_of_concern"
    | "withdrawal"
    | "version"
    | "update"
    | "other"
    | string;
  direction: "updated_by" | "updates" | "version_of" | "has_version" | "related" | string;
  related_doi?: string | null;
  related_external_id?: string | null;
  label?: string | null;
  source_label?: string | null;
  effective_at?: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export type AcademicLiteratureWork = {
  id: string;
  canonical_title: string;
  abstract_text?: string | null;
  publication_year?: number | null;
  publication_date?: string | null;
  publication_title?: string | null;
  work_type?: string | null;
  language?: string | null;
  doi?: string | null;
  primary_url?: string | null;
  cited_by_count?: number | null;
  is_open_access?: boolean | null;
  open_access_url?: string | null;
  oa_status?: string | null;
  license?: string | null;
  lifecycle_status: string;
  lifecycle_source?: string | null;
  lifecycle_checked_at?: string | null;
  state: AcademicLiteratureState | string;
  relevance_score?: number | null;
  relevance_reason: string;
  discovered_via: string;
  literature_item_id?: string | null;
  last_discovered_at: string;
  updated_at: string;
  authors: AcademicAuthorship[];
  institutions: AcademicWorkInstitution[];
  relations: AcademicWorkRelation[];
  fulltext?: AcademicFulltextJob | null;
  is_unread: boolean;
};

export type AcademicLiteratureTopic = {
  id: string;
  org_id: string;
  course_id: string;
  name: string;
  query_text: string;
  description: string;
  auto_refresh: boolean;
  refresh_interval_minutes: number;
  last_run_at?: string | null;
  last_success_at?: string | null;
  next_run_at?: string | null;
  last_run_status?: "running" | "succeeded" | "partial" | "failed" | string | null;
  last_run_new_count: number;
  last_error_summary?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  work_count: number;
  unread_count: number;
};

export type AcademicFulltextJob = {
  id: string;
  org_id: string;
  course_id: string;
  work_id: string;
  literature_item_id: string;
  requested_by?: string | null;
  source_kind: "openalex_oa" | "publisher" | "manual_upload" | string;
  source_url: string;
  status: "queued" | "resolving" | "downloading" | "downloaded" | "ingesting" | "ready" | "failed" | "cancelled" | string;
  attempt_count: number;
  file_name?: string | null;
  mime?: string | null;
  size_bytes?: number | null;
  checksum_sha256?: string | null;
  rag_document_id?: string | null;
  rag_ingest_job_id?: string | null;
  error_class?: string | null;
  error_summary?: string | null;
  metadata_json: Record<string, unknown>;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AcademicDiscoveryRun = {
  id: string;
  status: string;
  query_text: string;
  provider_keys: string[];
  discovered_count: number;
  persisted_count: number;
  duplicate_count: number;
  error_class?: string | null;
  error_summary?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type AcademicDiscoverySearchResponse = {
  run: AcademicDiscoveryRun;
  works: AcademicLiteratureWork[];
  trace_summary: Array<{
    provider?: string | null;
    status: string;
    detail: string;
  }>;
};

export type AcademicLiteratureCoverage = {
  work_count: number;
  doi_count: number;
  abstract_count: number;
  institution_count: number;
  country_count: number;
  open_access_count: number;
  saved_count: number;
  risk_count: number;
  latest_sync_at?: string | null;
};

export type AcademicOriginMetric = {
  full_count: number;
  fractional_count: number;
  corresponding_count: number;
};

export type AcademicInstitutionOrigin = AcademicOriginMetric & {
  institution_id: string;
  institution_name: string;
  country_code?: string | null;
  ror_id?: string | null;
  openalex_id?: string | null;
};

export type AcademicCountryOrigin = AcademicOriginMetric & {
  country_code: string;
};

export type AcademicResearchOrigins = {
  work_count: number;
  institution_work_count: number;
  institutions: AcademicInstitutionOrigin[];
  countries: AcademicCountryOrigin[];
};

export type AcademicIntelligenceSummary = {
  work_count: number;
  institution_count: number;
  country_count: number;
  open_access_count: number;
  saved_count: number;
  risk_count: number;
  total_citations: number;
  year_min?: number | null;
  year_max?: number | null;
};

export type AcademicIntelligenceCountry = {
  country_code: string;
  work_count: number;
  fractional_count: number;
  corresponding_count: number;
  open_access_count: number;
  saved_count: number;
  cited_by_count: number;
  year_min?: number | null;
  year_max?: number | null;
};

export type AcademicIntelligenceInstitution = {
  institution_id: string;
  institution_name: string;
  country_code?: string | null;
  ror_id?: string | null;
  openalex_id?: string | null;
  city?: string | null;
  region?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location_source?: string | null;
  location_precision?: string | null;
  location_confidence?: number | null;
  work_count: number;
  fractional_count: number;
  corresponding_count: number;
  open_access_count: number;
  saved_count: number;
  cited_by_count: number;
};

export type AcademicIntelligenceTimelinePoint = {
  publication_year: number;
  work_count: number;
  open_access_count: number;
  saved_count: number;
  cited_by_count: number;
};

export type AcademicIntelligenceCollaboration = {
  source_country_code: string;
  target_country_code: string;
  work_count: number;
};

export type AcademicIntelligenceWork = {
  id: string;
  canonical_title: string;
  publication_year?: number | null;
  publication_title?: string | null;
  doi?: string | null;
  primary_url?: string | null;
  cited_by_count?: number | null;
  is_open_access?: boolean | null;
  lifecycle_status: string;
  state: AcademicLiteratureState | string;
  relevance_score?: number | null;
  literature_item_id?: string | null;
  institution_count: number;
  country_codes: string[];
  institution_ids: string[];
};

export type AcademicIntelligenceMapData = {
  summary: AcademicIntelligenceSummary;
  countries: AcademicIntelligenceCountry[];
  institutions: AcademicIntelligenceInstitution[];
  timeline: AcademicIntelligenceTimelinePoint[];
  collaborations: AcademicIntelligenceCollaboration[];
  works: AcademicIntelligenceWork[];
};

export type AcademicIntelligenceMapFilters = {
  state?: AcademicLiteratureState | string;
  q?: string;
  topic_id?: string;
  year_from?: number;
  year_to?: number;
  open_access_only?: boolean;
  work_limit?: number;
};
