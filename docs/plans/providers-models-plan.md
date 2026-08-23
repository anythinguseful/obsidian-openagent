---
title: "Rencana: Settings Providers & Model ala Hermes"
type: plan
status: done
date: 2026-07-19
tags: [openagent, providers, models, plan]
---

# Rencana: Settings Providers & Model ala Hermes

Hasil studi: Hermes Desktop (`apps/desktop/src/app/settings/providers-settings.tsx`, `model-settings.tsx`, `fallback-models-field.tsx`, `model-visibility-overlay.tsx`) + docs (provider-routing, fallback-providers, credential-pools), disusun untuk plugin **Open Agent**.

---

## 0. Temuan kunci

### Providers (Hermes)
- Dua sub-view **Accounts** (OAuth, N/A untuk plugin) & **Keys**: satu baris provider = **primary key + advanced overrides** (base URL dsb.), dengan set/reveal/clear.
- **Connected-first**: provider terhubung tampil di grup atas; sisanya di balik disclosure "Other providers". Baris *Local / custom endpoint* untuk endpoint OpenAI-compatible apa pun.
- **Credential pools**: multi-key per provider + rotasi → **ditolak** untuk plugin (single-user).

### Model (Hermes)
- **Fallback chain** `fallback_providers: [{provider, model}]` — failover otomatis saat **429/5xx** (setelah retry habis) dan **401/403/404** (langsung); **turn-scoped**: turn berikutnya kembali ke primary; riwayat percakapan utuh; UI editor baris provider+model (`fallback-models-field.tsx`) yang hanya menyimpan pasangan lengkap.
- **Provider routing** OpenRouter/Nous (`sort/only/ignore/order/require_parameters/data_collection` → objek `provider` di body) → **diparkir** (Tahap nanti).
- **Auxiliary models** (vision, web_extract, compression, **title_generation**, curator…) → framework masa depan; satu-satunya kandidat nyata saat ini: title generation sesi.
- Model picker per provider dengan inline key-entry + metadata (konteks/harga) + visibility filter (hide dari picker).

## 1. Audit kita

**Providers**: 7 preset ✅ (termasuk `custom` OpenAI-compatible ✅) · key tersimpan lokal ✅ · custom headers JSON ✅ · test connection → katalog model ✅. **Tidak ada**: pengelompokan connected-first, baris key rapi (reveal/clear), fallback, retry/backoff. Error dilempar sebagai teks `HTTP 429: …` (perlu typed error untuk trigger).

**Model**: dropdown + free-text ✅ · favorites ✅ · effort ladder ✅ (injeksi `reasoning:{effort}` + `reasoning_effort`) · temperature/maxTokens/streaming ✅. **Tidak ada**: fallback chain, aux models, hide-models, metadata.

## 2. Keputusan (disetujui)

1. ✅ **Fallback chain** — daftar cadangan `{providerId, model}` + retry+backoff + failover turn-scoped + Notice.
2. ❌ **Credential pool** — satu key per provider cukup.
3. ⏸️ **OpenRouter routing** — diparkir, didokumentasikan (body sudah punya titik injeksi di `buildBody`).

Bawaan tanpa perlu keputusan: perapian tab Providers (connected-first, baris key set/reveal/clear, advanced tersembunyi) — aman & sesuai arah visual yang sudah disepakati.

## 3. Desain

### 3.1 ProviderHttpError + retry (`src/agent/providers.ts`)

```ts
export class ProviderHttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
```

- Semua `throw new Error(\`HTTP ${status}…\`)` → `throw new ProviderHttpError(status, …)`.
- **Retry policy** di titik panggil (agentLoop/runner): untuk status `{429, 500, 502, 503}` → retry maks. **2 kali** dengan backoff eksponensial (1s, 3s); `{401, 403, 404}` → tanpa retry (langsung gagal/fallback); error jaringan → 1 retry.
- Mirror semantik Hermes: rate-limit & server-error = retry dulu, auth/not-found = langsung.

### 3.2 Fallback chain

