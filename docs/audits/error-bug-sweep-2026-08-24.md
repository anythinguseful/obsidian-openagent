---
title: "Error & bug sweep (2026-08-24)"
type: audit
status: active
date: 2026-08-24
tags: [openagent, audit, bugs, quality]
---

> **Status: active** — fase sapuan-lebar (read-only) selesai; peta di
> bawah adalah hasilnya. Fase dalam (perbaikan + guard) belum dimulai dan
> menunggu keputusan owner soal urutan.

# Error & bug sweep

Owner meminta "sweep menyeluruh dulu, baru deep": petakan dulu seluruh
permukaan repo lewat beberapa dimensi yang saling bebas, baru menyelam.
Dokumen ini adalah petanya.

Aturan yang dipakai sepanjang sapuan (Lesson 198): **angka scanner adalah
hipotesis, bukan fakta.** Setiap hit ditelusuri ke situs definisinya sebelum
disebut bug. Kolom "nyata" di bawah hanya diisi setelah penelusuran itu.

## Permukaan yang disapu

123 file `.ts`/`.tsx` di `src/`, 36.350 baris.

`tsconfig.json` memakai `strictNullChecks: false` (dengan `noImplicitAny: true`).
Konsekuensinya penting untuk membaca dokumen ini: **gate `tsc` yang hijau lebih
lemah daripada kelihatannya** — cacat null/undefined tidak terlihat olehnya.

## Ringkasan: 11 dimensi, 1 bug nyata

| # | Dimensi | Hit mentah | Nyata | Catatan |
|---|---|---|---|---|
| A | `tsc --strictNullChecks` | 9 | 0 | 4 false positive tipe-menyempit, 5 sisanya defensif |
| B | Floating promise (`.then` tanpa `.catch`) | 37 | **2** | → temuan T1 |
| C | `JSON.parse` tanpa try/catch | 15 | 0 | 13 idiom deep-clone; 2 sisanya dibungkus pemanggil |
| D | `catch {}` menelan error | 58 | 0 | semuanya berkomentar justifikasi; 0 tanpa penjelasan |
| E | Kerentanan dependensi (runtime) | 0 | 0 | 1 moderate di esbuild, dev-only |
| F | Larangan resmi Obsidian | 0 | 0 | tanpa `innerHTML`, tanpa detach di `onunload`, tanpa hotkey default |
| G | Listener global tanpa cleanup | 15 | 0 | 15/15 punya `removeEventListener` berpasangan |
| H | Timer tanpa clear | 2 `setInterval` | 0 | 2 dibuat, 2 di-clear; `cronTimer` dibersihkan di `onunload` |
| I | React `useEffect(async …)` | 0 | 0 | 36 `useEffect`, tak satu pun async langsung |
| J | Escape hatch tipe | 38 | 0 | 0 `@ts-ignore`; `as unknown as` 23, `: any` 10 |
| K | Off-by-one indeks | 0 | 0 | tanpa `[-1]`, tanpa `[x.length]` |

Kesimpulan sapuan: basis kode ini jauh lebih disiplin daripada yang disugestikan
oleh `strictNullChecks: false`. Sembilan dari sebelas dimensi bersih total.

## T1 — Salin ke clipboard bisa gagal diam-diam (bug nyata)

**Skenario.** Pengguna menekan tombol salin di blok kode dalam chat. Obsidian
berjalan di webview; kalau dokumen sedang tidak fokus atau host memblokir
Clipboard API asinkron, `navigator.clipboard.writeText()` menolak. Karena
promise-nya tidak punya `.catch`, tidak terjadi apa-apa: label tidak berubah,
tidak ada notice, teks tidak tersalin. Pengguna mengira sudah tersalin, lalu
menempel dan mendapat isi clipboard yang lama.

**Kenapa ini bug dan bukan pilihan desain.** Repo ini sudah punya jawaban untuk
persoalan yang sama di empat tempat lain — jadi ini inkonsistensi, bukan
keputusan sadar:

| Situs | Fallback `execCommand` | Status |
|---|---|---|
| `src/settings/sections/helpers.ts:29` (`copyText`) | ya | benar |
| `src/settings/modals/profile.ts:41` (`copyText` lokal) | ya | benar |
| `src/settingsTab.ts:2953` (salin diagnostics) | ya | benar |
| `src/ui/ChatApp.tsx:1637` (salin seleksi) | ya | benar |
| **`src/ui/components/code-block.tsx:82`** | **tidak** | **T1** |
| **`src/ui/components/message.tsx:70`** | **tidak** | **T1** |

