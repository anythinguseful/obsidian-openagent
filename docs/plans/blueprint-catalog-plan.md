---
title: "Rencana: blueprint catalog (paritas Hermes cron)"
type: plan
status: done
date: 2026-08-20
tags: [openagent, cron, blueprint, plan]
---

# Rencana: blueprint catalog (paritas Hermes cron)

## Summary

Bikin automasi di Open Agent masih mulai dari **halaman kosong**: nama, jadwal,
lalu prompt ditulis dari nol. Hermes menghapus langkah terakhir lewat
`cron/blueprint_catalog.py` (diverifikasi byte-level 2026-08-20 @ aeabff6):
sebuah katalog ~16 template yang membawa jadwal + prompt jadi, dan user hanya
mengisi beberapa "slot" bertipe (jam, pilihan, teks, hari).

Ini **bukan** pengganti jadwal terbimbing yang sudah ada — blueprint adalah
lapisan di atasnya: yang memilih jadwal tetap template, yang menulis prompt
awal juga template.

## Contract

- Tombol "Browse templates" di seksi Automations → modal daftar template.
- Tiap template = `schedule_template` (cron dengan `{slot}`) + `prompt_template`
  + slot bertipe (`time` / `enum` / `text` / `weekdays`).
- Form satu field per slot + field "Target note" (delivery = note, satu-satunya
  permukaan delivery plugin).
- Baris **"Means: …"** live di bawah form (konsisten dengan jadwal terbimbing —
  cron tidak pernah tampil sebagai password).
- `fillBlueprint` memvalidasi (unknown slot / enum salah / jam salah) dan
  melempar error yang bisa ditampilkan form.

## Decisions

- D1: Katalog **dikurasi, bukan port mentah** — Hermes punya 16 template,
  sebagian menunjuk integrasi yang tidak plugin punya (mail/calendar). Yang
  menunjuk tool hantu = prompt bohong → **dibuang** (fail-closed). Sisa = 9
  template yang berjalan di vault search + web_search + tulis note saja.
- D2: Slot `deliver` Hermes (enum platform) dipetakan ke field **Target note** —
  jujur pada satu-satunya permukaan delivery yang ada. `(review)`
- D3: `time` → minute/hour, `weekdays`/`day` → dow, `interval_min` → step —
  identik dengan `_resolve_schedule` Hermes. `[assumed]` (paritas)
- D4: `fillBlueprint` memanggil `validateCronExpr` — template yang menghasilkan
  cron invalid adalah dev error, dilempar. `(review)`

## Impact

- `src/agent/cronBlueprints.ts` — baru (data + fill, murni, node-testable).
- `src/settingsTab.ts` — tombol + `BlueprintCatalogModal`.
- `styles.css` — `.oa-bp-*`.
- `test/cron-blueprints.test.cjs` — baru; `test/smoke.test.cjs` guard v0.1.147j;
  `package.json` test chain.
- TIDAK berubah: engine cron, `newCronTask`, jadwal terbimbing, tool cronjob.

## GWT

```text
Given user membuka Automations
When klik "Browse templates"
Then daftar 9 template tampil (judul + kategori + deskripsi)

Given user memilih "Custom reminder"
When isi "water the plants" + jam + Repeat on
Then baris Means menunjukkan jadwal manusia (mis. "Every day at 09:00")

Given slot jam diisi "25:00"
When Create ditekan
Then error jam ditampilkan, task tidak dibuat
```

## Risks

> [!risk]
> Blueprint prompt merujuk integrasi hantu → agen bingung saat run. Mitigasi:
> katalog dikurasi + guard test "no phantom integrations".

> [!risk]
> Duplikasi nama task (title jadi nama) — mitigasi: konsisten dengan form lama
> (nama bebas), user bisa rename di Edit.
