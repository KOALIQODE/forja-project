//! Application layer — use cases that orchestrate domain and infrastructure.
//!
//! Hexagonal Architecture: this layer sits between the inbound adapters (commands/)
//! and the domain/infrastructure layers. Use cases encode the "what the system does"
//! without caring about the "how" (which adapter delivers the request).
//!
//! ## Use Cases
//! - [`document_service`]: Document lifecycle orchestration (open, edit, close, highlight)
//! - [`parser_service`]: Parser installation, query repair, and language detection
//! - [`plugin_service`]: Plugin loading, scanning, installation from registry
//!
//! ## Design Pattern: Application Service
//! Each module is an Application Service — a stateless function group that:
//! 1. Validates input (basic sanity checks)
//! 2. Loads/coordinates domain objects
//! 3. Calls infrastructure adapters
//! 4. Returns results to the caller (command layer)

pub mod document_service;
pub mod parser_service;
pub mod plugin_service;
