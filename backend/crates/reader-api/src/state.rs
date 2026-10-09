use reader_db::PgPool;

use crate::llm::LlmClient;
use crate::settings::Settings;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub settings: Settings,
    pub llm: LlmClient,
}
