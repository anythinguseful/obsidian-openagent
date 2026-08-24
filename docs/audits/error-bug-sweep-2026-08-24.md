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
| B | Floating promise (`.then` tanpa `.catch`) | 37 | **7** | grep meremehkan: AST menemukan 6 situs + 1 regresi `revealLeaf`; **SELESAI**, lihat Dimensi B |
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

## Dimensi B — floating promise: dari grep ke type-checker — **SELESAI**

Sapuan awal memakai grep dan melaporkan 2 temuan nyata. Itu meremehkan: **grep
tidak bisa mendeteksi floating promise**, karena yang menentukan adalah *tipe*
sebuah expression statement, bukan bentuk teksnya. Penggantinya adalah gate
berbasis type-checker, `scripts/check-floating-promises.mjs`.

Enam situs diperbaiki:

| Situs | Perbaikan |
|---|---|
| `ChatApp.tsx` manual-drain `sendQueued(head)` | `.catch` → `pushLocalNoticeTurn(..., "error")` |
| `ChatApp.tsx` auto-drain (effect) | `.catch` **sebelum** `.finally` yang sudah ada (`.finally` melempar ulang) |
| `ChatApp.tsx` `sendQueuedNow` cabang idle | `.catch` → notice yang sama |
| `main.ts` ×3 `revealLeaf` | helper `revealQuietly` — sengaja senyap, tahan dua kontrak |
| `markdown.tsx` `MarkdownRenderer.render` | `.catch(() => el.setText(processed))` |
| `mcp/http.ts` `send()` | `this.chain.catch(() => {}).then(...)`; probe naik 1 → 3 dari 3 POST |

Dua hal yang hanya muncul saat dikerjakan, bukan saat disapu:

1. **Detektornya sendiri buta.** Versi pertama lulus bersih sambil melewatkan
   setiap statement ber-`void`, karena `getTypeAtLocation` pada `VoidExpression`
   mengembalikan `void`. Harness mutasi 6 lengan yang membongkarnya; angka
   sebenarnya **96**, bukan 5. Gate sekarang memisahkan **tanpa penanda = gagal
   keras** dari **ber-`void` = ratchet `VOID_BUDGET = 96`**.
2. **Perbaikan `revealLeaf` sempat menimbulkan regresi.** `.catch` tanpa syarat
   melempar `TypeError` pada build Obsidian lama yang mengembalikan `void` —
   ditangkap trap runtime baru, bukan oleh `tsc`.

Penjagaan yang ditambahkan: gate statis di atas (terpasang di `npm run verify`
dan CI), trap runtime `test/fail-on-unhandled.cjs` yang di-preload ke 40 lane
sehingga unhandled rejection menjadi kegagalan lane, dan lane perilaku
`v0.1.199` yang menguji **kedua** kontrak `revealLeaf` termasuk promise yang
menolak. Pelajaran 201 mencatat sebabnya.

## Putaran 2 — dimensi L–P (2026-08-24)

Dimensi A–K sudah ditutup di bagian sebelumnya dan tidak disapu ulang.
Semua pemeriksaan putaran ini berbasis AST (bukan grep), sesuai pelajaran
dimensi B bahwa grep melaporkan angka yang terlalu kecil.

| Dim | Pemeriksaan | Mentah | Nyata | Hasil |
|---|---|---|---|---|
| L | Non-null assertion `!` | 15 | 0 | Semua terbukti aman — lihat catatan |
| M | `parseInt` tanpa radix | 2 | 0 | Keduanya bergerbang `\|\| default` |
| N | Hasil `.match()` diakses langsung | 3 | 0 | Ketiganya sudah memakai `?.` |
| O | Perbandingan longgar `==` / `!=` | 0 | 0 | Bersih |
| P | Hasil `JSON.parse` di-cast buta | 23 | **1** | **Bug nyata — SELESAI** |

