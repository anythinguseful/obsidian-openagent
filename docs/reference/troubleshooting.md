---
title: "Troubleshooting"
type: reference
status: active
date: 2026-09-11
tags: [openagent, troubleshooting, user]
---

# Troubleshooting

Gejala yang sering muncul. Tanpa wajib membuka source.

## Chat tidak membalas / bubble kosong

1. Reload plugin setelah update (`main.js` baru).
2. Settings → Open Agent → **Debug mode**: lihat konsol Obsidian.
3. Model lokal (LM Studio / Ollama): naikkan context window di server
   (contoh LM Studio `n_ctx`). Error “prompt too long” / 400 artinya
   permintaan lebih besar dari jendela model — bukan bug chat kosong saja.
4. Beberapa model menaruh jawaban di *reasoning* bukan di teks biasa; plugin
   seharusnya tetap menampilkan isi. Jika masih kosong setelah reload,
   coba model instruct non-reasoning.

## Web search tidak jalan / “model tidak bisa internet”

Pencarian **bukan** fitur provider chat. Settings → **Capabilities → Web search**.

- Default **DuckDuckGo** — tanpa API key.
- Brave / Tavily butuh key; SearXNG butuh URL. Key kosong → jatuh ke DuckDuckGo.
- **Web extract** = buka satu URL yang sudah ada, bukan kotak search.
- Matikan toolset Web di Capabilities → agen tidak search.

## Lambat di model lokal

Prompt plugin berisi system + daftar tool + riwayat, jauh lebih besar dari
chat polos. Kurangi toolset yang aktif, matikan title generation jika tidak
perlu, pin tugas kecil (judul/kompresi) ke model cepat.

## Terminal tidak muncul

Hanya **desktop**, default off, butuh consent pertama. Tidak ada di mobile,
Quick Ask, cron, atau subagen.

## Setelah update plugin, MCP / skrip cron hilang

Folder di dalam direktori plugin ikut terhapus saat update. Pasang ulang
server katalog / taruh lagi skrip. Lihat README bagian Data layout.

## Mermaid rusak di note vault

Chat sudah disanitasi; note yang sudah tertulis tidak diubah diam-diam.
Perbaiki fence di note: kutip label yang berisi tanda kurung.

## Masih macet

Settings → Community plugins: cek **versi** Open Agent. Laporan bug: template
GitHub (plugin lain dimatikan, log, screenshot).
