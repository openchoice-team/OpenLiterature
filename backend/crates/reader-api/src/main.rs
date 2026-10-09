mod auth;
mod error;
mod ingest;
mod llm;
mod models;
mod repos;
mod routes;
mod settings;
mod state;

use anyhow::Context;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn".into()),
        )
        .init();

    let settings = settings::Settings::from_env()?;
    let pool = reader_db::connect(&settings.database_url)
        .await
        .context("连接数据库失败")?;
    reader_db::migrate(&pool).await.context("执行数据库迁移失败")?;
    tokio::fs::create_dir_all(&settings.data_dir)
        .await
        .context("创建数据目录失败")?;

    let llm = llm::LlmClient::new(&settings);
    if !llm.chat_enabled() {
        tracing::warn!("LLM_API_KEY 未配置：AI 助读与问答将返回 503，其余功能可用");
    }

    let state = state::AppState {
        pool,
        settings: settings.clone(),
        llm,
    };

    let app = routes::router()
        .with_state(state)
        .layer(CorsLayer::very_permissive())
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(&settings.bind_addr)
        .await
        .with_context(|| format!("监听 {} 失败", settings.bind_addr))?;
    tracing::info!(addr = %settings.bind_addr, "OpenDHU reader API listening");
    axum::serve(listener, app).await.context("HTTP 服务异常退出")?;
    Ok(())
}