**L (non-null `!`).** Kluster terbesar, 7× `record!` di
`src/agent/terminal/service.ts:729-764`, aman secara struktural: `record`
hanya `null` saat `action === "list"`, dan setiap situs `!` berada di cabang
yang sudah menyingkirkan `"list"`. Sumbernya `ownedRecord()`, yang
**melempar** (bukan mengembalikan `undefined`) ketika id tidak ketemu atau
pemiliknya beda sesi. Sisanya (`agentLoop.ts:345` setelah cek `length`,
`ChatApp.tsx:2516`/`3399`, `at-refs.ts:73,82` atas string literal ber-`/`)
juga terjaga di pemanggilnya.

**M (`parseInt` tanpa radix).** `settings/sections/advanced.ts:106` dan
`settingsTab.ts:3160`. Sejak ES5 radix default sudah 10 untuk input tanpa
awalan `0x`, dan keduanya dibungkus `|| <default>` lalu `Math.max`/`Math.floor`,
jadi `NaN` maupun `0x`-input tidak bisa lolos jadi nilai aneh. Tidak diubah:
mengubah yang tidak rusak hanya menambah risiko.

**P (cast buta atas `JSON.parse`) — satu bug nyata.** Dari 23 kecocokan, 13
adalah idiom deep-clone `JSON.parse(JSON.stringify(x))` (bentuknya dijamin
oleh sumbernya) dan sisanya memvalidasi setelah parse — kecuali
`src/agent/sessions.ts`. Kedua situs baca file sesi memakai
`JSON.parse(raw) as Session`: sebuah **klaim** bentuk yang tidak pernah
diperiksa. File sesi adalah data disk — tulisan terpotong, suntingan tangan,
atau skema versi lama bisa menghasilkan JSON valid yang kehilangan field wajib.

Direproduksi runtime (bukan dibaca dari kode saja), tiga crash dari satu akar:

| Isi file (JSON valid) | Akibat |
|---|---|
| `turns` hilang | `TypeError: session.turns is not iterable` di `search()` |
| satu turn tanpa `parts` | `TypeError: Cannot read properties of undefined (reading 'map')` |
| `title` hilang | `TypeError: ... (reading 'toLowerCase')` di `search()` lewat `list()` |

Dampaknya melampaui pencarian: `load()` memasok `setTurnsSynced(s.turns)` ke
ChatApp, sehingga satu file rusak bisa menjatuhkan pencarian lintas sesi **dan**
jalur muat chat untuk semua sesi.

Perbaikan: `sanitizeSession()` menormalkan pada titik baca — id non-string
ditolak (`null`), `turns`/`parts` dipaksa array, `title`/`model`/timestamp
diberi default, `turnCount` jatuh ke `turns.length`. Field tak dikenal dan
opsional (`messages`, `goal`, `todos`, `compression`, `personality`, `parent`)
lewat apa adanya — round-trip sesi normal terbukti identik byte-per-byte.
Kedua situs baca (`list()` dan `load()`) melewatinya; cast buta dilarang balik.

Penjagaan: lane `v0.1.152` di `test/smoke/agent.cjs` menuntut `sanitizeSession`
ada, kedua situs baca memakainya, normalisasi `parts` tetap utuh, dan jumlah
cast `JSON.parse(...) as Session` **nol**. Red-proof tiga arah: mencabut
sanitasi di `load()`, di `list()`, atau melemahkan normalisasi `parts`
masing-masing memerahkan lane.

## Putaran 3 — dimensi Q–V (2026-08-24)

Catatan: dimensi "Q" dan "S" dari sesi lampau tidak pernah tertulis di dokumen
ini dan isinya tidak terekam di manapun, jadi huruf-huruf itu **dipakai ulang**
untuk pemeriksaan baru di bawah alih-alih mengarang isi lama.