```ts
// settings
fallbackProviders: { providerId: string; model: string }[];  // default []
```

- **UI (tab Model)**: "Fallback models" — daftar baris editor (pola `fallback-models-field.tsx`): dropdown provider (yang **punya API key/terkonfigurasi**) + dropdown model (katalog yang sudah di-fetch; free-text fallback bila model di luar katalog — pola `withActive`). Baris setengah-isi tidak pernah tersimpan (hanya pasangan lengkap yang di-commit). Tombol + add row / × hapus. Empty-state mute.
- **Runtime** (agentLoop): saat primary gagal setelah retry habis → ambil fallback **pertama** dari chain → ganti provider+model **untuk sisa turn ini saja** → lanjutkan dengan riwayat utuh → `new Notice("Open Agent: <model> gagal (HTTP 429) — dialihkan ke <fallback> untuk turn ini")`. **Maks. 1 failover per turn** (anti loop, persis Hermes). Turn berikutnya otomatis primary lagi.
- Tercatat di trace: part tool/system menandai pergantian model (badge kecil "switched to X" di turn).
- Interaksi cron (dari rencana automations): run headless memakai chain yang sama — tidak ada konfigurasi terpisah.

### 3.3 Perapian tab Providers

- **Pengelompokan**: "Connected" (punya key / enabled) di atas · "Other providers" di balik disclosure (diset default tertutup bila ada ≥1 connected).
- **Baris provider** tetap pola flat yang sudah disepakati (bukan kartu), aksi klik = jadikan aktif.
- **Baris key** rapi: password input + tombol **reveal/hide** (eye icon), **clear** (trash kecil) — mengganti input polos; deskripsi tetap menyebut penyimpanan lokal.
- **Advanced** (base URL + custom headers) di balik disclosure kecil per provider — mengurangi panjang halaman.
- *Local / custom endpoint* sudah terwakili preset `custom` ✅ — pastikan barisnya berlabel jelas ("Custom endpoint (OpenAI-compatible)").

### 3.4 Dokumentasi item diparkir/ditolak

- **Provider routing** (Tahap nanti): panel kecil di tab Model, hanya aktif saat provider ∈ {openrouter, nous-portal}; mengisi `body.provider` di `buildBody` (titik injeksi sudah ada).
- **Auxiliary models** (Tahap nanti): mulai dari `title_generation` (judul sesi otomatis oleh model kecil murah) — baru bermakna setelah ada ≥1 tugas sampingan.
- **Model visibility/hide** & metadata harga-konteks (models.dev) — Tahap opsional, menyusul bila picker terasa penuh.
- **MoA** — di luar roadmap plugin.

## 4. Tahapan implementasi

| Tahap | Isi | Verifikasi |
|---|---|---|
| **A** | `ProviderHttpError` + retry/backoff policy + `fallbackProviders` di settings (+migrasi ringan) + runtime failover turn-scoped dengan Notice + trace marker | unit test retry policy & failover (mock 429→fallback sukses; 401→langsung fallback; maks 1 fail/turn), smoke guards |
| **B** | UI tab Model: editor fallback rows (provider tersaring "terkonfigurasi", dropdown model + free-text, commit pasangan lengkap saja) | preview frame, tools/smoke |
| **C** | Perapian tab Providers: connected-first + disclosure, key reveal/clear, advanced tersembunyi, label custom endpoint | preview frame, pipeline penuh |
| **D** (nanti) | OpenRouter routing panel, aux model `title_generation`, model visibility, metadata harga/konteks | — |

### Catatan batasan
- Failover = **turn-scoped** saja (kinerja & harga-pastinya Hermes): cache prompt antar-provider tidak berbagi, jadi Notice menyebut pergantian secara eksplisit.
- Fallback dengan provider belum terkonfigurasi tidak ditawarkan di UI; kalau key dicabut belakangan, entri cadangan dilewati dengan Notice.
- API key tetap plaintext di `data.json` (lokal) — sama dengan hari ini, tidak diubah oleh rencana ini.
