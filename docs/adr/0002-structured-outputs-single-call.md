# ADR 0002 — One structured Gemini call per mistake

- Status: Accepted · Date: 2026-10-26

## Context
Diagnosis needs OCR, error classification, hints and three variants. Multiple calls add
latency and cost; free-form text output breaks parsing.

## Decision
Use a single `generateContent` call with `responseMimeType: application/json` and a strict
`responseSchema`. A sanitizer enforces invariants the schema cannot (one variant per level,
grade clamp, SVG prefix). Model is configurable (`GEMINI_MODEL`); default `gemini-flash-latest`.

## Consequences
- ~10–15 s end-to-end on Flash; acceptable for capture flow.
- Variant numeric correctness is not guaranteed → S12 adds deterministic verification.