| Dim | Pemeriksaan | Mentah | Nyata | Hasil |
|---|---|---|---|---|
| Q | Comparator `sort()` mengembalikan boolean | 0 | 0 | Bersih |
| R | Callback `async` di `forEach` (tak ditunggu) | 0 | 0 | Bersih |
| S | `.replace()` pola string (hanya kemunculan pertama) | 6 | 0 | Semua atas `toISOString().slice(0,16)` — target tunggal |
| T | Regex `/g` tersimpan (`lastIndex` stateful) | 4 | 0 | 2 mereset `lastIndex`, 2 memakai `matchAll`/`replace` |
| U | Akses `[0]` tanpa cek panjang | 42 → 21 | 0 | `split()` selalu ≥1; `match[0]` dijaga `if`; `groups[0]` literal 4 elemen |
| V | Parse JSON non-objek di batas input | 26 | **1** | **Bug nyata — SELESAI** |

**T (regex stateful).** Empat regex `/g` disimpan di konstanta modul. Pola ini
berbahaya karena `.test()`/`.exec()` berulang atas objek regex yang sama akan
melanjutkan dari `lastIndex` sebelumnya dan melewatkan kecocokan secara
bergantian. Keempatnya sudah aman: `AT_REF_RE` dan `MERMAID_TRAILING_PERCENT`
menyetel `lastIndex = 0` tepat sebelum loop `exec`, sedangkan
`SLASH_COMMAND_RE` dan `MERMAID_SUBGRAPH_LINE` dipakai lewat `matchAll()` dan
`replace()` yang tidak terpengaruh state.

**U (akses indeks 0).** Dari 42 kecocokan mentah, 21 benar-benar memakai
hasilnya langsung. Semuanya terbukti aman atas alasan struktural, bukan
kebetulan: `String.prototype.split()` **selalu** mengembalikan minimal satu
elemen (walau string kosong), `match[0]` hanya diakses di dalam cabang yang
sudah memastikan match tidak `null`, dan `groups[0]` menunjuk array literal
beranggota empat. `memory.ts:111` (`hit[0].i`) didahului `if (hit.length === 0)`.

**V (JSON non-objek di batas input) — satu bug nyata.**
`JSON.parse` menerima jauh lebih banyak daripada objek: `null`, `123`, `"halo"`
dan `[1,2]` semuanya JSON valid. Kolom **Custom headers** menyimpan apa pun yang
kembali dari `JSON.parse(v)` tanpa memeriksa bentuknya.

Direproduksi runtime:

| Yang diketik | Akibat |
|---|---|
| `null` | tersimpan `null` → render Settings berikutnya crash: `Object.keys(null)` — `Cannot convert undefined or null to object` |
| `"halo"` | tersebar jadi header per-karakter `{"0":"h","1":"a","2":"l","3":"o"}` — **dikirim ke provider di setiap request** |
| `[1,2]` | jadi header `{"0":1,"1":2}` |
| `123` | tersimpan senyap sebagai angka |

Kasus `null` adalah crash yang terlihat; kasus string justru lebih buruk karena
**senyap** — header sampah ikut terkirim ke jaringan tanpa gejala di UI.

Perbaikan: `sanitizeCustomHeaders()` di `src/settings.ts` hanya menerima objek
biasa yang seluruh nilainya string (kunci kosong ditolak), mengembalikan `null`
untuk yang lain. Dipasang di **dua** batas — titik ketik (`settingsTab.ts`:
input non-map tidak disimpan, pengguna dibiarkan lanjut mengetik) dan titik
muat (`settings.ts`: merge preset, sehingga vault yang **sudah terlanjur**
menyimpan nilai rusak ikut pulih saat load). Header sah lolos tanpa perubahan.

Penjagaan: lane `v0.1.152` di `test/smoke/settings.cjs` menuntut helper ada,
kedua batas memakainya, dan bentuk lama (`JSON.parse(v)` mentah, merge tanpa
sanitasi) tidak bisa kembali. Red-proof tiga arah: mengembalikan parse mentah di
input, mencabut sanitasi di merge, atau melemahkan cek nilai string —
masing-masing memerahkan lane.
