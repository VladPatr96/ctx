# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-12-15

### Added

#### Core Features
- Multi-provider context management plugin for Claude Code, Gemini CLI, OpenCode, and Codex
- Session logging with project indexing and lesson loading from past sessions
- Cross-project knowledge base using SQLite FTS5 with GitHub Issues integration
- Deep file indexing for comprehensive project understanding
- Adaptive routing with provider performance tracking
- Multi-round anonymous consilium with Claim-Based Deliberation Protocol (CBDP)

#### Commands & Skills
- `/ctx` command for session management (start, index, load lessons, create session log)
- `/ctx save` command for session persistence with GitHub Issues integration
- `/ctx-search` command for searching solutions across all projects via knowledge base
- `/ctx-consilium` command for multi-round anonymous deliberation with structured responses
- `/ctx-delegate` command for smart task routing with adaptive scoring
- Auto-save hooks (PreCompress and Stop) for automatic session context preservation
- MCP Hub with 29 tools accessible by any MCP-compatible client

#### Provider Management
- Provider Registry with circuit breaker pattern for reliability
- Unified pipeline state machine (DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE)
- Cross-provider launch capabilities with flexible provider selection
- Provider performance analytics and evaluation tracking
- Smart router with default provider assignments by task type
- Evaluation-driven adaptive routing with configurable CTX_ADAPTIVE_ROUTING flag

#### Dashboard & UI
- Real-time web dashboard for CTX pipeline visualization
- Task modal and consilium results display
- Session progress tracking and monitoring
- HQ mode with sidebar tabs, authentication, and hardening
- Desktop app UI/UX overhaul with improved performance
- Visual claim graph explorer with interactive verdict system
- Provider performance analytics dashboard
- Cost tracking and optimization engine with budget alerts

#### Onboarding & Setup
- Guided onboarding wizard with interactive prompts
- Provider availability checks (CLI, config directories, API keys)
- Provider selection and configuration flow
- State persistence with resume capability
- Interactive tutorial with demos for search, consilium, and session management
- Skip/retry options with clear installation instructions

#### Knowledge Base & Search
- SQLite FTS5 full-text search across all sessions
- Git sync for cross-project knowledge sharing
- Web-first architecture with SQLite failover
- Telemetry and analytics integration

#### Cost Tracking & Optimization
- Token usage extraction for all provider adapters
- Cost calculator with pricing data for all providers
- Cost storage and persistence
- Budget alert system with threshold checking
- Optimization engine with provider comparison logic
- Quality scoring based on success rates and latency
- Real-time cost updates via SSE streams
- Cost dashboard with visualization
- Monthly cost report generation

#### Distribution & Integration
- Marketplace.json for plugin distribution
- Slash command registration via .claude/commands
- MCP server configuration in settings.json
- Cross-platform support (Windows, macOS, Linux)

### Changed
- Transformed from single-provider Claude Code config to multi-provider CTX plugin
- Updated documentation to reflect multi-provider architecture
- Corrected CLI invocation syntax for Gemini, OpenCode, and Codex
- Split MCP Hub into domain modules for better organization
- Improved Gemini model to gemini-3.1-pro-preview
- Increased E2E test timeouts for readline interface stability
- Enhanced ConsiliumCompareView with better confidence visualization
- Implemented React.lazy for page components to improve startup time

### Fixed
- Corrected source path in marketplace.json
- Fixed project root path resolution
- Fixed idle stage in schema
- Fixed Electron token passing and preload path
- Fixed Windows ESM imports for better compatibility
- Added loading states to improve perceived performance
- Fixed various UI/UX issues in desktop app

### Documentation
- Comprehensive README with architecture details
- Pipeline state machine documentation
- Provider routing strategy documentation
- Consilium protocol (CBDP) documentation
- Web-first unified plan documentation
- Command and skill usage documentation

[Unreleased]: https://github.com/ctx-plugin/ctx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ctx-plugin/ctx/releases/tag/v0.1.0
