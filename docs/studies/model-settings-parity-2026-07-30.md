---
title: "Bedah paritas halaman Model — Hermes Desktop vs Open Agent"
type: study
status: done
date: 2026-07-30
tags: [openagent, hermes, parity, settings, study]
---

# Bedah paritas halaman Model — Hermes Desktop vs Open Agent

Catatan diskusi (2026-07-30). Sumber fakta: source mentah resmi
`NousResearch/hermes-agent@main` — `apps/desktop/src/app/settings/model-settings.tsx`,
`fallback-models-field.tsx`, `lib/model-options.ts`, `app/settings/constants.ts`.
Bukan dari halaman docs. Setelah diputuskan, catatan ini dihapus/arsip.

---

## Peta lengkap isi halaman Model resmi

1. **Main model** — dropdown provider + dropdown model + tombol **Apply** eksplisit.
   Pilihan = pasangan (provider, model); Apply menolak jalan kalau salah satu kosong.
   Provider belum siap (belum ada key) → form setup inline di situ juga.
2. **Defaults** (di bawah main model, muncul hanya kalau model mendukung):
   reasoning effort (dropdown) + **fast tier** (switch → `agent.service_tier`).
3. **Auxiliary Models** — 8 slot tugas: `vision`, `web_extract`, `compression`,
   `skills_hub`, `approval`, `mcp`, `title_generation`, `curator`.
   Tiap slot: status "auto (use main)" atau `provider · model` tersemat;
   aksi "Change" (pilih inline) / "Set to main" / "Reset all to main".
   Ada peringatan **stale-aux**: slot yang masih tersemat ke provider berbeda
   dari main ditampilkan sebagai warning (jebakan tagihan provider mati).
4. **Mixture of Agents (MoA)** — preset ensambel: N model referensi + 1 model
   agregator; preset muncul seolah provider model sendiri.
5. Di section config resmi (di luar komponen ini tapi satu section "model"):
   `fallback_providers` (sudah kita punya per-baris sejak v0.1.14) dan
   `model_context_length`.

## Yang kita SUDAH punya (setara/lebih)

- Pemilihan model (via Providers → Set active + dropdown Model) — jalan, tapi beda rumah.
- Reasoning effort (8 nilai), temperature, max output tokens, streaming.
- Fallback chain persis semantik resmi (ganti provider = reset model baris).

---

## Item per item — jujur atau placebo?

### 1. Main-model pick di tab Model — ✅ JUJUR, dampak paling terasa

**Skenario hari ini**: mau pakai model OpenRouter → buka tab Providers →
klik OpenRouter → klik Set active → pindah tab Model → pilih model.
**Sesudah**: di tab Model langsung pilih provider + model + Apply. Satu halaman,
sesuai goal-mu ("model untuk pick model default dan fallback").
Mesinnya pakai yang sudah teruji v0.1.14 (aktivasi + heal, pasangan selalu valid).
"Set active" di tab Providers TETAP ada — dua pintu, satu mesin yang sama.
Divergensi sadar dari resmi: form setup provider (key/url/test) tetap di tab
Providers — struktur yang sudah kamu setujui sebelumnya.

### 2. Fast tier (service_tier) — ✅ JUJUR, dengan pagar

Di resmi: switch mengirim `service_tier: fast` ke backend Hermes (routing
prioritas di infrastruktur mereka). Di plugin kita padanannya: field request
`service_tier: "priority"` yang dipahami OpenAI/OpenRouter.
**Pagar**: default OFF dan TIDAK mengirim apa-apa (nol risiko). Saat ON, barulah
dikirim; provider lokal umumnya mengabaikan field asing. Kalau ada provider
ketat yang 400 menyebut parameter ini, tambah satu retry tanpa field itu.
Tanpa pagar ini, aku tidak akan menawarkannya.

### 3. Auxiliary Models: slot Vision — ✅ JUJUR (1 dari 8 resmi)