Komentar di `ChatApp.tsx:1614` menyebut alasannya eksplisit: "restricted
contexts (headless sim, older webviews) fall back to execCommand". Dua situs
React di atas melewatkan penanganan itu.

**Efek samping kedua.** Di kedua situs, `setCopied(true)` dan
`window.setTimeout` dipanggil tanpa penjaga unmount. Kalau komponen dilepas
dalam 1500 ms setelah klik, timeout tetap menembak `setCopied` pada komponen
yang sudah mati. `ChatApp.tsx` menjaga hal ini dengan `mountedRef.current`;
dua situs ini tidak.

**Usulan perbaikan.** Pakai ulang `copyText()` yang sudah ada alih-alih
menulis fallback ketiga — sekaligus menghapus duplikasi `copyText` di
`profile.ts`. Guard regresi: pin bahwa tidak ada `navigator.clipboard.writeText`
di `src/` yang berdiri tanpa jalur fallback.

## Dimensi A — rincian 9 temuan `strictNullChecks`

Empat di antaranya **false positive dari penyempitan tipe**, bukan cacat
runtime: variabel dideklarasikan `T | null`, lalu diisi di dalam callback yang
tidak dilacak TS, sehingga menyempit ke `never`.

| File:line | Kode | Penilaian |
|---|---|---|
| `src/settingsTab.ts:1482` | TS2339 | false positive — `delBtn` diisi dalam `addButton` callback (L1469/1471) |
| `src/ui/attach/pdf.ts:249-250` | TS2339 ×2 | false positive — `loadingTask` diisi di L215 |
| `src/ui/components/session-panel.tsx:63` | TS2322 | ketidakcocokan `RefObject` vs `LegacyRef`, murni tipe |
| `src/agent/terminal/tools.ts:10` | TS2322 | dijaga throw di L5-7 tepat di atasnya |
| `src/settings.ts:1375,1378` | TS18048 ×2 | dijaga `?? {}` pada `Object.keys()` di baris yang sama |
| `src/ui/ChatApp.tsx:3966` | TS2531 | dijaga `if (providerId && …)` |
| `src/settingsTab.ts:3492` | TS2322 | `v.error` hanya dibaca setelah `if (!v.ok)` |

Tidak ada yang perlu diperbaiki. Nilainya ada di kesimpulan sebaliknya:
menyalakan `strictNullChecks` hanya berbiaya 9 anotasi, jadi flag itu **layak
dipertimbangkan** sebagai pekerjaan tersendiri — bukan karena ada bug hari ini,
tapi supaya cacat null berikutnya tertangkap gate.

## Dimensi C — dua `JSON.parse` jaringan, keduanya aman

Keduanya sempat dicurigai karena mem-parse byte dari jaringan, dan keduanya
ternyata sudah dibungkus pemanggilnya:

- `src/agent/mcp/http.ts:76` (`parseMcpHttpBody`) — pemanggil tunggalnya di
  `http.ts:177` membungkus dengan `try/catch` dan melaporkan
  `unreadable response body: …`.
- `src/agent/hub.ts:231` — berada di `private async fetchJson()`, yang memang
  dirancang melempar (403/429 → error rate-limit, `>= 400` → `HTTP ${status}`).
  `SyntaxError` dari body non-JSON mengalir ke pemanggil lewat jalur yang sama.

## Metode

Semua pengukuran read-only, tanpa perubahan file. ESLint tidak terpasang di
repo ini, jadi dimensi B/I/J diukur dengan skrip Node ad-hoc yang menyeimbangkan
kurung untuk mengambil badan `catch`/`then`, bukan dengan regex per baris —
pendekatan per baris sempat dicoba lebih dulu dan gagal (mencocokkan konstruktor
dan pernyataan sinkron biasa).

Filter yang menentukan di beberapa dimensi:

- Dimensi C: buang idiom `JSON.parse(JSON.stringify(x))` lebih dulu, kalau tidak
  13 dari 15 hit mengubur sinyalnya.
- Dimensi D: bedakan `catch {}` benar-benar kosong dari yang berisi komentar
  justifikasi. Setelah dibedakan, angkanya jatuh dari 58 ke 0.
- Dimensi B: `.catch` dicari dalam jendela 9 baris, karena rantai promise di
  repo ini kerap dipecah multi-baris.
