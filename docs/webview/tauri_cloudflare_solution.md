# Archived: Nexus WebView / Cloudflare Path

This document is intentionally archived as of milestone v0.3.

ModForge Studio no longer implements or recommends a WebView challenge handling path for Nexus Mods. Launcher Nexus integration must use the official Nexus API direction, the existing typed launcher ports, and the Public GraphQL metadata path where an unauthenticated read path is required.

Do not reintroduce:

- Public HTML scraping as a launcher data source
- challenge verification commands or diagnostics routes
- browser fingerprint or stealth script injection
- clearance-cookie synchronization into launcher HTTP requests
- browser automation sidecars for Nexus data access

Historical research files under `docs/webview/` may mention the removed approach, but they are not active implementation guidance. Current Nexus implementation guidance lives in `docs/research_nexusmods_api.md` and the v0.3 planning notes.