**Skenario hari ini**: model utamamu text-only (banyak model LM Studio begitu),
kamu tempel screenshot error → gambar "turun kelas" jadi blok teks polos;
agent tak benar-benar melihat gambarnya.
**Sesudah**: kamu pin satu model vision (mis. model vision kecil lokal murah).
Gambar dideskripsikan dulu oleh model itu, deskripsinya masuk prompt, model
utama menjawab pakai deskripsi itu. Aux gagal/di-timeout → kembali ke perilaku
hari ini + Notice jelas. Kalau provider-nya dihapus → slot kembali "auto (use
main)" (sanitasi saat load; ala stale-guard resmi, versi satu slot).
UI tab Model: satu baris "Vision" dengan status `auto (use main)` / `provider ·
model`, aksi Change (dropdown provider+model inline persis resmi) dan Set to main.

### 4. Mixture of Agents — ❌ arc tersendiri

Apa: tiap prompt dipanggil ke N model, lalu model agregator menggabungkan
jawabannya. Kenapa tidak kumasukkan: mengubah agent loop jadi multi-call +
manajemen preset + biaya per pesan berlipat. Bisa dikerjakan, tapi ini
fitur tersendiri, bukan "settingan model". Rekomendasi: bahas terpisah kalau
kamu memang ingin memakainya.

### 5. Model context length — ❌ placebo hari ini

Berguna untuk membatasi window input (mis. memaksa 32k di LM Studio).
Tapi di plugin kita BELUM ada mesin yang memakainya (belum ada context
manager/kompresi/truncation percakapan; yang ada hanya pemotongan hasil tool
20k). Dipasang = angka yang tak berbuat apa-apa. Masuk akal dipasang BARENG
arc context manager nanti — sekaligus slot aux `compression` resmi.

### 6. Tujuh aux tasks resmi lainnya — ❌ belum ada pasangannya di agent kita

| Slot resmi | Fungsi di Hermes | Kenapa belum jujur di kita |
|---|---|---|
| `compression` | model yang merangkum konteks panjang | belum ada context manager (lihat item 5) |
| `title_generation` | model pembuat judul sesi | judul sesi kita dari pesan pertama, tanpa model |
| `approval` | model penilai auto-approve | persetujuan kita = gerbang UI murni, tanpa model |
| `mcp` | model untuk call MCP | MCP kita masih config-only ("runtime menyusul") |
| `skills_hub` | model kurasi hub | hub kita masih baca-katalog, tanpa model |
| `web_extract` | model ekstraksi hasil web | web tool jalan di loop utama (model utama) |
| `curator` | model kurasi memori | memori disimpan via tool di loop utama |

Kalau salah satu mesin itu nanti ada (mis. context manager), slot aux-nya
langsung masuk akal dipasang — polanya sudah ada dari item 3.

### 7. Capability gating (default reasoning/fast hanya tampil jika model mampu)

Resmi meng-gate dari metadata katalog backend-nya (`capabilities[model]`).
`/v1/models` OpenAI-compatible standar TIDAK membawa metadata itu; LM
Studio/Ollama tidak, OpenRouter sebagian. Kita hanya punya heuristik nama
untuk VISION (sudah dipakai). Meng-gate dari tebakan nama = halusinasi UI —
tidak kukerjakan. Sikap jujur: kontrol tetap tampil, nilai terkirim hanya saat
dipilih (perilaku hari ini), provider yang tak paham mengabaikan.

---

## Rekomendasi tetap: item 1 + 2 + 3 (v0.1.16)

Paling terasa, semua jujur, tanpa placebo. Item 4–7 punya jalur masing-masing
kalau waktunya tiba; tercatat di backlog setelah keputusan.

**Cara memutuskan**: balas pesan dengan pilihanmu, mis.:
- `1+2+3` — rekomendasi penuh
- `1 saja` — hanya pemilih model utama
- `1+3` — tanpa fast tier
- atau tulis kombinasi/pertanyaan lain bebas.
