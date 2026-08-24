---
title: "Error & bug sweep (2026-08-24)"
type: audit
status: active
date: 2026-08-24
tags: [openagent, audit, bugs, quality]
---

> **Status: active** — fase sapuan-lebar (read-only) selesai; peta di
> bawah adalah hasilnya. **T1 sudah diperbaiki** (2026-08-24, guard
> `v0.1.197`, Lesson 199) — lihat bagian T1. Urutan lanjutan yang disepakati
> owner: T1 → `strictNullChecks` → runtime agent → Phase 4.

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

## Ringkasan: 11 dimensi, 3 bug nyata + 1 celah laten

| # | Dimensi | Hit mentah | Nyata | Catatan |
|---|---|---|---|---|
| A | `tsc --strictNullChecks` | 9 | **2** | + 1 celah laten keamanan; triase awal "0 nyata" **dikoreksi** — lihat Dimensi A |
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

Kesimpulan sapuan: basis kode ini disiplin — sembilan dari sebelas dimensi bersih
total. Tapi dimensi A membuktikan harga dari `strictNullChecks: false`: ia
menyembunyikan satu crash nyata, satu blok cleanup yang jadi kode mati, dan satu
jalur keamanan yang tidak fail-closed. Flag itu kini ON.

## T1 — Salin ke clipboard bisa gagal diam-diam (bug nyata) — **SELESAI**

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

**Perbaikan yang dikirim (2026-08-24).**

Usulan pertama — "pakai ulang `copyText()` dari `settings/sections/helpers.ts`"
— **ditarik sebelum ditulis**. Arah impor yang berlaku di repo adalah
`settings/ → ui/` (3 kali); `ui/ → settings/` nol kali. Usulan itu akan
membalik layering demi perbaikan dua baris.

Bentuk final: `src/ui/clipboard.ts` menjadi satu-satunya jalur yang disanksi.

- Kontraknya `Promise<boolean>`, bukan `Promise<void>`. Alasannya konkret:
  `copyDiagnostics()` dulu menampilkan Notice "diagnostics copied" tanpa
  syarat, termasuk ketika kedua jalur gagal. Sekarang Notice-nya mengikuti
  hasil.
- Enam call-site menyatu; tiga fallback tulisan-tangan (`helpers.ts`,
  `profile.ts`, `settingsTab.ts`) hilang. `helpers.ts` menyimpan
  `export { copyText }` sebagai re-export agar permukaan impor settings tidak
  berubah.
- **Tidak disatukan, sengaja:** `ChatApp.copySelection`. Fallback-nya
  menjalankan `execCommand("copy")` pada sorotan yang masih hidup, bukan pada
  textarea terlepas — di sana seleksi *adalah* muatannya, dan merutekannya
  lewat `copyText` justru akan menghapus seleksi itu. Strategi berbeda,
  kontrak sama; ia sudah menangani penolakan.
- Efek samping unmount ikut ditutup: kedua situs React kini memakai
  `mounted`/`timer` ref, sejajar dengan pola `mountedRef` di `ChatApp`.

**Guard regresi `v0.1.197`** (`test/smoke/misc.cjs`): berjalan atas 124 file
sumber, menolak `navigator.clipboard` di mana pun kecuali dua file yang
disanksi, memastikan modul kanonik masih memuat kedua jalur *dan* melaporkan
boolean, memastikan kedua call-site memeriksa boolean itu, plus lantai korpus
supaya pemindai yang tidak memindai apa pun tidak lolos diam-diam.

Red-proof 4/4, tiap lengan diverifikasi lewat pesan `✗` miliknya sendiri.
Lengan M2 sempat **tidak merah**: guard membaca file mentah, dan docstring
`clipboard.ts` sendiri menyebut `document.execCommand("copy")` — predikatnya
puas dari prosa, bukan dari kode. Diperbaiki dengan strip komentar sebelum
memeriksa (Lesson 199).

## Dimensi A — 9 temuan `strictNullChecks` — **SELESAI**

> **Koreksi triase.** Versi pertama audit ini menyimpulkan "tidak ada yang perlu
> diperbaiki: 4 false positive penyempitan tipe, 5 sisanya sudah dijaga".
> Pemeriksaan per-baris saat mengeksekusi perbaikan membuktikan kesimpulan itu
> **salah untuk tiga baris**. Membaca ulang tiap situs sebelum menyunting —
> bukan mempercayai triase sendiri — yang memunculkannya.

Flag `strictNullChecks` kini **ON** di `tsconfig.json` dan `npx tsc --noEmit`
bersih. Dijaga guard smoke **v0.1.198** (6/6 lengan terbukti merah).

| File:line | Kode | Vonis akhir |
|---|---|---|
| `src/ui/ChatApp.tsx:3966` | TS2531 | **BUG NYATA** — `getActiveProvider(settings).id` tanpa `?.`; fungsi itu `return null` bila tak ada provider aktif/enabled. Kembarannya di `main.ts:216` sudah memakai `?.` sejak awal — asimetri, bukan gaya. Triase lama keliru mengira `if (providerId && …)` menjaganya; guard itu menjaga argumen, bukan hasil panggilan. |
| `src/ui/attach/pdf.ts:249-250` | TS2339 ×2 | **BUG NYATA (kode mati)** — `loadingTask` hanya diisi di dalam closure async, jadi CFA menyempitkannya ke `null` di `finally` luar: cleanup timeout/worker-failure **tak pernah jalan**. Bukan false positive; `never` justru pesan TS bahwa cabangnya mustahil. |
| `src/agent/terminal/tools.ts:10` | TS2322 | **CELAH LATEN (keamanan)** — throw-guard L5 memeriksa `terminal`/`execution`, **tidak** `workspacePolicy`, padahal `service.ts:195` men-dereference `.mode` untuk memutuskan kurungan `strict-folder`. Runner selalu meng-inject (runner.ts:173), jadi tak hidup hari ini — tapi jalur keamanan harus fail-closed eksplisit. |
| `src/settingsTab.ts:3488` | TS2322 | Akar di sumber, bukan di pemanggil: `validateCronExpr` mengembalikan `{ ok: boolean; error?: string }`. Diperbaiki jadi union terdiskriminasi `CronExprValidation`, sehingga `!v.ok` menyempitkan `error` ke `string` untuk **semua** 6 pemanggil. |
| `src/settings.ts:1375,1378` | TS18048 ×2 | Benar aman (`?? {}`), tapi `Object.keys(srv.env ?? {})` membaca dari objek yang bisa berbeda dari yang ditulisi. Diikat sekali ke `const env`/`const headers`. |
| `src/settingsTab.ts:1483` | TS2339 | Artefak penyempitan asli. `delBtn` dihapus; `setDisabled` dipanggil inline karena `addButton` menjalankan callback-nya sinkron. |
| `src/ui/components/session-panel.tsx:63` | TS2322 | Prop ditulis gaya React 19 (`RefObject<HTMLElement \| null>`); repo ini React 18, di mana `RefObject<T>.current` **sudah** `T \| null`. Diselaraskan dengan `file-upload.tsx`. |

Catatan metode: dua "perbaikan" naif untuk kasus `never` (anotasi ulang lewat
`const` lokal; setter function) diuji lebih dulu di scratch file dan **keduanya
gagal** — CFA tetap menyempitkan ke `never`. Hanya holder object yang lolos.
Menambal dengan `as` akan menyembunyikan kode mati itu, bukan menghidupkannya.

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
