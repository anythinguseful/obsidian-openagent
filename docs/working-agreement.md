---
title: "Open Agent — Working Agreement"
type: process
status: active
date: 2026-07-21
tags: [openagent, process]
---

# Open Agent — Working Agreement

Standing instruction dari owner (2026-07-21). **Binding** untuk semua sesi.
Dibaca bersama set skill UI dev di `skills/` — `openagent-ui`
(kontrak binding, MENANG atas saran skill lain), `frontend-design` (arah
estetika; salinan = revisi clarity upstream), `functional-ui` (susunan
surface fungsional), `web-design-guidelines` (audit a11y/UX; salinan
reference/ identik upstream per 2026-08-06). Jalan lama
`~/.claude/skills/…` TIDAK dipakai lagi (diverifikasi 2026-08-06) — semua
skill kini di `skills/`.

## Gaya komunikasi (feedback owner 2026-07-21)

Penjelasan untuk owner harus langsung dipahami:

1. **Skenario konkret dulu, istilah teknis belakangan.** Contoh: jangan
   mulai dari "MAX_DISPLAY_CHARS guardrail di Output pane" — mulai dari
   "kalau tool balikin hasil 400 KB, chat sekarang tampil 5 KB pertama +
   catatan kecil, sisanya tetap utuh di riwayat".
2. **Kenapa sebelum apa.** Alasan perubahan dijelaskan sebelum detailnya.
3. **Kalimat pendek.** Satu ide per baris; hindari jargon berlapis
   (TurnPart, disclosure id, guardrail) kecuali sudah didefinisikan dulu
   dalam percakapan yang sama.
4. **Beda sebelum-sesudah** untuk perubahan yang terlihat di layar.

## Prinsip (dari owner)

1. Selalu bersikap perfectionist.
2. Selalu teliti.
3. Selalu konsisten.
4. Selalu periksa docs dan source resmi / repo.
5. Selalu menaati prosedur.
6. Jangan pernah halusinasi.
7. Berpikir secara logika dan logis.
8. Jangan pernah mengulangi kesalahan — kalau tidak, kerja dua kali atau lebih.
9. Belajar dari preseden / real project.
10. Kamu jauh lebih pintar dan berbakat — lakukan semestinya.

## Mekanisme penegakan (prinsip → prosedur nyata)

| Prinsip | Mekanisme |
|---|---|
| Perfectionist · teliti | Pipeline penuh (`npm run release`) setelah **setiap** perubahan kode; laporan "selesai" hanya jika typecheck ✓ + 10 suite ✓ + ZIP SYNCED ✓. Tidak ada "harusnya aman". |
| Konsisten | Kontrak gaya SKILL.md (class `oa-`, variabel CSS Obsidian, blok CSS baru di akhir file dsb.); API komponen mengikuti source official, bukan improvisasi. |
| Periksa docs/source resmi | **Aturan tool.tsx**: klaim tentang library/framework hanya setelah menarik **source mentah resmi** (jsDelivr/raw CDN/repo), bukan sekadar halaman docs. Temuan diarsipkan di ringkasan sesi. |
| Menaati prosedur | Workflow: study → keputusan binding via `ask_user` → plan → greenlight → implement → pipeline → commit per logical change → present. Ritual release sebelum present. |
| Tanpa halusinasi | Setiap klaim teknis diverifikasi (grep / test / screenshot pixel). Pisahkan eksplisit **fakta vs hipotesis** (contoh: insiden LM Studio 180-token tetap 3 hipotesis sampai user konfirmasi). |
| Logis | Premis dinyatakan, kesimpulan diturunkan; premis goyang → berhenti, verifikasi dulu, baru lanjut. |
| Tak mengulang kesalahan | Setiap bug/kegagalan mendapat **regression guard** di smoke test + dicatat di Lessons log di bawah. Bug tanpa guard = utang. |
| Belajar dari preseden | Lessons log wajib dibaca ulang di awal sesi (terangkum di conversation summary). |

## Bootstrap sesi GitHub (dari owner 2026-08-11)

Repositori `anythinguseful/obsidian-openagent` kini dikelola lewat GitHub.
Setiap sesi Arena BARU wajib membuka dengan prosedur ini SEBELUM mengubah
apa pun — audit dulu, implementasi belakangan:

1. **Fetch & audit kondisi terbaru.** `git fetch origin --prune`, baca
   `main` dan daftar PR (`gh pr list --state all`). Jangan menganggap
   commit yang disebut di instruksi otomatis ada di remote — verifikasi
   objeknya (`git cat-file -t <sha>`), ref-nya (`git ls-remote origin`),
   dan riwayatnya.
2. **Verifikasi artefak handoff kunci.** Cek keberadaan: `.github/workflows/ci.yml`,
   `scripts/check-docs.mjs`, `package.json` script `check:docs`, README
   "21 tools in 9 toggleable toolsets", `docs/working-agreement.md`
   "Bootstrap sesi GitHub" + Lesson 117, dan `skills/internal/openagent-ui/SKILL.md`
   menunjuk `preview/index.html`. Yang hilang = pekerjaan rekonstruksi.
3. **Baca dokumen & skill binding.** `docs/working-agreement.md` (seluruh
   Lessons log, terutama 109+), lalu keempat SKILL.md
   (`openagent-ui` MENANG atas saran skill lain).
4. **Baseline dulu, kode belakangan.** `npm ci` → `npm run typecheck` →
   `npm run build` → `npm test`. Semua hijau baru menyentuh file.
5. **Rekonstruksi dari kebutuhan, bukan tebakan.** Bila commit sesi lama
   tidak ada di remote, bangun ulang dari kebutuhan yang terverifikasi
   (grep source untuk angka, cek arsitektur aktual), lalu catat di
   Lessons log.
6. **`.github/workflows/ci.yml` adalah baris pemisah wajib.** GitHub App
   Arena tidak boleh membuat/mengubah workflow — commit workflow TERPISAH
   dari docs/tooling, push bagian yang diizinkan, dan isi workflow
   diserahkan ke owner untuk ditambahkan manual lewat GitHub UI.
7. **Jangan pernah commit/push ke `main`.** Kerja di branch sesi
   (`arena/<id>`), push hanya ke branch itu; pull request dari sana.

## Aturan dokumentasi (kapan update docs)

Diadopsi 2026-08-18 dari `designdocs/agents/DOCS_GUIDE.md` repo obsidian-copilot
(studi: `docs/studies/copilot-docs-organization-2026-08-18.md`). **Binding.**

1. **Saat mengubah perilaku user-facing** (fitur baru, setting berubah, fungsi
   dihapus) → **update doc yang sesuai di `docs/` di commit yang sama**.
   Rencana fitur → `docs/plans/`, riset parity → `docs/studies/`, audit →
   `docs/audits/`, sumber resmi → `docs/reference/`.
2. **Doc user-facing ditulis untuk pengguna non-teknis** — jelaskan perilaku
   dan konsep, tanpa referensi kode sumber; detail teknis hidup di plan/study.
3. Satu perubahan menyentuh banyak doc → update semuanya.
4. Ragu doc mana → cek hub `docs/README.md` (daftar lengkap + deskripsi).
5. Plan baru mulai dari `docs/plans/_TEMPLATE.md`; status frontmatter harus
   jujur (`draft` → `done` saat ship, `archived` saat digantikan).
6. `RELEASES.md` di root mencatat changelog ringkas per rilis untuk pengguna;
   ZIP, checksum, clean source, source manifest, dan final report disimpan
   permanen sebagai asset GitHub Release. Folder lokal `release/` hanya staging
   ter-ignore dan tidak boleh menjadi dependency lintas sesi.

## Tabel routing (kalau kerja X → baca Y)

Satu pintu cepat sebelum mulai. Detail tetap di dokumen tujuan (jangan menyalin
isi ke sini).

| Kalau kerja… | Baca |
|---|---|
| UI / visual / CSS / copy plugin apa pun | `skills/internal/openagent-ui/SKILL.md` (KONTRAK — menang atas saran skill lain) |
| Arah estetika (tipografi, layout, anti-"AI slop") | `skills/vendor/anthropics/frontend-design/SKILL.md` |
| Susunan permukaan fungsional (chat, settings, dashboard) | `skills/internal/functional-ui/SKILL.md` |
| Audit a11y/UX (fokus, form, animasi, tipografi) | `skills/vendor/vercel/web-design-guidelines/SKILL.md` |
| Parity dengan upstream (prompt-kit, Hermes, Copilot, lobe-ui, shadcn) | `docs/reference/reference-sources.md` — **verify raw dulu** |
| Batas Workspace (Whole/Preferred/Strict, symlink, read ceiling) | `docs/reference/workspace-security.md` |
| Proses, prinsip owner, Lessons log, bootstrap GitHub | `docs/working-agreement.md` |
| Ide yang sengaja ditunda + alasan + unlock | `docs/backlog.md` |
| Peta seluruh docs | `docs/README.md` (hub) |
| Merilis (pipeline, zip, checksum) | `scripts/release.mjs` + `CONTRIBUTING.md` |
| Gate sebelum selesai | `npm run verify` · `npm run check:docs` · `npm run check:skills` |

## Lessons log (preseden — jangan diulangi)

1. **Docs ≠ source** (2026-07-21) — audit CoT hanya dari halaman docs melahirkan
   justifikasi keliru ("Steps sudah cocok"). Setelah source asli prompt-kit
   ditarik utuh via CDN, keputusan berubah. → Klaim API framework wajib baca source.
2. **KV-cache busting** (2026-07-20) — Date dengan presisi detik di system prompt
   memecah cache LM Studio tiap turn. → Periksa setiap string dinamis dalam prompt;
   detail kecil bisa ber-blast-radius besar.
3. **test/preview.html trap** (2026-07-21) — nama file mengundang dibuka langsung,
   padahal materi mentah tanpa CSS → tampil berantakan. → Nama & affordance adalah
   bagian dari desain; perangkap dinamai ulang + di-guard (`renamed` check).
4. **Modal CSS scope** — Obsidian modal render di `document.body`, bukan di bawah
   `.oa-settings` → selector yang salah scope diam-diam tak berlaku. → Verifikasi
   lokasi DOM asli sebelum styling.
5. **Wipe environment** (2026-07-21) — cache browser playwright (& `node_modules`)
   dihapus antar sesi → tooling wajib self-healing (`launchBrowser`), jangan
   degrade senyap ke fallback.
6. **Double tooltip** (2026-07-21) — Obsidian membuat `.tooltip` dari `aria-label`;
   `title` + `aria-label` pada satu elemen = dua tooltip bertumpuk. → Chat UI
   aria-label only; di-guard (title= apa pun di `src/ui/**` menggagalkan suite).
7. **Type setengah jadi** (2026-07-21) — destructure prop baru tanpa memperbarui
   props type = typecheck merah dan batch terblokir. → Selesaikan satu file utuh
   (markup + type + pemakaian) sebelum pindah file.
8. **Pixel > getComputedStyle** — di bawah override custom-prop, nilai komputasi
   bisa menipu; screenshot pixel adalah ground truth visual.
9. **Bugfix berantai** — tiap fix diverifikasi *end-to-end* bila memungkinkan
   (bukti nyata: hapus cache playwright → self-heal tereksekusi → 9 frame REAL),
   bukan hanya "kodenya terlihat benar".

10. **`String.replace` punya aturan khusus untuk `$`** (2026-07-21) —
    dalam string pengganti JS, `"$$"` berarti SATU `$` literal. Port
    LaTeX Copilot memakai `"$$"` sebagai pengganti, jadi output riilnya
    `$…$` (inline), bukan `$$…$$` (display) seperti niat terdokumentasi
    mereka. → Simulasikan perilaku bahasa target (simulasi Python
    `re.sub` berbohong karena tidak mengenal aturan `$$`); ground truth =
    runtime JS asli (eval literal + JSON.stringify), bukan tebakan
    manual berlapis escape.
11. **Import API obsidian baru = wajib update shim di commit yang sama**
    (2026-07-21) — menambah `MarkdownView` ke import ChatApp membuat
    bundle real-preview gagal (export shim hilang) dan pipeline jatuh ke
    static fallback **secara senyap**; esbuild error tertelan jalur
    fallback. → Tiap penambahan simbol `obsidian` di `src/ui/**` mirrors
    ke `test/real-preview/obsidian-shim.ts`. Setiap release: baca baris
    "N REAL frame(s) injected" — jangan grep sempit yang menyembunyikan
    kegagalan.

12. **Closure `useCallback` itu snapshot** (2026-07-21) — `/retry` memotong
    `turns` lewat `setTurnsSynced` lalu memanggil `runAgent` 30ms kemudian;
    closure `runAgent` tetap memegang daftar turns SEBELUM dipotong → seluruh
    percakapan terduplikasi saat regenerate. `setTimeout` tidak
    "menyegarkan" closure. → State yang berubah sinkron harus dibaca dari
    ref (`turnsRef.current`), bukan dari state yang dicapture closure.
    Bug seperti ini hanya terbukti lewat **klik nyata** (E2E: scenario
    convo + `page.click` + assertion jumlah bubble — sebelum=2 sesudah=1),
    bukan review mata. Pelajaran pendamping: install browser playwright
    perlu `--with-deps` (paket OS ikut ter-wipe: libnspr4 dkk.).
    **Addendum (2026-07-31)**: im-peratif settings tab punya hazard yang
    sama — handler Apply pada main-model pick membaca konst hasil render
    (probe F14 menangkap Apply menulis model versi render, persis
    mismatch lintas-provider yang mau dibunuh; gejala kedua: tombol
    Apply macet disabled karena state tombol juga snapshot render).
    → Handler di UI imperatif wajib membaca field draft LIVE; enable/
    disable tombol yang bergantung pada draft diperbarui in-place di
    onChange, bukan mengandalkan render berikutnya.
    **Addendum #2 (2026-07-31)**: varian harness — `<ChatApp {...props}/>`
    MENYALIN referensi prop saat render; mutasi `props.applyProfile` di
    dalam driver (setelah mount) tidak pernah sampai ke komponen (spy tak
    terpanggil, check gagal senyap — tertangkap karena assertion
    profileApplied). → Mutasi properti skenario (seed data, spy) wajib di
    module scope SEBELUM render; guard-nya assertion E2E itu sendiri.

13. **Override yang melukai parity bawaan** (2026-07-21) — quote bar di chat
    tampak abu-abu karena `.oa-app .oa-markdown blockquote` me-repaint
    `border-left: var(--background-modifier-border)` di atas rule resmi Obsidian
    `.markdown-rendered blockquote` (bar = `--blockquote-border-color` →
    `--interactive-accent`). Konten markdown kita sudah dibungkus class
    `markdown-rendered`, jadi CSS aplikasi asli sudah berlaku — override kita
    justru menghancurkannya. → Sebelum men-styling elemen markdown apa pun
    (blockquote, table, hr, heading), cek dulu rule aslinya di
    `test/reference-obsidian-app.css` (dump CSS aplikasi Obsidian = ground truth
    resmi yang kita miliki lokal). Solusi pertama yang dipertimbangkan harus
    **menghapus** override, bukan meniru nilai resmi. Yang boleh dideklarasikan
    ulang: properti benar-benar khas chat (ritme vertikal compact).

14. **Harness meniru DOM aplikasi, bukan "yang masuk akal"** (2026-07-21) —
    real-preview menaruh `class="theme-dark"` di `<html>`; aplikasi asli
    menaruhnya di `<body>`. Dampak sunyi: app.css mendefinisikan `--accent-h`
    di blok `body {…}`, jadi rantai `--color-accent-* → hsl(var(--accent-h)…)`
    **guaranteed-invalid** di harness tapi valid di aplikasi — garis quote
    hilang di screenshot tanpa satu error pun. Ditambah: subset auto-extract
    (`obsidian-sim.css`) tidak memasukkan rule `.markdown-rendered blockquote`.
    → Kalau ada yang "tampil beda dari aplikasi tapi kode kita sudah benar",
    curigai struktur harness (kelas/parent/at-rule) SEBELUM menyalahkan CSS
    plugin. Verifikasi dengan computed-style probe pada halaman preview, bukan
    tebakan; whitelist extractor untuk elemen markdown yang dirender plugin.

15. **Batas default bisa membunuh fitur secara senyap** (2026-07-21) — owner
    melaporkan "tidak bisa upload file jenis apa pun": dialog terbuka normal,
    tapi batas 256 KB + kebijakan teks-saja menolak hampir semua file nyata
    (PDF/gambar/dokumen). Harness E2E justru hijau karena file uji kecil.
    → Kalibrasi default terhadap file dunia-nyata, bukan file uji. Setiap
    notifikasi penolakan harus membawa **angka terukur** (ukuran file vs
    batas) supaya diagnosis cukup satu kalimat, bukan dua round-trip tanya
    jawab. Batas baru diputuskan owner: teks 1 MB · gambar 5 MB via jalur
    vision.

16. **Giliran teks-saja bisa tak ter-render untuk owner** (2026-07-21) — dua
    kali berturut balasan berisi hanya teks tidak sampai ("chat hilang"),
    sedangkan balasan dengan tool call (ask_user / present_file) selalu
    tampil. → Tutup setiap giliran dengan tool call bermakna (pertanyaan,
    presentasi hasil, atau aksi), bukan paragraf telanjang — dan sampaikan
    keputusan penting di label/opsi ask_user, bukan hanya di narasi.

17. **Build tak teridentifikasi = diagnosis buta** (2026-07-22) — owner dua
    kali melaporkan "masih tidak bisa upload" padahal fix sudah di-zip: ia
    masih menjalankan build LAMA (belum menimpa file / belum reload plugin).
    Bukti termurah: pesan unik build lama masih muncul padahal string-nya
    sudah dihapus dari sumber. → Setiap perbaikan yang dikirim ke user wajib
    menaikkan `manifest.version` supaya user dapat MEMBUKTIKAN build yang
    sedang jalan (Settings → Community plugins), dan tulis satu cek visual
    sederhana (teks overlay/versi) di laporan "selesai".

18. **Jebakan multi-vault** (2026-07-22) — owner menimpa file plugin di
    main-vault padahal yang ia pakai (dan baca stempelnya) adalah dev-vault.
    Gejalanya identik dengan "zip cache lama / file tak tertimpa", lima putaran
    diagnosis. → Kriteria pembeda paling awal: cek STRING khas build di main.js
    yang BENAR-BENAR di folder plugin (Notepad + Ctrl+F) dan minta path folder
    dibuka lewat ikon folder di Settings Obsidian (selalu mengarah ke vault
    yang aktif), bukan lewat File Explorer manual. Versi/stempel di Settings
    adalah orang pertama yang bersaksi — baca dia dulu sebelum menyalahkan
    packaging.

19. **Screenshot harness pun bisa bohong** (2026-07-22) — aplikasi asli
    memaku `body { height:100%; overflow: clip }`, jadi konten di bawah
    viewport tidak pernah di-paint: shot settings awal menampilkan "teks
    terpotong" dan "baris hilang" PALSU. Urutan aman: klaim layout diuji
    dulu di DOM (jumlah baris, getBoundingClientRect), pixel hanya sebagai
    konfirmasi. Tangkap section penuh dengan menaikkan VIEWPORT ke
    scrollHeight; JANGAN pernah meng-override rantai height/overflow milik
    app (hasilnya malah paint kosong total).

20. **Menghapus fitur = memburu guard-nya juga** (2026-07-23) — saat layer
    per-tool dihapus (Hermes semantics), smoke test LAMA ikut teriak:
    assertion `"capabilities: per-tool toggle groups"` mengunci perilaku
    yang persis sedang dihapus, dan release berhenti. → Sebelum melepas
    fitur, grep smoke test (+ suite lain) untuk string marker fitur itu
    (`disabledTools`, `oa-tool-groups`, dst.) dan balik assertion-nya ke
    realita baru DI COMMIT YANG SAMA — jangan treat "test merah setelah
    penghapusan" sebagai kejutan.

21. **Satu kartu ask_user = satu pertanyaan** (2026-07-30) — kartu
    multi-pertanyaan yang di-skip SEBAGIAN menghapus SEMUA jawaban yang sudah
    diisi (owner menjawab Q1, me-skip Q2, sistem mencatat semuanya kosong).
    → Jangan gabungkan pertanyaan independen dalam satu kartu; tanya satu
    per satu, dan desain pertanyaan agar "lewati" tidak menghukum jawaban
    yang sudah diberikan.

22. **Klik inspeksi tak boleh membawa efek aktivasi** (2026-07-30) — baris
    provider Settings diklik hanya untuk MELIHAT setelannya, tapi handler-nya
    menulis `activeProviderId` + persist: chat menampilkan LM Studio sementara
    request diam-diam ke Ollama (11434). Gejala salah-kirim-provider hampir tak
    mungkin didiagnosis user. → Aksi destruktif/pemindah-state (aktivasi, hapus,
    pindah) wajib lewat kontrol eksplisit ("Set active"), bukan menumpang di klik
    inspeksi. Guard: marker smoke pada `renderRow` (tak boleh ada
    `s.activeProviderId = p.id;`) + probe F11 di settings harness
    (klik-lihat ≠ aktif; tombol aktif = aktif).

23. **State milik satu entitas jangan disimpan di laci global** (2026-07-30) —
    katalog model disimpan sebagai SATU list `favoriteModels` membuat "Test &
    fetch" pada provider NON-aktif menimpa katalog provider aktif DAN mereset
    model chat (kelas jebakan lesson 22 satu level di bawah; owner: "provider
    lain tidak bisa dipakai"). Source resmi Hermes Desktop: katalog hidup PER
    endpoint (`providers[].models`), validate hanya prefill saat kosong,
    heal hanya pada katalog non-kosong (manualPickRemoved), fallback tiap
    baris pakai katalog provider barisnya. → Katalog pindah ke
    `ProviderConfig.models`; test menulis provider yang dilihat saja; heal
    model hanya saat provider itu aktif; "Set active" menjaga pasangan
    (provider, model) tetap valid; migrasi legacy sekali, tak pernah menimpa
    data. Guard: blok smoke "model catalogs" (tanpa `favoriteModels` di
    settingsTab/ChatApp) + suite test/model-catalog.test.cjs + probe F12
    (activate heal · katalog kosong tak meng-clobber · fallback per-baris).

24. **Typings `^` melayang ke latest — "compile hijau" ≠ "jalan di
    minAppVersion"** (2026-07-31) — devDependency `obsidian: ^1.5.7` memasang
    **1.13.1** (range 1.x float), jadi tsc tidak pernah membuktikan janji
    `minAppVersion: 1.5.0`. `FileManager#trashFile` (baru ada di typings
    1.6.6; 1.5.7 belum punya) menyusup ke skills.ts + main.ts — crash senyap
    `trashFile is not a function` di app lama, hanya saat hapus skill /
    reset-everything. Fakta pendamping: CHANGELOG resmi
    obsidianmd/obsidian-api **berhenti di v1.7.2** — sumber kebenaran API
    modern = npm registry (raw) + obsidian.d.ts + kompiler, bukan changelog.
    → Klaim kompat versi lama wajib **uji compile silang terhadap typings
    versi minimum** (`npm pack obsidian@1.5.7` — 1.5.x pertama yang
    dipublish; swap ke node_modules, `tsc --noEmit`, restore) —
    prosedur lengkap di [obsidian-api-audit-2026-07-31](audits/obsidian-api-audit-2026-07-31.md). API yang
    lebih baru dari minAppVersion dipanggil via **feature-detect shim**
    (`src/agent/vaultCompat.ts`, pola resmi `setInstant`: cek fungsi ada
    sebelum dipanggil). Guard: smoke "v0.1.18 API compat" — tak boleh ada
    `fileManager.trashFile` langsung di luar shim.

> Aturan update: setiap pelajaran baru ditambahkan ke daftar ini bersama
> guard-nya, di commit yang sama dengan fix-nya.

25. **Budget probe harness harus muat payload kalengan (2026-07-31, skenario
    `branch`):** proyeksi `wire` di-mock di-`slice(0,400)` — padahal reply
    kalengan ~800 char, jadi string target di pesan ketiga tidak pernah masuk
    window dan assertion gagal walau perilaku aplikasi benar. Aturan: kalau
    assertion harness gagal tapi payload menunjukkan semua perilaku lain
    benar, cek DULU batas potong/kuota proyeksi mock sebelum utak-atik kode
    aplikasi. Guard: skenario branch dengan wire 2500-char menyaksikan
    stabilitas induk + pertumbuhan anak; selalu hitung budget ≥ (jumlah
    pesan × panjang kalengan).

26. **Skrip replace python: satu penulisan per file, atau verifikasi segera
    (2026-07-31, chips PromptInput):** satu heredoc berisi BANYAK penggantian
    untuk dua file dengan `open(p,'w')` di akhir — assert di tengah membunuh
    skrip, SEMUA penggantian file itu hilang (chipResolver tak pernah
    terpasang → composer "diam total" tanpa satu pun error). Gejalanya
    mematikan secara sunyi: DOM menerima teks, state kosong. Aturan: setiap
    skrip edit — tulis per file SETIAP kali selesai menggantinya (jangan
    menumpuk), dan langsung `grep` membuktikan pola target ada.
    Guard: skenario chips menegakkan rantai penuh type→chip→submit→wire.
27. **Filter grep bisa menelan bukti + textContent mencakup `<script>`
    (2026-08-01, steer harness):** dua jebakan pengukuran dalam satu
    skenario. (a) Pesan gagal `steer check failed: {"stashNotice":…}`
    HILANG dari pipa karena `grep -viE "…|notice|…"` — huruf-i membuat
    "Notice" di nama kunci JSON ikut terfilter; pipeline juga menyembunyikan
    exit code perintah pertama (yang terbaca = exit tail). Aturan: output
    harness selalu ke file (`> /tmp/x.log 2>&1`), baca file-nya. (b)
    `document.body.textContent` memuat SUMBER bundle `<script>` — setiap
    literal kode ("OUT-OF-BAND…", "Steer queued…") positif-palsu.
    Aturan: semua asersi teks DOM di-scope ke `#root`, dan kartu yang
    ter-tutup (disclosure) dibuka dengan klik sungguhan sebelum menegakkan
    isinya — sama seperti pengguna.
    Guard: skenario steer menegakkan rantai stash→marker di wire→catatan
    ter-render→idle jadi pesan biasa, semua terukur di #root.
28. **resolveAuxTask = provider DAN model — keduanya wajib naik
    (2026-08-01, ditemukan saat studi web_extract):** tiga situs aux
    (compression/titleGeneration/goalJudge) memanggil chatCompletion
    dengan `provider` hasil pin tapi `settings` mentah — padahal model
    dikirim dari `settings.model`, jadi pin model TIDAK PERNAH terpakai
    (provider benar, model main). Jebakannya sunyi: provider pin tampak
    bekerja, baris settings tampak hidup. Aturan: memanggil aux SELALU
    `{ ...settings, model: pair.model }`, dan guard harus membuktikan di
    wire (harness goal kini men-pin goalJudge ke model berbeda satu
    provider — request juri wajib membawa id model pin, bukan main).
    Guard: `judgeModelOk` di skenario goal + smoke hitung tiga override.
29. **Irisan bukti harus dihitung dari UKURAN artefak, bukan tebakan
    (2026-08-01, skenario webe):** dua jebakan pengukuran beruntun. (a)
    Footer web_extract (~400 char: marker tengah + blok "Showing ..." +
    pointer read_note) tidak pernah masuk `slice(-300)` — assertion
    footer gagal walau footer benar-benar ada; window head/tail JUGA tak
    bisa memuat marker tengah yang memang duduk di ~11.2k (marker itu
    dibuktikan lewat baris hitung footer, bukan irisan mentah). Aturan:
    sebelum menulis assertion pada teks panjang, hitung dulu panjang
    artefak target dan posisinya; assertion menyaksikan hal yang memang
    TERJANGKAU irisan itu. (b) Fallback FNV-1a (dipakai saat
    `crypto.subtle` tiada, mis. about:blank) pertama kali menghasilkan
    8 hex, bukan 10 — regex anchor `-[0-9a-f]{10}\.md` tak pernah
    cocok dan nama file store tak terverifikasi. Aturan: path fallback
    wajib punya test bentuk-persis (panjang + alphabet) di unit suite,
    bukan cuma "ada output".
    Guard: skenario webe menyaksikan footer lengkap via irisan -600 +
    baris hitung + pointer read_note + summarizeModelOk; unit test
    mengunci digest 10-hex di KEDUA jalur (subtle + fallback).
30. **Komponen Obsidian ≠ nilai balik addX, dan toggle di-klik di
    kontainer (2026-08-01, section MoA):** dua jebakan Obsidian-DOM dalam
    satu section. (a) `Setting.addButton(cb)` mengembalikan SETTING, bukan
    ButtonComponent — `const del = ctl.addButton(...); del.setDisabled()`
    melempar `setDisabled is not a function` dan membunuh SISA render
    section (semua baris setelahnya hilang tanpa ada yang teriak selain
    pageerror). Aturan: tangkap komponen DI DALAM callback
    (`let btn; ctl.addButton(b => { btn = b; ... })`). (b) Klik sintetik
    pada `<input>` di dalam ToggleComponent tidak menggerakkan state
    komponen — handler-nya menempel di `.checkbox-container`. Aturan
    harness: klik toggle Obsidian = klik `.checkbox-container` (baca state
    boleh dari input). Bonus (c), preseden lama terkonfirmasi: tombol di
    bawah lipatan gagal `getByRole(...).click()` ("outside of the
    viewport") — klik via `page.evaluate(el.click())` seperti F15.
    Guard: probe F17 menegakkan rantai seed→hint→persist→toggle→
    prefill→tolak-keras di tab Model.
31. **Karakter kontrol mentah di sumber TS: tak terlihat, mematahkan anchor,
    dan aktif di runtime (2026-08-01, mesin MoA):** transport teks bisa
    mengirim karakter U+0000–U+001F mentah ke dalam file — tampil sebagai
    SPASI di editor/grep (pemisah signature `\u001d` di moaLoop.ts tampak
    seperti `join(" ")`). Akibat beruntun: anchor string tak pernah cocok
    (assert gagal dengan teks yang "sama persis"), dan separator runtime
    jadi byte yang salah. Jebakan ini BUKAN baru: guard yang langsung
    dipasang menemukan satu laten lama (`\x1f` pemisah dedupe fallback di
    settings.ts — sudah berfungsi benar, tak pernah terlihat). Aturan:
    (a) separator/hash-key SELALU escape-text (`"\\u001d"`), jangan pernah
    karakter mentah; (b) kalau anchor gagal padahal teks tampak identik,
    od/hexdump baris itu SEBELUM mengutak-atik logika; (c) verifikasi
    bukti irisan dari ukuran artefak (kelas lesson 25/29). Satu preseden
    cadence ikut tercatat: official me-hash FULL advisory view untuk
    every_n (hanya user_turn yang prefix) — meniru bentuk user_turn ke
    every_n membuatnya klon user_turn yang tak pernah re-run.
    Guard: blok smoke lesson-31 — SATU karakter U+0000–U+001F (minus
    \\t \\n \\r) di src/**/*.ts(x) menggagalkan release.
32. **Anchor edit-script harus BYTE-EXACT dari file, bukan rekonstruksi
    ingatan (2026-08-01, /moa v0.1.31):** dua anchor python berturut
    gagal — blok `finally` di runAgent diasumsikan indentasi 3-tab padahal
    2-tab+isi (runAgent ada di dalam callback bersarang), dan
    `plugin.onunload();\\tif (failed > 0) {` di smoke.test.cjs ternyata
    SATU baris (statemen dipisah tab), bukan dua. Assert count==1 menangkap
    keduanya sebelum file rusak, tapi siklus terbuang. Aturan: sebelum
    menulis anchor multi-baris, `sed -n`/`cat -A` region target dan SALIN
    byte-nya apa adanya — jangan pernah mengetik ulang anchor dari tampilan
    terminal (tab vs spasi dan join satu baris tak terlihat mata).
33. **Patch-on-patch dalam try/catch bersarang merusak struktur — tulis
    ulang SELURUH callback; dan ekspektasi port-test dicek ke SOURCE
    sebelum menyalahkan kode (2026-08-01, model menu v0.1.32):** (a)
    menambal handler di dalam try{} bersarang meninggalkan blok yatim +
    catch stray; solusinya menulis ulang callback utuh, bukan tumpukan
    tambalan. (b) DUA kegagalan unit-test port dari official
    (prettify gemini; sentinel re-enable) dan SATU kegagalan harness
    (pill "Claude Opus 4.8") ternyata EKSPEKTASI karangan — kait lib↔DOM
    sudah benar; source resmi justru membuktikan `"Opus 4.8"` (prefix
    `claude-` memang dibuang) dan re-enable pasca-sentinel menyimpan
    HANYA family itu untuk provider tsb. Aturan: kalau port-test gagal,
    bandingkan ekspektasi ke source official DULU — baru curigai kode;
    guard-nya adalah test yang sudah dikoreksi. (c) Mutasi objek settings
    dari aksi menu (collapse, visibility, pick MoA) TIDAK me-render ulang
    — persist ≠ re-render; perlu `useReducer` bump eksplisit (ditemukan
    lewat harness: tombol collapse tampak mati).
34. **Gerbang "provider tersambung" pakai `providerUsable()`, bukan
    `p.enabled`:** semua PROVIDER_PRESET lahir `enabled: false` dan tidak
    ada kode yang membaliknya — gerbang `p.enabled` = NOL target untuk
    vault nyata (Refresh Models pun salah masuk ke settings; sim lolos
    karena seed sengaja `enabled: true`). Predikat kanonik proyek =
    `providerUsable(p)` (baseUrl + key, atau lokal tanpa kunci
    {lmstudio, ollama, custom}) — dipakai konsisten di pick dropdown,
    fallback chain, dan Refresh Models. Tambahan: aksi dari DALAM menu
    tidak pernah navigasi (jangan `openSettings()` dari Refresh) — resmi
    tidak pernah pindah layar; error per provider cukup dinamai di
    Notice. Gejala lingkungan nyata dijaga dengan spy di sim (counter
    `__oaSettingsOpened`; lesson 33 untuk ekspektasi rekayasa vs source).
    Dan untuk kontrol UI, ikuti komponen SETTING bawaan aplikasi
    (toggle `.checkbox-container` vars `--toggle-s-*`), bukan bentuk
    hasil rekaan sendiri.
35. **Kalau aplikasi sudah punya komponen-nya, REUSE — jangan tiru bentuk
    dengan CSS baru:** tema yang meng-override `.checkbox-container` tidak
    akan menyentuh kelas buatan (switch dialog tetap tampil default →
    dilaporkan "ngak selaras"). Render markup app persis (span
    checkbox-container + is-enabled + input tersembunyi). Dan cek layout
    resmi SEBELUM pakai pola grid sendiri: item footer dropdown resmi
    menumpuk vertikal — dua kolom horizontal adalah penyimpangan yang
    terlihat.
36. **Hover jangan re-hue kalau kontras foreground-nya di-tune untuk
    rest-state:** hover send pakai `--interactive-accent-hover` (dark theme =
    accent-1, lightness ×1.15) sementara ikon oklch dihitung dari
    `--interactive-accent` — ikon putih di atas lavender pucat = tombol
    "kehilangan aksen" persis laporan owner (bukti: screenshot harness
    dark+light state hover). Pola send kanonik dari source resmi
    (`app/chat/composer/controls.tsx`: `bg-foreground … hover:bg-foreground/90`;
    ChatGPT juga) = hover MEMPERTAHANKAN identitas: fill sama + redup tipis.
    `filter: brightness(0.92)` men-skala bg+ikon bersama sehingga kontras
    terjaga untuk accent/tema apa pun, tanpa var baru. Verifikasi visual wajib
    mencakup state HOVER di dark DAN light, bukan cuma rest. Jebakan sampingan:
    guard smoke yang menolak substring (`!includes("--x-hover")`) ikut memakan
    NAMA var di dalam komentar CSS — tolak pola DEKLARASI
    (`/background:\s*var\(--x-hover\)/`), bukan teks bebas.
37. **Reset generik `button:hover` milik SENDIRI bisa men-strip tombol kustom
    yang specificity-nya lebih rendah:** rule reset
    `.oa-app button:hover { background-color: transparent }` (0,2,1) diam-diam
    mengalahkan base tombol aksen single-class (0,2,0) — Send disabled pas
    hover jadi TRANSPARAN (laporan owner "masih sama saat textarea kosong"),
    dan versi enabled-nya ikut ter-strip pas :focus/:active. Anti-jebakannya:
    (a) tombol yang warnanya matter pakai selector double-class (0,3,0+);
    (b) muka disabled kontrol primer = versi official: netral translusen
    fg/30 + ikon knock-out + opacity 1 + pointer-events: none (Hermes
    `disabled:bg-foreground/30 disabled:text-background disabled:opacity-100`)
    — JANGAN opacity-.35 di atas warna aksen (terlihat pudar, dibaca "aksen
    hilang"); (c) probe harness harus menyentuh kontrol DALAM STATE disabled
    juga — state yang paling jarang diuji justru asal laporan. Echo (a): rule
    app-wide pakai `:where()` kalau niatnya fallback (0 specificity).
38. **Kecolongan lesson 36 PERSIS di penulisan guard berikutnya:** guard
    negatif baru `!msg.includes("MessageAvatar")` langsung gagal karena
    komentar header di file yang sama (sah-sah saja) menyebut nama
    komponen yang dipensiunkan. Aturan keras mulai sekarang: SETIAP
    assertion negatif pada string identifier (nama komponen/var/kelas)
    ditulis SEBAGAI pola deklarasi sejak draft pertama —
    `/export function X|<X|var\(--x/` — bukan diselamatkan belakangan.
    Positif-assertion (`includes(...)`) aman dari jebakan ini; negatif
    tidak pernah aman.
39. **Dua slot teks untuk satu informasi = duplikat Visual di layar:**
    trigger reasoning merender title "Thought" + meta "Thought for Ns"
    sekaligus → "Thought Thought for Ns" (laporan owner). Contoh
    perilaku resmi justru perkataannya ada di i18n (`en.ts`:
    `thought` / `thoughtBriefly` / `thoughtFor(durasi)`) DAN state-machine
    penentu labelnya di file render (`message-parts.tsx`: no duration →
    thought, <1s → briefly, else for Ns). Pelajaran: (a) MULAI pencarian
    parity dari file i18n resmi — daftar label + variannya nampak utuh di
    sana; (b) kalau komponen punya slot label+meta, jangan pernah
    menaruh frasa yang menamai konsep SAMA di dua slot sekaligus;
    (c) salin state-machine label resmi mentah, bukan menebak bentuk.

40. **Regex ber-anchor `^[ \t]*` menelan indentasi ke dalam token — uji
    nilai token secara literal, jangan cuma tipenya:** tokenizer mini
    (v0.1.43): rule yaml `^[ \t]*KEY(?=:)` dan md `^[ \t]*#{1,6}…`
    menjadikan spasi indent bagian token (`"  days"`, bukan `"days"`) —
    tak terlihat di UI (warna tanpa background) tapi secara semantik
    token "kotor" dan bisa bocor ke fitur lanjutan (copy-token, dump).
    Yang menangkap bukan mata, melainkan assertion `t.v === "days"` di
    unit test. Pelajaran: (a) untuk tokenizer/highlighter, assert TEKS
    token persis (literal / regex jangkar penuh), tipe saja tidak cukup;
    (b) strip indent di dalam tokenize untuk rule yang diawali `^`
    (deteksi `src.startsWith("^")` — jangan string-sniff pola lain);
    (c) jalankan unit test modul murni DULU sebelum integrasi UI —
    4 kegagalan (py dot-call hilang, indent token, sampel sh tanpa
    variabel telanjang) tertangkap di tahap itu, nol lolos ke pipeline.
41. **`window.getSelection().toString()` kosong untuk range programatik di
    Chromium headless/tak-fokus — baca `Range#toString()` sebagai
    gantinya:** bar seleksi (v0.1.44) tak pernah muncul di harness walau
    `isCollapsed=false`, endpoint valid, rect non-zero — penyebabnya
    `Selection.toString() === ""` untuk range buatan program (selChange
    TETAP fired, jadi tak ada error apa pun yang terlihat). Probe DOM murni
    (dbg-sel, recompute direplay per-cabang) menemukannya dalam satu lari.
    Pelajaran: (a) untuk teks seleksi selalu pakai
    `sel.getRangeAt(0).toString()` — DOM-murni, kebal fokus; (b) overlay
    yang berjangkar ke konten butuh guard viewport (`rect.bottom < 0 ||
    rect.top > innerHeight → hide`) — chat autoscroll menempatkan baris
    terpilih 366px DI ATAS viewport, bar untuk highlight tak-terlihat =
    noise; (c) ini kemenangan honesty-check: `[sel]` check GAGAL dengan
    bukti JSON sebelum ada klaim pixel — fallback statis release justru
    yang memberi tahu; jangan "perbaiki" dengan mengendurkan check,
    perbaiki penyebabnya (2 patch kecil, hijau penuh).
42. **Seleksi programatik ≠ gestur nyata; dan Obsidian `body{user-select:none}`
    membungkam area apa pun yang tidak opt-in:** laporan owner "selection
    gak bisa di chat ui" — padahal skenario sel hijau penuh. Akar (dibuktikan
    drag-lane probe: seleksi kosong, computed userSelect none sampai body):
    app.css resmi menyetel `body{user-select:none}` lalu opt-in hanya untuk
    reading view (`.markdown-preview-view{user-select:text}`) dan
    `[contenteditable]` — bubble chat kita di luar keduanya, jadi drag
    mouse asli memang mati di aplikasi beneran; driver `addRange` programatik
    TIDAK PERNAH mengeksekusi jalur gestur. Pelajaran: (a) untuk fitur
    gestur (seleksi/drag/scroll), harness WAJIB punya jalur gestur asli
    (page.mouse.down/move/up) di samping jalur programatik — kini permanen
    sebagai "real-drag lane" di build.mjs; (b) konten baca di UI kustom
    Obsidian harus opt-in `user-select:text` secara ter-scoped (`.oa-app
    .oa-msg-content`), jangan menyentuh chrome; (c) saat fix gagal tervalidasi
    karena guard, curigai SUTRADARANYA juga — pengeditan untuk build.mjs
    tertinggal di memori karena dua file diedit dalam satu script tanpa
    write-per-file (pelanggaran lesson 26; ditangkap oleh smoke guard baru
    itu sendiri — guard yang menolak draft-setengah-jadi adalah fitur).
43. **Copy shell harness SECARA VERBATIM — satu blok <style> yang hilang
    membuat seluruh geometri kolaps tanpa error apa pun:** debug v0.1.46
    buntu 4 ronde (drag gagal, clientHeight 0, scrollTop valid, strong di
    y≈31). Akarnya: template dbg hasil salin-tangan MENGHILANGKAN blok
    `#root{height:100%}` dari shell() build.mjs → #sim-frame tanpa tinggi
    → kolom chat menekan jadi clientHeight 0 → semua koordinat bohong
    (topbar+composer+footer tetap tampak NORMAL, jadi tidak dicurigai).
    Gejalanya tipikal: screenshot tampak benar, probe geometri tidak
    masuk akal. Aturan baru: (a) skrip dbg WAJIB menyalin shell() dari
    build.mjs utuh-utuh (termasuk style block + FRAME_HEIGHT), idealnya
    diekstrak ke helper bersama; (b) probe koreksi cepat bila geometri
    aneh: `scroller.clientHeight === 0` = shell salah, STOP sebelum
    menuduh fitur; (c) pengulangan tercatat: guard title= palsu-positif
    dari literal di komentar + negatif `Copied" : "Copy"` menggigit
    aria-label baru — kelas lesson 38 kambuh DUA KALI dalam satu kapal
    (komentar bukan ruang bebas untuk string pola; negatif assertion
    harus menunjuk bentuk-lama yang unik, bukan substring).
44. **Selector kelas-tunggal pada <button> di wilayah `.oa-app` AKAN kalah
    dari reset `.oa-app button{}` — ukur geometri, jangan percaya mata:**
    owner mengukur toolbar hasil v0.1.46 sebesar 34,6×19,6px (dengan koma
    desimal — devtools, bukan tebakan). CSS-nya "benar" (width/height 26px)
    tapi kelas tunggal `.oa-selbar-btn` (0,1,0) kalah spesifisitas dari
    reset `.oa-app button{width:auto;height:auto}` (0,1,1) yang berdiri
    di awal file — urutan file TIDAK menyelamatkan. Ini PENGULANGAN
    persis kelas jebakan send-button v0.1.38 (waktu itu hover; sekarang
    geometri) dan screenshot bukti tangkapan mataku sendiri ikut tertipu
    (kotak 20px "tampak" seperti 26px di crop). Aturan permanen: (a)
    setiap gaya <button> baru di .oa-app ditulis ber-scope ganda
    (`.oa-app .oa-x`) sejak draft pertama; (b) fitur UI dengan ukuran
    PERSIS harus punya metric harness (getBoundingClientRect di driver,
    assert angka di build.mjs — kini btnW/btnH ≥ 26 di jalur sel);
    (c) mata manusia tidak bisa membedakan 20px vs 26px di tangkapan
    layar — angka terukur mengalahkan "kelihatan benar".
45. **Mock yang "lembut" menelan kekurangan: ikon tak dikenal di shim = SVG
    kosong tanpa suara, dan bisa bertahan berbulan-bulan:** banner v0.1.49
    tampak "judul + X" — thumb tak terlihat. ThumbsUp/Down memang sah di
    aplikasi (Icon merender lewat setIcon Obsidian), tetapi SHIM sim
    memiliki PETA ikon sendiri dan nama tak dikenal jatuh ke `body ?? ""`
    — tombol 32×32 tak kasat mata di sim, hijau di semua check DOM.
    Pelajaran: (a) shim jangan pernah diam — unknown name sekarang
    `console.warn` keras; panggilan pertamanya LANGSUNG mengekspos tiga
    gap lama lain (`arrow-up` scroll-button, `text-cursor-input`,
    `quote`) yang diam-diam kosong di sim; (b) untuk permukaan yang
    memakai ikon, lane harness memastikan svg BENAR-BENAR tergambar
    (`svg path` ada), bukan sekadar tombol ada; (c) path dimasukkan
    verbatim dari upstream lucide @main (curl-verified), bukan ingatan
    — divergensi path = divergensi visual; (d) koreksi cepat saat peta
    shim ragu: audit nama terpakai (grep `make("…")` + `setIcon`) vs peta,
    satu node -e, bukan menebak.
46. **Komentar "riwayat" ikut memuat string yang baru saja dipensiunkan**
    (v0.1.50): grep/negative-assert membaca FILE, bukan niat — komentar
    yang mengutip literal pensiunan (`"Data & danger zone"` di komentar
    settingsTab) langsung menjegal guard `!includes()` yang baru dipasang.
    Prosedur: setiap kali menambah negative-assert pada string literal,
    grep dulu string itu ke SELURUH file target SETELAH semua edit final,
    termasuk komentar/dokumen yang kutulis sendiri di commit yang sama —
    lalu baru jalankan pipeline (ketangkap pra-run kali ini; pelajaran
    keluarga 26/33/38, bentuk baru: sumber polusinya komentar sendiri).
47. **Dua kepala lubang gerbang (v0.1.54→0.1.55, ketangkap LANGSUNG oleh
    harness sendiri):** (a) lane dirancang di atas mock yang LEBIH LEMBUT
    dari kenyataan — sim menukar `assembleSystemPrompt` dengan placeholder
    19 karakter, jadi fitur yang mengubah prompt MUSTAHIL terverifikasi di
    wire lane (lajur merah bukan karena produk rusak, tapi karena harness
    berbohong halus — keluarga lesson 45). (b) Kegagalan lane tidak
    menghentikan rilis: build.mjs exit≠0 → build-preview `return null` →
    frames basi/0 tetap "ZIP SYNCED" hijau. Prosedur: setiap lane baru
    WAJIB (1) membuktikan mock-nya mengembalikan bentuk data yang sama
    dengan produk (ukuran/bentuk, bukan placeholder), dan (2) memverifikasi
    bahwa kegagalan lane benar-benar menghentikan pipeline — bukan diam-diam
    terdegradasi. Dan bila rilis "hijau" tapi satu baris log berteriak
    gagal, PERCAYA LOG, perbaiki dulu baru komit — jangan komit dulu.
48. **Kejujuran sim harus LENGKAP per metode, bukan per fitur (v0.1.56):**
    menambahkan `getAbstractFileByPath`+`create` jujur ke mock vault
    MENGGESER cabang kode produksi — `storeFullPage` (web_extract) pindah
    dari cabang `create` ke cabang `modify` begitu cache note "ada", dan
    mock tanpa `modify` melempar TypeError di dalam try; `storedPath` jadi
    null dan footer "(Summarized — full text saved to: …)" hilang diam-diam.
    Gejala terlihat satu lane jauh dari fitur yang diubah (kartu
    changed-files → lane webe merah). Prosedur: saat menambah kejujuran pada
    satu metode singleton (vault/workspace), audit SEMUA pemanggil metode
    tetangganya di src/ (`grep -n "\.modify(\|\.create(\|\.append(" src/agent/`)
    dan lengkapi mock-nya SEKALIGUS — cabang ternodai-silently adalah
    jebakan klasik keluarga lesson 45/47; gate wire menangkapnya, tapi
    menemukannya via dbg dulu jauh lebih murah.
49. **Sweep argumen lewat penyisipan = RANGKAP DUA JEBAKAN byte (v0.1.57,
    ketangkap tsc detik itu juga):** menandai ~15 pemanggil
    `pushLocalNoticeTurn` dengan argumen varian gagal dua kali berturut —
    (a) rekonstruksi `stmt[:-2] + suffix` MEMAKAN tanda kutip penutup
    string (off-by-two → ratusan error sintaks mengalir dari baris
    pertama); (b) loop `expect=2` menandai statement YANG SAMA dua kali
    karena jarum prefix tetap cocok setelah disisipi. Aturan final:
    sisipkan DI ANTARA byte terminator (`k+1 == ")"`, `k+2 == ";"`,
    keduanya di-assert), JANGAN potong+bangun ulang; dan setelah menyisip,
    geser kursor pencarian MELEWATI statement yang baru ditandai. Bonus
    keluarga 47: rilis hijau dengan `[warning] unknown lucide icon` tetap
    wajib diperbaiki sebelum komit — shim ICONS diisi path ASLI
    curl-verified, lalu buktikan `grep -c "unknown lucide" == 0`.
50. **Flag `dangerous` adalah SAKLAR perilaku seluruh harness (v0.1.58):**
    memberi tag `dangerous: true` pada write_note/edit_note (lubang tagging
    — tulis mendarat senyap di mode cautious bawaan) LANGSUNG mengubah
    gerbang approval di SEMUA lane yang memakai tool itu. Prosedur wajib:
    (1) `grep` SEMUA canned writer di chat-entry SEBELUM membalik flag
    (fcard akan pending selamanya tanpa pin `simSettings.approvalMode = "yolo"`
    — dan pin itu sekaligus menjadikan lane tersebut bukti regresi bypass
    yolo); (2) matematika preview TIDAK BOLEH logika paralel — satu planner
    murni (`writePreview.planWrite/planEdit`) dipakai tool DAN kartu
    approval, dengan string error byte-identical yang dipin unit test;
    (3) status hijau lane lama SETELAH flag dibalik adalah bukti bypass,
    bukan kebetulan — baca kembali artinya sebelum komit.
51. **Penganalisis buatan sendiri BISA BERBOHONG OPTIMIS — verifikasi
    silang sebelum operasi destruktif (v0.1.60, ketangkap lane komposer
    26×26):** parser cascade pass-1 menjawab "0 blok aman dihapus" (benar),
    pass-2 "moves 0 / 22 keluarga bersih" (SALAH — diam-diam melewatkan
    selector multi-baris dan keluarga berblok >2, sehingga blok PEMEGANG
    spesifikasi efektif ikut terhapus). Gejala seharusnya terlihat dari
    kontradiksi internal (blok 3 baris "menaungi" blok 9 properti).
    Aturan: (a) sebelum `delete` massal berbasis analisis, tulis assert
    SANITY di parser-nya (setiap keluarga dicetak dengan rentang baris +
    jumlah properti; cacah manual 2-3 sampel); (b) bila dua pass
    berbeda kesimpulan, YANG BENAR adalah yang bisa menunjukkan bukti
    per-butir; (c) operasi destruktif dikembalikan penuh (checkout)
    sebelum mencoba pendekatan baru — jangan patch di atas kesalahan;
    (d) hutang yang terbukti hidup dibekukan lewat whitelist di guard,
    bukan dipaksakan mati.
52. Merge konsolidasi = meniru cascade, bukan menyalin properti.
    Jebakan (terbukti empiris saat konsolidasi .oa-hub-chip-x, v0.1.61):
    properti unik blok atas (font-weight:600) ternyata SUDAH mati karena
    shorthand di blok bawah (font: inherit, posisi lebih akhir). Bila
    blok gabungan menaruh font-weight DI BAWAH font:inherit, tombol diam-
    diam jadi bold = behavior change. Aturan: (a) urutan properti di blok
    gabungan meniru urutan cascade lintas-blok — warisan blok atas berdiri
    sebelum deklarasi blok bawah; (b) bukti wajib sebelum commit: diff
    getComputedStyle (base + hover + canary keluarga lain) identik DAN
    screenshot lane yang relevan byte-identical; (c) jebakan dipaku di
    guard smoke baru (order assert), bukan cuma di komentar.
53. Mutasi berantai satu bash = verifikasi per langkah, jangan telanjur.
    Jebakan (v0.1.62): heredoc python pertama gagal parse karena apostrof
    di teks komentar, tapi heredoc berikutnya TETAP jalan — smoke/versi
    sudah menuntut "1 rule gabungan" sementara CSS masih punya 2 blok.
    Kedua: anchor follower ditebak (.oa-text-shimmer menempel) padahal ada
    baris kosong + banner komentar di antaranya. Aturan: (a) satu mutasi
    file per pemanggilan python, assert -> write -> grep-verify sebelum
    mutasi berikut; (b) anchor "baris setelah blok" JANGAN dianggap —
    sed/cat -A dulu; (c) komentar CSS/kode tanpa apostrof mentah di
    heredoc, atau pakai pembatas kutip yang kebal; (d) PNG flaky harness
    (scrollbar gutter x~tepi / pita chip) dibedakan dari regresi lewat
    forensic bbox + kehadiran elemen target di DOM, bukan panik.
54. Probe state animasi + nomor baris basi = artefak, bukan regresi.
    Jebakan (v0.1.63): (a) open-chevron rotate(180deg) diukur 120ms setelah
    klik padahal transition 150ms — matrix mid-flight berbeda antar run,
    seolah CSS berubah; aturan: tunggu probe HARUS melebihi durasi
    transition/animasi (atau ukur endpoint paksa). (b) nomor baris blok hasil
    grep sesi sebelumnya sudah geser setelah merge keluarga lain — selalu
    re-grep segar sebelum anchor edit; (c) noise PNG khas ketiga:
    anti-aliasing sudut rounded komposer (puluhan piksel abu, delta <=5,
    di pojok elemen) — bedakan dari regresi lewat jumlah piksel + pola
    lokasi + warna, persis protokol lesson 53d.
55. Penyisipan "akhir method" = jangkar ke NAMA method berikutnya, bukan
    ke pola kurung tutup. Jebakan (v0.1.64, merge Sessions -> Chat): pola
    `\t\t}\n\t}` ternyata milik renderSnippetRows(list), bukan agent() —
    baris Setting tersisip di method salah (containerEl tak dikenal, tsc
    TS2663 menangkap). Aturan: (a) jangkar penempatan antar-method WAJIB
    menyertakan signature method tetangga (`\t}\n\n\tprivate namaMethod(`),
    jangan pasangan kurung tutup generik; (b) bila tsc berteriak setelah
    penyisipan, TARIK BALIK penuh bloknya lalu sisipkan ulang di jangkar
    yang benar — jangan tambal di tempat salah; (c) perubahan IA settings
    memicu pembaruan ganda: smoke IA guard + build-settings SECTIONS +
    hygiene shot basi, ketiganya dalam satu commit.
56. String literal di komentar ikut menghitung indexOf guard. Jebakan
    (v0.1.65): guard urutan "Save sessions < Approval mode" di
    agentSection gagal karena KOMEN baru di agent() memuat literal
    "Approval mode" 24 baris sebelum baris aslinya — indexOf menemukan
    komentar duluan. Aturan lanjutan lesson 46: (a) komentar JANGAN
    mengulang literal persis yang dipakai matcher guard (parafrase:
    "the approval row"); (b) guard urutan mah yang rapuh begini
    diverifikasi dengan membaca hasil slice-nya, bukan asumsi posisi.
57. Guard dup-parser membaca EKOR comma-group sebagai kejadian selector.
    Jebakan (v0.1.69): setelah grup dibongkar, rule baru multi-baris
    (ekor .oa-cron-note { / .oa-attach-toggle {) tercatat sebagai "dup"
    baru — debt set berubah dan guard menolak. Solusi: rule hasil bedah
    grup ditulis SATU BARIS (parser melewati baris yang ditutup }).
    Juga: lokasi "blockOf(sel)" selalu kejadian PERTAMA — kalau aturan
    baru mungkin mendahului yang lama, guard jangan pakai blok pertama;
    dan koreksi guard lintas-file (FROZEN, regex grup di guard lain)
    dikerjakan SETELAH styles.css final, bukan bersamaan.
58. Guard historis mem-pin LITERAL deklarasi + jangkar tanggal, bukan nama
    selector. Jebakan (v0.1.70): grep persiapan fold hanya menyapu nama
    selector + nilai width (270px/300px) — meleset, karena guard v0.1.34
    mem-pin "flex-direction: column" + "justify-content: flex-start" via
    slice dari jangkar tanggal ("2026-08-01 v0.1.34") hingga EOF; setelah
    fold, kedua literal pindah ke SEBELUM jangkar itu dan rilis merah.
    Aturan: sebelum memindah deklarasi CSS, sapu TIGA hal sekaligus di
    semua file test: (a) nama selector, (b) literal deklarasi yang
    dipindah, (c) jangkar tanggal/versi di komentar pangkal slice. Guard
    yang kena ditulis ulang menegaskan struktur baru (assert DI DALAM blok
    fold, bukan slice setelah header layer) + catatan tanggal. Bonus
    forensik: md5 PNG beda lintas environment-wipe = noise stream zlib
    semata — bukti visual yang sah = pixel-diff PIL (0 piksel beda) atau
    computed-style probe, keduanya stabil lintas environment.
59. Probe event-sintetik wajib hormat pada state React + latensi async.
    Jebakan (v0.1.72): probe IME gagal total berlapis tiga — (a) sinyal
    yang diukur keliru (render pesan pengguna, padahal bel yang jujur =
    composer TERKOSONG); (b) dispatch keydown tepat setelah insertText
    membaca closure handleSubmit yang STALE (state input belum flush —
    wajib await ~80ms dulu); (c) dua submit dirantai di satu halaman
    terpeleset ke semantik QUEUE (submit kedua bukan kirim biasa).
    Aturan: repro/proof memakai halaman FRESH per kasus, poll kondisi
    (bukan durasi), dan KONTROL positif (plain Enter HARUS mengirim)
    sebelum menyatakan bug terreproduksi.
60. Jalur onload baru → sapu mock Obsidian smoke DULU; klaim guard wajib
    dibuktikan grep penuh SEBELUM ditulis.
    Jebakan (v0.1.75, dua release merah beruntun): fitur editor-menu
    menyentuh `workspace.on` + `registerEvent` — permukaan Obsidian yang
    belum di-stub `obsidianMock`/mock workspace smoke, padahal konvensi
    harness = base-class method distub manual. Aturan: setiap permukaan
    Obsidian BARU yang disentuh onload (base method atau workspace API)
    → perbarui mock smoke DI COMMIT YANG SAMA. Kedua: guard berperingkat
    klaim arsitektur ("arm single-sourced") kugirim sebelum menghitung
    semua situs tulis — ternyata ada dua saudara lain (`/skills read|use`
    + reset `= null`); yang benar = rapikan REALITAS (ekstraksi
    `loadSkillIntoContextRef` sebagai satu-satunya penulis `[Skill: …`)
    sampai hitungan grep jadi 1, BUKAN melonggarkan guard. Bonus: path
    guard relatif ke test/ wajib ikut konvensi `real-preview/…` seperti
    guard lain (satu ENOENT percuma).
61. "Tambahkan tips di form" = permintaan FITUR — tips tanpa perilaku
    adalah UI bohong; dan anomali visual di shot harus di-root-cause,
    bukan di-crop.
    Insiden (v0.1.78): owner minta tips placeholder Copilot di modal
    command. Mengirim tips saja = mendokumentasikan fitur yang tidak
    ada; yang benar = implementasikan `{}`/`{[[]]}`/`{activeNote}`/
    `{#tags}` sungguhan, BARU tulis tipsnya. Kedua: shot pertama lane
    menunjukkan chip "Apple ×" tak terduga — bukan bug (chip attachNote
    asli, mock `getActiveFile` baruku menyalakannya), tapi pembuktiannya
    lewat instrumentasi lane (capture chip), BUKAN asumsi; dan selector
    chip terlalu lebar (`.oa-attach-chip` global ikut menangkap chip
    lampiran bubble terkirim) — scope-kan ke `.oa-prompt-input`. Ketiga:
    fitur baru + chip lama berinteraksi (`{activeNote}` + attachNote ON
    = catatan sama terkirim dua kali) — sapu interaksi dengan fitur
    existing SEBELUM release, bukan sesudah shot menyela.
62. Lane untuk TOOL baru: dua jebakan harness berurutan, keduanya
    keluarga terdokumentasi yang kutabrak ulang.
    Insiden (v0.1.80, dua putaran pipeline merah): (a) mock runner di
    chat-entry punya `getTools: () => []` — tiap skenario WAJIB
    whitelist `props.runner.getTools = () => ALL_TOOLS.filter(...)`
    (pola webe/fcard/preview); tanpa itu wire berbunyi "Unknown tool"
    persis lesson-47. (b) capture `__oaRequests` memotong content jadi
    head-200 + tail-600 — envelope lebih panjang dari 200 NEVER valid
    via `content`; kumpulkan dari `tail` dulu dan hanya terima string
    yang awal+akhirnya utuh. Aturan: menulis lane tool baru →
    whitelist + cek format capture wire DI COMMIT YANG SAMA.
63. Sisipan heredoc di chat-entry.tsx: verifikasi SINTAKS via esbuild
    sebelum menyebut smoke hijau — smoke hanya membaca entry sebagai
    TEKS (guard string), parse error baru ketahuan di tahap preview.
    Insiden (v0.1.81): satu replace memakan `__oaReady` milik driver
    token DAN menjatuhkan penutup `\t}` — "Unexpected else" baru
    muncul saat release. Aturan: setelah mengedit
    test/real-preview/chat-entry.tsx, jalankan esbuild bundle dry-run
    (atau langsung pipeline penuh) di loop interim, bukan smoke saja.
64. CM6: layout-READ (coordsAtPos/getBoundingClientRect) ilegal selama
    update, sama ilegalnya dengan dispatch-dari-dalam-update yang
    didokumentasikan Copilot. Insiden (v0.1.81): overlay.mount →
    updatePosition → coordsAtPos meledak dari dalam ViewPlugin.update.
    Obat: defer ke requestAnimationFrame (simpan anchor terakhir,
    cancel di destroy). Berlaku juga untuk efek samping pengukuran lain
    yang dipicu effect/docChanged.
65. Sebelum append CSS: GREP dulu literal terlarang guard hygiene
    (v0.1.59: `border-radius: 4px;`, `var(--radius-s)` tanpa fallback,
    warna pensiun) — radius pakai var bercadang (--radius-m, 8px dst).
    Insiden (v0.1.81): block .oa-quickask-ku sendiri menabrak guard
    yang kutahu ada; guard menangkap sebelum pipeline, tapi seharusnya
    tidak kutulis begitu dari awal. Keluarga lesson-46: cek guard yang
    melindungi file target SEBELUM menulis.
66. "Elemen hilang di shot" bisa dua penyakit berbeda — BEDAKAN
    sebelum menulis CSS: (a) jepit layout INTERNAL (flex shrink
    menelan tombol: periksa apakah label lain terpotong ellipsis; kalau
    tidak, bukan ini), (b) panel MELEWATI bingkai shot karena lebarnya
    diklamp ke viewport halaman, bukan ke editor. Insiden (v0.1.82):
    × panel 520px hilang di frame 430px — dugaan awal flex-shrink
    salah alamat; buktinya label model utuh tanpa ellipsis (keluarga
    lesson-61: anomali visual di-root-cause, bukan ditebak). Obat
    sesungguhnya = klamp ukuran+posisi panel ke rect editor
    (scrollDOM.getBoundingClientRect), parity Copilot
    contentLeft/Right — sekaligus asuransi pane sempit/sungguhan.
67. node_modules BISA HILANG MID-TURN (snapshot race antar-pesan):
    perintah yang 2 menit lalu hijau tiba-tiba MODULE_NOT_FOUND /
    `tsc` hilang → CEK `ls node_modules` DULU sebelum menyentuh kode.
    Insiden (v0.1.83): smoke yang barusan "All smoke checks passed"
    mendadak "Cannot find module '@codemirror/state'" — bukan regresi
    CSS-ku, tapi seluruh node_modules menguap; `npm install
    --no-audit --no-fund` (≈84 paket, @codemirror ada) menyembuhkan
    tanpa satu baris pun berubah. Aturan: anomali toolchain = curigai
    lingkungan dulu, kode belakangan.
68. Rule CSS komponen BERSAMA yang di-scope ke satu permukaan = bug diam
    di semua permukaan lain. Kontrak <Icon> (.oa-icon: "span memiliki
    ukuran, svg setIcon mengisi 100%") sifatnya context-independent,
    tapi dulu ditulis `.oa-app .oa-icon` → di panel quick ask (root
    .oa-quickask) span jadi inline polos (inline-style width/height
    DIABAIKAN elemen inline) dan glyph 24×24 asli lucide membesar +
    nangkring di baseline teks: send icon tidak di tengah, close button
    tidak square (v0.1.84). Obat: un-scope kelas privat milik sendiri
    (cuma kita yang merender .oa-icon — bocor ke plugin lain mustahil).
    Kunci regresi DUA lapis: (a) smoke string guard (unscoped ada,
    scoped lama hilang), (b) pengukuran GEOMETRI NYATA di lane
    real-preview — offsetWidth square, svg bounding == size prop
    (X=13/ArrowUp=16, bukan 24), drift tengah ≤1px. Bug visual WAJIB
    punya assertion geometri: string guard tidak menangkap kasus
    "rule pernah benar lalu ke-scope ulang", dan mata manusia lolos
    melihatnya 3 rilis berturut-turut (v0.1.81-83) di screenshot kecil.
69. Harness real-preview = PLAYWRIGHT, bukan puppeteer: API emulate
    media beda total. page.emulateMediaFeatures tidak ada; rute yang
    benar = CDP lewat page.context().newCDPSession(page). Dan CDP
    Emulation.setEmulatedMedia HANYA mendukung fitur prefers-* —
    pointer/hover di-senyapkan (di-ignore tanpa error). Cara kerja
    untuk @media (pointer:coarse): Emulation.setTouchEmulationEnabled
    {enabled:true} + Emulation.setDeviceMetricsOverride {...,mobile:true}
    lalu cek matchMedia("(pointer: coarse)"); SELALU sediakan fallback
    deterministik = uji struktural rule @media di CSSOM (selector +
    opacity), karena engine boleh menolak flip. Bersihkan override
    (clearDeviceMetricsOverride + touch disabled) setelahnya. Varian
    baru race busy-flush: setelah qaSend fase retry, swap tombol
    Stop↔Send mendarat ASYNC — geometri yang diukur langsung membaca
    ikon stop (svg 14px). Fix: tunggu input ENABLED dulu (loop),
    baru ukur. Tambahan: smoke guard yang mengunci literal harness
    harus dikunci ke implementasi NYATA yang lulus (setTouchEmulation-
    Enabled), bukan ke literal rute percobaan yang dibuang.
70. Assertion GEOMETRI lane harus sadar viewport harness: sim qask
    sengaja sempit (470px) sehingga panel default MENTOK di cap lebar —
    tes "grow/gerak bebas" gagal bukan karena bug tapi karena clamp
    bekerja. Pola yang benar: kecilkan dulu ke MIN (300×200) supaya ada
    ruang bebas, ukur delta eksak DI ruang bebas; uji clamp lewat
    batas hardcoded INDEPENDEN (innerWidth-m, angka MIN) — bukan dengan
    rumus kode itu sendiri. Pelajaran desain yang menyertainya: state
    geometri user (pos/size) WAJIB ditulis-balik hasil clamp-nya; kalau
    tidak, langkah keyboard berikutnya melanjut dari nilai mentah drag
    (di luar clamp) dan tombol panah tampak "macet". Sekali lagi
    kejadian guard literal tak cocok kode (userPos: vs this.userPos =)
    → disiplin lesson 69 berlaku untuk literal BARU sekalipun.
71. Menguji komponen bersama di lane: jangan menebak TEKS TAMPILAN
    komponen — pakai transform yang sama (import displayModelName) atau
    anchor RAW-ID yang memang diekspos komponen (menu item title=
    family.id). Pill mem-pretty-print id ("sim-model"→"Sim Model");
    assertion string mentah gagal semuanya walau komponen benar
    (menuOpens true, pick never fired). Pelajaran kedua: memberi CSS
    mirror untuk komponen .oa-app yang di-port ke .oa-quickask = salin
    NILAI WINNER komputasi (folded layers disatukan), bukan rangkaian
    layer-nya — dan saat komponen membuka dropdown ke atas, panel
    overflow:hidden HARUS dilepas (visible) atau dropdown ter-clip.
72. Menghapus fitur atas keputusan owner = AMENDEMEN guard lama + tambah
    ABSENCE guard (string/fitur yang dihapus diverifikasi HILANG, bukan
    cuma keberadaan yang baru) supaya fitur tak balik tanpa sadar lewat
    merge/refactor. Dan fitur yang melampaui referensi (waktu itu:
    resize Quick Ask — Copilot hanya punya move) sebaiknya ditawarkan
    dulu lewat kartu tanya daripada langsung di-ship; kalibrasi owner
    adalah terhadap yang lazim/parity, bukan terhadap imajinasi dev.
73. Mem-port komponen ke SCOPE BARU (mirror .oa-app→.oa-quickask) juga
    memindahkan tanggung jawab layer a11y yang di-scope: blok lama
    (prefers-reduced-motion .oa-app/.oa-settings) tidak ikut menjangkau —
    spinner mirror berputar 2 rilis tanpa ada yang sadar. Setiap mirror
    baru: cek SATU PER SATU layer scoped yang menyebut nama scope lama
    (motion, print, contrast) dan tambahkan scope baru bila perlu.
    Dan: tidak semua dugaan itu bug — "first:preset" di probe F17 hanya
    efek textContent meratakan <ul><li>; verifikasi struktur DOMNYA
    dulu sebelum menulis fix (temuan hantu membuang rilis).
74. Panen (harvest render) DOM ke host detached itu ampuh (indeks
    search settings v0.1.94 dibangun dari BUILDER ASLI — teks tak
    mungkin drift dari UI), TAPI builder boleh jadi berefek samping:
    menimpa field El milik pane hidup (snapshot & restore!), menembak
    jaringan saat BUILD (hub taps/deskripsi → guard flag searchHarvesting),
    atau memicu display() async (buat state UI tahan-rebuild: query
    disimpan di field & diterapkan ulang tiap display()). Dan ritual zip:
    pipeline release SUDAH memproduksi zip final byte-verified — ritual
    tangan = verifikasi isi + rename + pangkas dua terbaru; jangan rm
    dulu baru cari cara regenerasi.
75. Refinement NILAI pada selector yang SUDAH ADA = edit di tempat —
    ritual "blok baru di EKOR styles.css" hanya untuk selector BARU.
    Guard anti-debt (layered-selector + chip-x) mengunci satu-definisi-
    per-selector dan menangkap percobaan override-di-ekor v0.1.95;
    pivot ke in-place, guard lama tak perlu diamend apa pun. Dan:
    look kartu settings itu milik CORE (.setting-item di app.css via
    token --setting-items-*) — kenali tuannya sebelum mendesain ulang.
76. "Rule-ku kalah oleh host" seringnya BUKAN specificity war — itu CAT
    ASLI UA stylesheet (native appearance). Bukti definitif: enumerasi
    document.styleSheets menemukan NOL rule pelukis → pencurinya UA.
    Obatnya: appearance:none + inherit, bukan specificity lebih tinggi.
    Dan: page.evaluate(fn) di Playwright MENJATUHKAN closure atas fn —
    helper Node-scope tak ikut; fn harus self-contained, atau probe
    mati DIAM-DIAM sambil JSON menyimpan hasil run lama (halusinasi
    ukuran!). Rail debugging scaffold jangan pernah dibiarkan red herring.
77. Chrome yang duduk DI DALAM bingkai rancangan kita harus di-PIN
    netral di SEMUA state — host/UA gemar mengisi field saat :hover
    (F26 mengukur bg transparent → rgb(42,42,42) + border-color geser).
    Audit state jangan berhenti di rest: page.hover() bekerja di lane,
    dan "tidak ada yang bergerak saat hover" adalah kontrak estetika
    yang layak di-guard, bukan kemewahan.
78. Mirror komponen tanpa layer RESET GLOBAL itu cacat-latent: v0.1.89
    mem-port 57 selector picker tapi bukan .oa-app :is(input,…) — field
    quickask pun tertimpa block @media (hover:hover) core (form-field
    paint). Kalau membetulkan sebuah bug-class di SATU permukaan, potret
    SEMUA permukaan yang meniru pola sama — jangan tunggu laporan ke-2.
    Dan waspada sim touch: touch emulation mem-flip media hover:none di
    TENGAH skenario → probe hover harus ditaruh SEBELUM blok coarse.
    Flake lane (streamResetOnRetry hari ini, sekali dalam 4 rilis) =
    check timing race — catat, jangan diam-diam di-longgarkan.
79. :is() specificity = argumen TERTINGGI, bukan yang ke-match — pasangan
    :not() di dalam :is() MENGGELEMBUNGKAN kekuatan selector secara
    diam-diam. v0.1.98: .oa-quickask :is(input:not():not(), textarea,
    select) dihitung (0,3,1) → reset pembantu diam-diam MENANG atas
    komponen (0,2,0): padding 10/12/4 → 0, min-height 26 → 0, shorthand
    font: inherit ikut menggasak line-height. Bug-kasat-kelas ini
    TAK KELIHATAN di diff hover ({} tetap hijau — diff-of-nothing itu
    bukan bukti sehat). Hukumnya: (1) layer reset/pembantu harus
    selector polos berkekuatan TERENDAH (elemen telanjang, split per
    tag — bukan :is() campur :not()); (2) hindari shorthand font di
    reset (font-family: inherit saja, biar size/line-height milik
    komponen); (3) guard untuk metrik komponen = NILAI RESOLVED
    absolute (padding 10px 12px 4px, min-height 26px, rasio lh 1.5)
    yang diukur di lane nyata, bukan sekadar "tak ada yang bergerak";
    (4) smoke guard berubah BENTUK → amend di tempat, kontrak tetap.
80. Dua jebakan pengukur hari ini: (1) selector class-tunggal pada
    <button> di scope kita (0,1,0) KALAH dari pelukis core
    `button:not(.clickable-icon)` (0,1,1) — walau deklarasinya
    `background: transparent`; angka rgb(54,54,54) di lane = UA-look
    belang kalau selector tidak di-bump parent (0,2,0) — kembaran
    v0.1.96, sekarang di komponen seam. (2) Probe dengan toleransi
    harus cocok dulu dengan DESAIN handler-nya: langkah keyboard seam
    memang SENGAJA 12 (plain)/48 (Shift) — probe awalku menuntut 48
    tanpa-shift lalu data "off-by-2" menipuku — kalau toleransinya
    kelonggaran, itu hijau palsu versi baru; uji SEMUA arah + perilaku
    lantai (floor stick) supaya clamp tak pernah menyamar jadi delta.
    Bonus pelajaran produk: koreksi pemilik v0.1.91 menolak WUJUD
    (tombol resize), bukan KONSEPnya (tetap mau resize) — baca ulang
    kalimat penolakan sebelum menguburnya jadi absence-guard permanen;
    dan permintaan "cari referensi dulu" dibayar tuntas: seam pojok
    tak terlihat itu tiruan macOS yang DIPERBAIKI (zona hit DI DALAM
    frame — kegagalan Tahoe jadi bukti kenapa).
81. pointerup TIDAK dijamin datang — browser/OS boleh membatalkan pointer
    di tengah gestur (pointercancel; touch takeover, gesture OS, drag
    initiation). Setiap flip-flop gestur (isDragging/selDrag sebangsa)
    WAJIB punya jalan keluar ganda: listener pointercancel + level
    window-capture (tak bisa ditelan stopPropagation di bawahnya) +
    sembunyikan fallback FAKTA FISIK bila ada (mousemove buttons===0).
    Gejala khasnya kejam: "bekerja lalu MATI PERMANEN tanpa jejak" dan
    harness selalu hijau karena harness memasangkan semua event —
    reproduksi butuh event sintetik CUSTOM (jangan andalkan driver mouse
    CDP; pointerup-CDP datang selalu). Witness yang jujur juga wajib
    bersih urutan-nya: pensiunkan artefak bar lama dulu, atau
    querySelector membaca sisa dan salah-bukti. Sanitasi menyapu kelas
    bug yang sama di permukaan lain (quickask & hold-scroll sudah
    punya cancel — sweep membuktikan, bukan mengasumsikan).

82. Koordinat `position:fixed` punya RUANG, dan ruang itu bisa dicuri:
    contain (paint/layout/strict), transform, filter, atau
    backdrop-filter pada LELUHUR manapun menjadikan leluhur itu
    containing-block bagi elemen fixed — left/top-nya berhenti berarti
    viewport (core Obsidian sendiri memasang contain:strict di
    .workspace-leaf & body; resmi, di SEMUA instalasi). Gejala khasnya
    paling menipu di kelasnya: elemen DIRENDER SECARA SAH, semua gerbang
    logika lolos (guard babak 1: barTerender:true), tapi tak pernah
    tampak — tergeser offset pane, di mesin owner sampai terlempar
    keluar layar. Diagnosa pasti tanpa menebak: ukur ELEMENNYA sendiri
    (rect + offsetParent + rantai leluhur + elementFromPoint pada titik
    tengahnya) — offsetParent != null pada elemen fixed adalah bukti
    forensik ruang-yang-dicuri; JSON babak 2 owner langsung menunjuk
    .workspace-leaf. Hukumnya: overlay yang mengukur koordinat dalam
    ruang viewport (getBoundingClientRect dsb) WAJIB di-mount di ruang
    itu juga — createPortal ke document.body (body = origin viewport;
    preseden core: menu/tooltip/notice append ke body; quick-ask kita
    juga sejak awal). Sweep aturan-cermin membuktikan bukan mengasumsi:
    quick-ask selamat (right/bottom-anchor + mount body + delta drag),
    .oa-modal-overlay hanya pane-scoped (tolerable, bukan off-screen —
    dicatat, bukan diubah diam-diam). Dua pelajaran pengadilan: (1)
    hijau palsu 5 rilis (v0.1.98–101) karena harness menempel di origin
    tanpa chrome workspace — reproduksi GEOMETRI nyata dulu (fake-leaf
    contain:strict + offset 240/40) sebelum percaya metrik posisi;
    witness-nya memang red→green (dx=241 off-screen → 0). (2) Guard
    visibilitas overlay = bukti LETAK (rect vs titik seleksi + berada
    di dalam viewport), bukan bukti ADA di DOM — "terender" ≠ "tampak".
    Bonus guard-kecil: komentar tak boleh memuat teks selector terlarang
    mentah — guard !includes membaca prosa juga; parafrasekan.

83. Handler gestur yang membajak double-click WAJIB mengecualikan zona
    TEKS — removeAllRanges() adalah penghapus senyap seleksi native:
    browser memilih kata pada dblclick, React onDoubleClick menyapu
    habis 0ms kemudian. Gejalanya persis "seperti ke-cancel" dan harness
    yang hanya menguji seleksi via drag/addRange buta selamanya. Pola
    aman: kandaskan wilayah — teks (.oa-msg-content) = wilayah seleksi
    (quote bar ikut hidup dari seleksi kata), chrome bubble = wilayah
    gestur khusus (tapback tetap jalan); DUA wilayah berarti DUA witness
    — lane 5 dblclick CDP sungguhan menjaga teks (red pre-fix
    {"text":"","bar":false}), lane reax yang sudah ada menjaga chrome
    (dispatch detail:2 ke root bubble). Catatan harness: CDP dblclick
    (page.mouse.dblclick) memicu word-selection native Chromium — ia
    witness jujur, bukan simulasi. Dan baca niat desain sebelum
    menyimpulkan "rusak lama": branch detail!==2 yang melindungi seleksi
    triple-klik adalah bukti dobel-klik cuma tertinggal di keputusan
    yang sama — mirror the intent, jangan tunggu permisi produk.

84. "Sama seperti komponen asli" adalah KONTRAK TERUKUR, bukan selera:
    fetch SOURCE upstream dulu (raw.githubusercontent — thinking-bar:
    flex w-full justify-between + stop dotted-underline tanpa chevron;
    tool: Loader2 spin biru / Settings oranye / circle-check hijau /
    circle-x merah, semua 16px), lalu TERJEMAHKAN jadi asersi numerik
    (gap≤12px, radius 0, dotted, w===16, kanal warna, animationName) di
    lane fixture STATIS — fixture deterministik menang dari probing
    state in-flight yang racey. Dua hukum kecil dari pasangan bug ini:
    (1) JANGAN gambar spinner dengan border CSS pecahan — border-width
    1.5px terkuantisasi jadi used-value 1px (probe membuktikan),
    cincin rapuh "cacat" di zoom nyata; vektor lugas (arc path) anti-
    aliasing di SEMUA zoom dan tidak butuh border sama sekali. (2)
    setIcon-by-name = hidden version dependency: glyph yang PERNAH
    berganti nama antar era lucide (check-circle/circle-check, loader-2/
    loader-circle) WAJIB di-inline body-nya verbatim (curl-verified,
    URL di komentar) — setIcon hanya untuk nama yang stabil lintas era;
    tandai di shim bila nama dipertanyakan. Bonus: visual defect = pixel
    witness — probe deviceScaleFactor 3 + screenshot lane jadi bukti
    sebelum/sesudah yang bisa dilihat pemilik, bukan sekadar angka.

85. Indikator status WAJIB punya jalur calm di SEMUA blok reduce-motion,
    dan "nama animasi benar" ≠ "animasi bergerak": styles.css kita punya
    EMPAT blok `@media (prefers-reduced-motion: reduce)` (kill generic,
    lalu tiga blok calm per-komponen) — menambah kelas animasi BARU
    (mis. glyph spinner arc) tanpa mengaudit keempatnya = indikator
    membeku total di mesin reduce-motion, persis keluhan "loading nya
    tidak ada animasi sama sekali" (witness RED: {name:oa-spin,
    dur:1e-05s} — durasi dibunuh generic, tak ada fallback). Audit =
    grep semua blok-nya setiap menambah `@keyframes`/kelas animasi —
    mirror rule lesson 73/78/80 berlaku juga untuk media-query TEMA,
    bukan cuma selektor. Hukum witness keduanya: computed
    `animationName === "oa-spin"` adalah green PALSU (nama bisa benar
    sementara durasi 1e-05s = gambar diam); witness sah = DUA sampel
    `transform` live berjarak ~350ms yang BERBEDA di halaman normal
    (membukti rotasi nyata) + halaman kedua `reducedMotion:"reduce"`
    yang mengaserti durasi bukan 0.01ms DAN nama = jalur calm (bukan
    freeze). Bonus parser-trap dari lane yang sama: Chromium
    men-serialisasikan `color-mix(in srgb, …)` sebagai
    `color(srgb R G B / A)` — BUKAN `rgba(...)` — jadi pembaca alpha
    di lane WAJIB mengenali kedua format, kalau tidak asersi tint
    lembut diff mengambang merah/hijau buta.

86. Screenshot resmi mengalahkan bacaan docs — selalu kerja di level PIXEL
    saat parity visual dipermasalahkan: v0.1.105 menebak struktur gutter
    CodeDiff LobeHub dari narasi dokumentasi (dual old/new — "unified diff
    reading") dan tebakan itu SALAH; koreksi datang dari screenshot asli
    yang dikirim owner (SATU kolom: removed = nomor lama tinta rose,
    added = nomor baru tinta olive, context = abu; pita tepi 4px hanya di
    baris berubah — "hose" lewat baris context yang kuduga dari mata
    ternyata tak ada, getImageData membuktikan rows 6-8 bersih). Hukum
    urutannya: (1) minta/tangkap pixel komponen resmi DULU before styling,
    (2) probing canvas attachment owner (`drawImage`+`getImageData` per
    strip-koordinat) = anatomi yang tak bisa dibantah mata, (3) lampiran
    stylesheet resmi (owner melampirkan app.css Obsidian!) mengunci ANGKA
    persis (baris 0.2 · segmen 0.4) — dua sumber resmi yang convergen lebih
    kuat dari satu. Dan untuk reduce-motion: peta "motion esensial vs
    dekoratif" adalah PUTUSAN PRODUK, bukan wewenang agen — owner menolak
    denyut pada spinner DUA KALI berturut ("tidak bergerak" → "malah
    pulse"); rotasi loading adalah identitas komponen, samakan upstream
    persis bila owner protes, jangan lindungi mereka dari keputusan mereka
    sendiri. Terakhir: koreksi kontrak visual = AMEND guard versi-locked
    di tempat (105 tetap tercatat sebagai versi, pins-nya mengikuti
    kontrak baru + catatan amend) — jangan pernah menghapus sejarah.

87. Pesan error lexer BERBOHONG lewat bentuk — reproduce dengan library
    asli, jangan anatomi dari tampilan konsol: tembok konsol owner's
    "Lexical error on line 2. Unrecognized text … subgraph Agent Loop ✨
    A[🚀 Task/" TAMPAK seperti bukti pipeline meratakan newline (celah 8
    spasi = indentasi baris berikutnya!) — berjam-jam potensi berburu
    hantu. Replay `mermaid.parse` pada varian terkontrol membuktikan pesan
    itu byte-IDENTIK untuk sumber baris-normal + judul subgraph ber-emoji
    tanpa kutip: excerpt jison memang mewartakan jendela sumber mentah
    yang merusak struktur baris. Prosedur anti-hantu: (1) bentuk ulang
    pesan error persis (cocokkan byte-per-byte, bukan kira-kira) dengan
    input terkontrol, (2) BINARISKAN varian (newline×kutip×emoji) —
    hasilnya: judul bare ber-emoji = satu-satunya pelaku; label node
    ber-emoji dan judul multi-kata lolos; mengutip menyembuhkan. (3)
    Salvage output model harus SEMPIT & IDEMPOTEN — sentuh hanya bentuk
    yang terbukti gagal (judul subgraph bare non-identifier); bentuk
    sehat (id polos yang bisa dirujuk edge, id[title], quoted) wajib
    byte-identik. (4) Error console dari app.js core ≠ bug kita, tapi
    konten yang KITA antar ke renderer adalah tanggung jawab kita —
    pagar preprocess (LaTeX, fence eksekutabel, kini mermaid) adalah
    tempat membendungnya, dengan saksi lane pada sumber yang TIBA.

88. "Apakah perlu proper docs?" — ukur AUDIENS dulu, rot dulu, baru
    pekerjakan: untuk repo personal yang tidak dipublish, dokumen besar
    USER-GUIDE/DEVELOPER adalah hutang bukan aset — pembacanya tidak ada,
    dan dokumen tanpa pembaca membusuk (kita baru saja menghapus checklist
    yang basi karena alasan identik). Bukti hidup satu pintu: README kita
    sendiri sudah melenceng dari realitas (slash list 11 dari 24; web tool
    salah nama; quick-ask tak tercatat) — jika SATU dokumen saja bisa
    basi, sepuluh dokumen akan basi sepuluh kali. Aturan kerjanya:
    (1) pemakaian pribadi → manual hidup di DALAM produk (/help, settings
    yang bisa dicari, deskripsi tool) + working-agreement sebagai memori
    proses; (2) yang layak dikerjakan hanya sinkronisasi README yang
    TERVERIFIKASI ke registry nyata — grep daftar nama dari kode, jangan
    tulis dari ingatan; (3) dokumen proper untuk audiens luar ditulis
    TEPAT SAAT audiensnya ada (trigger: publish/zip dibagikan), tidak
    lebih awal.

89. Port komponen dari library React ke DOM vanila = petakan KONTRAK
    behavior, bukan salin JSX — dan inventarisasi pohon dulu saat
    melanjutkan kerja dari ringkasan. Kasus v0.1.108 (lobe-ui Data Entry
    ke settings): (a) sebelum menulis satu barispun, verifikasi SOURCE
    mentah komponen asal (Segmented = wrapper tipis antd: rail border
    colorFillQuaternary + background colorBgLayout, thumb meluncur;
    SliderWithInput = Slider + InputNumber flex gap 16, kotak maxWidth
    64, unlimitedInput membebaskan angka melebihi rail, NaN/null
    diabaikan, changeOnWheel default OFF) lalu port kontraknya:
    radiogroup + roving tabindex + thumb geser; sinkron dua arah
    slider dan kotak; clamp hanya saat commit, bebas di kotak.
    (b) Token tema jangan ikut diimpor — terjemahkan ke var var(--*)
    Obsidian, penempatan CSS patuh LESSON 75 (refine di tempat, append
    hanya untuk selector baru). (c) Ringkasan kompak bisa basi di
    tengah jalan: implementasi ternyata SUDAH jadi padahal catatan
    rencana bilang belum — cek git status + grep jejak versi di tree
    SEBELUM mengulang langkah; kerja dobel menipiskan kepercayaan diff.

90. Owner bicara bahasa kelas Obsidian ("setting-item mod-toggle") — cek
    app.css dulu sebelum menata layout: mod-toggle = baris ber-toggle
    di Obsidian native (dikecualikan dari aturan tumpuk vertikal
    @container <=340px), jadi baris komposit ber-toggle aman ditata
    horizontal. Untuk kontrol multi-item, "full width" ala owner = satu
    kontrol flex:1 mengisi sisa ruang baris, BUKAN width:100% yang
    mendobrak barisnya. Dan urutan visual = urutan DOM: memindahkan
    tombol cukup memindahkan blok addButton di kode — jangan utak-atik
    CSS order/flex-order untuk hal yang DOM bisa urutkan sendiri.

91. Kesamaan visual = geometri yang DIKUNCI, bukan flex harapan. Kasus
    v0.1.110: rail slider "sama panjang aturan mainnya" padahal flex:1
    di dalam pair width:100% mewarisi lebar control tiap baris (yang
    tergantung panjang nama/desc) — dua rail lahir dengan panjang beda.
    Untuk "harus sama", lebarnya difix-kan (240px; rail 160px di semua
    baris) dan saksi F27slide ikut mengukur rect kedua rail (±1px).
    Prinsip: (a) flex:1 menyamakan PROPORSI terhadap kontainer, bukan
    piksel antar-baris; (b) keluhan visual dijawab dengan ANGKA rect di
    probe bukan dengan menebak screenshot; (c) percaya mata owner
    meski shot harness tampak "cukup mirip" — ukur dulu baru simpulkan.

92. Re-render penuh = scroll kolaps; "quiet" bukan alasan posisi berpindah.
    Kasus v0.1.111 (owner: toggle Enabled MoA "seperti di force ke atas /
    scroll ke atas"): display() empty→reappend meng-collapse tinggi konten
    sesaat → browser meng-clamp scrollTop ke 0 dan tak pernah
    mengembalikannya — berlaku untuk SEMUA pemanggil display(), bukan
    cuma MoA. Pola obat baku: rekam scrollTop dari ancestor scrollable
    terdekat (walk overflowY auto/scroll dari containerEl; fallback
    document.scrollingElement di harness; try/catch demi headless) SEBELUM
    empty, pulihkan SESUDAH seluruh section ter-render. Saksinya F29scroll:
    baris lama harus TERDETAS (rebuild benar terjadi — kalau tidak,
    pertanyaan kenapa) namun y bertahan ±4px dan nilai sungguh berbalik.
    Kedua: sub-kontrol yang harus "nempel satu garis" dibungkus satu wadah
    flex kecil — mengandalkan gap kontainer tua untuk menjaga pasangan saat
    wrap itu fatamorgana.

93. Rata-kanan + flex-wrap = jurang kosong di KIRI tiap baris. Kasus
    v0.1.112 (owner: "bagian kirinya seperti ada spasi gitu yang dorong"):
    justify-content:flex-end yang idiom untuk baris Obsidian BERNAMA
    (nama di kiri, kontrol di kanan) menjadi jebakan pada baris komposit
    TANPA kolom info — tiap baris wrap mengerumun kanan dan meninggalkan
    void kiri yang terasa seperti "ada spasi yang dorong". Aturannya:
    baris tanpa info → rata KIRI mengikuti tepi konten (flex-start), void
    bergerak ke kanan yang terbaca alami seperti teks. Kedua: lebar input
    di baris padat jangan pasrah ke default tema (new preset-nya 225px!)
    — tetapkan eksplisit (9rem) supaya baris muat, dan assert RENTANG
    lebarnya di probe bukan cuma ada/tiada.

94. "Inset misterius" pada baris settings custom = geometri NATIVE yang
    terlupakan, bukan CSS kita. Kasus v0.1.113 (owner kirim screenshot
    DevTools flex inspector — ungu = gap/free space): Obsidian SELALU
    membuat .setting-item-info meski baris tanpa nama, dan aturan resmi
    .setting-item > *:first-child memberi margin-inline-end size-4-4 —
    itulah "purple space kiri" yang membuat dropdown tampak tidak full
    width. Obatnya sembunyikan info kosong pada baris komposit itu.
    Kedua: "harus mentok dua tepi" = justify-content space-between;
    flex-start hanya MEMINDAHKAN void dari kiri ke kanan (keluhan
    berpindah sisi). Ketiga: harness-parity bukan kemewahan — snapshot refCss tertentu tidak memuat aturan first-child itu,
    jadi keluhan owner dapat TAK TERLIHAT di probe; suntik
    aturan native lewat <style> di dalam probe (pola injeksi F29scroll
    untuk pane scroll) sebelum mengukur, kalau tidak saksinya bohong
    aman.

95. "Samakan component" dieksekusi sebagai HELPER yang membangun struktur
    identik — bukan menyalin style, dan bukan langsung menebak komponen
    mana. Kasus v0.1.114: dugaan pertama bilah Search settings (terukur
    [49,651] identik dengan tabstrip+baris — ternyata bukan itu); owner
    memaksudkan search SKILL: dua input telanjang di Capabilities yang
    kasarnya kontras dengan shell komplit komponen induk (ikon lup +
    clear + border + focus ring). Helper searchField() memproduksi shell
    yang sama; kelas spesifik TETAP di input (.oa-hub-search) — saksi F
    lama menempel pada kelas itu, menghapusnya = memecahkan penjaga diri
    sendiri. Rupa dibandingkan lewat computed style + tinggi TERHADAP
    komponen induk (F31skills), bukan cek string kelas. Dan perilaku kecil
    yang "bagian dari komponen" (clear + Escape) ikut di-port serta
    diuji — visual doang tak pernah cukup selaras.

96. **\u201cSamakan semua search\u201d = inventaris satu rumah dulu, baru satu komponen \u2014 kulit dihormati, bukan dihapus**: (a) jawaban atas \u201cbagian mana lagi yang ada search-nya?\u201d HARUS berupa tabel inventaris hasil grep (type:\u201csearch\u201d, placeholder Search, FuzzySuggestModal, input mentah di src/ui) \u2014 jangan menebak dari ingatan; (b) pemersatuan = satu komponen React `SearchField` (ikon \u00b7 input \u00b7 tombol \u2715 \u00b7 Escape dua tahap) dengan dua varian kulit `strip` (menu, borderless + garis bawah) dan `pill` (panel, kotak berborder) \u2014 jangan paksa satu kulit ke dua lingkungan berbeda; (c) CSS lama di-refactor IN PLACE jadi komentar penunjuk (bukan dihapus buta), dan periksa duplikat tersembunyi di lokasi ke-4 (quickask menyimpan 3 one-liner `.oa-vis-search` sendiri!) \u2014 grep kelas di SELURUH stylesheet sebelum menulis selector baru; (d) kelas identitas lama tetap dibawa lewat prop `className` supaya driver pengetes dan gaya yang masih relevan tak patah; (e) saksi harus menyentuh interaksi nyata: \u2715 muncul hanya saat terisi, klik \u2715 mengosongkan, Escape bertahap (isi \u2192 bersihkan \u00b7 kosong \u2192 teruskan ke handler penutup) \u2014 diuji via dispatchEvent KeyboardEvent dan menu diverifikasi MASIH terbuka; (f) native Obsidian (FuzzySuggestModal/EditorSuggest) dibiarkan native by design \u2014 dan alasan itu ditulis eksplisit ke pemilik, bukan dibiarkan abu-abu.

97. **\u201cKayak markdown editor\u201d = satu mesin murni + adapter per medium \u2014 dan contenteditable bukan textarea**: (a) `computeMarkdownEdit` murni string (Tab/Shift+Tab multi-baris, Enter lanjutkan bullet/nomor/checkbox/quote + keluar di item kosong, auto-pair/bungkus-seleksi/skip-over/Backspace-pasangan) membuat logika bisa diuji cepat di node SEBELUM menyentuh browser \u2014 semua kegagalan pertama kami ternyata bug asersi uji, bukan kode; (b) contenteditable PUNYA HUKUM SENDIRI: execCommand(\u201cinsertText\u201d,\u201c\\n\u201d) dirender Chrome sebagai `<div>` padahal serializeComposer/caretOffsetOf menghitung `<br>` \u2014 offset langsung melayang 1 per baris; spasi ujung baris contenteditable disimpan sebagai `&nbsp;` sehingga regex penanda list HARUS toleran `\u00a0`; execCommand(\u201cdelete\u201d) HANYA menghapus seleksi (no-op di caret kosong), \u201cforwardDelete\u201d pun tak konsisten; (c) kesimpulan (b): composer kaya hanya boleh dimutasi lewat RENDER KANONIKNYA SENDIRI (renderText + setCaretOffset + emit manual) \u2014 adapter DOM khusus diganti keputusan murni `markdownComposerEdit`, mutasi 8 baris pindah ke prompt-input; (d) guard SAFE_DELETE_RE harus memuat SEMUA karakter yang bisa dihapus mesin (karakter pembuka pasangan `( [ { " \' \` sempat tertinggal \u2014 pair-delete diam-diam no-op); (e) asersi driver browser harus normalisasi nbsp dan tajam terhadap posisi caret (skip-over menggeser langkah berikutnya); sentinel huruf mengalahkan ukur-panjang spasi ujung yang dipangsa innerText.

98. **Bug serius lintas-view = buktikan fingerprint dulu, lalu cabut jalur berbahayanya — jangan menambal tebakan**: (a) laporan "simbol ikut muncul di composer" ditelisik lewat DUA pertanyaan klarifikasi; jawaban "hanya simbol pasangan" adalah fingerprint yang membedakan: huruf lewat jalur native (aman), pasangan lewat jalur execCommand (bocor) — tanpa fingerprint ini akar bisa ditebak keliru; (b) `document.execCommand` menyasar SELEKSI window, BUKAN element — fokus textarea bukan jaminan sasaran; di lingkungan Obsidian asli seleksi bisa tertinggal di composer contenteditable sehingga sisipan jatuh di sana, cek nilai gagal, fallback MENDUPLIKASI ke textarea: pasangan tampil di dua tempat; (c) API deprecated yang menyasar state global (execCommand) tidak punya tempat di jalur mutasi lintas-view — dicabut total, bukan "dipagari lagi": `applyCaretState` kini menulis el.value langsung + event input manual, deterministik; kehilangan undo native diterima sadar (benar > nyaman); (d) empat replika hijau (bare-DOM → settings+PromptInput → settings+ChatApp penuh) membuktikan bug ini environment-specific — replika bersih TIDAK berarti laporan salah; itu menandakan residu di lingkungan produksi dan perbaikan harus by-construction; (e) probe regresi yang benar untuk bug bocor adalah DETEKTOR: pasang listener input global di lane, perintahnya "tak boleh ada event mendarat di target selain ta" (probe F32 noLeak menggantikan undoNative yang tak lagi relevan).

99. **Jarak antar-komponen = SATU sumber, garis = keputusan eksplisit**: (a) saat pemilik melihat "gap dobel", yang benar bukan mengukur-menebak melainkan mengecek kedua margin (search 10px bawah + strip 8px atas); diukur dulu di lane dan tebakan margin ganda terbukti KURANG tepat — penyumbang sebenarnya: status & results KOSONG yang tetap membawa margin 8+8; obatnya `:empty { display:none }` sehingga margin hidup kembali saat ada isi — konsisten dengan pelajaran layout MoA (kosong disembunyikan, bukan di-violence margin); (b) permintaan "sembunyikan garis halus" dieksekusi dengan menghapus border-bottom sambil menyimpan jejak niat di komentar (versi + alasan); (c) probe geometri yang sudah ada (F30search pengukur tepi) diperLUAS in place — hairline 0px & gap 6-11px terukur — bukan menulis probe baru; saksi visual kecil ikut kunci besar.

100. **Judul panjang vs "zero overlap": ukur dulu di lane, geometri mentah membuka akar — rule gabungan bisa menyebarkan hukum layout ke permukaan yang salah**: (a) bug pixel yang tak muncul pada data normal direpro dengan GHOST NODE murni: clone satu baris panel asli di dalam halaman, ganti judulnya teks TAK-TERPUTUS 136 char, paksa tombol hapus tampak lewat inline display (tiruan persis rule :hover), ukur — tanpa menyentuh state React; saksi ini langsung meruntuhkan teori pertama saya ("baris kurang disegel": row 920px di panel 291px padahal overflow:hidden SUDAH terpasang — penyegelan tak menolong kalau lebar mengambang); (b) akar sebenarnya ditemukan dengan memplot computed style naik ke atas sampai anomali pertama: `.oa-panel-list` ber-display FLEX — rule "merged (v0.1.68)… zero overlap" menyerap `.oa-panel-list`/`.oa-profile-menu-list` ke blok `display:flex; flex-wrap:wrap; gap; padding:0 0 10px 18px` milik `.oa-hub-preview`/`.oa-cron-history`; arah default flex = ROW, sehingga grup menjadi item yang melebar mengikuti max-content, dan judul nowrap membuat min-content = max-content sehingga shrink floor tak menolong → list scroll-X, ikon hapus terdorong 900px ke kanan terpotong dan tak bisa diklik — PERSIS kata pemilik ("kedorong akibat judul panjang"); konsolidasi CSS yang menambah selector ke blok layout berbeda-semantik adalah bom waktu, dan komentar "zero overlap" bukan bukti; (c) obatnya UN-MERGE, bukan menambah pagar: kedua list dipulangkan ke blok deklarasi masing-masing (block + padding asli 4px 8px 12px / 4px) dan konsekuensi baik ikut dipulihkan (`overscroll-behavior: contain` dipindah sadar) — hapus penyebab, pertahankan konsekuensi; lapis pertahanan `overflow:hidden` baris + `min-width:0` anak kolom tetap dipertahankan sebagai cadangan; (d) saksi tripwire HARUS dibuktikan MERAH sekali: stash styles.css → lane gagal (listNoXOverflow/ghostGeometry false) → pop → hijau; saksi yang tak pernah terlihat merah hanya dekorasi; (e) dua keluhan, satu akar, dua keping: strip pencarian menu profil diritmekan eksplisit (padding 6px 10px mengikuti baris item, via komplain DevTools "karna paddingnya") DAN indentasi 18px yang ikut hilang bersama un-merge; klarifikasi singkat pemilik sebelumnya ("ikon kedorong kepotong") lagi-lagi menentukan sasaran — tanya dulu, ukur, baru sunting (bandingkan pelajaran 98 fingerprint).

101. **Audit keluarga rule gabungan itu SATU Paket — "yang tersisa pasangan aslinya" harus dibuktikan, bukan diklaim**: (a) perbaikan v0.1.119 ku hanya melepas DUA dari ENAM selector serapan blok hub/cron; dump pertama kubaca mulai tepat DI TENGAH daftar selector sehingga dua selector di atasnya (.oa-slash-menu, .oa-model-menu-list) luput, dan edit-ku meninggalkan keduanya menggantung masih menyatu ke blok (komentar arrow-comment pun nyelip di dalam selector list) — untungnya efek computed tak berubah, tidak ada regresi; pemilik yang menangkap sisanya ("oa-model-menu-list sepertinya sama") — baca blok dari komentar header sampai kurung tutup, JANGAN dari baris temuan grep; (b) keluhan susulan pemilik dijadikan uji empiris dulu: ghost grup 144-char di menu2 MERAH pada CSS pra-fix (modelListNoXOverflow false — dugaan pemilik terbukti), baru disembuhkan; (c) tiap permukaan yang dipulangkan diperiksa konsekuensinya satu per satu — model-menu-list: overscroll dipindah (ia scroller), slash menu: overscroll SENGAJA tak dipindah (overflow:hidden, bukan scroller) dan padding pulang ke 0 deklarasi; hairline grup slash yang cuma selebar teks menjadi saksi visual yang juga dipin (hdr border-top selebar menu); (d) tripwire tetap dua arah: kedua lane (menu2, slash3) dibuktikan MERAH terpisah pada CSS pra-fix (lane pertama gagal memutus run sebelum lane kedua — isolasi dengan OA_ONLY saat membuktikan); (e) saat mengedit blok multi-minggu, verifikasi state ANTARA ikut sehat: selepas un-merge tahap 1, selector yang belum diproses tidak boleh menggantung tanpa blok — baca ulang hasil akhirnya dengan mata, bukan asumsi diff.

102. **"Cuma warna atau ada teks?" — kontras diuji dengan ANGKA COMPUTED, bukan asumsi token tema; dan kartu yang menampilkan HASIL aksi harus menyimpan path yang SAMA dengan yang dipakai aksi**: (a) badge op "create" memang ADA teksnya sejak v0.1.58 (lane lama memverifikasi textContent) — tapi --text-success di atas --background-modifier-success tenggelam di tema pemilik; red-proof memberi angka pastinya: bg fg sama-sama rgb(68,207,110); pelajarannya: memverifikasi textContent ≠ memverifikasi KETERBACAAN, dan pasangan warna dari DUA token tema yang berbeda tak pernah aman diasumsikan kontras — obatnya idiom tint lembut (rgba 0.14) + teks token solid, bahasa yang sama dengan baris diff; (b) kartu "N files changed" menyimpan path ARGVS MENTAH sedangkan semua keluarga write menulis lewat vaultPath(settings.workspaceFolder) → di vault berfolder kerja, klik baris memicu notice "no longer in the vault" PALSU di file yang benar-benar ada; turunan (derive) dari sumber yang sama harus melewati RESOLVER yang sama — baik berupa fungsi bersama maupun mirror yang dikomentari dua arah (changed-files.ts tetap bebas impor obsidian, culture file itu); (c) bug kelas ini tak terlihat di vault default tanpa workspaceFolder: seed skenario per-lane (fcard workspaceFolder "Projects") mengubah lingkungan yang"Sama-dengan-yang-butuh-bug" menjadi repro publik, persis pola ghost-node; (d) unit suite murni mendapat kasus ws-prefix lengkap (write/edit/delete/rename, double-prefix, blank) SEBELUM lane browser; (e) red-proof dipisah per-akarnya: styles-only untuk kontras, sources-only untuk path — satu stash tak bisa membuktikan dua penyakit.

103. **Ikon stroko kosong itu TELANJANG, bukan desain — keputusan wajah tombol lewat fork yang nyata (tint lembut vs solid vs tetap), dan koreksi bentuk murni (kapsul) jalan tanpa fork**: (a) "garis merah" yang pemilik lihat di tombol Stop hanyalah glyph lucide stroked di atas background transparan — hover tint (0.12) membuatnya tampak "benar" hanya saat hover; wajah rest diputuskan pemilik lewat fork: tint lembut 12% di rest + 20% di hover, ikon token tetap bintangnya, konsisten dengan bahasa badge/diff; rule lama yang telanjang DIHAPUS (satu rumah per wajah) — dan quickask ternyata punya rule danger sendiri yang telanjang persis sama, nyaris lolos karena tambahanku semula terduplikat lalu KALAH cascade later-wins: cek dulu keberadaan rule sebelum menulis yang baru (grep head mungilku memotong daftar!); (b) permintaan "samakan dengan quick ask" berarti parity di KEDUA arah: perlakuan identik + saksi identik (iconGeometry qask diperluas in place, close ikut dikunci); (c) kapsul = persamaan sederhana: w≠h dengan radius 999px; `aspect-ratio: 1/1` + `flex: 0 0 auto` membuatnya MUSTAHIL di dimensi apa pun (termasuk edit DevTools pemilik) — selalu sertakan saat mengunci radius lingkaran; (d) saksi wajah rest diukur dari computed style live (working lane baru untuk stop mid-run; empty lane probe radius diperluas — widened-in-place, bukan probe baru); hover tetap dijaga statis (rule text) + red-proof tiga lane sekaligus sebelum hijau.

104. **Token tema bernama "active-hover" bukan jaminan "abu lebih pekat" — verifikasi NILAI token di app.css asli; saksi hover dibaca SETELAH transition rampung, bukan frame interpolasi**: (a) hover [+] yang "kok pakai warna button stop" akarnya terukur: `--background-modifier-active-hover` di app.css Obsidian asli = `hsla(var(--interactive-accent-hsl), 0.1)` (test/reference-obsidian-app.css:2828) = TINT AKSEN — dengan aksen kemerahan persis tint Stop, dan fallback `var(--background-modifier-hover)` tak pernah jalan karena tokennya TERDEFINISI; sebelum memakai token tema sebagai efek hover untuk permukaan netral, grep nilainya di reference app.css dulu — nama bohong; obatnya tangga netral by-construction: `color-mix(in srgb, var(--text-normal) 12%, var(--background-modifier-hover))` sesudah deklarasi modifier-hover polos (jatuh-tangan engine tua); (b) `:is-open` = wajah aktif yang sama — resep identik, jangan cuma `:hover`; (c) saksi hover pertama kubaca `oklab(0.999994 … / 0.0666667)` persis di atas rest: itu FRAME INTERPOLASI dari `transition: background 100ms` (ruang campur OKLab default), bukan wajah final — computed style mid-transition bisa membohongi saksi; tunggu MELEBIHI durasi transition baru menimbang (CDP forcePseudoState + getMatchedStylesForNode yang membersihkan cascade dari teori lain; dan parser warna saksi harus bicara dua serialisasi: `rgba()` DAN `color(srgb …)` — mesin modern menuliskan hasil color-mix sebagai yang terakhir); (d) saksi warna yang kuat memin PROPERTI, bukan nilai mentah: channel seimbang (netralitus), α > rest + margin, dan ≠ rest — membunuh tint aksen sekaligus tahan perubahan tema; (e) untuk crash parser jison (mermaid "got 'PS'"): bangun dulu matriks byte-verified di mermaid ASLI versi teranyar lewat crewthrowaway — unquoted `()` gagal di label [ ]/{ }/pipa DAN interior bentuk [(..)],([..]),[[..]],{{..}}; bebas `-- text -->` AMAN — baru menulis pembersihan menyempit + idempoten berbatas jenis diagram (flowchart/graph saja; class braces & sequence dibiarkan); hasilnya dibuktikan END-TO-END dengan melewatkan OUTPUT sanitizer kembali ke `mermaid.parse` asli (11/11 parse), bukan cuma assertion string.

105. **Baca error stack PENUH sebelum mengklaim akar — gejala serupa bisa datang dari jalur yang SANGAT berbeda (render chat ≠ render note), dan perbaikan renderer kita tidak menjangkau konten yang sudah/tengah masuk file vault**: (a) konsol kedua memakai pesan mermaid identik ("got 'PS'"), tapi stack-nya — `loadLayout → loadFile → onLoadFile → setViewData → dispatchTransactions → spans → toDOM → initDOM → mermaid.render` — membuka cerita lain: itu startup Obsidian MERENDER NOTE di vault (layout restore / file yang tengah terbuka), BUKAN render chat; sanitizer v0.1.123 yang berjalan di MarkdownDoc tak pernah menyentuh file vault; gejala yang sama datangnya dari artefak yang kita tulis ke vault; (b) audit permukaan vault-write mengikutkan konten assistant: `/save` menulis transkrip verbatim ke openagent/exports/chat-*.md (kandidat melanggar paling jelas), write tool agent (konten niat model — sengaja dibiarkan; sanitize=overreach pada file user yang bermakna), memory/automation/skills (bukan markdown diagram); (c) obatnya BY-CONSTRUCTION di titik ekspor: sanitizeMermaidFences — komposisi baru yang berjalan di atas dokumen (wrap fence ≥3 backtick/tilde, tutup harus runtime, info string dipertahankan apa adanya, luar fence byte-identical) memakai sanitizeMermaidSrc yang sudah byte-verified; kemurnian file markdown-preprocess (tanpa import obsidian) dipertahankan — fungsi baru diekspor dari sana aja; (d) saksi vault-real: slash2 sudah men-save transkrip ke sim vault; jawaban canned lane itu kini membawa fence mermaid mentah perspective owner (label berkurung + caption pipa) — pin triple: path + konten user + `saveMermaidSalvage` — dan red-proof per-akarnya (preprocess → unit crash; /save call → saveMermaidSalvage false sementara pin lain true); (e) note lama yang terlanjur crash TIDAK di-auto-edit plugin (jangan ubah file user diam-diam): user diberi instruksi manual dua-tanda-kutip di laporan.

106. **"Dua permukaan gagal" = dua pipeline berbeda dengan sanitasi masing-masing; dan matriks byte-verified harus diperluas saat domain berkembang—hole hanya boleh ditutup kalau jison asli membuktikannya**: (a) keluhan pemilik "render mermaid gagal di chat DAN di editor" memetakan tiga pipeline berbeda: chat (MarkdownDoc+sanitize — selesai v0.1.123), export /save→note (v0.1.124), dan note yang ditulis agent langsung lewat write_note (belum terselamatkan — baru di rilis ini); memperbaiki satu permukaan tidak pernah menimbulkan permukaan lain jadi sehat — audit semua titik content-assistant-masuk-vault setiap merancang sanitasi; (b) untuk membuktikan cakupan kasus pemilik yang sebenarnya (workflow desain arsitektur), rekonstruksi diagram realistis LLM (label fase Indo + kurung, `<br/>`, & multiword, classDef/class) dan lewatkan RAW vs SANITIZED ke mermaid.parse ASLI: raw FAIL → sanitized OK membuktikan chat-side sudah menang; jangan menjual "sudah beres" tanpa replay begitu; (c) matriks baru menemukan dua hole tambahan: `ID:::class[label]` (class-SEBELUM — jison menolak SELALU, bahkan label bersih; class-SUDAH parse di semua bentuk termasuk cylinder/stadium/diamond) → reorder by-construction lalu rantai kutip biasa, dan nested `[` di dalam label yang TETAP tak terselamatkan (kekonservatifan disengaja — lebih baik menyisakan kasus langka daripada mengkorupsi teks orang); (d) sanitize di write_note sah karena ensureMd menjadikan target selalu markdown dan transformasi byte-identical di luar fence mermaid — prinsip "konten niat model tak diedit" menghargai BATAS fence-diagram, bukan mutlak semua byte; edit_note (fragmen) dibiarkan: partial fence tak bisa dinilai benar-salah; (e) saksi write-path tak bisa lewat lane chat (sim runner, bukan tools.ts asli) — level unit yang tepat dengan fake vault menangkap (path, content); red-proof per file (tools→3 fail, preprocess→3 fail) mengikat keduanya.

107. **Restrukturisasi IA = pindahkan row VERBATIM + semua saksi ikut berpindah rumah; dan guard lama harus DIBACA ulang satu per satu — pin teks mendeskripsikan dunia lama akan menggigit dunia baru secara sembunyi-sembunyi**: (a) penambahan tab berarahan (Appearance sebelum Chat, Workspace/Safety mengikutinya, Notifications/About menutup) diisi berdasar SOURCE resmi — constants.ts hermes-agent memberi parity yang mengejutkan tapi terverifikasi: appearance SECTION resminya keys=[] (tema = ranah shell), workspace ⊇ terminal.cwd ≡ Workspace folder kita, safety ⊇ approvals.mode ≡ Approval mode kita; yang tak punya padanan dibiarkan kosong terhonor ("biarin kosong") dengan deskripsi yang menjelaskan KEKOSONGAN sebagai bentuk resmi; (b) dua row dipindah sebagai BLOK VERBATIM penuh (Setting + markModified + komentar asal) ke method private baru — method ditempatkan sebelum private general( sehingga semua slice smoke lama (agent→profiles, general→providers, memory→automations) tetap higienis; SECTION_DESC agent ikut di-rescope; switch renderSectionBody butuh case eksplisit per key (harvest pencarian memanggilnya per-section — tanpa case, row pindahan HILANG dari index pencarian); (c) tiga gigitan pin lama menandai disiplin yang sama: desc agent lama dipin guard v0.1.77 → di-amend dengan komentar; komentar relokasi-ku sendiri di dalam agent() mengandung string "Approval mode"/"Workspace folder" sehingga pin new-absensi salah-bolang → komentar ditulis ulang tanpa nama setting (pin absensi selalu dicocokkan dengan apa yang BOLEH ditulis di area itu); probe F13/F27 yang berada di page "agent" pindah ke "safety"/"workspace" dengan assertion diperluas what-goes-out (movedOut) BUKAN removed; (d) foto struktur baru diangkat level probe baru (F33: urutan data-key di strip + setiap tab membaca nama row + desc — kosong berarti ZERO rows + desc menjelaskan), red-proof satu stash settingsTab.ts memadamkan F33+F13+F27 sekaligus.

108. **Chord keyboard yang hanya bermakna di SATU posisi toggle adalah TOMBOL MATI pabrik — dan saksi shortcut wajib berupa KeyboardEvent scuba yang dibaca dari WIRE, bukan asumsi cabang handler**: (a) keluhan "ctrl enter tidak berfungsi" akarnya terukur bukan di listener antrian/scope, melainkan di cabang submit sendiri: `(enterToSend && plain) || (!enterToSend && mod)` dengan DEFAULT enterToSend=true membuat Ctrl+Enter jatuh ke TAK-preventDefault + tak-submit, dan contentEditable bawaan memperlakukan Ctrl+Enter sebagai no-op total — chord yang dirancang hidup hanya di toggle-OFF menjadi mati di posisi pabrik; desain chord harus dinyatakan per-posisi-toggle lengkap (bawaan Shift+Enter=kirim/Enter=baris baru, toggle ON membalik, Ctrl/Cmd+Enter netral = SELALU kirim); (b) Engine markdown (computeMarkdownEdit) jangan PERNAH menjahit chord Ctrl/Cmd+Enter jadi baris baru — ia dilepas utuh (return null) supaya lapisan UI yang memutuskan; pembalikan makna Enter/Shift+Enter dibawa sebagai sendChord pada adapter composer tanpa menyentuh jalur textarea warisan (guarded() di sana memang sudah menolak modifier); (c) placeholder & deskripsi setting adalah bagian dari kontrak chord — setiap perubahan skema wajib mengikutsertakan juggling string UI (composer placeholder per-running/per-toggle, desc toggle menyebut ketiga chord) atau harness harus membuktikannya (pin placeholder per mode); (d) saksi level browser: driveKeys satu fungsi men-drive DUA halaman lane (toggle OFF halaman biasa + skenario dedikasi ?s=keys untuk toggle ON — param URL baru JANGAN dipakai karena harness me-literal-kan window.location.search TEPAT SATU kali untuk scenarioParam; skenario baru = cara aman tanpa memecah semua lane), lalu men-drive chord via KeyboardEvent scuba ke editor (React synthetic menangkap event buatan yang berbubel) dan membaca bukti KIRIM dari WIRE __oaRequests (konten user membawa "\n" hasil jahitan baris baru — bukti ganda: baris baru tersetrika + chord kirim bekerja); (e) baris-baru di contenteditable pre-wrap JANGAN pernah diserahkan ke dua jalur lain yang terukur SALAH — terbukti keylab+driveKeys: (i) bawaan Enter browser = insertParagraph yang MEMBELAH <div> root-level, dan serializeComposer hanya menjahit \n dari TEKS/<br> → baris TAMPAK terpisah tapi wire menjepit ("baris satubaris dua"); (ii) menjahit "\n" TEKS manual lewat renderText menabrak kanonisasi caret Chromium — DOM berdiri "…\n" dan anchor dilaporkan offset 11, tapi penyisipan berikutnya diletakkan SEBELUM \n ujung; satu-satunya jalur byte-benar = hard-break native (Shift+Enter) → composer memanggil document.execCommand("insertLineBreak") untuk chord baris-baru non-list, seleksi collapsed DI DALAM editor digerbang sehingga varian-bocor v0.1.117 tidak berlaku; mesin markdown tetap pemilik cerdas LIST semata; (f) saksi keyboard-level harus KeyboardEvent ASLI (page.keyboard isTrusted) DAN bukti fungsi dibaca dari WIRE __oaRequests dengan memindai SELURUH arus (request side-task title-generation bercampur — at(-1) membaca judul-prompt, bukan kiriman), placeholder diminta per-mode sebagai kontrak-UI, dan jeda manusiawi ~150-170ms antar chord karena default-effect contenteditable butuh menetap sebelum ketikan lanjutan — ketikan sekuens pengujian super-rapat sempat meniru bug caret yang bukan milik manusia; (g) red-proof lintas file: stash prompt-input.tsx (lane padam: Shift+Enter tak kirim + Ctrl+Enter mati mode-ON — repro persis keluhan owner) · stash settings.ts (bawaan balik true → lane padam) · stash markdown-keys.ts (2 unit mkEdit padam) · stash settingsTab.ts (F34 padam).

109. **Optimasi ukuran juga layak saksi byte-verified — dry-run metafile dulu, baru flag; dan jumlah pin versi di smoke TUMBUH satu per rilis (jangan di-hardcode ilusi "selalu 5")**: (a) bundle production ternyata tidak pernah di-minify sejak baseline — sourcemap saja yang dimatikan; mengukur Dunia Terbuka via metafile esbuild memberi angka pasti (5.398.228 → 1.926.827 B, gzip 876 KB → 567 KB) sebelum menyentuh config, dan top-modul mengungkap komposisi nyata (pdf.worker ~36% alam semesta, react-dom sudah production — peluru perak bukan di sana); (b) flag `minify: prod` dijaga guard byte: pin string config + pin UKURAN `read("main.js").length` < ambang di smoke (main.js tracked → smoke mengikat artefak nyata, bukan niat), ditambah pin anti-`drop` karena jalur debugMode sengaja menjaga console.*; (c) audit-hygiene: scan kelas CSS naive over-mark template dinamis — setiap kandidat mati harus dibuktikan kotornya lewat bentuk `oa-x-${}` / `${cls}-wrap` / probe harness yang query selector itu, sebelum pernah disentuh; (d) bump versi berikutnya memakai count pin SEBELUMNYA+1 (6 untuk 127→128), karena setiap guard block baru menambah pin-nya sendiri; (e) mengaktifkan minify DUA kali menggigit hal yang sama seperti lesson 96/107 — audit pin yang membaca main.js: identifier (nama fungsi/variabel) DIRENAME minifyIdentifiers sehingga guard lama yang meminnya di bundle (normalizeLoadedSettings/deterministicToolCallId/trashFile) patah — pindahkan pin identifier ke src (tak pernah diminify) dan sisakan di bundle HANYA literal string / property key (`openagent/exports`, `/learn`, kunci JSON) yang memang selamat; dan komentar di esbuild.config sendiri tidak boleh memuat nama opsi yang dipin ABSEN oleh guard (opsi pelempar-log sempat kutulis di komentar config → pin `!includes` memakan dirinya — tulis ulang tanpa nama opsi itu), plus persempit bentuk pin absensi ke pola ber-konteks (`"es.drop"`, `"\tdrop:"`) supaya komentar narasi tak lagi menggigit.

110. **Payload blok kode ber-escape-ganda = monster satu-baris (sintaks hancur, arkeologi mahal) — tulis blok multi-baris via python-ber-paritas-pernyataan, JANGAN paste \n literal ke editor; dan penghapusan export mati wajib cross-check word-boundary atas dua alam (src+test) sebelum disentuh, backlog-park dicatat inline supaya tak ikut tersapu**: (a) ketika menempelkan blok guard lewat edit-tool, verify LANGSUNG dengan node --check + satu tail-run smoke — blok yang lolos sebagai satu baris \n-escaped memakan anchor plugin.onunload() di bawahnya dan sintaksnya baru meledak setelah file di-run; perbaikannya bukan tambal tapi rekonstruksi buntut dari marker terakhir yang sehat; (b) heuristik "export tak terpakai" baru boleh beriaksi sesudah dua gerbang: (i) naif-count hanya memberi KANDIDAT, (ii) grep word-boundary penuh atas src DAN test (ikons di-test-boleh-buntut; konstanta app-sentris seperti GOAL_JUDSE harus nol hit di dua-duanya), dan elemen terpark-backlog (BrainIcon) dijaga dengan komentar park inline, BUKAN dihapus "karena hitungannya nol"; (c) pin anti-regresi arsip mati: gone.every(!export const NAME) + pin positif saudara-park + pin panjang-file agar file-ikon tidak diam-diam menggembung lagi.
### 111. (v0.1.130) Worker/library eksternal di Obsidian = adapter.readBinary → Blob → URL.createObjectURL; red-proof live harus memutus kabel BARU, bukan mengembalikan kode lama
- pdf.worker (1,94 MB — 36% bundle) dieksternalkan ke `vendor/pdf.worker.min.js`: runtime-nya Obsidian, jadi baca byte via `src.app.vault.adapter.readBinary("${pluginDir}/vendor/…")` → `new Blob([buf])` → `URL.createObjectURL(blob)` → `pdfjs.GlobalWorkerOptions.workerSrc`. Ini satu-satunya jalur yang lolos CSP Electron DAN tetap jalan di harness Chromium (lane menyerve byte yang sama via `window.__oaPdfWorkerB64`).
- Red-proof live WAJIB memutus kabel mekanisme baru (stash `chat-entry.tsx` → lane attach MERAH "No GlobalWorkerOptions.workerSrc"). Mengembalikan kode lama (stash `pdf.ts`) TIDAK valid sebagai red-proof live: perilaku lama memang lulus secara legitim — itu sifat refactor, bukan regresi. Stash-kode-lama hanya sah untuk red-proof PIN STATIS smoke.
- Guard lama yang mem-pin string jalur lama (`pdfjs-dist/build/pdf.worker.js`, `pdfjsWorker ??=`) pasti merah setelah refactor sengaja — AMEND di tempat dengan komentar `v0.1.NNN amended:` dan ganti ke pin mekanisme baru; jangan tambah blok baru yang bertentangan dengan pin lama.
- Hasil v0.1.130: main.js 1.926.827 → 857.157 B (stamp build yang diparse Obsidian turun 55%); vendor 1.073.729 B hanya dibaca saat PDF attach; zip total 605.475 → 607.594 B (hampir impas — byte tetap, tapi yang diparse saat load jauh lebih kecil).

### 112. (v0.1.131) Zip-only minify: esbuild transformSync css + sentinel polos + verify by reparse; rak zip prune by VERSION SORT, bukan mtime
- Minify khusus-zip (repo tetap readable): `transformSync(src, { loader: "css", minify: true })` di staging release. Sentinel verifikasi WAJIB substring polos tanpa spasi (`.oa-msg-attach`, bukan `.oa-app .oa-msg-attach {`) — minifier meruntuhkan spasi sekitar brace/combinator tapi tak pernah menulis ulang nama class. Verify step untuk file terminify: bukan byte-compare (mustahil by design) — buktikan reparse bersih + semua sentinel bertahan + lebih kecil dari sumber.
- Witness live untuk CSS: minify sementara styles.css in-place (backup dulu), jalankan lane CSS-sensitif (empty/convo/sel — sel adalah kejadian portal-coordinate v0.1.102), restore dalam SATU bash call (`;` bukan `&&` agar restore tetap jalan saat lane gagal), tutup dengan `git status --porcelain styles.css` kosong.
- Menutup audit dead-CSS: `grep -c selector styles.css` MENGHITUNG komentar — selector-frasa seperti `.oa-app-only` bisa muncul murni sebagai prosa komentar (".oa-app-only" = "hanya .oa-app"). Kandidat mati wajib diverifikasi dengan (a) aturan nyata ada?, (b) referensi kode ada? — dua-duanya nol barulah comment-only (bukan aturan mati, tak ada yang dihapus).
- Ritual rak zip: snapshot env antar-pesan me-refresh mtime file secara tak konsisten → prune `ls -t` bisa menghapus versi yang salah (v0.1.130 hilang, 129/131 tersisa). Selalu prune dengan `ls -v openagent-obsidian-plugin-*.zip | head -n -2` (version sort, keep 2 terbaru by nomor versi), dan catat jujur ke owner bila ada versi yang hilang dari rak.

### 113. (v0.1.132) Menutup parity toolset: STORE yang kaya dulu, tool tetap thin; resolusi nama exact→case-insensitive→ambiguity-list (pola findCronTask); unit test tool WAJIB memakai store ASLI di atas vault in-memory, bukan stub
- Urutan kerja yang benar: (1) studi raw sumber asli (dok resmi +, bila bisa, source; GitHub API rate-limit → fallback web_search pada website/docs repo), (2) perkaya STORE method (resolveSkill, patchSkill, updateSkillRaw, write/removeSkillFile, deleteSkillTree) dengan guard traversal (`split("/").includes("..")` + tolak absolut) dan refuse-honest (SKILL.md ditolak di write_file/remove_file — lewat patch/update), (3) tool di tools.ts tinggal glue + Notice + pesan error jujur per action.
- Resolusi nama entity untuk tool agent = pola findCronTask: exact → case-insensitive tunggal → ambigu → error mencantumkan kandidat; tidak ditemukan → error mencantumkan yang terinstal (cap 12 nama). Dipakai view_skill/manage_skill; pola ini layak jadi default untuk tool by-name lain.
- Stub `skills: { createSkill, loadSkills }` di tools.test.cjs membuat tool store-centric tak teruji — ganti dengan SkillsStore ASLI di atas vault in-memory (bundle tersendiri via esbuild + parseYaml mock flat + trash rekursif folder + getAllLoadedFiles). Red-proof: stash skills.ts+tools.ts → guard smoke v0.1.132 merah exit 1.
- Patch semantik Hermes: old_string WAJIB match persis sekali — 0 match → "call view_skill", >1 → "include more surrounding context". Jangan pernah fuzzy/auto-first-match untuk mutasi dokumen milik user.

### 114. (v0.1.133) Port tool dari sumber asli = studi BYTE-LEVEL file source-nya (bukan ringkasan docs), lalu pisahkan: semantics di store murni (unit-testable tanpa mock), boundary ctx dumb get/set
- Deskripsi tool di website docs terpotong ("merge=…") — wajib baca file source aslinya. Pencarian path saat GitHub API rate-limited: tree HTML `github.com/<org>/<repo>/tree/main` memberi layout dari pesan commit (`tools/…py` di root), lalu tebak filename via curl raw (`tools/todo_tool.py` = 200). Simpan hasilnya — dokumen indentasi/semantiknya jadi acuan guard.
- Tambah STATE sesi baru = preseden existing: `goal` (v0.1.25) & `compression` (v0.1.17) sama-sama ride session file + ref di ChatApp + restore di loadConversation + reset di new + inherit di branch + inject ke ctx di titik run. Ikuti kelima titik persis — jangan ciptakan pola ke-2. Hermes-deviation WAJIB dikomentari (alasan: plugin restart terlalu sering untuk in-memory per-proses).
- Merah-bukti untuk file BARU (untracked): `git stash push` menolak pathspec untracked → `mv` file ke /tmp sementara (kembalikan di command yang sama), stash file tracked pasangannya. Verifikasi merah via exit code NYATA (tanpa pipe), dan cek dua bentuk merah: crash-loud saat file hilang + ✗ terdesain saat hanya glue-nya yang dicabut.
- Anchor indentasi kode lama bisa TIDAK seragam (sessionTitleRef tampak 1-tab di print sed tetapi byte aslinya 2-tab) — verifikasi dengan `cat -A` sebelum menulis anchor, assertion count==1 menyelamatkan dari half-write.

### 115. (v0.1.134) Tool multimodal: piksel naik tool result lewat ENVELOPE string + unpack di loop (bypass clipper); witness = request BODY ke provider; slot aux baru = amend pin "N known slot" di commit yang sama
- Interface tool kita string-only, tapi native vision butuh parts array di wire: tool mengembalikan string ber-prefix (`oa://vision-native/` + JSON), agentLoop meng-unpack menjadi `[text, image_url]` SEBELUM clipper 20k (clipper akan menghancurkan base64). `body.messages = messages` di providers meneruskan parts apa adanya — OpenAI-compatible menerima array content di tool message (fakta dari studi `_supports_media_in_tool_results` mereka).
- Witness multimodal yang jujur adalah REQUEST BODY: rekam `init.body` di mock fetch agent-loop.test (mockFetchSequence), verifikasi request ke-2 membawa `role:"tool"` dengan part image_url UTUH (panjang identik dengan data URL sumber >20000 — bukti bypass clipper di level byte).
- Menambah slot aux (`resolveAuxTask`) = sengaja mengubah anchor pinned: guard "webExtract is the fourth known slot" (v0.1.28) harus di-AMEND di commit yang sama (komentar `v0.1.NNN amended:`), jangan dibiarkan merah mengejutkan di pipeline.
- Mock vault dengan DUA store (text files + binFiles utk adapter.readBinary): seed KEDUANYA — alat membaca getAbstractFileByPath (text map) SEBELUM adapter (bin map); seed satu saja = error dunia-nyata yang tak tercermin benar di test.
- Lingkup jujur saat sumber asli jauh lebih berat (region-crop, rasterize SVG, konversi ANY2IMG, downscale — butuh Pillow): port yang layanannya ada (resolusi 3 sumber, magic-byte mime, template prompt verbatim, cap byte) + TOLAK jenis tak didukung dengan pesan eksplisit "no format conversion" — jangan pura-pura konversi.

### 116. (v0.1.135) Fitur multi-file selesaikan SEMUA kabel dalam satu sapuan sebelum tsc (interface dulu, baru pemakaian); label test dengan interpolasi tak bisa jadi pin guard; subagent = loop BARU dengan event handler kosong (auto-deny alami, jangan sambungkan UI parent)
- Urutan anti err-sekuens: (1) tulis interface/domain murni (delegate.ts: api + tipe + pool + prompt builder), (2) TOOL memakai interface, (3) engine di runner mengimplementasi, (4) UI colok event, BARU tsc. Error `Expected 1-2 args` & `Property delegation does not exist` muncul karena interface ToolsetConfig/DelegateApi ditulis belakangan — murah dihindari, mahal didiagnosa berulang.
- Pin guard JANGAN menunjuk string di dalam label test yang memakai template-literal interpolasi (`max ${3} concurrent`) — file berisi literal `${3}`, pin `max 3 concurrent` merah selamanya. Pin pola yang stabil (nama fungsi + arg: `runPooled(3, workers)`).
- Subagent tool memanggil tool.execute(..., interactive) — interactive membawa {clarify, delegateProgress, signal}; guard lama yang mem-pin literal panggilan satu-baris (`{ clarify: events.requestClarify }`) WAJIB di-amend saat objek jadi multi-line (`clarify: events.requestClarify,` tetap hidup sebagai substring).
- Mesin delegasi = AgentLoop BARU per anak dengan ctx segar (todo ephemeral, TANPA requestApproval → default-nya sudah deny — persis _subagent_auto_deny mereka) + sinyal abort induk disalurkan lewat interactive.signal. JANGAN pernah meneruskan event handler UI induk (onToken/onToolStart) ke loop anak.
- Blocked-set parity butuh PEMETAAN antar ekosistem: `memory` mereka (save+recall satu tool) → blok DUA tool tulis kita (save_memory, update_user_profile), search_memory (read-only) sengaja hidup. Tulis pemetaan itu eksplisit di komentar + test positif/negatif.

### 117. (2026-08-11) Handoff GitHub antar sesi Arena: sebutan commit = hipotesis, verifikasi objeknya; PR yang di-merge bisa squash; workflow GitHub App = commit terpisah wajib
- Commit sesi lama yang disebut di instruksi BELUM TENTU ada di remote: `2cd54a1` (head PR #1) ternyata SUDAH masuk main via squash-merge, sedangkan `1e94609` tidak ada di mana pun (bukan object lokal, bukan ref remote, tidak ada PR #2). Verifikasi TIGA gerbang sebelum percaya: `git cat-file -t <sha>` · `git ls-remote origin` · `gh pr list --state all` — dan bandingkan JUDUL PR + daftar file yang diubah, bukan hanya hash (merge commit punya parent sendiri, isi squash ≠ isi head PR).
- Rekonstruksi dari kebutuhan: 6 artefak handoff (ci.yml, check-docs.mjs, README "21 tools", working-agreement Bootstrap+117, package.json check:docs, SKILL.md → preview/index.html) semuanya absen dari main — README bahkan stale dua versi (bilang "16 tools in 4 toolsets" padahal source sudah 21 tools in 9 toolsets). Hitung angka dari SOURCE (`grep toolset:` dan `name:` di src/agent/tools.ts), jangan dari dokumen lama; lalu kunci dengan check-docs.mjs supaya drift terulang menjaid merah.
- SKILL.md openagent-ui menunjuk `test/preview.html` + `test/preview-final.html` yang KEDUANYA sudah lama tiada — arsitektur preview nyata adalah `preview/index.html` (hub) hasil `node test/build-preview.mjs` (gitignored). Referensi tooling didokumentasikan oleh pembuatnya; audit grep referensi mati termasuk bagian dari bootstrap.
- GitHub App Arena menolak membuat/mengubah `.github/workflows/ci.yml` (commit 1e94609 gagal push karenanya). Aturan permanen: workflow dikerjakan di commit TERPISAH dari docs/tooling; push bagian yang diizinkan; isi workflow diserahkan ke owner untuk ditambahkan manual. Jangan pernah membiarkan satu file yang ditolak menggagalkan seluruh batch.
- Baseline hijau sebelum menyentuh apa pun (npm ci → typecheck → build → test), dan `npm run check:docs` wajib hijau di akhir pekerjaan handoff — ia adalah gerbang bootstrap itu sendiri.

### 118. (2026-08-11) Struktur docs = keputusan binding: subfolder per tipe + frontmatter wajib + hub + relative link (bukan wikilink)
- Owner meminta docs "lebih terstruktur dan profesional" dan proyek "dapat dibuka nantinya dengan Obsidian (khususnya docs)". Keputusan binding via ask_user: (1) grouping `plans/` · `studies/` · `audits/` · `reference/` (working-agreement + backlog tetap di root — path working-agreement di-pin check-docs), (2) bahasa English untuk hub & frontmatter (isi doc lama dibiarkan apa adanya).
- Frontmatter WAJIB tiap note (`title`, `type`, `status`, `date`, `tags`) + hub `docs/README.md` wajib ada — dijaga check-docs (bootstrap check #12–13). Status frontmatter harus jujur (done/draft/active/archived) dan di-update saat plan ship/superseded.
- Link internal = **relative markdown link** (`[x](subfolder/note.md)`), BUKAN wikilink `[[x]]`: repo ini publik di GitHub — wikilink tidak ter-render di GitHub, sedangkan relative link jalan di GitHub DAN Obsidian (Obsidian resolve relative link dari folder note-nya). Keputusan ini menyimpang dari kata "wikilink" di opsi ask_user; alasan: dual-compat GitHub+Obsidian.
- Setiap move file docs = sapu referensi path ke file itu di SELURUH repo (docs lain, skills/, README, scripts, **test/**, **src/**, .github, esbuild.config) — termasuk penyebutan prose dalam backtick dan komentar kode, bukan cuma link. Yang lolos pada percobaan pertama: `read("docs/hermes-delegation-plan-…")` di smoke.test.cjs (gagal ENOENT saat `npm test`), lalu 17 komentar lain di src/, test/, esbuild.config.mjs. Dua jebakan pengukur: (a) sweep `| head` MEMOTONG daftar temuan (kelas lesson 27a — output ke file, jangan head); (b) sweep parsial pertama hanya menyapu docs/skills/README/scripts, bukan src/ + test/.

### 119. (2026-08-11) "Buat knowledge graph dengan Graphify" → owner batalkan setelah penilaian jujur: ukur kebutuhan SEBELUM bangun, dan Obsidian Graph view adalah knowledge graph gratis
- Owner meminta integrasi Graphify (github.com/Graphify-Labs/graphify) untuk knowledge graph docs + update workflow. Studi terverifikasi dari source (venv `pip install graphifyy` v0.9.39, `docs/how-it-works.md`, `extractors/markdown.py`, `cli.py`): (1) kode = AST tree-sitter lokal tanpa key; (2) markdown/docs = Pass 3 LLM — CLI menolak tanpa key (`error: no LLM API key found`); (3) ekstraktor markdown DETERMINISTIK resmi ada (`extract_markdown`: file + heading + link antar-doc) dan bisa dipanggil lewat `graphify.extract.extract(md_files, root=docs)` → 308 nodes/322 edges id kanonik tanpa key; `graphify cluster-only <path> --no-label` → GRAPH_REPORT.md + graph.html + graph.json tanpa LLM. Jadi versi deterministik SAH dibuat tanpa key, tapi "Surprising Connections" jujur kosong (tanpa INFERRED edge).
- Penilaian jujur ke owner: corpus 29 doc sudah terindeks oleh hub docs/README.md (kurasi), Obsidian **Graph view bawaan** menggambar knowledge graph otomatis dari relative link (kita sudah pasang di Lesson 118), dan "hemat token 71×" tidak berlaku di corpus kecil. Graphify baru bernilai nyata saat docs 50–100+ note (guard freshness). Owner: "batalkan saja" → **TIDAK ada integrasi graphify**.
- Aturan: tawaran integrasi tool baru = sajikan analisis "perlu atau tidak" dengan angka sebelum implementasi (kelas Lesson 72: kalibrasi owner = terhadap yang lazim/parity, bukan imajinasi dev; Lesson 88: ukur audiens dulu, rot dulu, baru pekerjakan). Keputusan "batalkan" dicatat, bukan diulang/diprotes di sesi berikutnya.

### 120. (2026-08-18) Organisasi dokumentasi diadopsi dari studi obsidian-copilot; bersih-bersih versi lama = backfill changelog DULU sebelum hapus
- Owner: "pelajari ulang cara docs obsidian copilot diatur" lalu "kerjakan sesuai urutan" rekomendasi + "bersih-bersih file lama". Studi byte-level dari klon `logancyang/obsidian-copilot` @ `d3ad51a` (4.0.1, 2026-08-16) dicatat di `docs/studies/copilot-docs-organization-2026-08-18.md`.
- Diadopsi sesuai urutan nilai: (1) aturan "kapan update docs" → seksi binding di working-agreement; (2) tabel routing "kalau kerja X → baca Y"; (3) `.github/ISSUE_TEMPLATE/` bug+feature dengan checklist wajib; (4) format plan terstruktur → `docs/plans/_TEMPLATE.md` (Summary/Contract/Decisions/Impact/Phases/GWT/Risks); (5) `RELEASES.md` changelog ringkas di root.
- TIDAK ditiru: pemisahan total `docs/` vs `designdocs/` (melawan struktur vault Lesson 118) dan `AGENTS.md` penuh (kita sudah punya skills + working-agreement sebagai kontrak).
- Aturan pembersihan workspace: sebelum menghapus `releases/vN` lama, ekstrak highlight-nya ke `RELEASES.md` dulu — final-report per versi ikut terhapus, jadi changelog adalah satu-satunya artefak yang menyintesis versi lama. Versi terbaru + working copy + evidence audit TIDAK boleh ikut terhapus saat bersih-bersih.

### 121. (2026-08-19) LM Studio "prompt processing lemot": prompt plugin jauh lebih besar dari chat polos; deskripsi tool di-duplikasi; aux "auto" menumpuk request di model utama
- Akar latensi model lokal BUKAN bug server: prompt per request = system prompt (~1,5k token) + daftar tool + 21 JSON schema + riwayat, vs chat polos ~10 token. Perbaikan berurutan nilai: (1) deskripsi tool di system prompt DI-DUPLIKASI dengan `body.tools` (schema function-calling) — buang salinan di prompt (`- name (toolset…)` saja), hemat ~1,6k token; (2) `titleGenerationEnabled` default ON = request KEDUA ke model utama tiap sesi baru (gejala "kok masih proses lagi") — default OFF + toggle master baru di Model tab; (3) aux slots default "auto (use main)" = compression/goal/title rebutan model utama — arahkan ke model cepat.
- Diagnostik jujur ditambahkan (debugMode only): log `~N wire tokens (chars/4) + M tool schemas` per request di agentLoop.run — "lambat" harus terukur, bukan tebakan.
- Jebakan guard yang ditabrak & pelajarannya: (a) guard v0.1.17 mem-pin `!loop.includes("contextManager")` — awalnya saya import `estimateTokens` dari contextManager → guard merah; niat guard = "engine kompresi TIDAK boleh diimport agentLoop". Solusi benar = INLINE estimator (chars/4) di agentLoop, bukan melemahkan guard — baca Niat guard sebelum menambah import; (b) kata "contextManager" di KOMENTAR pun memicu `includes()` — komentar boleh mematahkan guard string-match, pilih kata lain; (c) pin hitungan `markModified` (37→38) + label log ×37→×38 diamend bersama di commit yang sama.

### 122. (2026-08-19) Cron "selesai" ≠ paritas Hermes: plan bertanda DONE dengan scope lebih sempit; monitor & scan keamanan diangkat jadi Tahap E
- Owner mengoreksi: cron dikerjakan "setengah-setengah / tidak tuntas" dan tidak diberi tahu sudah selesai semua. Audit source membuktikan keduanya benar secara berbeda: (a) plan sendiri bertanda "DONE" dengan implementasi lengkap 122 test — jadi "selesai" benar terhadap plan; (b) tapi plan punya "Di luar scope" yang TIDAK mencantumkan kemampuan Hermes (monitor change-detection, script/no_agent, scan keamanan prompt) — sehingga "selesai" terasa bohong relatif patokan Hermes. Pelajaran: saat menandai plan DONE, sebutkan EKSPLISIT apa yang belum setara upstream, jangan biarkan "di luar scope" menyembunyikan gap paritas.
- Implementasi Tahap E: `monitor_url` change-detection (hash byte-exact → skip LLM saat tak berubah, diff saat berubah; fetch gagal = fail-open) + `scanCronPrompt` (strip unicode tak-terlihat selalu + temuan secret/exfil/injection dilaporkan, tidak dibuang) diterapkan create/update + runtime strip. Diff butuh konten SEBELUMNYA, bukan cuma hash → field `monitorLastContent` (bounded) wajib ikut di-persist.
- Ganti nama variabel di tengah runCronTask (`scopedTask` → `safeTask`) memutus pin smoke "buildTaskPrompt(scopedTask, …)" — pin string di smoke adalah kontrak nyata; amend di tempat, bukan biarkan merah.

### 153. (2026-08-20) Owner: tombol "buka tutup drawer" (Conversations) → ikon history (nama lama rotate-ccw-clock), posisi SETELAH New chat

- Owner: "conversation, yang untuk buka tutup drawer itu loh" — tombol toggle panel sesi di TOPBAR. Ikon lama `panel-left` (SidebarIcon) diganti; posisinya pindah ke kluster kanan, tepat setelah tombol New chat (sebelum Settings).
- KOREKSI owner (2): "aku tadi minta iconnya rotate-ccw-clock, bukan rotate-ccw" lalu "buttonnya ngak ada icon" — jejak penting: `rotate-ccw` SEMPAT render (owner melihat bedanya), tapi `rotate-ccw-clock` TIDAK. Akar: lucide versi baru ME-RENAME `history` → `rotate-ccw-clock` (JSON lucide: `history` = alias deprecated). Obsidian masih memaketkan lucide LAMA → nama yang terdaftar di setIcon Obsidian = `history`, bukan nama barunya. Fix = `make("history")`; geometri identik (panah ccw + jarum jam).
- PELAJARAN BESAR: nama ikon WAJIB mengikuti versi lucide yang DIBUNDEL Obsidian, BUKAN nama terbaru di lucide.dev. Sebelum memakai nama ikon baru, cek `icons/<nama>.json` lucide untuk `aliases` (deprecated) dan `icons/<nama>.svg` (404 = sudah di-rename). Shim harness menutupi bug ini (shim menambahkan glyph apa pun), jadi "render hijau di harness" TIDAK membuktikan render di Obsidian asli.
- Yang berubah: topbar jadi [title][ProfilePicker][spacer][New chat +][Conversations ↺][Settings ⚙]. Fungsi toggle TETAP (setPanelOpen + clear filter + refreshSessions), aria-label "Conversations" TETAP (harness klik pakai selector itu).
- SidebarIcon jadi ikon mati → amandemen gone-list v0.1.129 (SidebarIcon pensiun, RotateCcwIcon live) + guard v0.1.169 (urut source: New chat SEBELUM Conversations; glyph `history`; shim ICONS ada entry `history`).
- Pelajaran kecil: ganti ikon TIDAK cukup di icons.tsx + call-site — shim ICONS (test) WAJIB ikut; dan tulis PERSIS ikon yang diminta owner, jangan "disederhanakan" ke ikon mirip.

### 158. (2026-08-20) Owner: token pill "↑580.6k ↓16.8k · 1772% of the 32768 context window — over budget" + "context length 131072 dari LM Studio tidak kebaca" → dua akar: (a) % memakai total kumulatif, (b) LM Studio dibaca dari endpoint yang salah

- (a) ALARM PALSU: jendela konteks = batas PER-REQUEST. Kode lama membandingkan TOTAL KUMULATIF sesi (`tokenTotals.in`) dengan jendela → chat panjang PASTI "over budget" (1772% ≈ 580.6k/32.7k). Fix: % + flag overload memakai `usage.promptTokens` (kiriman TERAKHIR); ↑in ↓out tetap total sesi. Label aria kini "last input Xk = Y%".
- (b) LM Studio TIDAK kebaca: plugin baca OpenAI-compat `/v1/models` (`listModelInfos` → `context_length ?? context_window ?? max_context_length`). LM Studio TIDAK menaruh jendela konteks di sana. Verifikasi Hermes `agent/model_metadata.py`: `_query_local_context_length_uncached` membaca API NATIVE `{root}/api/v1/models` → `models[].loaded_instances[].config.context_length` (nilai RUNTIME yang di-set user), dengan `_model_id_matches` (publisher/slug vs slug) + fallback `max_context_length`. Fix = `fetchLmStudioContextLength` (root via `lmStudioServerRoot` strip /v1, /api/v1, /api) dipanggil HANYA saat compat tidak memberi context.
- (c) Fallback default 32768 → **256000** (Hermes `CONTEXT_PROBE_TIERS[0]` = 256_000, "default fallback when no detection method succeeds"). Pin diamend: contextManager.test, settings.ts comment, settingsTab desc.
- Pelajaran: saat user lapor angka aneh, cek SEMANTIK metrik dulu (kumulatif vs per-request) DAN sumber datanya (endpoint compat vs native). "Cek konfirmasi cara kerja Hermes" = baca `model_metadata.py`; jangan tebak nama field endpoint native.
- Test: `lmstudio-context.test.cjs` (4 kasus, routing transport double — compat vs native; mutable mock karena bundel menahan satu referensi exports). Smoke v0.1.174. Dicatat: cache `contextLengthCache` di-reset saat plugin reload → setelah ganti context length di LM Studio, reload plugin.

### 160. (2026-08-21) Memory & context engine ala Hindsight (FASE 1) — plugin-native, tanpa Docker/MCP: pure fusion recall + typed retain + facts.jsonl

- Owner: "memorynya pakai sistem hindsight … tanpa docker atau tanpa mcp … built-in ke plugins … deep research dulu". Studi: docs/studies/memory-context-engine-research-2026-08-21.md (Hermes memory_provider/memory_manager + plugin hindsight/honcho/mem0/holographic resmi, Hindsight upstream, Mem0/Letta/Zep).
- Dari 8 provider Hermes Desktop, hanya HOLOGRAPHIC yang benar-benar "built-in tanpa apa-apa" (SQLite lokal); sisanya cloud/server. Desain final = campuran: model data Hindsight (world/experience facts), jalur tulis Mem0 (satu panggilan LLM memutuskan typed ops add/update/delete + dedupe), trust Holographic, context Letta (core MEMORY.md/USER.md tetap; engine = archival).
- FASE 1 yang dikirim: `src/agent/memoryEngine.ts` (pure + store): tokenize/factKey/bm25/entityOverlap/temporalWeight/rankFacts (fusi = log1p(bm25)·3 + entity·2.5 + recency, ×(0.5+0.5·trust)), contradicts (negation-flip hint), parseFactsJsonl/serialize, buildRetainPrompt/parseRetainOps (JSON `[… ]` di prose LLM), recallableFacts/buildRecallBlock (preamble + threat-scan), isTrivialPrompt (Hermes TRIVIAL_PROMPT_RE), EngineMemoryStore (facts.jsonl di `<memoryFolder>/.engine/`, adapter vault, escape guard).
- Wiring: settings `memoryEngineEnabled/RetainEveryN/RecallMax` (default true/1/8, clamp) + 3 baris UI di tab Memory & Context; runner `engine` + `engineForPolicy` + `assembleSystemPrompt(..., recalledMemory)` (headless pass null); systemPrompt `recalledMemory` section; ChatApp recall pre-run (pure, no LLM, never breaks run) + `maybeRetainMemory` post-turn (fire-and-forget, skip trivial, every-N) + statusbar indicator `oa-memory-tag` + BrainIcon (live → amend pin v0.1.129 comment).
- KEJUJURAN (didokumentasikan): tanpa embedding/cross-encoder kualitas recall di bawah Hindsight-ber-server; recall Fase 1 = fusi murni (nol latensi), rerank LLM/embedding = fase berikutnya. Retain = 1 panggilan LLM ekstra per N turn.
- Jebakan: (a) `.setControl()` bukan API Setting Obsidian — slider via controlEl.appendChild (terulang, sudah masuk Lesson 159); (b) test store pakai stub adapter (exists/read/write/mkdir) karena App asli butuh vault; (c) `private factsPath` tetap bisa diakses runtime JS — jangan pin `=== undefined`; (d) canonicalVaultPath MELEMPAR pada `..` (assert throw, bukan normalisasi). markModified ×59→×62. Test memory-engine.test.cjs (35 cek) + smoke v0.1.176 + chain npm test.

### 161. (2026-08-21) Memory engine FASE 2 — reflect: facts→observations (evidence+proof count, refined bukan duplicate) + mental models (read = file read, tanpa LLM)

- Melanjutkan Fase 1 (Lesson 160). Tambahan di `src/agent/memoryEngine.ts`: `EngineObservation` (text + factIds + proofs + proofCount + trust), `EngineMentalModel` (question→answer), `EngineMeta` (lastReflectAt + factCountAtReflect untuk throttle), `MENTAL_MODEL_QUESTIONS` (4 pertanyaan standing built-in, bounded set read-cheap).
- Pure: `consolidationDue` (≥8 fakta pertama kali; ≥5 dirty; atau dirty>0 + cooldown 10 menit), `buildReflectPrompt`/`parseReflectOps` (obs/obsDelete/model; pertanyaan model di luar MENTAL_MODEL_QUESTIONS DITOLAK supaya set tetap bounded), `applyReflectOps` (replaceId = refine BUKAN duplikat; factIds+proofs di-merge; proofCount recompute; model di-upsert by question), `buildMentalModelBlock` (skip jawaban kosong, cap 1500 char).
- Store: `reflect(llm)` (load facts+obs+models+meta → gate due → LLM → apply → tulis 3 file + meta; `[]` tetap menandai pass supaya tidak re-fire tiap turn) dan `mentalModelsBlock()` (read murni). File: `.engine/observations.jsonl`, `.engine/models.jsonl`, `.engine/meta.json`. `genId(prefix)` digeneralisasi.
- Wiring: runner `assembleSystemPrompt` baca `stores.engine.mentalModelsBlock()` → `PromptParts.mentalModelBlock` → section "Mental models (settled knowledge…)" SETELAH recall block (keduanya konteks, bukan instruksi). ChatApp `maybeRetainMemory` setelah retain → `await engine.reflect(...)` (masih fire-and-forget, best-effort, silent). Headless TIDAK reflect (jalur owned-interactive saja).
- Kejujuran: reflect = 1 panggilan LLM lagi per pass (di-throttle). Tidak ada UI baru (reflect ride memoryEngineEnabled) — sadar, supaya Fase 2 tidak menambah churn markModified. Indicator statusbar tetap "N memories" (facts), reflect silent (Hermes routine-silent parity).
- Jebakan: (a) `MENTAL_MODEL_QUESTIONS.includes(question)` di parseReflectOps = bounded set — LLM yang ngarang pertanyaan lain di-drop, cegah models.jsonl tumbuh liar; (b) `reflect` dipanggil SEBELUM cek `consolidationDue` di store (bukan di caller) supaya satu sumber kebenaran cadence; (c) meta.json ikut ditulis saat `[]` supaya pass kosong tidak loop. Smoke v0.1.177 + 12 cek baru memory-engine.test (47 total).

### 171. (2026-08-22) Owner: "compress when above / preserve recent tail tak muncul, itu persentase ya?" → YA, bug `%` ditulis ke `<input type=number>`

- Akar: `createSliderInput` menulis `num.value = fmt(v)`; dua slider kompresi memakai `format: (v) => \`${v}%\`` → `num.value = "80%"`. Browser MENOLAK nilai ber-% di input type=number (value sanitization) → kotak jadi KOSONG. Range slider sebenarnya masih tampil, tapi user melihat kotak kosong = "field tak muncul".
- Fix: (1) `num.value = String(v)` SELALU (angka polos); `format` kini HANYA untuk `aria-valuetext` (screen reader). (2) Opsi baru `unit?: string` → span `.oa-slideinput-unit` (aria-hidden) di kanan kotak, supaya "%" tetap terlihat. (3) Dua call site kompresi tambah `unit: "%"` (format dibiarkan untuk a11y).
- Bukti: probe settings F45 (real-DOM) — thrNum "80", tailNum "20", unit % tampil, range "80"/"20". Smoke v0.1.186 mem-pin `num.value = String(v)` + larangan `num.value = fmt(v)` + unit di kedua slider.
- Pelajaran: nilai non-numerik (suffix unit) TIDAK boleh masuk value input type=number — pisahkan "nilai" (untuk input) vs "tampilan" (span/aria). Sebelum pakai `format` di komponen input, cek apakah target-nya input numerik.

### 172. (2026-08-22) Owner: "reset khusus yang ketik manual, terlebih angka" → tombol ↺ reset-to-default hanya pada field numerik/teks

- Owner menajamkan: saklar TIDAK butuh reset (keadaan kasat mata, satu klik balik). Reset bernilai untuk nilai yang default-nya tidak kasat = ketikan manual, terutama angka.
- `settingsModified.ts` tambah `setPath` (simetris getPath). `settingsTab.resetButton(setting, path)`: hanya render bila `isModified`, `addExtraButton` + `setIcon("rotate-ccw")` + `setTooltip("Reset to default")`; klik = `setPath(s, path, deepClone(getPath(DEFAULT_SETTINGS, path)))` + save + refreshViews + Notice + display().
- 23 titik reset: 18 numerik/teks yang sudah ada + 3 field yang bahkan TANPA titik modifikasi (Max output tokens/maxTokens, Context window/modelContextLength, Request timeout/requestTimeoutMs — kini dikasih var + markModified + reset sekalian). compressionThreshold & compressionProtectLastN dapat reset DI KEDUA blok (Model tab lama + Memory tab baru).
- TEMUAN sampingan: kompresi muncul DUA KALI (blok lama Model tab v0.1.17 + blok baru Memory tab v0.1.175) — sisa yang belum dibereskan; dilaporkan ke owner, belum dihapus (butuh keputusan).
- Jebakan: (a) extra button di shim = `div.extra-setting-button`, BUKAN `<button>` → probe pilih `[aria-label="Reset to default"]` (element-agnostic), bukan `button[...]`; (b) onChange TextComponent Obsidian = event `input`, bukan `change`; (c) `setPath` perlu cast `s as unknown as Record<string,unknown>` (OpenAgentSettings tanpa index signature); (d) markModified ×63→×66 (3 field baru). Probe F46 (ubah→tombol+dot→klik→default→tombol hilang) hijau. Smoke v0.1.187 mem-pin 23 resetButton + larangan pada toggle/enum (stCompressionEnabled/stApprovalMode/stMemoryEnabled).

### 177. (2026-08-22) Owner: "kemarin personality preset ada yang kamu ubah ya? untuk promptnya? bisa disamakan lagi dengan hermes desktop?" → YA, prompt 14 built-in kita ≠ Hermes; kini VERBATIM

- Jujur: yang pernah kubuat adalah NAMA preset (kunci) = sudah cocok dengan 14 built-in Hermes + 4 mode vault tambahan. Tapi TEKS prompt-nya karangan kita sendiri — "mode descriptor" pendek orang-ketiga ("Friendly, general-purpose assistant mode — …", "Speak like a tech-savvy pirate captain…"). Hermes memakai prompt orang-pertama role-play yang jauh lebih hidup. Jadi ya, prompt-nya menyimpang dari Hermes Desktop.
- Verifikasi source (re-klon, commit 261a4ef @main, 2026-08-22): `hermes_cli/personality.py` `BUILTIN_PERSONALITIES` = 14 teks verbatim (helpful…hype, lengkap dengan kaomoji: kawaii "(◕‿◕)…ヽ(>∀<☆)ノ", catgirl "Neko-chan…(=^･ω･^=)", uwu "hewwo! i'm your fwiendwy assistant uwu~", noir "They call me Hermes…", hype "YOOO LET'S GOOOO!!!"). Desktop cuma mirror NAMA via `apps/desktop/src/lib/personalities.ts`; pemilik tunggal teks = personality.py.
- Mekanisme parity ikut terkonfirmasi: Hermes menyuntik personality sebagai `ephemeral_system_prompt` yang di-APPEND paling akhir system prompt (`conversation_loop.py`: effective + "\n\n" + ephemeral) — persis posisi wrapper kita ("Personality overlay X is ACTIVE… MUST adopt this voice") di akhir stack. Tak ada yang perlu diubah selain teksnya.
- Fix: 14 prompt diganti VERBATIM; 4 mode vault (researcher/engineer/writer/librarian) TETAP (tidak ada padanan Hermes — dilaporkan ke owner, bukan dihapus diam-diam).
- Kaomoji/emoji di sini = konten prompt YANG DILIHAT MODEL, bukan chrome UI → kontrak "no emoji" (openagent-ui) TIDAK dilanggar. Dicatat eksplisit supaya tak ada yang "mengoreksi" balik.
- Pin: harness `personality` (assert uwu) di-amend ke teks Hermes; smoke v0.1.192 baru mem-pin tanda-tangan 8 teks verbatim + 4 extras + larang teks "mode descriptor" lama (slice literal PERSONALITY_OVERLAYS saja, kebal komentar).

### 176. (2026-08-22) Owner: "apa yang perlu kita ubah / perbaiki dari setiap deskripsi?" (indikator: singkat-padat-jelas, menerangkan kegunaan utama) → audit copy settings menyeluruh + guard anti-regresi

- Dibaca SEMUA copy: 15 desc tab (SECTION_DESC) + 33 desc grup (subheading) + 102 desc setting (setDesc). Temuan dikelompokkan A–E; owner pilih terapkan SEMUA + buat guard.
- A (bug/fakta usang): (1) typo `course`→`coarse` di "Max output tokens"; (2) desc tab Chat masih bilang "iteration cap" padahal baris itu sudah pindah ke Advanced (v0.1.151) → jadi "personality and session storage"; (3) desc tab General bilang cuma "chat view" padahal memuat Backup & Restore + Danger Zone.
- B (nama internal upstream bocor ke UI): `Hermes target_ratio` / `Hermes protect_last_n` di dua desc kompresi → ganti ke efeknya; istilah upstream pindah ke komentar kode.
- C (jargon teknis): "the wire"/"wire estimate"→"the conversation", "transport details"→"requests and responses", "provider-advertised"→"auto-detect", "operator-level instructions"→"extra instructions".
- D (kepanjangan, 10 desc): Checkpoints 160c→satu kalimat; Include API keys; Title generation; Context menu Quick Ask; Docker image; Memory Budget; Run a script; Script only; I understand Local (consent — dipangkas tapi makna keamanan utuh); Stop all owned processes.
- E (konsistensi): Temperature `-1 = omit`→`don't send`; desc tab Advanced di-rescope ke isi aktualnya.
- Guard v0.1.191 (smoke): ekstrak SETIAP literal setDesc → panjang (di luar ${...}) wajib ≤140 + larang token internal di string UI saja (komentar kode kebal — jebakan string-match yang menggigit komentar dihindari dengan regex ber-scope setDesc).
- Voice rules tertulis di skills/internal/openagent-ui/SKILL.md ("use first, mechanism second"; ≤140c; default di akhir; larang nama internal; angka yang bisa drift di-pin test).
- Pin yang di-amend: copy band ("Switches back…" → "Resets to Off each time you open this tab.") + agent SECTION_DESC (baris 4868). Deskripsi baru diverifikasi jujur: toggle Include-API-keys memang selalu mulai Off tiap render; tombol notif test berubah "Send test" saat izin sudah granted → kata "may ask" dipertahankan.

### 175. (2026-08-22) Owner: "mau hidupkan kembali tab about" → tab About informasional + header menyisakan tagline pendek

- Owner awalnya bingung mau diisi apa. Diskusi dulu, lalu diputuskan paket LENGKAP: Identity (versi/build/requirements) · About (deskripsi penuh dari manifest) · License (MIT) · Built on (attribution ke Hermes Agent/Desktop, prompt-kit, lobe-ui, shadcn-ui, Lucide, obsidian-copilot — dari reference-sources.md) · Data & diagnostics (pernyataan "semua lokal" + tombol Copy diagnostics).
- Keputusan owner: TIDAK ada "check for updates" (belum ada server update — menjanjikan cek yang tak bisa dilakukan = tidak jujur). Versi tetap ditampilkan di Identity. Lalu ralat owner: header settings boleh menyimpan deskripsi SINGKAT — sisakan hanya kalimat pertama manifest ("A self-improving AI agent for your vault."), sisanya pindah ke About.
- Header disingkat dengan MEMOTONG manifest.description (split ". "), bukan hardcode — kalau deskripsi manifest berubah, tagline ikut.
- Syarat teknis penting: tab harus muncul di pencarian settings (F33) → baris About SEMUA pakai `Setting` asli (bukan div kosong), karena buildSettingsIndex hanya mengindeks `.setting-item`; query "about" cocok lewat `sectionLabel` ("About").
- Copy diagnostics = versi/build/platform (Platform.isMobile/isDesktop) + jumlah toolsets aktif + id provider ber-key TANPA key + user agent. Fallback `execCommand("copy")` bila `navigator.clipboard` absen. Secret TIDAK boleh bocor.
- Anti-breakage dipatuhi penuh: 4 edit wajib (SectionKey/SECTIONS/SECTION_DESC/case renderSectionBody), amend pin smoke absen-about (2 blok `!includes('key:"about"')` jadi `includes('key:"about", label:"About"')` + `private about(`), probe F33 `emptyTabsStayHidden`→`aboutInTabs` + `emptyTabsStayOutOfSearch`→`aboutInSearch`, SECTIONS build-settings.mjs + "about" (muncul shot settings-about.png).

### 174. (2026-08-22) Owner: "tampilan untuk persentase bisa dibuat lebih menyatu dengan fieldnya, seakan seamless" → unit "%" pindah ke DALAM kotak angka

- Sebelumnya span `.oa-slideinput-unit` adalah anak ketiga `.oa-slideinput` — dengan `gap: 16px` label "%" mengambang 16px di kanan kotak, terlihat seperti elemen terpisah, bukan bagian field.
- Fix CSS+DOM: kotak angka dibungkus `.oa-slideinput-numwrap` (position relative, flex 0 0 64px). Unit jadi suffix ABSOLUT di dalam kotak (top 50% + translateY(-50%), right 8px, pointer-events none) — terlihat seamless, "80  %" dalam satu field. `has-unit` hanya memberi `padding-right: 22px` pada input (non-unit slider tak kena padding). Class `.oa-slideinput-unit` tetap (kontrak probe F45 `unitShown` tak berubah).
- Pelajaran: "menyatu dengan field" untuk suffix unit = letakkan di dalam kotak via wrapper relative + absolute, BUKAN saudara flex di sampingnya. Gap flex berlaku ke SEMUA saudara — suffix visual bukan saudara sejajar, melainkan lapisan di atas input.

### 173. (2026-08-22) Owner: "excluded folder tidak perlu ada reset button" → ↺ dihapus pada daftar eksklusi (list ≠ scalar)

- Daftar workspace exclusions adalah LIST hasil picker (FolderSuggestModal), tiap baris punya tombol trash sendiri. Tombol ↺ reset-to-default yang kubuat di v0.1.187 salah tempat: satu klik akan mengosongkan SELURUH daftar sekaligus — destruktif dan tak simetris dengan model "reset satu field ketikan".
- Fix: hapus `resetButton(stExclusions, ...)`. `markModified` TETAP (dot modifikasi masih valid: "daftar berbeda dari default"). Jumlah situs reset 23→22.
- Pelajaran: reset-to-default hanya untuk SCALAR yang ditebak ulang (ketikan angka/teks). Koleksi (list/object) punya UI pengelola sendiri (per-item remove) — jangan kasih tombol yang mengosongkan seluruh koleksi. Sebelum menambah reset, tanya: "satu klik ini memulihkan SATU nilai, atau membuang banyak?" Yang kedua = bukan reset.

### 170. (2026-08-21) Owner: "ubah oa-attach-menu dan oa-model menu diatas composer juga, biar rapi di desktop & phone" → full-width di atas composer (paritas slash menu/panel)

- Kedua menu tadinya SUDAH membuka ke atas, tapi popover sempit (attach 250px, model 270/300px) yang menempel ke tombolnya. Owner mau seragam dengan slash menu/panel: full-width di atas composer.
- Fix CSS-only (DOM tetap — outside-click `contains()` pada anchor masih valid): (1) hapus `position:relative` dari `.oa-attach-anchor` & `.oa-app .oa-model-picker` → containing block jadi `.oa-composer-zone` (relative); (2) kedua menu → `position:absolute; bottom:100%; left:12px; right:12px; margin:0 auto 6px; width:min(820px, calc(100% - 24px))`. Hasil = persis lebar composer (min(820, zone−24)), tengah. Attach menu tambah `max-height:min(24rem, calc(100vh - 12rem))` + `overflow-y:auto` (aman di layar pendek).
- `.oa-quickask .oa-model-menu` TIDAK disentuh (surface terpisah, anchor sendiri).
- Bukti: skenario harness baru `menugeo` (buka model menu → ukur rect vs composer-zone → Escape → buka attach menu → ukur) assert modelShown/attachShown + above + wide (width ≥ zone−25). Hijau. Pin smoke v0.1.70 (width 270px→300px) diamend ke `width:min(820px, calc(100% - 24px))` + left/right 12px. Guard baru v0.1.185 (kedua menu full-width + kedua anchor static).
- Jebakan: jangan pakai `width:auto` + `max-width` saja untuk centering abs-pos (algoritme margin-auto ambigu saat width auto); pakai `width:min(820px, calc(100% - 24px))` eksplisit supaya `margin:0 auto` centering deterministik. Dan `calc(100% - 24px)` = 12px kiri + kanan padding composer-zone.

### 169. (2026-08-21) Owner: "tidak ada blok yang menjelaskan sedang compression" → banner START ditambahkan (ThinkingBar "Compacting…" terlalu singkat)

- Akar: `maybeCompressConversation` jalan SEBELUM agent loop, jadi `setLiveStatus("Compacting context…")` hanya tampil sepersekian detik di ThinkingBar lalu tertimpa "Thinking" — user tak sempat lihat. Banner END ("Context compacted — N…") SUDAH ada via `pushLocalNoticeTurn` → SystemMessage, tapi tidak ada indikasi SEDANG kompres.
- Fix: dorong banner START (`pushLocalNoticeTurn("Compacting context — folding earlier messages into a rolling summary.")`) tepat setelah `setLiveStatus`, SEBELUM summarize. Kini ada 2 blok sistem permanen per kompres (start + end), keduanya role "system" (bukan bubble assistant), dan keduanya ikut ter-persist sebagai system turn.
- Aman untuk wire: `pushLocalNoticeTurn` hanya menyentuh `turns` (display), BUKAN `messagesRef` (wire) — summary tetap di wire, turn banner tidak bocor ke model.
- Harness `compress` diamend: assert `domStartNotice` + `domNotice` (keduanya `.oa-sysmsg`, bukan `.oa-msg`). Smoke v0.1.184.
- Catatan paritas: Hermes hanya menampilkan label transien "Summarizing thread" saat kompres (status.tsx), TANPA banner permanen — kita LEBIH eksplisit (2 banner). Divergensi sadar yang lebih membantu user.

### 168. (2026-08-21) RILIS RESMI 0.1.147 — ritual bump versi + arsip pristine

- Owner "lanjut" setelah semua fitur menumpuk → rilis resmi (bukan test build). Bump versi = KEPUTUSAN saya (0.1.147, konsisten pola 0.1.145→0.1.146; minAppVersion TETAP 1.5.0 — tidak ada API baru yang diwajibkan).
- Yang WAJIB di-bump serentak (cek check-docs = konsistensi manifest==package==lock==versions.json): manifest.json, package.json (2×: version), package-lock.json (2×), versions.json (entry baru, urut numerik), `src/agent/mcp/client.ts` clientInfo.version (live protocol field), dan **15 pin smoke** `"0.1.146"` → `"0.1.147"` (pola "manifest masih versi X" yang menempel di banyak guard). Komentar historis ("mirrors v0.1.146") TIDAK diubah.
- Ritual rilis penuh = `npm run release` (typecheck→build→test→pdf-security→check-docs→preview chat+settings→zip+verify) — 208 detik, semua hijau, zip `release/openagent-obsidian-plugin-v0.1.147.zip` + stamp.
- Arsip pristine `releases/v0.1.147/` (meniru layout v0.1.146): plugin zip + .sha256, clean-source zip + .sha256 + per-file manifest.sha256 (244 file; tar --exclude node_modules/main.js/vendor/release/preview/test/dist/out/shots/frames.json/ui-preview/coverage/.obsidian), final-report.md.
- RELEASES.md dapat entry 0.1.147 (judul + bullet per tema + status "locally validated" + daftar yang belum diverifikasi end-to-end di mesin asli).
- Jebakan: `npm run release` menjalankan pdf-security + preview yang butuh chromium (cache ms-playwright persisten, tapi package-nya ikut npm ci); zip rilis TIDAK sama dengan zip test manual (ini via release.mjs resmi). Setelah rilis, working copy di-`npm run clean`.

### 167. (2026-08-21) Owner "kerjakan #1" → label duplikat "Title generation" di tab Model dibelah jadi dua nama

- Ada DUA baris bernama sama "Title generation" (toggle fitur + slot aux-model) → membingungkan. Fix: aux slot di-rename "Title model"; toggle tetap "Title generation". Konsisten dengan slot aux lain (Compression / Goal judge / Web extract / Vision = nama tugas, bukan fitur).
- Pin yang WAJIB diamend: probe settings F15 memakai `findRow("Title generation", true)` (aux=true = baris ber-tombol "Set to main") di DUA tempat → ganti ke "Title model" (bukan matikan — F15 masih harus membuktikan slot title bekerja). Smoke v0.1.147 (`tab.includes("Title generation")`) TETAP hijau karena toggle masih bernama itu. Guard v0.1.183 mem-pin kedua nama.
- Pelajaran kecil: rename label = cek string-match selector di harness probe (findRow by name), bukan cuma smoke; satu label bisa muncul di beberapa selector.

### 166. (2026-08-21) P3: kontrol bertumpuk di Model tab → provider+model SIDE-BY-SIDE (oa-control-row)

- `stackedControl(setting, { row?: boolean })` menambah class `oa-control-row`; CSS varian = `flex-direction: row; flex-wrap: wrap; align-items: center`, dropdown/input `flex: 1 1 140px; width: auto; min-width: 120px`, button `flex: 0 0 auto`. Diterapkan: Global default model (provider+model+Apply), Fallback N, MoA Reference N, Aggregator.
- Terukur (probe geometri real-DOM): Global default 205→129px · Fallback 132→94px · Reference 151→113px · Aggregator 151→113px. 0 overflow baru. F14 (draft atomik) tetap hijau — dropdowns/buttons tidak berubah aria/text.
- SENGAJA TETAP bertumpuk penuh-lebar: Custom global model id (input id panjang), Environment/Headers (multiline), Custom system prompt (textarea 209px). Itu butuh lebar/tinggi penuh, bukan "stacked yang bisa disampingkan".
- Jebakan: pin smoke `stackedControl(pickSetting)` putus saat argumen `{ row: true }` ditambah → amend di tempat (intent sama), jangan matikan. Guard v0.1.182 mem-pin konversi (dan `!stackedControl(row);` / `!stackedControl(agg)` supaya tak diam-diam balik ke kolom).

### 165. (2026-08-21) Owner: "layout UI yang baik di setting" → subheading konsisten + deskripsi diringkas (buktikan pakai probe geometri, bukan nebak)

- Tanpa visi screenshot: UKUR DOM settings harness. Probe temp `.setting-item` geometry 14 tab: 0 overflow, 0 ctrl meluber, 0 name wrap. Ditemukan: (a) 8 tab sudah ber-subheading, 6 belum (workspace/safety-top/agent/appearance/profiles/automations/advanced) → baris terasa tumpukan; (b) 10 baris 94–125px karena desc 2 baris (bukan kontrol).
- P1: subheading "Approvals" (safety), "Scope" (workspace), "Chat surface" (appearance), "Limits" + "System prompt" (advanced), "Scheduled tasks" (automations). Chat & Profiles sengaja TANPA (3 baris / list sudah kohesif — jangan over-churn).
- P2: desc diringkas (Workspace mode, Approval mode, Tool calls, Reasoning, Embedding model — tetap muat "Pick a model" untuk probe F44, Watch a page, Run a script, Import settings, Context window, New profile, Search backend, Enable MCP, Workspace folder ×3 varian). Hasil terukur: semua baris desc-driven 94–125px → 79px; appearance 79→63px.
- PUTUSAN dipertahankan (P4): sidebar Hermes TIDAK diadopsi — tab horizontal + panah + keyboard ←→ sudah keputusan lama; hanya layak kalau owner minta paritas penuh.
- Jebakan: (a) desc "Approval mode" & "New profile" di-pin guard copy C1–C16 → amend di tempat (string baru), jangan matikan; (b) "Embedding model" desc wajib tetap memuat "Pick a model" (probe F44 pin). Smoke v0.1.181. P3 (kontrol bertumpuk Global default model/Fallback/Reference/Aggregator/Custom prompt = 129–209px) DITUNDA — itu restruktur kontrol, bukan desc.

### 164. (2026-08-21) Owner: "perbaiki capabilitas composer textarea yang belum sesuai Hermes Desktop" → ↑/↓ input-history browse + UNDO/REDO milik sendiri + Escape halt

- Verifikasi source Hermes `apps/desktop/src/app/chat/composer/index.tsx` + `store/composer-input-history.ts` + `app/chat/composer/undo-history.ts` + `hooks/use-composer-undo.ts` + `lib/keybinds/composer-focus-keys.ts`. Tiga gap composer textarea yang DIPORT (sisanya sengaja skip — lihat bawah):
- (1) ↑/↓ input-history browse: `src/ui/composer/history.ts` — `deriveUserHistory` (ring user-text newest-first, di-derive dari turns LIVE tiap press — bukan mirror) + `ComposerHistoryBrowse` (cursor -1 = tak browsing; `browseBackward` snapshot draft, `browseForward` restore draft saat kembali ke present). Prioritas panah persis Hermes: queue-edit → draft-kosong+ada-antrean → history; draft berisi yang BELUM browsing TIDAK dibajak. `stepQueueEdit(±1)` baru (snapshot draft asli tetap utuh).
- (2) UNDO/REDO milik sendiri: `src/ui/composer/undo.ts` — `createComposerUndoHistory` (snapshot text+caret, coalesce 600ms, limit 200, no-op record di-drop, fresh edit invalidate redo) + `isUndoShortcut`/`isRedoShortcut` (⌘/Ctrl+Z; ⌘/Ctrl+Shift+Z; Ctrl+Y). PromptInput: `onBeforeInput` record (coalesce insertText), paste/newline/markdown record manual, keydown klaim chord SEBELUM markdown/Enter; `resetUndo` via handle (dipanggil newConversation/loadConversation). ALASAN: chip re-render kita (renderText) melewati undo Chromium — kelas bug yang sama yang diperbaiki Hermes (#45812).
- (3) Escape halt: saat `running` dan bukan queue-edit/at-menu/slash-menu → `haltAgent()` (paritas tombol Stop).
- Reset browse: newConversation, loadConversation, beginQueueEdit, handleSubmit.
- Jebakan BESAR (hampir lolos): blok baru TADINYA ditaruh SETELAH `if (!atQuery) return;` → unreachable. Pindah SEBELUM early-return itu. Selalu cek posisi relatif early-return saat menyisip logika keyboard.
- Real-DOM: skenario `composer` baru (2 prompt → ↑↑↓↓ → draft restore → draft berisi tak dibajak) hijau. Unit composer-input.test.cjs (34 cek). Smoke v0.1.180. Sengaja DILEWAT + alasan: URL→`@url:` chip (butuh resolver URL — @ kita = file vault), suggestion pills (bus MCP connect), voice (ASR), type-to-focus (handler level-dokumen, bukan textarea internal) — semuanya dicatat sebagai divergensi sadar.

### 163. (2026-08-21) Owner: "bisa gak ganti jadi picker seperti setting model" → embedding model jadi DROPDOWN dari katalog provider aktif, bukan ketik manual

- Baris "Embedding model" (Memory & Context) yang tadinya `.addText` diganti `.addDropdown`: opsi "off (keyword recall only)" + katalog model provider aktif (`withCurrentModel(catalogOf(activeProvider), s.memoryEngineEmbedModel)` — persis pola picker Model tab), nilai tersimpan yang off-catalog tetap tampil (tidak pernah hilang diam-diam). onChange langsung saveSettings.
- Kenapa provider AKTIF (bukan semua): embedding di runtime dipanggil ke provider yang dipakai chat (`embedTexts(provider, embedModel, …)`), jadi katalog provider aktif = sumber jujur. Model embedding yang sudah di-load di LM Studio ikut tampil setelah fetch (Providers → Test connection), sama seperti model biasa.
- Jebakan: `.addText` → `.addDropdown` mengubah probe F44 (harness settings) — TIDAK boleh ada `input[type=text]` di baris itu; assert `select` + opsi "off" + model provider + desc "Pick a model". Smoke v0.1.179 + probe F44embedPick. markModified tetap ×63 (satu baris, satu markModified — tidak berubah).

### 162. (2026-08-21) Memory engine FASE 3 — semantic recall via /v1/embeddings (embedding-gemma-300m) + observations ikut di-recall; embedding OPSIONAL

- Melanjutkan Fase 1–2. `embedTexts` di providers.ts (POST /v1/embeddings, OpenAI-compat; satu vektor per input, entri hilang → null; transport/parse gagal → null, TIDAK throw — semantic adalah boost, bukan syarat). `EmbedFn` + `cosineSimilarity` (clamp [0..1], norm-nol/panjang-beda → 0) + `fuseScores<T>` (score × (1+cosine), embed null → urutan tetap) + `rankObservations` (BM25+recency+trust; observations tanpa entity) di memoryEngine.
- Store: `search(q, limit, embed?)` & `searchObservations(q, limit, embed?)` — pure fusion dulu (kandidat limit×3), lalu re-rank cosine bila embed ada. `buildRecallBlock(facts, observations[], maxChars)` — section "Consolidated observations:" + injection-scan pada keduanya.
- Wiring ChatApp: bila `memoryEngineEmbedModel` terisi + provider usable → embed closure `(texts)=>embedTexts(provider, model, texts)`; recall = `Promise.all([search, searchObservations])`; `recalledCount = facts+obs`. Setting baru `memoryEngineEmbedModel` (default "", trim+cap 200) + baris "Embedding model" di tab Memory & Context.
- Spek owner (6 GB VRAM): gemma-4-e4b ±2,5–3 GB + embedding-gemma-300m ±0,3 GB = aman; embedding bisa offload CPU. Tanpa embed recall tetap jalan (pure fusion).
- Kejujuran: cosine atas fakta pendek OK; bukan cross-encoder. Benchmark Hindsight tetap di atas. Embedding = 1 panggilan per recall (query+kandidat di-satukan 1 request).
- Jebakan: (a) `buildRecallBlock` signature berubah (observations param ke-2) → pemanggil test 2-arg lama WAJIB di-update ke `(facts, [], max)` — bukan bikin overloading (string-match guard v0.1.176 masih menunjuk nama fungsi, aman); (b) test fuseScores async TIDAK boleh di top-level .cjs (await hanya di IIFE async) — taruh di IIFE store; (c) markModified ×62→×63 (+1 embedding model). Smoke v0.1.178 + embedding.test.cjs (10 cek) + 14 cek baru memory-engine + settings.test embed normalize.

### 159. (2026-08-20) Owner: "apa yang perlu ditambah di tab Memory & Context merujuk Hermes Desktop?" → blok COMPRESSION (enabled/threshold/target_ratio/protect_last_n) yang belum kita tampilkan

- Verifikasi `apps/desktop/src/app/settings/constants.ts` SECTIONS.id=="memory": keys = memory.memory_enabled, memory.user_profile_enabled, memory.memory_char_limit, memory.user_char_limit, memory.provider, context.engine, compression.enabled, compression.threshold, compression.target_ratio, compression.protect_last_n.
- Punya kita SUDAH punya 4 key memory (enabled/profile/budget×2) + context file + attach active note. YANG KURANG = blok compression: 3 setting sudah ada di settings.ts TAPI tak pernah tampil di UI (compressionEnabled/Threshold/ProtectLastN) + 1 belum ada sama sekali (compressionTargetRatio, default 0.20, clamp 0.05–0.5).
- Ditambah: subheading "Compression" + 4 baris (toggle "Compression", slider "Compress when above" 10–99%, slider "Preserve recent tail" 5–50%, slider "Keep last N messages" 0–24) di memory(). `target_ratio` = fraksi trigger yang dipertahankan sebagai tail verbatim BERBASIS TOKEN (Hermes config_defaults: "fraction of threshold to preserve as recent tail"); `pickTokenTailStart` di contextManager menyapu dari akhir sampai ≥ keepTokens lalu snap ke batas user-message. Di maybeCompressConversation: start = min(startByMessages, startByTokens) (kedua lantai "keep at least").
- JUJUR tidak ditambahkan (bukan dilupakan): memory.provider (honcho/mem0) — diparkir eksplisit; context.engine — slot plugin Hermes (register_context_engine) untuk mengganti ContextCompressor, kita pakai engine bawaan (bukan UI-able di plugin Obsidian). tail_mode/lean, threshold_tokens, min_tail_user_messages = fine-grained, defer.
- Jebakan: Setting Obsidian TIDAK punya `.setControl()` — slider lewat `setting.controlEl.appendChild(createSliderInput(...).el)` (pola stMemoryNudgeInterval). Pin: smoke v0.1.17 + guard baru v0.1.175, settings.test clamp target_ratio, contextManager.test pickTokenTailStart (empty/zero-budget/whole-history/snap-to-user). markModified ×55→×59 (+4 baris compression).

### 157. (2026-08-20) Laporan agent terminal Windows: pisahkan bug asli vs salah-diagnosis agent; akar quoting = cmd /d /s /c tanpa verbatim; model butuh disclosure dialek shell

- Owner meneruskan laporan error agent. PISAHKAN dulu: (a) "pwd is not recognized", "sysctl/free -h gagal" = BUKAN bug plugin — itu perintah POSIX dijalankan di cmd.exe Windows; agent tidak diberi tahu shell-nya apa. (b) "systeminfo | findstr /C:…" → "FINDSTR: Cannot open Physical", "&& → system cannot find the path" = BUG ASLI.
- Akar (b): `localCommand` Windows = `["/d","/s","/c", command]` TANPA bungkus kutip + TANPA `windowsVerbatimArguments`. Node me-re-quote arg (ganda `""`) lalu aturan `/S` cmd men-strip kutip pertama+terakhir → kutip embedded (`/C:"OS Name"`) jadi token pecah. Perbaikan = bentuk shell:true Node (lib/child_process.js): `["/d","/s","/c", `"${command}"`]` + `windowsVerbatimArguments: true` (verbatim) — cmd-lah yang memproses kutip, bukan Node.
- (c) pesan refusal tanpa arahan: "Local execution requires the separate expert opt-in." dan "refused in YOLO approval mode." → kini menyebut setting yang diubah (Settings → Capabilities → Terminal & Processes; Settings → Safety). Behavior TETAP benar (local unsandboxed menolak yolo/never-ask) — hanya pesannya yang dijelaskan.
- (d) disclosure dialek shell: `TerminalApi.describeShell()` + `runner.enrichTerminalShell` menyuntik "Shell: Docker container (network-off) — POSIX /bin/sh | Windows cmd.exe (CMD: dir, type, echo, &&, | — not bash) | POSIX /bin/sh" ke deskripsi tool `terminal` di jalur interactive SAJA. Gagal describe = tool tetap dikirim (never drop).
- Jebakan: `spawn` dipakai bersama oleh docker (inspect/run/rm/version/health) — verbatim HANYA untuk cmd.exe (dari localCommand), bukan flag global. Pin smoke v0.1.173 + test terminal-service (args[0..3] persis + windowsVerbatimArguments true + describeShell) + rejects opt-in guidance. Tidak bisa diverifikasi di Linux sandbox → owner re-test di Windows.

### 156. (2026-08-20) Owner: "di pengaturan profile, merujuk Hermes Desktop, personality tidak ada" → personality = GLOBAL (display.personality), BUKAN per-profile

- Verifikasi source Hermes (klon `--depth 1`): `ProfileInfo` desktop = `name, display_name, provider, model, path, has_env, is_default, skill_count` + `SOUL.md` (identitas) + `profile.yaml` (description/display_name). TIDAK ada personality. `display.personality` = setting GLOBAL di Settings → Chat (view `config:chat`), nama terpilih (empty/none = tanpa overlay); `hermes_cli/personality.py` adalah single-owner (contract: `display.personality` = NAME; `agent.system_prompt` = manual overlay user; kode personality TIDAK PERNAH tulis identity).
- Kita KELIRU: `AgentProfile.personality` + dropdown "Personality overlay" di form profile + dropdown Chat yang menulis `activeProfile.personality`. Perbaikan (v0.1.172): hapus field `personality` dari AgentProfile (interface/makeDefaultProfile/normalizeProfile/migrateProfiles/ProfileStore.create/update/export/import/main.ts), `resolveOverlayKey` kini jatuh ke GLOBAL `s.personality`, dropdown Chat jadi "Personality" global (isOverlayKey + saveSettings), dropdown form profile DIHAPUS, ringkasan kartu profile tak lagi menulis "overlay:", Intro memakai `sessionOverlay` (overlay aktif) bukan `activeProfile.personality`.
- `s.personality` global di-normalisasi via `legacyOverlayKey` saat load (default "none"; "default"/junk → none). `/personality` TETAP session-scoped (owner sudah terima; Hermes persist global — divergensi kecil yang disengaja & terdokumentasi).
- Pin diamend serentak: smoke v0.1.149 (SOUL/personality split → "global, profiles carry none"), probe settings F13 (baris Chat kini "Personality"), smoke section-map ("Personality overlay" → "Personality"), profiles.test (personality tak pernah mendarat di profile; resolveOverlayKey global), settings.test (default global "none"; bundle export drop personality).
- Pelajaran: saat meniru "setting" upstream, PERIKSA LINGKUP-nya (global vs per-profile) di source resmi — bukan cuma namanya. `ProfileInfo` + `personality.py` contract adalah bukti byte-level; jangan tebak scope dari nama field.

### 155. (2026-08-20) Owner "/personality uwu aktif tapi respon tidak berubah" → kabel BENAR (bukti wire); akar = harness runnerMock kurang getToolsWithMcp (sekaligus akar kluster drift title/slash2/slash3/md)

- Bukti wire-level (real-DOM, bukan grep): setelah `/personality uwu`, run berikutnya MEMUAT section `Personality overlay "uwu" is ACTIVE … MUST adopt this voice … Maximum cuteness with uwu-speak` di system prompt. Jadi produksi mengirim overlay — "tidak aktif" di sisi owner hampir pasti model lokal mengabaikan instruksi gaya yang lunak, ATAU `/personality` diketik saat agent sibuk (di-queue → berlaku mulai turn BERIKUT, bukan reply yang sedang jalan).
- AKAR BESAR yang ketemu saat diagnosa: `runnerMock` di `test/real-preview/chat-entry.tsx` TIDAK punya `getToolsWithMcp` padahal runAgent produksi memanggilnya → di sim SETIAP run agent error `getToolsWithMcp is not a function` SEBELUM request apa pun. Ini akar dari kluster "harness drift" yang diparkir (title/slash2/slash3/md — semua lane yang menjalankan agent). Fix = `getToolsWithMcp: async function () { return this.getTools(); }` (DELEGASI ke getTools saat dipanggil — lane tool (fcard/steer/webe/clfy/preview/moa) meng-override `getTools` per-lane; capture `() => []` akan membuat lane-lane itu kelaparan tool). Hasil: TIDAK hanya title/slash2/slash3/md — fcard/steer/webe/clfy/preview/token/branch/chips/goal/qask ikut sembuh.
- Sisa merah setelah itu: moa & moa2 gagal `refsOnceGemma`/`advisorsOnceGemma` (expect gemma count 2 = 1 advisor + 1 title call, terukur 1). Akar #2: `titleGenerationEnabled` default OFF (Lesson 121) — lane moa/moa2 TIDAK opt-in, padahal assertion-nya masih menghitung title call. Fix = opt-in `titleGenerationEnabled` untuk moa/moa2 persis pola lane `title` (bukan ubah ekspektasi jadi 1 — maksud asli assertion = "advisor tak re-run + title call ride model sesi"). SELURUH suite real-DOM kini hijau.
- Pelajaran: "harness drift" yang terlihat seperti banyak bug berbeda bisa jadi DUA kontrak yang basi (method mock hilang + default setting flip). Periksa mock runner terhadap signature AgentRunner asli DAN periksa setting-default yang berubah (Lesson 121 family) sebelum menuduh fitur rusak. Mock harus contract-complete. build.mjs TIDAK masuk npm test → jebakan Lesson 143; kini guard smoke v0.1.171 mem-pin `getToolsWithMcp` + `return this.getTools()` di chat-entry (sama seperti stopTerminalSession).
- Overlay diperkuat: wrapper lama "It overrides the default tone and style — commit fully" → "Every reply MUST adopt this voice and style — do not lapse back into the default assistant tone" (imperatif, menaikkan kepatuhan model kecil). Pin diamend: smoke sp + system-prompt.test ("overrides the default tone" → "MUST adopt this voice").
- Guard baru: skenario harness `personality` (kirim `/personality uwu` → "hello" → assert statusbar "uwu" + notice + system prompt memuat ACTIVE+MUST+teks overlay, dan run tidak error).

### 154. (2026-08-20) Owner: panel = "tidak ada oa-panel-backdrop, sama seperti oa-slash-menu" + "oa-panel diatas composer, sama seperti oa-slash-menu"; "test. wahh kok hilang hasilnya?" = backdrop menutupi chat

- Akar keluhan: panel lama = full-viewport backdrop + sheet di bawah → saat terbuka MENUTUPI seluruh isi chat, jadi "hasil hilang" (isinya tersembunyi di balik backdrop, bukan dihapus). Solusi owner = jadikan seperti slash menu.
- Perubahan: (1) hapus `.oa-panel-backdrop` (JSX + CSS + keyframes oa-panel-up); (2) panel dibungkus `.oa-overlay oa-panel-overlay` DI DALAM `.oa-composer-zone` → popup `bottom:100%` tepat di ATAS composer (wadah sama dengan slash/at/approval); (3) lebar mengikuti composer (max-width 820px lockstep .oa-prompt-input), bg primary, radius-l, border, shadow — cangkang persis slash menu; (4) scroll pindah ke `.oa-panel-list` (`flex:1 1 auto; max-height:min(22rem, calc(100vh - 10rem))`) supaya head+search tetap di atas dan list tidak kolaps.
- Tanpa backdrop, tutup panel = document listener pointerdown (di luar panelRef + panelToggleRef → close) + Escape (kecuali fokus di input rename/search, supaya Escape di input tidak menutup panel). Pola persis [+] attach menu (Lesson-66 family). Toggle di topbar DIANGGAP "dalam" supaya klik toggle tidak race (pointerdown close lalu click reopen).
- Guard: v0.1.168 diamend ke kontrak popover (backdrop absen, max-width 820, flex 1 1 auto, cap 22rem); harness `panel` di-strengthen: backdropGone + aboveComposer (rect panel di atas composer-zone) + listH>0 + rowCount>=4 + glyph history. Probe geometri = bukti nyata, bukan grep.
- Pelajaran: "hasil hilang" yang dilaporkan owner sering BUKAN data hilang — tapi data TERTUTUP elemen overlay. Sebelum cari bug persistensi, ukur dulu apa yang menutupi (z-index/backdrop), dan baca 3 bullet owner sebagai SATU permintaan (ikon + tanpa backdrop + posisi) bukan 3 isu terpisah.

### 152. (2026-08-20) Owner "kenapa tidak disamakan saja?" → panel sesi jadi SATU shell (floating bottom sheet) di SEMUA platform; scoping platform atas inisiatif sendiri = salah

- Koreksi owner (2×): saya memutuskan sendiri "mobile = sheet, desktop = drawer DIKUNCI". Owner balik tanya "kenapa tidak disamakan saja?" → maksudnya SATU tampilan, jangan pecah dua. Akui lalu satukan; arah = sheet (yang owner usulkan sebagai "oa-overlay"), bukan drawer (yang dikeluhkan di HP).
- Satu shell = hapus cabang `Platform?.isMobile` + class `.is-mobile` seluruhnya. Backdrop `align-items:flex-end; padding:10px; background:rgba(0,0,0,.35)` + panel `width:100%; max-width:560px; height:auto; max-height:min(70vh,520px); radius-l; border penuh; animasi oa-panel-up` jadi gaya DASAR `.oa-panel`. Drawer lama (`width:min(290px,88%); height:100%; oa-slide-in`) dihapus.
- `min-height:0` pindah ke `.oa-panel-list` dasar supaya list scroll di dalam sheet yang di-cap.
- Amandemen pin serentak (pola Lesson 121): guard v0.1.168, pin import v0.1.21 (Platform keluar lagi), skenario harness `panel-mobile` → `panel` (probe geometri tunggal `__oaPanelCheck`), ALL_SCENARIOS, type decl.
- Pelajaran (penguatan 121c): kalau owner kasih SOLUSI lalu tanya "kenapa tidak disamakan", jangan baca sebagai "keep scoped" — baca sebagai "terapkan SOLUSI itu SERAGAM". Jangan re-scope keputusan UI atas inisiatif sendiri.

### 151. (2026-08-20) oa-panel di HP: slide-over penuh "sangat mengganggu" → mobile = floating bottom sheet (lebar composer, max-height 70vh, scroll dalam), desktop slide-over DIKUNCI
- Owner: "masalahnya sangat mengganggu ketika dijalankan di hp; solusinya dibuat oa-overlay aja?" Jawaban: YA, overlay — TAPI scoped mobile. Desktop slide-over mapan + punya lane harness (`panel`) → jangan diubah. Mobile: backdrop `align-items:flex-end` + `is-mobile` di aside → `width:100%; max-width:560px; height:auto; max-height:min(70vh,520px); radius-l; border penuh; animasi translateY`. Gate via `Platform?.isMobile === true` (ChatApp kini import Platform).
- Proof: skenario harness baru `panel-mobile` (shim Platform.isMobile jadi getter yang baca `window.__oaForceMobile`, di-set scenario SEBELUM mount) → assert isMobileClass/backdropMobile/floating/panelW>200/maxHeight bukan none/radius≠0/border. Desktop `panel` tetap hijau. Screenshot shots/panel-mobile.png + panel.png.
- Pin diamend di tempat: v0.1.21 mem-pin string import persis (tanpa Platform) → diamend + komentar; v0.1.168 baru. Pelajaran kecil: mem-pin STRING IMPORT persis = rapuh saat API bertambah; amend + jelaskan, bukan matikan.

### 150. (2026-08-20) Slash "/" overlay ≠ Hermes: fixed ke narrow left-docked drawer (320px) + icon/nama/deskripsi + highlight keyboard; pin "hairline grup" diamend karena hairline DIHAPUS (paritas)
- Owner: "oa-overlay untuk slash '/' beda dengan hermes desktop". Banding byte-level `apps/desktop/src/app/chat/composer/trigger-popover.tsx` + `completion-drawer.tsx` + `reference-kinds.ts`: drawer = `left-2 w-80 (320px) bottom-full mb-1`, row = ICON (16px, warna per kind) + nama (medium, foreground, truncate) + deskripsi (tertiary, flex-1 truncate), header grup 10px uppercase tanpa border (spacing pt-2), navigasi keyboard + hover = `data-highlighted`. Kita tadinya: centered max-560px, `code`+span tanpa ikon, tanpa highlight keyboard.
- Fix: `oa-slash-overlay` (flex-start) + scoped `.oa-slash-menu` 320px + scroll; row = `oa-slash-item-icon` (per kind: command=accent/terminal, skill=orange/zap, snippet=cyan/message-square-text — warna+glyph dari Hermes reference vocabulary) + `oa-slash-item-name` + `oa-slash-item-desc`; `slashIndex` state + ArrowDown/Up/Enter/Tab di handleComposerKeys (dipindah ke setelah slashMenu karena butuh runSlash) + onMouseEnter hover-highlight; header grup border-top DIHAPUS (spacing saja).
- Pin diamend: v0.1.129 "gone icons" (TerminalIcon hidup lagi → keluar dari daftar mati + dipin eksplisit), v0.1.120 (slashHdrFullWidth → slashHdrNoRule, karena hairline dihapus), smoke v0.1.165 baru. Jebakan: regex negatif `border-top: 1px` file-wide MEMAKAN blok lain — pin harus slice blok hdr sendiri.
- Temuan pra-syarat (bukan ulah ini, kelanjutan Lesson 143): skenario harness slash2 (`saveMermaidSalvage`), slash3 (`reqHadSkill`/`mainReqCount:0`), md (`remote-media`) gagal — cluster "harness drift". Yang menyentuh slash menu (slash, slash3 visual/headers) tetap hijau; audit harness menyusul.
- Tindak lanjut owner (v0.1.166, TIGA koreksi sekaligus): (1) lebar drawer TIDAK boleh fixed 320px — harus SAMA dengan composer (`.oa-prompt-input`): `width:100% + max-width:820px + margin:0 auto`, lockstep dengan input; (2) `oa-slash-item-name` TERPOTONG karena rule generik `.oa-slash-item span` (0,2,1) mengalahkan `.oa-slash-item-name` (0,2,0) — fix via `.oa-slash-item span.oa-slash-item-name { overflow:visible }` + name `flex:0 0 auto` (natural width, deskripsi boleh ellipsis); (3) slice caps dihapus SEMUA (commands 6→semua, skills/snippets 4→semua, opt 6→semua) — menu scroll. Bukti DOM: menuW==composerW, namesClipped:0, itemCount:25 (24 command + 1 snippet). Pelajaran: rule generik selector-element (span) bisa diam-diam mengalahkan rule class turunannya — cek spesifisitas saat menambah variasi baris.
- v0.1.167 (owner: "arrow key select tidak ikut"): highlight `.is-active` SUDAH pindah, tapi scroll list TIDAK — baris ter-highlight jatuh keluar pandangan setelah beberapa panah. Fix: efek `slashMenuRef` + scroll lokal (block:nearest, Hermes trigger-popover.tsx: topDelta/bottomDelta, ambil delta terkecil, index 0 → scrollTop 0). TIDAK pakai bantuan viewport-scroll (bisa ikut menggeser transcript). Bukti: 12×ArrowDown → active `/personality` fullyVisible (bottom==listH), 12×ArrowUp → balik scrollTop 0. Jebakan 121c lagi: komentar saya menulis kata yang di-pin ABSEN → ditulis ulang tanpa kata itu.

### 149. (2026-08-20) Model pill "ngunci" panjang → composer collapse: bug-nya di RANTAI flex, bukan di pill — flex item yang harus menyusut adalah wrapper (.oa-model-picker), bukan teks di dalamnya
- Owner: nama model panjang membuat pill terkunci panjang, composer collapse saat panel dipersempit. Ukur DULU (rule 137 #5) dengan harness di viewport LEBAR + frame sempit (karena media query max-width:380px mengikuti VIEWPORT, bukan panel — mengukur pakai viewport kecil = menyesatkan). Bukti: label ellipsis ADA tapi tidak pernah aktif karena label = flex item `min-width:auto` (tak mau menyusut); dan yang lebih dalam: `.oa-model-picker` (wrapper) adalah flex item sebenarnya di row nowrap, juga `min-width:auto` → row overflow.
- Fix rantai: `.oa-model-picker` jadi shrinkable flex item (`min-width:0; flex:0 1 210px; max-width:210px`); pill `display:flex; width:100%` (mengisi wrapper); label `flex:1 1 auto; min-width:0` (ellipsis aktif). Mirror di Quick Ask. Hasil terukur: 430→pill 210, 300→169, 240→109, semua `actionsOverflow:false` + send tetap terlihat + label terpotong.
- Pelajaran: "teks tidak terpotong padahal sudah pakai ellipsis" hampir selalu = flex item `min-width:auto` di sepanjang rantai — periksa SEMUA leluhur flex sampai item yang benar-benar menjadi anak row, bukan cuma span teks.

### 148. (2026-08-20) "pindah otomatis saat setting diganti" — dan temuan penting: memindah leaf = view DI-recreate (React state hilang), jadi sesi aktif WAJIB di-capture+direstore, bukan sekadar detach
- Owner: pindah sudah jalan tapi butuh klik ribbon lagi; minta otomatis saat dropdown diganti. Implementasi: onChange settings memanggil `moveChatViewToConfiguredLocation()` (method publik baru; activateView = buka bila belum ada, else delegate ke method ini).
- Temuan penting saat implementasi: ChatApp menyimpan sesi di React state (`useState(() => newSessionId())`), dan leaf relocation = `detach()` + `setViewState()` = view LAMA di-unmount (onClose) + view BARU di-create. Tanpa penanganan, percakapan yang terbuka RESET ke chat kosong. Solusi: ChatView melaporkan `currentSessionId` ke atas (prop `onSessionIdChange`); sebelum detach, main.ts men-capture ke `pendingChatSessionId`; ChatView baru membaca via `consumePendingChatSessionId()` dan memberi `initialSessionId` ke ChatApp; ChatApp me-restore via `loadConversation(initialSessionId)` sekali di mount (jalur sama dengan klik sesi di panel — draft composer ikut pulih karena `composerDrafts` module-level). Bukti behavioral smoke: captured === "sess-42".
- Pelajaran: memindah leaf Obsidian TIDAK preservasi view instance; fitur "pindah panel" yang benar harus menyertakan round-trip state (id sesi) sendiri — jangan asumsikan detach/setViewState cukup.

### 147. (2026-08-20) "Chat panel location" v1 SALAH — owner uji: "tidak berubah sama sekali". Keputusan desain "reveal in place" membuat setting terasa mati; open harus MEMINDAHKAN chat yang sudah ada
- Desain pertama (v0.1.161): setting hanya berlaku untuk leaf BARU; chat yang sudah terbuka selalu di-reveal di tempat. Owner punya chat di right sidebar sejak awal → setiap klik cuma reveal di tempat → nol perubahan terlihat. Pelajaran: "jangan ganggu yang sudah ada" bisa berarti "fitur tidak berfungsi" bila satu-satunya cara user melihat efeknya justru lewat chat yang sudah ada.
- Fix (v0.1.162): `activateView` memetakan region leaf via `leaf.getRoot()` vs `workspace.leftSplit/rightSplit` (else = main/popout). Sama region → reveal. Beda region → `getViewState()` + `leaf.detach()` + `target.setViewState(state)` (pindah utuh). Deskripsi setting diubah jadi "Choosing a different spot moves the panel there the next time you open it."
- Bukti PERILAKU, bukan cuma string: smoke test behavioral yang memanggil `plugin.activateView()` dengan leaf palsu (getRoot→rightSplit, detach recorder, setViewState recorder) → pindah ke left (detach + open di left + reveal target), dan same-region right → reveal existing tanpa detach. Jebakan kecil: smoke = JS polos, anotasi TS (`const x: string[]`) = SyntaxError.

### 146. (2026-08-20) "Chat panel location" (owner): left/main/right — enum dengan default = rumah lama; setelan berlaku HANYA untuk leaf BARU, chat yang sudah terbuka selalu di-reveal di tempatnya
- Setting `chatLeafLocation` ("left" | "main" | "right", default "right" = perilaku historis). `activateView()`: kalau leaf chat sudah ada → reveal in place (tak peduli setting); kalau tidak → `getLeftLeaf(false)` / `getLeaf(false)` / `getRightLeaf(false)` sesuai setting. Ini kontrak penting: setting ≠ memindahkan chat yang sudah terbuka, supaya user tidak kaget chatnya "loncat".
- Enum normalisasi: invalid → "right" (pola toolViewMode). markModified ×54→×55. Mock workspace smoke dapat `getLeftLeaf`/`getLeaf`. Bukti: F43chatLeaf (dropdown 3 opsi + default right + desc "already-open chat") + settings.test (invalid → right, left/main respected).
- Catatan API: `getLeaf(false)` adalah panggilan klasik lintas-versi (minAppVersion 1.5.0); argumen `'tab'` baru di versi lebih muda, jadi dihindari.

### 145. (2026-08-20) A5 BackBottom = TITIK TERAKHIR kurasi lobe-ui; unread dot (bukan angka palsu) + amend lane convo yang TIDAK scrollable
- ScrollButton dapat `badge` (dot "ada pesan baru di bawah saat kamu scroll ke atas"). State di ChatContainer: `newBelow` — observer content-grow (mutation + resize) → kalau pinned ikuti, kalau away tandai; `handleScroll` near → clear; klik scroll → clear segera. aria-label berubah jadi "Scroll to bottom — new messages" (dot-nya aria-hidden). DOT bukan angka: menghitung jumlah pesan di scope ChatContainer (anak = ReactNode opak) mustahil tanpa berbohong.
- Jebakan CSS hampir bikin bug: dot butuh containing block, saya hampir menimpa `position: absolute` tombol jadi `relative` — tombol sudah `absolute` sehingga OTOMATIS jadi containing block dot; override dihapus sebelum typecheck. (Kelas Lesson 136: sentuh positioning → pikir efek ke rule yang sudah ada.)
- Lane convo scroll-button ternyata RUSAK PRA-SYARAT (error "convo not scrollable" — konten kalengan pendek di env ini), sudah begitu sejak sebelum sesi. Amend di tempat: lane menumbuhkan filler 600px dulu (prekondisi lane = scrollable, bukan "pendek"), fade assertion TIDAK berubah, lalu lane dot tumbuh filler sendiri. Bukti: fade + dot grows/clears hijau penuh.

### 144. (2026-08-20) A3 TokenTag: pill token dapat bar context-window — % HANYA saat window diketahui; dan dua pin "no bare hex" (v0.1.94/95) menabrak fallback hex SAH → strip var() sebelum cek
- Statusbar `↑in ↓out` polos diberi bar 2px + persentase saat context window DIKETAHUI (resolveContextWindow: setting eksplisit > advertised provider). Overload (in > window) → teks+fill merah. Window tak diketahui (auto tanpa metadata) → pill polos, TIDAK menebak. advertised di-fetch lazy per koneksi (cached providers.ts), stale-guard via key ref.
- Fallback hex `#e93147` di CSS baru (kontrak SAH) memicu pin v0.1.94/95 yang mem-pin `!/#[0-9a-fA-F]{3,8}/` pada tail CSS. Amend di tempat (bukan dimatikan): `bareHex = /#.../.test(tail.replace(/var\([^()]*\)/g, ""))` — hex di dalam var() fallback = bentuk sah, dibuang sebelum cek. Intent (larang hex HARDCED) dipertahankan.
- Bukti: F42tokenTag (bar 2px, fill 60%, overText/overFill merah) + screenshot shots/token-tag.png. Wiring (useEffect resolve + JSX) dipin smoke v0.1.159. Port lobe-ui TokenTag = BAR datar, bukan ring antd (kontrak flatness).

### 143. (2026-08-20) A1 EditableText (rename sesi inline) + temuan: skenario harness "title" sudah RUSAK pra-syarat (0 model call), dan bukti rename dipindah ke "slash" yang sehat
- Fitur: `SessionStore.rename(id, title)` (load + patch title + save; recency TIDAK dibump — rename ≠ aktivitas), panel row dapat tombol pensil (hover-reveal) → klik tukar judul jadi input → Enter/blur commit, Escape cancel; rename sesi AKTIF ikut update `sessionTitleRef` supaya save berikutnya tak menimpa. Partition-safe (snapshot store, cek partitionKey sebelum refresh). Input punya rule fokus eksplisit (0,3,0) melawan reset input app (0,2,1) — anti-breakage #2.
- Bukti: probe di skenario `slash` (panel terbuka + sesi "Kucing Terbang" tersimpan) — commit Enter → judul + `__oaRenamed` berubah; Escape → draft dibuang, judul tetap. Hijau.
- Temuan pra-syarat (bukan ulah A1): skenario "title" gagal `reqs: []` — 0 `/chat/completions` terekam padahal persistSession jalan (judul = turunan prompt). Penyebab dua lapis: (a) Lesson 121 mem-flip default `titleGenerationEnabled` → false tanpa meng-update harness → aux naming mati (saya tambah opt-in `simSettings.titleGenerationEnabled = true` untuk skenario title — benar, tapi belum menyelamatkan); (b) anomali 0 model-call masih belum terjelaskan dan DI LUAR scope A1. Catatan: build.mjs TIDAK masuk `npm test` → kerusakan harness seperti ini bisa mengendap (kelas Lesson 138/F15). Ditandai untuk audit harness tersendiri.

### 142. (2026-08-20) Bug-bounty audit kontrak UI: 14 aturan terverifikasi HIJAU, 3 WARN rendah, dan satu "kontrak over-promise" milik saya sendiri dikoreksi — fallback var() harus di-scope, bukan "absolute"
- Owner minta audit + "bug bounty". Hasil (bukti grep + DOM): tanpa emoji (0), tanpa transition:all (0), tanpa gradien berat (2 = shimmer resmi + mask), tanpa font/palette hardcode, tombol semantik + aria, fokus-visible 29, radius ber-fallback 98, reduced-motion ada, wiring settings 14/14, ellipsis `…` konsisten. Jadi kontrak TERIMPLEMENTASI.
- 3 WARN rendah: (a) 9 label small-caps `uppercase+letter-spacing` (subsection/panel-group/steer/wordmark) — sidik anti-slop, tapi konsisten+deliberate; mengubahnya = reskin (dilarang constraint 5) → biarkan, dicatat; (b) aria-live cuma 2 permukaan (Notice = milik Obsidian); (c) 32 `--color-*` tanpa fallback — core-defined, bukan bug (swatch yang rusak itu bug SPESIFISITAS, sudah diperbaiki v0.1.153).
- Temuan jujur: aturan yang SAYA tulis 2026-08-20 "Every var() carries a fallback — absolute" = over-promise. Codebase ~1.200 var() tanpa fallback (`--text-*`, `--font-*`, `--background-*`, `--interactive-accent`) dan itu BENAR (core Obsidian, hardcode malah melanggar). Yang berisiko (`-rgb` + `--radius-*` + var buatan) SUDAH ber-fallback semua. SKILL.md diamend jadi scope jujur: REQUIRED (-rgb/radius/self-owned), RECOMMENDED (`--color-*`), NOT REQUIRED (core). Prinsip: audit harus menemukan kesalahan aturan juga, bukan cuma kesalahan kode.

### 141. (2026-08-20) A7 Skeleton: "Loading…" teks diganti baris shimmer; dan jebakan probe — CSS ter-scope `.oa-settings` berarti inject DI LUAR scope = tinggi 0, "element not visible"
- Hub + cron focus-skills yang tadinya menampilkan emptyState teks "Loading…" kini merender `skeletonRows()` (3 / 2 baris, main 45% + sub 75%). Port perilaku lobe-ui Skeleton (bukan JSX antd): markup sendiri, `--background-modifier-hover`, pulse hanya OPACITY (bukan layout — anti-slop), `prefers-reduced-motion` → animasi none + opacity statis.
- Jebakan probe F41: `.oa-skeleton` di-scope `.oa-settings .oa-skeleton`, tapi inject awal ke `#sim-frame` (di luar scope) → semua rule tak kena → div 0 tinggi → screenshot "element not visible". Fix: inject ke `.oa-settings` asli. Pelajaran umum: kalau CSS-nya ber-scope ancestor, probe visual WAJIB menyuntik di dalam scope itu, bukan di root.
- Bukti: F41skeleton `{normal.main.anim: oa-skeleton-pulse, h 10/8, w 45%/75%; reduced.main.anim: none}` + screenshot `shots/skeleton.png`. Wiring (skeletonRows dipanggil di dua loading path) dipin smoke v0.1.157 — bukti terbagi: smoke = wiring, probe = visual.

### 140. (2026-08-20) Tips snippet: pindah ke atas + kartu lightbulb (permintaan owner). Harness settings ternyata MENO-OP Modal.open() — modal tak pernah ter-render, jadi bukti visual modal mustahil; fix = shim Modal render beneran
- Owner: "tips di taruh paling atas? tambahkan visual card + icon lightbulb". Implementasi: blok tips pindah ke atas modal (setelah h3, sebelum field), dibungkus kartu (border hairline + bg secondary + radius-m) dengan ikon `setIcon(icon, "lightbulb")` (Lucide, no emoji — kontrak). Warna ikon `--color-yellow` ber-fallback (konotasi "tip" ala callout Obsidian).
- Menambah probe real-DOM F40 gagal `open:false` — ternyata `obsidian-shim.ts` punya `Modal.open(): void {}` (no-op). Modal tak pernah di-render di harness settings. Fix shim: `open()` = append contentEl ke body + `onOpen()`; `close()` = `onClose()` + remove. HTMLElement helper (addClass/createEl/setIcon) sudah di-polyfill, jadi modal render utuh. Risiko terkendali: hanya probe yang KLIK tombol pembuka modal yang kini ikut render (F40 satu-satunya); probe lain tak menyentuh modal.
- Bukti: F40snippetTips `{open:true, present:true, atTop:true, iconSvg:true, border:true}` + screenshot `shots/snippet-modal.png` (760×756) untuk dilihat owner. Catatan jujur: modal harness tak ber-chrome `.modal` (lebar = viewport), tapi order/ikon/border yang diuji adalah kontrak sebenarnya.

### 139. (2026-08-20) Baris command terlalu penuh: ukur DULU dengan DOM asli, bukan lihat gambar — judul terjepit ke 53px→0px; solusi = pindahkan toggle ke modal + ringkasan read-only di baris
- Owner kirim screenshot + usul pindahkan toggle ke modal. Saya tak bisa lihat gambar (tanpa vision), jadi diukur langsung: `titleW` 53px di 700px, 0px + overflowX di 560/420px — flags (4 toggle) makan 369px tetap + grip + panah + aksi ≈ 495px. Keputusan: YA pindahkan, tapi baris tetap bawa ringkasan `Shows in: menu · slash · + · quick ask` (read-only) supaya visibilitas tak hilang total.
- Implementasi: SnippetEditModal punya seksi "Where this shows" (4 toggle via helper `mkSurface`); onSave emit flag penuh (opt-in `if (x) out.x = true`, picker opt-out `if (!pickerShown) out.picker = false`). Edit handler ganti Object.assign → replace per-index (flag yang MATI = absen, Object.assign tak bisa delete). Add handler tak lagi memaksa `ctxMenu:true, slash:true`.
- Pin diamend di tempat (bukan dimatikan): v0.1.76/77 (`new ToggleComponent(flags)` → `const mkSurface =` + `"Where this shows"` + `Shows in:`/`Not shown anywhere`; `css .oa-cmd-flags` → `!includes` + `.oa-snippet-surfaces`), v0.1.79 (`mkFlag("Snippets")` → `mkSurface("Snippets (+ menu)"`; write-path `if (!this.pickerShown) out.picker = false`), v0.1.85 (`mkFlag("Quick Ask")` → `mkSurface("Quick Ask"` + `if (this.quickAsk) out.quickAsk = true`). Jebakan kecil: pin literal saya tulis `mkSurface("Snippets (+ menu)")` padahal asli `mkSurface("Snippets (+ menu)", ()` — selalu salin persis dari sumber.
- Bukti nyata: probe F39cmdSurfaces — `titleW: 430` (53→430), `noInlineFlags: true`, `summary` mulai "Shows in:", harness exit 0.

### 138. (2026-08-20) A4 drag-reorder: native HTML5 DnD TANPA dependency (konsisten "minus the dnd dependency" v0.1.77); dan probe F15 ternyata merah PRASYARAT — dua baris bernama sama menipu findRow
- Commands: grip handle `draggable` + dragover/drop pada row, splice + saveSettings + re-render. Panah up/down DIPERTAHANKAN sebagai jalur keyboard/mobile/a11y (drag tak jalan di mobile; keyboard butuh panah). Indicator drop = `is-drop-before/after` (box-shadow 2px accent), `is-dragging` meredup. Bukti render nyata: probe F38cmdDrag di harness (rows/grips/draggable/arrowsKept/orderFirst — fixed true).
- Menjalankan harness penuh membuka temuan PRASYARAT (bukan ulah sesi ini): F15 merah karena `titleAuto:false, titleSetMainDisabled:null`. Akar: Lesson 121 menambah toggle "Title generation" DI ATAS slot aux yang namanya SAMA → `findRow("Title generation")` (find = baris pertama) mengambil toggle, bukan slot aux. Amend probe di tempat: `findRow(name, aux)` — `aux=true` menambahkan filter "punya tombol Set to main". Intent probe (uji slot aux) dipertahankan; `mid`/`after` Compression tak berubah (nama unik). Pelajaran: menambah row dengan nama yang sudah dipakai = cek SEMUA probe yang findRow-nama itu (kelas Lesson 107/133, tapi untuk probe, bukan UI).
- "Done = real-DOM proof" (rule baru 137) dibuktikan benar-benar dijalankan: `node test/real-preview/build-settings.mjs` hijau penuh, bukan cuma grep.

### 137. (2026-08-20) Kontrak UI diperbarui atas permintaan owner: gaya SUDAH kuat, yang bolong = aturan anti-runtuh teknis. Lima kategori berulang dikodifikasi
- Owner bertanya sebelum lanjut perbaikan: adakah rule UI/UX yang perlu diperbarui soal masalah yang sering bikin hasil collapse/hancur. Audit lessons 107/121/130/133–136 → lima kategori berulang: (1) wiring section (key tanpa case → tab kosong), (2) CSS kalah dari painter Obsidian (button:hover 0,1,1 vs .oa-* 0,1,0), (3) var() tanpa fallback, (4) guard pin ABSENSI makan nama kelas/komentar baru, (5) "done" diverifikasi via grep bukan render.
- Ditambahkan seksi "Anti-breakage rules" di `skills/internal/openagent-ui/SKILL.md` (binding) + constraint #1 diubah: fallback `var()` jadi ABSOLUT untuk SEMUA var (bukan cuma status colors). Check-docs tetap hijau (pin preview/index.html + larangan test/preview*.html tak tersentuh).
- Prinsip: aturan yang dimasukkan = yang bisa DIPERIKSA (komputasi spesifisitas, grep pin sebelum menamai kelas, bukti render nyata), bukan himbauan kosong. "Rapikan" tanpa kontrak anti-runtuh = akan hancur lagi dengan cara yang sama.

### 136. (2026-08-20) A8 swatch: "sudah setara" itu klaim setengah benar — kelas warna ADA tapi rapuh; owner benar, warnanya bisa tidak muncul. Fallback var() + selektor dua-kelas
- Koreksi owner: warna swatch profil belum muncul. Audit: kelas `.oa-color-*` SUDAH ada (styles.css 2462–2469) — tapi `var(--color-red)` TANPA fallback (beda dengan konvensi repo yang selalu ber-fallback), dan swatch adalah `<button>` sehingga `button:hover/active` Obsidian (0,1,1) MENGALAHKAN `.oa-color-red` (0,1,0) → warna hilang/abu saat hover, plus tembak-meleset total di tema yang tak mendefinisikan var semantik. Jadi "tidak perlu kerja" salah; yang benar: ada, tapi tidak stabil.
- Fix: (a) selektor dua-kelas `.oa-swatch.oa-color-X, .oa-profile-dot.oa-color-X` (0,2,0) — semua 4 pemakaian memang berpasangan, diverifikasi; (b) fallback hex = nilai gelap kanonik `reference-obsidian-app.css` (red #e93147, orange #ec7500, yellow #e0ac00, green #08b94e, cyan #00bfbc, blue #086ddd, purple #7852ee); (c) hover hanya ring halus `:not(.is-active)` + `:focus-visible` quiet ring (pola `.oa-app`).
- Pelajaran umum: saat mengklaim "fitur X sudah ada/setara", buktikan lewat PIXEL/behaviour nyata (kelas ada ≠ warna tampil), bukan cuma "grep ketemu string". Kelas Lesson 10 (simulasikan runtime asli) + 86 (pixel/SOURCE mengalahkan teks).

### 135. (2026-08-20) "Rapikan UI" mulai dari empty state — sembilan permukaan, enam gaya, satu bentuk lobe-ui Empty; dan pin ABSENSI bisa menggigit nama kelas sah dari fitur BARU
- Fokus owner: tab Settings dulu, panel chat belakangan. Gap nyata pertama = empty state tersebar (fallback, commands, hub, skills, MCP, automations, cron history, focus skills, workspace exclusions) dengan 6 kelas CSS + padding beda. Port lobe-ui `Empty` (title + description + optional action) jadi satu helper `emptyState()` + satu blok `.oa-empty*`; 6 kelas lama dihapus. "Loading …" dan error-history ikut pakai bentuk sama (title-only / title+desc).
- Jebakan: guard v0.1.35 mem-pin `!css18.includes(".oa-empty-title")` (kelas intro CHAT yang sudah pensiun). Kelas BARU `.oa-settings .oa-empty-title` menabraknya. Amend pin jadi regex `!/\n\.oa-empty-title\s*\{/` — yang dilarang hanya rule TANPA scope (chat-side); rule ber-scope `.oa-settings` bukan target pensiunan itu. Nama kelas sama, intent beda → pin harus ikut niat, bukan substring.
- Yang menyusul di jalur Settings (urutan nilai): SortableList (drag reorder snippet — sekarang chevron), Skeleton (loading hub/skills), ColorSwatches (SUDAH setara — swatch+ring aktif ada). Panel chat menyusul belakangan: EditableText (rename sesi), TokenTag, BackBottom enrich.

### 134. (2026-08-20) Tab Advanced = tempatnya `agent.max_turns`; pindah row TIDAK boleh pakai pin "ketiadaan" yang ikut kena komentar sendiri; checkpoint yang tumbuh tanpa batas = utang, bukan fitur
- Hermes `constants.ts` Advanced = toolsets + terminal backend + tool_output.max_* + checkpoints.max_snapshots + agent.max_turns/retries + delegation.* + updates. Yang kita port jujur: (a) PINDAH "Max tool iterations" (= agent.max_turns) dari Chat → Advanced; (b) TAMBAH "Tool output limit" (chars, display-side; paritas tool_output.max_bytes — batas bytes/baris/panjang-baris Hermes itu untuk output terminal yang sudah kita bound sendiri); (c) TAMBAH "Checkpoint snapshots kept" + PRUNE (sebelumnya checkpoint tumbuh tanpa batas — bug vault-hygiene nyata, bukan sekadar kosmetik). toolsets/terminal tetap di Capabilities (keputusan owner). delegation.* + retries + service_tier = defer sadar (fitur/pipa terpisah).
- Pindah row = amandemen pin di TIGA tempat: smoke IA (`indexOf("Save sessions") < indexOf("Max tool iterations")` → anchor "Personality overlay"), F13 (`kept:[...]` Chat minus row itu + `iterationsMovedToAdvanced`), F35 (probe slider pindah ke page "advanced"). Semua diamend di tempat, bukan dimatikan.
- Jebakan guard 121c lagi: komentar relokasi di agent() menulis literal "Max tool iterations" → pin `!agentSection.includes("Max tool iterations")` memakan komentarnya sendiri. Ditulis ulang jadi "the iteration cap row". markModified ×52→×54.
- Checkpoint prune: nama file `YYYYMMDD-HHMMSS <safe>.md` → sortable lexicographically, cukup sort + delete kelebihan. Pake `vault.delete` (file milik kita sendiri di openagent/checkpoints/), bukan trash (jangan membanjiri trash user).

### 133. (2026-08-20) Tab Appearance: `keys: []` di constants Hermes = MENYESATKAN (cuma field config-schema); halaman aslinya buatan tangan dan kaya. Port = kurasi "milik chat surface kita", bukan chrome host
- Owner bertanya apa yang bisa diisi ke tab Appearance. Bukti: `constants.ts` menulis `appearance: { keys: [] }`, tapi desktop punya `appearance-settings.tsx` berisi theme/UI-scale/translucency/backdrop/session-density/tool-view/reasoning-collapsed/reactions/intro-splash/pet. Kesimpulan lama (Lesson 107 "appearance kosong") berdasar lapisan yang salah.
- Prinsip port: **yang kita miliki sendiri** (tool cards, reasoning, session list, intro, reactions) → 5 setting; **chrome host shell** (theme/zoom/kaca/backdrop) → MILIK Obsidian, tidak disentuh (kontrak `var(--*)`). Default semua = perilaku lama supaya user existing tak berubah (toolViewMode default "collapsed", bukan "expanded").
- Pin yang dipatahkan & diamend di tempat (bukan dimatikan): `!includes('key:"appearance"')` ×2 + `!includes("private appearance(")` ×2 (smoke IA + Notifications IA), F33 probe (`emptyTabsStayHidden` jadi hanya `["about"]`), SECTIONS build-settings.mjs (tambah "appearance"), markModified ×47→×52, dan pin feedback-banner (`showFeedbackBar` kini didahului `settings.showReactions &&`).
- Jebakan guard ke-N kalinya (121c): komentar `appearance()` awalnya menulis "theme/zoom/translucency/backdrop" — guard v0.1.150 mem-pin ABSENSI "translucency" → memakan komentarnya sendiri. Ditulis ulang jadi "theme, window scale, glass, backdrop".
- Bug nyata yang lolos satu putaran penuh (ditemukan OWNER, bukan test): tab tampil tapi KOSONG — `case "appearance"` TIDAK ditambahkan ke `renderSectionBody`. Ini persis Lesson 107 yang sudah tertulis, tapi guard lama hanya mem-pin `private appearance(` ada (method), bukan bahwa saklar MEMANGGIL method itu. Perbaikan ganda: (1) tambah case; (2) guard baru = invarian programatik — setiap `key:` di SECTIONS WAJIB punya `case "<key>":` di renderSectionBody (loop `matchAll` + `every`), jadi tab-kosong macam ini merah permanen, bukan lolos.

### 132. (2026-08-20) SOUL vs personality TIDAK BOLEH tertimpa — Hermes sendiri pernah punya bug ini; split = dua field terpisah + update field-merge, dan "none" adalah tombol kembalikan
- Owner bertanya "profile bisa gak kembalikan seperti semula, tidak tertimpa oleh personality". Jawaban berdasar source Hermes (`hermes_cli/personality.py` + `apps/desktop/.../config-field.tsx`, verifikasi 2026-08-20): `display.personality` menyimpan NAMA saja; identitas durabel hidup di `agent.system_prompt` (= SOUL kita); kode personality TIDAK PERNAH menulis identity. `""`/`"default"`/`"none"` = tanpa overlay (identity only). Split ini dibuat persis karena dulu personality TEXT menimpa system_prompt → kepribadian yang sudah dimatikan user "bangkit" lagi dari state basi (PR #81946).
- Kita SUDAH mengikuti split: `resolveIdentity` (SOUL, slot #1) dan `overlayText` (nama, slot terakhir) terpisah; `ProfileStore.update` = field-merge (`...cur` + patch per-field) sehingga `{personality}` tak pernah menyentuh `soul`, dan sebaliknya. "Kembalikan seperti semula" = set personality ke `none` (dropdown "none (identity only)" ada di Chat DAN Profiles; `/personality none` di chat).
- Yang kurang cuma PIN: tambah test yang mengunci invariant (update personality tak menimpa SOUL; personality=none memulihkan identity-only sambil mempertahankan SOUL) + guard smoke. Bukan tambah fitur baru — fiturnya sudah ada, yang perlu bukti tahan-regresi.

### 131. (2026-08-20) Memory parity Hermes: "cuma bisa tambah" adalah bug UX (tak bisa koreksi/basi); budget di-enforce saat TULIS, bukan saat baca; satu sumber pola ancaman (threatPatterns) seperti threat_patterns.py
- Bug asli yang dirasakan user: memory hanya bisa `add` (append). Salah tulis tak bisa dikoreksi, fakta basi tak bisa dihapus. Hermes memakai `memory` tool dengan add/replace/remove + substring unik (`old_text`). Kita pertahankan 3 tool (save_memory/update_user_profile/search_memory — amandemen pin, bukan rombak inventori 25) dan menambah param `action`+`old_text`.
- Enforce saat TULIS bukan saat BACA: file tumbuh tanpa batas, lalu `read` cuma ambil N karakter terakhir → memori LAMA hilang diam-diam dari prompt. Benar: batas karakter (Memory/Profile Budget, default 4.000/2.500) di-enforce di `add` — penuh → ditolak + inventory ditampilkan supaya agen konsolidasi (persis Hermes). `read` jadi ambil entri utuh yang muat (most-recent dulu), bukan potong tengah entri.
- Memory masuk system prompt → WAJIB di-scan. Hermes: `first_threat_message(content, scope="strict")` dari `tools/threat_patterns.py` — SATU modul bersama cron-scanner. Kita ekstrak `threatPatterns.ts` (secret/exfil/injection) dan cron.ts mengimpornya (scanCronPrompt behavior tak berubah). Blocked → `[BLOCKED: reason]`, file mentah tak disentuh (user masih bisa lihat/edit).
- Divergensi sadar dicatat: (a) entri = satu markdown bullet per baris (file vault tetap bisa diedit manusia), bukan `§`-delimited multiline; (b) Memory Provider (honcho/mem0) TIDAK di-port — plugin menyimpan di vault. Plus drift-guard: baris non-entry di file (editan manual) membuat replace/remove MENOLAK menulis, bukan menelan isinya (mirip drift guard Hermes issue #26045).

### 130. (2026-08-20) Blueprint catalog: port template Hermes secara KURASI, bukan mentah; guard "no phantom integrations" = pin kontrak kejujuran; komentar pun bisa mematahkan guard kata
- Hermes `blueprint_catalog.py` = katalog ~16 template automasi (jadwal + prompt jadi + slot bertipe). Sebagian menunjuk integrasi yang TIDAK kita punya (mail/calendar) → kalau di-port apa adanya, prompt-nya merujuk tool hantu dan berbohong ke agen. Jawaban: kurasi 9 template yang hanya butuh vault search + web_search + tulis note, dan guard test yang mem-pin kontrak itu (banned-list kata integrasi + "prompt harus menyebut kapabilitas nyata").
- `fillBlueprint` = validasi + isi slot → `{minute}/{hour}` dari slot time, `{dow}` dari slot weekdays/day, `{interval_min}` → step; lalu `validateCronExpr` (template → cron invalid = dev error, lempar). Slot time memakai `<input type="time">` native + baris "Means:" live — konsisten dengan jadwal terbimbing (cron tidak pernah tampil sebagai password).
- Jebakan guard yang ditabrak LAGI (kelas Lesson 121c): header komentar katalog semula menulis "Gmail/Calendar … weather" sebagai alasan kurasi — guard "no phantom" yang mem-pin kata-kata itu memakan komentarnya sendiri. Solusi: tulis ulang komentar tanpa kata yang dipin ABSEN (mail/schedules/forecasts). Pin kata yang menunjuk niat guard, bukan kata yang juga muncul di narasi.
- `*/N` di dalam komentar JSDoc menutup blok komentar (`*/`) → error parse TS. Tulis "step like /15" sebagai pengganti `*/N` dalam komentar.

### 129. (2026-08-20) MCP fase 4–5: HTTP transport TIDAK butuh klien baru (map `send`→POST, feed balik ke `onLine`); katalog = tawarkan HANYA yang benar-benar bisa jalan (fail-closed), pin SHA penuh
- Transport HTTP cukup dipetakan ke antarmuka `McpTransport` yang sama: tiap `send()` = satu POST (di-serial lewat promise chain supaya session-id tetap urut), hasil parse (JSON tunggal/array ATAU `text/event-stream`) di-feed balik via `onLine` persis seperti stdout stdio. Jangan fork `McpClient` kedua — satu klien JSON-RPC untuk dua transport.
- Kegagalan POST/status non-2xx/body kosong = feed `{jsonrpc,id,error}` sintetis supaya caller reject SEKETIKA, bukan nunggu timeout klien. Notifikasi (tanpa id) yang dijawab `202` body kosong = no-op — jangan anggap error.
- Header: merge case-insensitive, header user MENANG atas default (`Authorization` vs `authorization`), `Mcp-Session-Id` di-capture dari respons pertama lalu di-echo. Obsidian `requestUrl` balikin header campur-case → lookup case-insensitive wajib.
- Katalog paritas jujur: Hermes punya 20 entri, 18 di antaranya remote-OAuth yang TIDAK bisa plugin jalankan (tak ada browser flow) → TIDAK ditawarkan sama sekali (fail-closed), bukan "di-install tapi tak berguna". Yang dikirim: `n8n` (stdio + git + api-key env) dan `unreal-engine` (http + none). Pin SHA penuh (`7a9ae00…c3841`), install = wipe+re-clone+checkout+bootstrap via `execFile` dengan env git non-interaktif (`GIT_TERMINAL_PROMPT=0`) — installer TETAP menjalankan kode pihak ketiga tanpa sandbox, jadi itu keputusan trust user (tertulis di SECURITY.md + modal).
- Lokasi install `.obsidian/plugins/<id>/mcp-installs/` (preceden cron scripts) terhapus saat plugin di-update → dokumentasikan "re-run install", jangan diam-diam janji persistensi.

### 128. (2026-08-19) MCP runtime: injeksi dinamis di jalur owned-interactive SAJA = fail-closed gratis; consent mirror Terminal; klien murni transport-ter-inject
- MCP tools tidak masuk `ALL_TOOLS` statis — di-inject via `runner.getToolsWithMcp` (async) yang HANYA dipakai ChatApp owned-interactive. Headless/delegated/Quick Ask memakai `getTools` sinkron → otomatis tanpa MCP, tanpa menulis satu baris filter pun (pola terminal). Ini jawaban bersih untuk "dynamic tool registry" yang kalau dipaksakan ke `resolveEnabledTools` sinkron akan rumit.
- Consent MCP = mirror persis Terminal (receipt 32-byte per-vault + ledger localStorage + restore fail-closed di loadSettings) — satu bentuk mental untuk SEMUA fitur berisiko yang men-spawn proses. Jangan ciptakan bentuk consent ketiga.
- Klien JSON-RPC murni + transport ter-inject → testable tanpa proses asli; stdio = `require("child_process")` LAZY. Server gagal = skip (bukan crash run). Satu jebakan: `inRaw.x !== false` membalik default `false` jadi `true` saat key absent — untuk master switch pakai `=== true` (bug hampir lolos, dicek ulang).
- Ganti `runner.getTools(...)` jadi `getToolsWithMcp(...)` di ChatApp memutus pin smoke "terminal schemas … owned-chat opt-in" — amend pin di tempat (sama intent), jangan biarkan merah.

### 127. (2026-08-19) session_search: mesin SUDAH ada (SessionStore.search), yang kurang cuma tool + injeksi — jangan bangun ulang; field ToolContext baru = amandemen DELEGATE_BLOCKED_TOOLS (partisi wajib lengkap)
- Sebelum membangun "fitur baru", grep dulu: `SessionStore.search()` sudah ada (substring scan turn text, list() sudah urut updatedAt desc → otomatis recency-ranked). Pekerjaan jadi kecil: cocokkan judul juga + tool + injeksi, bukan mesin baru.
- ToolContext pakai injeksi opsional (pola `cron`): field `sessions?: SessionSearchApi` + runner `sessionsApi` + main.ts `this.runner.sessionsApi = { search: ... }`. Headless/cron ikut dapat (session store adalah working set yang valid), anak delegasi TIDAK (allowlist fail-closed).
- Menambah field/tool baru = `DELEGATE_BLOCKED_TOOLS` WAJIB diamend (test partisi "25-tool inventory … without gaps or overlap" akan merah kalau lupa) — pola yang sama seperti Lesson 121/123, kini dengan sanksi test yang langsung menunjuk.

### 126. (2026-08-19) web_search parity: parser murni + transport ter-inject; urutan decode→strip penting; protocol-relative URL; fallback jujur + notice, bukan silent-empty
- DDG HTML meng-highlight judul/snippet sebagai `&lt;b&gt;…&lt;/b&gt;` — strip dulu lalu decode = literal `<b>` bocor; benar: decode dulu, strip tag setelahnya, lalu collapse whitespace (kelas Lesson 10: simulasikan runtime asli). Redirect DDG protocol-relative (`//duckduckgo.com/l/?uddg=…`) membuat `new URL(raw)` melempar — prepend `https:` dulu.
- "Provider ber-key tanpa credential" = fallback jujur ke default + Notice menyebut credential yang hilang, BUKAN silent-empty. Key di-redact saat export (pola providers).
- Tambah tool = amandemen pin serentak (README/check-docs 23→24, tools.test 23→24, markModified 41→45, delegate blocked). Guard string-match gampang salah: `export function` vs `export async function` — tulis pin persis bentuk deklarasinya.

### 125. (2026-08-19) Safety parity Hermes (approval timeout · redact secrets · checkpoints): titip choke point di loop, bukan di tiap tool; promise approval = idempotent settle; redaksi konservatif = jangan rusak prosa
- Titip redaksi secret di SATU titik (agentLoop, tepat sebelum hasil tool jadi konten `role:"tool"` yang terlihat model) — bukan di tiap tool. Satu choke point menangkap web_extract, read_note, search, dst. sekaligus dan tidak bisa dilupakan saat menambah tool baru.
- Approval prompt adalah Promise — timeout + tombol harus berbagi satu `finish()` idempotent (settled flag + clearTimeout) supaya timer telat tidak double-resolve (JS resolve kedua = no-op, tapi Notice "timed out" liar tetap muncul bila tidak dibersihkan). Timer dibersihkan DI finish, bukan di tiap handler.
- Redaksi secret harus KONSERVATIF (fingerprint tak terelakkan: sk-…, AKIA…, ghp_…, PEM block, JWT eyJ…, key=value bernama secret) — pola longgar akan merusak prosa/note biasa. Test wajib mencakup "ordinary prose untouched" + "short lookalikes untouched" (false-positive guard).
- Checkpoints = snapshot sebelum mutate, best-effort (gagal snapshot TIDAK boleh blokir write — approval preview tetap guard utama), ke `openagent/checkpoints/` via vaultPath (ikut workspace policy). Dipasang di write/edit/delete/rename (keluarga mutate), bukan di read.
- Tambah markModified di Safety (+3) → pin 38→41 + label ×38→×41 diamend bersama di commit yang sama (pola berulang yang sudah diantisipasi Lesson 121).

### 124. (2026-08-19) Cron script/no_agent watchdog: folder yang SUDAH dilindungi = batas keamanan gratis; lazy require = mobile tak pernah memuat Node; env minimal = tanpa secret ambien
- Fitur tereksekusi-otomatis (skrip tiap tick) adalah risiko tertinggi di plugin — mitigasi utamanya BUKAN approval per-run (cron memang unattended), melainkan LOKASI: skrip di `.obsidian/plugins/<id>/scripts/` yang sudah masuk configDir yang di-reject workspace policy → agent tidak bisa menanam skrip. Menggunakan mekanisme perlindungan yang sudah ada (configDir) menghindari perubahan workspacePolicy yang invasif.
- `child_process` diambil via `globalThis.require` LAZY (pola terminal service v0.1.146) — module cronScripts.ts murni bisa di-bundle node untuk unit test tanpa Node; eksekusi nyata cuma desktop. `execFile` (bukan `exec`) = tanpa shell injection; interpreter dikunci oleh EKSTENSI file, bukan isi.
- env minimal (PATH/HOME/temp) — jangan pernah meneruskan `process.env` utuh ke proses yang dijalankan agent/cron; secret ambien adalah target exfil klasik.
- Mutually-exclusive (script vs monitor_url) diputuskan dengan throw di `newCronTask` + cek UI/tool — satu sumber kebenaran validasi di factory, sisanya glue. Kegagalan skrip = status error + notice, bukan fail-silent.

### 123. (2026-08-19) GitHub rate-limit (429) di klon/raw — fakta parity harus bisa dibuktikan dari catatan verifikasi byte-level sesi sebelumnya, bukan re-fetch wajib
- Saat diminta bandingkan dengan Hermes Desktop, klon & raw.githubusercontent sama-sama 429. Tapi perbandingan tetap bisa dilakukan jujur karena sesi ini SUDAH memverifikasi source Hermes byte-level (commit `aeabff6`/`6cf6ad4`) dan mencatatnya (studies + Lessons). Pelajaran: catat commit-sha + fakta kunci saat verifikasi, supaya saat network mati/rate-limit, klaim parity tetap berdasar bukti tersimpan, bukan re-fetch yang bisa gagal.

### 178. (2026-08-23) Release archive yang hidup di root workspace tidak durable; GitHub Release menjadi pemilik asset, dan rekonstruksi wajib mengaku byte lama hilang
- Audit v0.1.151 menemukan kontrak `releases/vN/` menunjuk folder yang dulu hidup di luar repository dan tidak ikut upload GitHub. Path machine-local bukan arsip lintas sesi. Keputusan owner: GitHub Releases memegang enam asset permanen (install ZIP+checksum, clean source+checksum, source manifest, final report); repo hanya menyimpan changelog/link, `release/` lokal hanya staging ter-ignore.
- Publisher wajib fail-closed: exact pushed commit, CI browser hijau untuk SHA yang sama, checksum asset cocok, tag/release belum ada, dan konfirmasi versi eksplisit. `npm run release` tidak boleh publish otomatis.
- Artefak historis yang hilang tidak boleh “dipulihkan” dengan checksum rekaan. v0.1.151 boleh diterbitkan sebagai reconstructed verification release setelah dibangun dan diuji ulang, dengan disclosure bahwa byte baru bukan byte ZIP lama yang hilang.

### 179. (2026-08-23) Upload multi-asset GitHub Release bukan transaksi atomik; buat draft, retry per asset, verify, baru publish
- `gh release create <tag> <6 assets>` gagal dua kali karena `uploads.github.com` menutup koneksi (`EOF`), sekali di asset keempat dan sekali di asset pertama. CLI membersihkan release/tag percobaan, tetapi satu perintah besar tidak memberi kontrol retry per asset dan bisa meninggalkan status yang sulit dibedakan pada kegagalan lain.
- Protokol permanen: create DRAFT tanpa asset → upload SATU-SATU dengan retry terbatas → download+hash semua asset selama masih draft → publish (`--draft=false`) → download+hash lagi. Bila satu langkah gagal, hapus draft+tag dan laporkan cleanup; release parsial tidak boleh tampil publik.
- Guard: `runWithRetries` diuji transient-success + exhausted-failure, publisher tetap dry-run default, dan live success hanya dicetak setelah release non-draft serta keenam byte remote cocok. Draft belum tentu punya tag ref: cleanup harus delete release dulu lalu cek `ls-remote` sebelum menghapus tag; `--cleanup-tag` buta sempat memberi 422 sesudah draft sebenarnya sudah terhapus.

### 180. (2026-08-23) Harness release tidak boleh menulis file TRACKED; bukti per-run yang volatile belongs to ignored sidecar — dan klaim "tree bersih" dicek tepat di langkah yang bisa mengotori, bukan di ujung pipeline
- Run `Publish GitHub Release` 32653162333 (+ run kembar 32652756389) gagal deterministik di langkah "Build complete verified asset set"; error NYATA pertama (bukan baris pamungkas "Process completed with exit code 1") adalah `Tracked source is dirty; … M test/real-preview/settings-audit-probes.json` dari `assertTrackedTreeClean`. Akarnya: settings-preview harness menulis ulang witness TRACKED itu dengan `at: new Date().toISOString()` pada SETIAP run — churn yang tak terlihat selama pipeline belum punya clean-tree assertion; begitu GitHub-release-retention menambahkan fail-closed check (release.mjs + preflight publisher), tiap run release dijamin kotor sebelum sempat publish. Log run tak terunduh dari sandbox (egress blob storage diblokir) — diagnosis lewat reproduksi lokal deterministik di commit yang sama.
- Aturan baru: (a) langkah yang berjalan di dalam `npm run release` hanya boleh menulis path ter-ignore; witness tracked diputuskan lewat policy murni `planSettingsWitnessUpdate` (hasil probe identik → jangan tulis ulang walau timestamp beda; run release `OA_RELEASE_WITNESS=readonly` → tidak pernah menyentuh witness, drift dilaporkan sebagai notice + sidecar `test/real-preview/out/settings-audit-probes.json`); (b) assertion kebersihan tree dijalankan TEPAT setelah langkah preview, supaya kegagalan menunjuk penyebabnya, bukan meledak sebagai exit code anonim di ujung; (c) guard smoke lama yang mem-pin literal pemanggilan step ikut diamend di commit yang sama (kelas Lesson 20/107 — pin teks vs dunia baru).
- Guard: unit test planner (churn timestamp, readonly, witness hilang, dev-rewrite) + fail-closed dirty-tree di `test/release-assets.test.cjs` + marker smoke `release witness policy wired`. Peringatan Node.js 20 pada run yang sama hanyalah deprecation actions (checkout@v4/setup-node@v4 dipaksa Node 24) — bukan penyebab kegagalan, dan `.github/workflows/*` tetap wilayah owner.

### 181. (2026-08-24) Memindahkan guard ke subdirektori: `__dirname` adalah jebakan senyap, dan "berapa file dibaca" adalah metrik yang salah untuk memutuskan split
- Saat memecah `test/smoke.test.cjs` ke `test/smoke/*.cjs`, tiga blok ternyata menimpa `read()` dengan helper `__dirname`-relatif miliknya sendiri. Turun satu direktori membuat `__dirname` bergeser dan **5 check hilang tanpa error** — bukan gagal, hanya berkurang. `node --check` hijau di kedua percobaan yang salah; yang menangkap hanyalah diff terhadap baseline 289 `✓`. Aturan: parse-clean tidak membuktikan apa pun tentang scope runtime; gerbang sesungguhnya adalah diff baseline sesudah SETIAP ekstraksi.
- Perbaikan pertama saya sendiri cacat: `__dirname` diganti dengan "buang awalan `../`". Itu benar untuk `../src/x.ts` tetapi salah untuk `real-preview/build.mjs`, yang relatif terhadap `test/` tanpa `../` sama sekali — path akan diarahkan diam-diam ke tempat lain. Aturan yang benar dan universal: `__dirname` → `path.join(ROOT, "test")`, lalu normalisasi `ROOT/test/../x` menjadi `ROOT/x`. Kelas kesalahan: menambal satu contoh yang terlihat, bukan invariannya.
- Metrik pemilihan blok juga salah. Klasifikasi "berapa domain file yang dibaca" menghasilkan 88 multi-file / 77 runtime dan kesimpulan "hanya 14 check bisa dipisah". Pengukuran kedua menunjukkan pengikat sebenarnya adalah **variabel top-level bersama**: 42 deklarasi di luar semua blok, dipakai 186 dari 190 blok (`src` 150×, `css` 58×, `prompt` 38×). Hanya 6 bernilai runtime; 32 sisanya hasil `read()` yang bisa dibuat ulang modul mana pun dalam satu baris — sehingga 105 blok (3.119 baris) sebenarnya mekanis untuk dipindah. Pisahkan per **subjek**, bukan per file yang dibaca: satu blok boleh membaca `styles.css` dan tetap jelas bersubjek Settings.
- Guard: `scripts/check-docs.mjs` kini memvalidasi setiap path literal ber-anchor `ROOT` di `test/smoke/*.cjs` benar-benar ada, dan melarang `__dirname` di luar `harness.cjs`. Keduanya red-proof (path palsu → `✗ smoke module path drift`; `__dirname` sisipan → `✗ __dirname outside the smoke harness`). Angka yang terlanjur salah di `docs/plans/smoke-harness-split-2026-08-24.md` ditandai superseded beserta alasannya, tidak dihapus — keputusan Phase 3a diambil saat angka itu masih dipercaya.
- Tindak lanjut (2026-08-24): audit sesudah Phase 3b menemukan guard Lesson 181 belum menutup celahnya sendiri. Empat `read()` BAYANGAN masih hidup di modul, dua di antaranya beranchor berbeda (`ROOT` vs `ROOT/test`) dengan nama identik — `read("../src/x.ts")` dan `read("src/x.ts")` bisa menunjuk file sama lewat jalur berbeda, dan guard path-literal tidak melihatnya karena argumennya variabel. Keempatnya dihapus (harness `read()` sudah setara), satu konvensi path tersisa, `fs`/`path` tak lagi diekspor-pakai di modul domain. Guard ketiga ditambahkan: deklarasi `read` di luar `harness.cjs` = gagal. Pelajaran: guard yang lahir dari satu bug harus diuji terhadap SEMUA bentuk bug itu, bukan hanya bentuk yang kebetulan ditemukan.
- 182. **Analisis dependensi harus membaca kode, bukan komentar.** Saat memilih blok CSS-murni untuk `test/smoke/styles.cjs`, penyaring menandai empat blok sebagai "memakai variabel `guard`/`hub`" padahal kedua kata itu hanya muncul di teks komentar (`// ... merged-structure guard`) dan di dalam string selector CSS (`".oa-hub-chip-x {"`). Blok-blok itu nyaris tersingkir dari ekstraksi tanpa alasan. Aturan: sebelum mencocokkan identifier, buang dulu komentar `//` dan `/* */`; dan jangan percaya satu regex identifier — konfirmasi dengan melihat baris pemakaiannya. Kelas kesalahan sama dengan Lesson 181: mengukur bayangan teks, bukan semantik.
- Penyaring "file apa yang dibaca blok ini" sekali lagi terbukti salah sebagai metrik pemisahan: 33 blok menyentuh `styles.css`, tetapi hanya 9 yang **bersubjek** CSS rule-order; sisanya membaca `styles.css` sambil lalu untuk subjek attach, quickask, approvals, selbar, preview-diff. Konsisten dengan Lesson 181: kunci pengelompokan adalah subjek, dan subjek hanya bisa dibaca manusia dari isi assert-nya.
- Kesembilan blok itu membaca `styles.css` lewat pasangan `fs`/`path` lokal ber-anchor `__dirname`. Memindahkannya apa adanya akan langsung melanggar guard 2 dan 3 yang baru dibuat sendiri — bukti bahwa guard statis lintas-file berfungsi sebagai rem nyata, bukan hiasan. Penulisan ulang ke `read()` dilakukan dalam gerakan yang sama, dan red-proof (`.oa-hub-chip-x` → `.oa-ZZZ-chip-x`) memastikan guard yang pindah benar-benar berjalan, bukan sekadar termuat.
- 183. **Pakai parser, bukan regex, untuk pertanyaan tentang struktur kode.** Sepanjang fase split ini tiga angka kunci dihasilkan regex dan ketiganya salah: (a) "33 blok bersubjek styles" (ternyata 9 — sisanya membaca `styles.css` sambil lalu); (b) "sisa lane agent ~11 / chat ~10"; (c) "32 variabel file top-level jadi penghalang, 43 blok mewarisi `s`". Parser TypeScript — sudah ada di `node_modules`, tanpa dependensi baru — menunjukkan yang sebenarnya: **0** deklarasi `read()` di module scope (semua 459 berada di dalam blok masing-masing), hanya 6 variabel di badan IIFE, dan **1** blok saja yang benar-benar memakai `s`. Angka 43 itu artefak `/\bs\b/` yang cocok dengan huruf `s` di dalam string dan komentar. Aturan: pertanyaan "variabel ini dipakai di mana" dijawab dengan AST (`ts.createSourceFile` + `forEachChild`, dan abaikan `Identifier` yang merupakan nama properti), bukan pencocokan teks.
- Konsekuensinya rencana "naikkan variabel bersama ke harness" **dibatalkan sebelum ditulis** karena premisnya tidak ada: blok-blok itu sudah mandiri. Penghalang yang nyata hanyalah 103 blok yang masih memakai `fs`/`path`/`__dirname` inline — mekanis, sama persis dengan yang sudah dipecahkan di Phase 4. Pelajaran proses: ketika investigasi membatalkan premis rencana yang sudah disetujui, hentikan eksekusi dan laporkan dulu; jangan jalankan rencana yang dasarnya sudah runtuh.
- Verifikasi silang wajib saat dua metode berselisih. `truth.cjs` (AST) bilang "0 blok terikat runtime", `chk.cjs` (regex) bilang 43. Alih-alih memilih yang enak, keduanya diadu pada satu blok konkret (L1177) sampai ketahuan regex-nya yang salah. Dua alat yang berbeda hasilnya berarti satu di antaranya bug — cari tahu yang mana sebelum melanjutkan.
- 184. **Red-proof harus memotong DI TENGAH substring yang di-assert.** Guard smoke memakai `includes()`, jadi menambahkan sufiks tidak merusak apa pun: `onCompositionEnd` → `onCompositionEndZZ` tetap mengandung `onCompositionEnd`, dan test lolos hijau seolah-olah guard-nya mati. Dua kali sudah red-proof menghasilkan "exit 0" bukan karena guard tidak jalan, melainkan karena mutasinya cacat — sekali karena menyasar label guard (Phase 6), sekali karena menyasar sufiks (Phase 7). Aturan: buka badan guard, baca daftar `includes()`-nya, lalu sisipkan penanda di TENGAH token (`onCompositionZZEnd`). Dan perlakukan red-proof yang hijau sebagai kecurigaan terhadap mutasinya lebih dulu, bukan sebagai kesimpulan tentang guard-nya.
- Tidak setiap blok dalam satu klaster boleh pindah, dan alasannya bisa terbalik dari dugaan. Guard reasoning.tsx memakai `fs.existsSync` untuk membuktikan tiga file **tidak ada** (`chain-of-thought`, `steps`, `prompt-suggestion` — dikonfirmasi absen). Ia tak bisa ditulis ulang jadi `read()`, dan kalau dipindah, guard 1 check-docs justru akan menolaknya karena path literal `ROOT` di situ memang wajib gagal resolve. Guard yang mengassert ketiadaan adalah kebalikan dari guard yang mengassert isi; keduanya tidak bisa dipindah dengan mesin yang sama. Blok itu tetap di monolit, alasannya ditulis di header modul.
- Ekstraktor yang berhenti lebih berharga daripada ekstraktor yang pintar. `/tmp/ex4.cjs` gagal dua kali di tengah jalan — sekali pada `fs.existsSync`, sekali pada shadow `read` yang parameternya `(f)` bukan `(p)` — dan justru itu yang mencegah dua bug masuk repo. Assertion "tidak boleh ada sisa `fs`/`__dirname`/deklarasi `read`" dijalankan per blok SEBELUM apa pun ditulis, sehingga kegagalan selalu menunjuk nomor baris asalnya.
- 185. **Satu blok bisa memakai DUA anchor sekaligus.** Di monolit `__dirname` adalah `test/`, jadi `"../styles.css"` berarti root repo sementara `"real-preview/build.mjs"` berarti `test/real-preview/build.mjs`. Klaster quickask punya blok yang memakai kedua bentuk dalam tiga baris berurutan. Ekstraktor Phase 7 membuang segmen `..` begitu saja, sehingga path ber-anchor `test/` diam-diam berubah jadi path root — dan file yang tidak ada itu baru ketahuan karena setiap `read()` divalidasi keberadaannya sebelum ditulis. Aturan konversi yang benar: ada `..` di depan → buang satu segmen (root); tidak ada → tambahkan prefix `test/`. Jangan pernah menormalkan `..` tanpa memutuskan anchor-nya lebih dulu.
- 186. **Aturan anchor berlaku untuk setiap bentuk yang menghasilkan path, bukan cuma `read()`.** Di Phase 10 konversi `read()` sudah anchor-aware, tapi sebuah `fs.readFileSync(path.join(__dirname, …))` yang ditulis multi-baris tidak cocok dengan pola itu dan jatuh ke aturan `path.join` generik yang masih buta anchor — segmen `test` hilang diam-diam. Kalau sebuah aturan penulisan ulang punya versi "benar", terapkan ke semua jalur yang bisa memproduksi hasil yang sama, lalu buat ekstraktor melempar error pada sisa `..` alih-alih menormalkannya. Catatan penting: check-docs guard 1 **melewatkan argumen non-literal**, jadi helper seperti `path.join(ROOT, "test", p)` tak terlihat oleh gerbang dan tetap butuh audit manual.
- 187. **Gerbang hijau bukan bukti guard ikut berjalan.** Phase 11 memindahkan satu guard `async` (ia `await plugin.activateView()`). Modulnya lupa dipanggil dengan `await`, dan hasilnya: `npm test` exit 0, nol `✗`, tapi enam `✓` menguap karena proses keluar sebelum promise-nya selesai. Yang menangkap hanyalah diff terhadap baseline 289 baris. Exit code hanya membuktikan tidak ada yang gagal, bukan bahwa semuanya sempat dijalankan — selalu bandingkan jumlah dan isi `✓`, bukan status akhirnya. Pemicu asalnya sepele: patch wiring gagal di tengah karena `node --check` lebih dulu menolak file, jadi satu dari dua edit tak pernah tertulis (ulangan Lesson tentang "wiring itu dua edit").
- 188. **Assertion ketiadaan file membatasi ke mana guard boleh pindah.** Guard yang menuntut sebuah file *tidak ada* (`!fs.existsSync`) tidak bisa masuk `test/smoke/*.cjs` bila path-nya literal `path.join(ROOT, …)`, sebab check-docs guard 1 mewajibkan setiap literal semacam itu resolve di disk. Lewat `read()` justru boleh, karena gerbang tidak memeriksanya. Perbedaan ini diuji dengan modul probe sekali pakai sebelum blok ditarik kembali ke monolit — sepuluh detik kerja, dan menggantikan tebakan dengan fakta.
- Verifikasi keberadaan file adalah jaring pengaman termurah dalam refactor ini. Tiga kali sudah ia menangkap bug: dua path `real-preview` yang salah anchor (Phase 9), dan konfirmasi bahwa `chain-of-thought`/`steps`/`prompt-suggestion` memang sengaja absen (Phase 7). Biayanya satu `existsSync` per path unik; hasilnya membedakan "guard ikut pindah dengan benar" dari "guard pindah lalu selalu hijau karena membaca string kosong".
- Alat ukur baru wajib diuji pada kasus yang jawabannya sudah diketahui. Pemeriksa variabel-bebas berbasis AST melaporkan "nol blok memakai `__dirname`" padahal grep menemukan 17. Penyebabnya bukan temuan, melainkan bug: daftar target berisi objek blok, sementara filternya membandingkan nomor baris, jadi tidak ada satu pun yang cocok. Kalau alat baru langsung memberi jawaban yang menyenangkan, curigai alatnya — jalankan dulu pada input yang hasilnya sudah pasti.
- 189. **Memindahkan kode diam-diam mematikan assertion negatif.** Guard v0.1.179 berbunyi `!tab.includes('setName("Embedding model").addText')` — ia menjaga agar picker embedding tidak kembali jadi text field. Begitu renderer Memory pindah ke `src/settings/sections/memory.ts`, assertion itu tetap hijau di `settingsTab.ts`, tapi hijau karena **subjeknya sudah tidak ada di file itu**, bukan karena kontraknya terpenuhi. Bentuk `!x.includes(...)` selalu benar pada file yang salah, jadi ia tidak pernah muncul sebagai `✗` dan tidak akan tertangkap oleh diff baseline. Aturan: sebelum memindahkan kode, sapu dulu semua assertion negatif atas file sumber (`!tab.includes`, `!re.test`), lalu pindahkan tiap negatif ke pemilik barunya bersama positifnya. Di ekstraksi ini ada 5 dari 13 negatif yang wajib ikut pindah; sisanya memang bersubjek kode yang tetap tinggal.
- Assertion berbasis **hitungan** butuh perlakuan senada tapi berbeda obat: `(tab.match(/this\.resetButton\(/g)).length === 22` pecah jadi 13 + 9 setelah pemisahan, dan penjumlahan naif malah menghasilkan 23 karena baris delegasi di `sectionContext()` ikut tercocok. Pola dipersempit ke `resetButton\(st` — argumen pertama call-site sebenarnya selalu variabel `st…` — sehingga yang dihitung hanya pemasangan tombol, bukan perantaranya. Hitungan lintas-file harus dijumlahkan atas semua pemilik **dan** disaring dari kode perancah, kalau tidak ia hijau karena sebab yang salah.
- Ekstraksi bisa menyingkap bug yang sudah lama tidur. Pin `tab.includes('"Compression"')` dan `markModified(stCompressionEnabled` tetap hijau setelah renderer pindah — ternyata `settingsTab.ts` memang punya baris "Compression" milik `auxModelRow` di tab Model **dan** toggle `compressionEnabled` kedua di L1532, duplikat yang sudah ada sejak sebelum refactor ini (terverifikasi di `git show HEAD:src/settingsTab.ts`). Selama ini guard v0.1.175 bisa lulus lewat baris yang bukan subjeknya. Pin sudah diarahkan ke modul; duplikat toggle-nya sendiri dicatat sebagai temuan terpisah, bukan diperbaiki menyelinap di dalam commit refactor.
- Kesetaraan perilaku dibuktikan mekanis, bukan dengan membaca ulang. Badan hasil ekstraksi dibandingkan byte-per-byte dengan potongan `git show HEAD:` setelah dedent satu level dan substitusi `this.` → `ctx.` terbatas pada enam anggota kontrak; skripnya menolak kalau masih ada sisa `this.`. Untuk pemindahan verbatim, pembuktian "identik modulo satu transformasi yang dinyatakan" jauh lebih kuat daripada gerbang test mana pun.
- 190. **Guard yang memakai CSS sebagai bukti hanya menjaga separuh kontrak.** Blok `stacked fields` memastikan `styles.css` punya aturan `.oa-settings .setting-item.oa-has-stacked textarea`, lalu berhenti di situ. Saat red-proof Phase 2, kelas `oa-has-stacked` diganti namanya di helper TS yang memasangnya — smoke tetap 289 `✓`, nol `✗`. Aturan CSS-nya masih ada, hanya saja tak ada lagi elemen yang memakainya, dan layout stacked diam-diam mati. Pasangan selector/kelas selalu butuh dua pin: satu pada aturan yang mengonsumsi, satu pada kode yang memasang (`addClass("oa-has-stacked")`). Lubang ini sudah ada sebelum refactor; yang menemukannya bukan gerbang, melainkan kebiasaan memutasi setiap lengan guard satu per satu.
- Red-proof bukan cuma formalitas verifikasi — ia audit atas guard itu sendiri. Empat lengan dimutasi di Phase 2, tiga merah sesuai harapan dan satu hijau; yang hijau itulah temuannya. Kalau red-proof hanya dijalankan pada lengan yang baru ditulis, bug seperti Lesson 190 akan lolos terus, sebab lengan lama tidak pernah diuji sejak hari ia ditulis.
- Sebelum memutuskan helper mana yang jadi "shared", survei pemanggilnya lewat AST, bukan grep. `settingsTab.ts` punya lima helper level-modul; tebakan awal rencana menyebut tiga, dan survei AST membuktikan tebakan itu tepat justru karena `baseUrlDesc` dan `stackedControl` hanya dipanggil renderer yang **tetap tinggal**. Memindahkan keduanya akan menambah dua modul lintas-file tanpa manfaat. Kriteria pindah bukan "dipakai lebih dari sekali", melainkan "dipakai oleh pemilik yang berbeda setelah pemisahan".

### 191. (2026-08-24) Owner: "kenapa ada 2 setingan yang sama? … pindahkan saja ke Memory & Context" → satu key, dua penulis: duplikat sejak v0.1.175 akhirnya ditutup

- Yang dilihat owner cuma satu toggle kembar, tapi cakupannya lebih luas: blok `Context & compression` di tab Model (`settingsTab.ts` L1510-1574, warisan v0.1.17) merender **empat** baris, dan **tiga** di antaranya menulis key yang sama persis dengan blok Compression di Memory & Context yang ditambahkan v0.1.175 — `compressionEnabled`, `compressionThreshold`, `compressionProtectLastN`. Hanya `modelContextLength` yang tidak punya kembaran. Efek nyatanya bukan sekadar jelek: dua penulis pada satu key berarti mengubah nilai di satu tab meninggalkan tab satunya menampilkan angka basi sampai ia dirender ulang, dan tombol ↺ dipasang **dua kali** untuk key yang sama (tercatat di Lesson 172 sebagai temuan terbuka, akhirnya ditutup di sini).
- Duplikat itu lahir karena v0.1.175 mengejar paritas Hermes Desktop (`SECTIONS.id=="memory"` memang memuat `compression.*`) tanpa lebih dulu menyapu apakah key-nya sudah punya UI di tempat lain. Aturan: **sebelum menambah baris settings, grep key-nya, bukan label-nya.** Label boleh beda ("Enable compression" vs "Compression"), key-nya yang menentukan apakah itu baris baru atau baris kedua.
- Penamaan diverifikasi ke sumbernya, bukan ke ingatan: `apps/desktop/src/app/settings/constants.ts` (`FIELD_LABELS`) memakai `Context Window` / `Auto-Compression` / `Compression Threshold` / `Compression Target` / `Protected Recent Messages`. Title Case itu **tidak** disalin mentah — pedoman plugin Obsidian mewajibkan sentence case ("only the first word in a sentence, and proper nouns, should be capitalized"). Jadi paritas diambil pada tingkat *istilah*, casing mengikuti platform tempat kita ship. Guard `v0.1.193` memasang larangan eksplisit pada ketiga bentuk Title Case supaya salin-tempel dari upstream tidak diam-diam masuk lagi.
- Penempatan `Context window` sengaja **menyimpang** dari Hermes (di sana ia tinggal di section Model): threshold adalah persentase *dari* context window, jadi menaruh keduanya berjauhan memaksa pengguna menghitung di kepala. Keputusan owner, dicatat sebagai deviasi sadar, dan urutannya dikunci guard (`indexOf` subheading < `Context window` < `Auto-compression`) — bukan sekadar "ada baris"-nya.
- Default `compression.threshold` 0.8 dan `protect_last_n` 4 ternyata juga menyimpang dari Hermes (`0.50` / `20`). Pada 0.8/4 kompresi baru menyala saat konteks nyaris penuh lalu menyisakan empat pesan — persis kondisi yang bisa meluap di tengah tool-call. Diselaraskan ke 0.50/20. Vault yang sudah menyimpan nilai legal **tidak** dimigrasi paksa; hanya install baru dan tombol ↺ yang mendarat di angka baru, dan itu dipin dua-duanya di `test/settings.test.cjs`.
- Jebakan yang nyaris terulang: default hidup di **dua** literal — `DEFAULT_SETTINGS` dan fallback di `normalizeLoadedSettings`. Mengubah satu saja membuat nilai tolak-balik menunjuk angka pensiunan, dan tidak ada test yang otomatis mengeluh. Fallback-nya kini membaca `DEFAULT_SETTINGS.<key>` sehingga sumber kebenarannya tinggal satu; red-proof mengganti literal itu kembali ke `0.8` untuk membuktikan pin-nya memang menangkap.
- Menghapus baris UI = menyapu **empat** kelas guard sekaligus, bukan cuma yang menyebut label: (a) pin label (`v0.1.183`, `v0.1.175`), (b) pin subheading (`v0.1.17`), (c) assertion **hitungan** lintas-file (`resetButton(st` 22→20, `markModified(` 66→63 — dan hitungannya harus dihitung ulang dari `grep -c` di kedua file, bukan diaritmatikakan dari ingatan), (d) probe real-preview yang menanyakan DOM lewat `aria-label` (`F15` dipecah jadi `F15knobs` di halaman memory + `F15` slot aux di halaman model; `F45pctSlider` ikut ganti nama baris dan nilai harapannya). Yang (d) paling mudah terlewat karena `grep` label di `src/` tidak menyentuh `test/real-preview/`.

### 192. (2026-08-24) "Blocker" yang ternyata bukan: baca jalur kode sampai `process.exit`, jangan berhenti di teks notice

- Saya melaporkan ke owner bahwa witness basi (`test/real-preview/settings-audit-probes.json`) **memblokir** `npm run release`. Dasarnya: `planSettingsWitnessUpdate` mengembalikan notice "rerun the settings preview standalone and commit the updated witness", dan beberapa baris di bawah `release.mjs` memanggil `assertTrackedTreeClean(root)`. Dua fakta benar, kesimpulannya salah.
- Yang tidak saya telusuri: **apa yang dilakukan pemanggilnya dengan notice itu.** `build-settings.mjs` L2612-2613 = `if (plan.writeTracked) writeFileSync(...)` lalu `if (plan.notice) console.warn(...)`. Di bawah `OA_RELEASE_WITNESS=readonly`, `writeTracked` selalu `false` — jadi file tracked **tidak pernah ditulis**, pohon kerja **tetap bersih**, dan `assertTrackedTreeClean` justru lolos. Notice-nya `console.warn`, bukan `throw`; `step()` (`release.mjs` L38-46) hanya gagal kalau `execFileSync` melempar. Peringatan yang dicetak ke stdout tidak pernah menggagalkan step.
- Justru sebaliknya dari dugaan saya: mekanisme readonly itu **memang dirancang** supaya drift tidak menggagalkan rilis — komentarnya menyebut run 32653162333, insiden di mana harness menulis witness mid-release lalu clean-tree check menolak run yang mengotori pohonnya sendiri. Saya membaca pengaman itu sebagai jebakan.
- Yang benar-benar bisa menggagalkan rilis di langkah itu cuma satu: **probe merah**. `build-settings.mjs` L2619-2623 memfilter `v.fixed === false` lalu `process.exit(1)`. Jadi risikonya bukan "witness beda" melainkan "DOM tidak sesuai harapan probe" — dan itu baru ketahuan saat harness benar-benar jalan di mesin ber-Chromium.
- Aturan: sebelum menyebut sesuatu **blocker**, telusuri sampai menemukan `throw`, `process.exit`, atau exit code bukan-nol yang nyata. Notice, `console.warn`, dan nama fungsi yang terdengar galak (`assertTrackedTreeClean`) bukan bukti. Kalau tidak ketemu jalur keluarnya, statusnya "belum terverifikasi", bukan "memblokir" — dan owner harus mendengar versi itu.
- Temuan sampingan dari pembacaan yang sama: probe `F15knobs` sempat memuat field `noDupe: true` — konstanta harfiah yang ikut dikembalikan tapi tidak pernah masuk perhitungan `fixed`, dan tidak bisa gagal secara definisi. Komentarnya mengklaim "duplikat tab Model harus hilang", padahal yang benar-benar menguji itu `F15.gone` yang jalan **di halaman Model**. Field-nya dihapus. Assertion yang dievaluasi di halaman yang salah tidak menjadi benar hanya karena diberi komentar yang meyakinkan.

### 193. (2026-08-24) Ekstraksi renderer: yang berpindah bukan cuma kode, tapi juga jangkauan guard — dan pemanggilnya tidak pernah dijaga siapa pun

- Phase 3 memindahkan `terminalSettings` (103 baris) dari `src/settingsTab.ts` ke `src/settings/sections/terminal.ts`. `tsc --noEmit` hijau, tapi `npm test` merah dua: guard consent terminal di **`test/smoke.test.cjs`** (bukan `test/smoke/settings.cjs`) dan guard hitungan dot `v0.1.94`. Sebabnya satu: **guard membaca file berdasarkan nama.** `test/smoke.test.cjs` hanya membuka `src/main.ts`, `src/settings.ts`, `src/settingsTab.ts`; string apa pun yang ikut pindah ke `src/settings/sections/*.ts` otomatis lenyap dari pandangannya. Sebelum memindahkan sebuah method, grep string khasnya ke **seluruh** pohon `test/`, bukan cuma ke file guard yang sedang diingat.
- Guard consent tidak dilonggarkan, melainkan **diikutkan pindah dan diperketat**: sekarang ia memin `await ctx.plugin.grantTerminalConsent()` + `new TerminalConsentModal(ctx.app,` + `toggle.setValue(false);` di modul, **plus** `!settingsTab.includes("grantTerminalConsent")` supaya salinan kedua tidak bisa tumbuh diam-diam di tab. Kontrak keamanan yang berpindah file harus keluar dari perpindahan itu lebih ketat, bukan lebih longgar.
- Assertion hitungan lintas-file (`markModified(` === 63) adalah **fitur, bukan gangguan**: ia satu-satunya yang membuktikan ekstraksi tidak menelan satu dot pun. Perbaikannya menambah file ketiga ke penjumlahan dan mempertahankan angka 63 (42 tab + 17 memory + 4 terminal) — bukan menurunkan angkanya ke 59. Menurunkan ekspektasi akan mengubah bukti menjadi stempel.
- **Temuan utama, dari red-proof, bukan dari kegagalan test.** Setelah semua hijau saya memutasi satu hal lagi: menghapus baris pemanggil `terminalSection(this.sectionContext(), containerEl);`. Hasilnya `tsc` hijau dan **nol guard protes** — padahal seluruh section Terminal & Processes tidak akan pernah dirender. Lubang ini **sudah ada sebelum ekstraksi** (`this.terminalSettings(containerEl)` juga tak pernah dipin siapa pun), tapi ekstraksi menaikkan risikonya: definisi dan pemanggil kini di file berbeda. Modul `memory` kebetulan tertutup guard IA yang memeriksa isi tab; `terminal` tidak, karena ia dirender inline di dalam Capabilities.
- Ditutup oleh `v0.1.194`, yang mengunci **rantai lengkap** tiap modul yang diekstrak: import → pemanggilan lewat `sectionContext()` → urutan terhadap subheading pengantarnya → tanda tangan `export` di modulnya → dan tidak adanya sisa `private <nama>(` di tab. Enam lengan, keenamnya di-red-proof merah.
- Aturan yang lahir: **"fungsinya ada dan mengekspor" bukan bukti fitur itu hidup.** Untuk setiap ekstraksi berikutnya (`general`, `mcp`), guard wiring ditulis di commit yang sama dengan pemindahannya. Dan perluasan Lesson 191: red-proof jangan berhenti di lengan yang baru ditulis — mutasi juga hal-hal yang menurut Anda "pasti sudah dijaga". Yang hijau saat dimutasi, itulah temuannya.

### 194. (2026-08-24) Prediksi guard yang patah hanya sebaik pola pencariannya — dan komentar bisa memuaskan guard posisi

- Sebelum memindahkan `general` (189 baris) saya menulis prediktor: ambil semua literal berkutip dari blok yang akan pindah, cocokkan ke file test. Prediksinya lima guard patah. Kenyataannya **enam**. Yang lolos: band copy `C1–C16`, yang memin **potongan** kalimat (`"Resets to Off each time you open this tab."`) sementara di sumber kalimat itu bagian dari `setDesc` yang lebih panjang. Prediktor saya membandingkan literal **utuh** lawan literal utuh, jadi substring tidak pernah cocok.
- Aturannya: prediktor pencocokan-literal itu alat bantu, bukan jaminan. Ia menjawab "mana yang PASTI patah", bukan "hanya ini yang patah". Yang menentukan tetap `npm test`, dan angka prediksi tidak boleh dipakai sebagai daftar-selesai.
- Verifikasi pemindahan dilakukan dengan **roundtrip byte-exact**, bukan dengan membaca ulang: body dipotong secara programatik, di-dedent satu tab, empat substitusi `this.*` → `ctx.*` diterapkan dengan regex, lalu hasilnya *dibalik* kembali dan dibandingkan `==` dengan aslinya. Identik. Ini jauh lebih kuat daripada mengetik ulang isi method lalu berharap tidak ada yang tergeser — dan lebih murah daripada review manual 189 baris.
- **Temuan utama: doc-comment saya sendiri menjatuhkan guard urutan.** Guard v0.1.50 mengukur posisi heading dengan `st.indexOf('"Backup & Restore"')` atas teks sumber MENTAH. Header modul baru menjelaskan urutan grupnya dan karenanya menyebut `"Backup & Restore"` dan `"Danger Zone"` — `indexOf` menemukan komentar itu di offset 232/274, jauh sebelum `ctx.subheading(...)` yang asli, lalu melaporkan urutan kacau. Gagal merah, padahal kodenya benar.
- Yang penting: kelemahan itu **bukan** dibuat oleh ekstraksi. Komentar yang menyebut nama heading di `settingsTab.ts` akan melakukan hal yang sama sejak hari guard itu ditulis; kebetulan saja belum pernah ada. Jadi perbaikannya bukan "hapus komentarnya" (itu menyembunyikan bug guard demi lolos) melainkan **membuat guard mengukur kode saja**: buang blok `/* */` dan baris `//`/`*` sebelum menghitung posisi.
- Red-proof-nya dibalik arah untuk yang satu ini. Selain tujuh mutasi yang harus MERAH, saya menyuntikkan komentar berisi nama-nama grup dalam urutan TERBALIK dan menuntut guard tetap **hijau**. Guard posisi yang bisa dipengaruhi teks komentar tidak mengukur tata letak, ia mengukur ejaan. Untuk setiap guard berbasis `indexOf` di masa depan: buktikan dua arah — kode salah harus merah, komentar apa pun harus tak berpengaruh.
- Catatan pembersihan impor, senada Lesson 193: pemindahan ini meninggalkan **empat** impor yatim (`buildSettingsExport`, `exportStamp`, `copyText`, `ConfirmResetModal`) sementara `JsonImportModal` dan `ExportFileSuggestModal` masih hidup di pemanggil lain. Bedanya cuma ketahuan dengan `grep -n` lalu membaca tiap barisnya; `grep -c` akan menyamakan keduanya.

### 195. (2026-08-24) `slice(indexOf(...))` gagal DIAM — tiga guard hijau ternyata mengukur wilayah yang salah

- Lesson 194 ditutup dengan aturan berwawasan ke depan: "untuk setiap guard berbasis `indexOf` **di masa depan**, buktikan dua arah". Kalimat itu salah bentuk. Kalau sebuah pelajaran berbunyi "mulai sekarang guard jenis X harus begini", maka **semua guard jenis X yang sudah ada langsung menjadi tersangka** — dan harus diaudit di perubahan yang sama. Saya tidak melakukannya, dan tiga guard yang sudah rusak lolos satu putaran penuh.
- Cacatnya ada pada idiom `x.slice(x.indexOf(A), x.indexOf(B))`. `indexOf` mengembalikan `-1` untuk penanda yang hilang, dan `String.slice` **tidak melempar** untuk `-1` — ia membacanya sebagai "satu karakter sebelum akhir". Jadi penanda yang terhapus tidak menghasilkan error, melainkan wilayah yang salah tapi masuk akal:
  - `slice(-1, n)` → `""`. Setiap lengan `!wilayah.includes(...)` menjadi **benar secara hampa**.
  - `slice(n, -1)` → hampir seluruh file. Lengan `includes(...)` positif cocok ke kode yang tak ada hubungannya.
  - Keduanya condong ke arah yang sama: **hijau**. Ini kegagalan paling berbahaya — guard berhenti menguji tanpa memberi tahu siapa pun, sambil tetap membelanjakan kepercayaan sebuah centang hijau.
- Yang ditemukan audit atas 19 lokasi slice di jalur smoke (skrip ad-hoc: petakan `const v = read("path")` **terdekat ke atas**, bukan yang terakhir di file — versi pertama saya salah scope dan melaporkan false positive):
  - `settings.cjs:408` `genSection` — penanda `"private general("` terhapus di `143858e` (ekstraksi general). Panjang wilayah **0**.
  - `settings.cjs:411` `safetySection` — penanda akhir yang sama. Panjang **141.099** karakter, mencakup **73** method, termasuk `mcp()`; makanya `safetySection.includes("Import mcp.json")` bernilai true dan tidak membuktikan kepemilikan apa pun.
  - `styles.cjs:78` `anchor` — **bukan** ulah saya, sudah rusak sejak lama dan lewat jenis kerusakan ketiga: kedua penanda ADA, tapi kemunculan pertama penanda akhir (offset 23.333) berada 65k karakter **sebelum** penanda awal (88.893), sehingga rentangnya terbalik dan `slice` memulangkan `""`.
- Buktinya bukan "sekarang hijau". Untuk tiap lengan yang diperbaiki saya jalankan mutasi identik dua kali — sekali dengan guard LAMA, sekali dengan guard BARU. `genSection`: LAMA hijau, BARU merah. `anchor`: LAMA hijau, BARU merah. Itulah satu-satunya bentuk bukti bahwa sebuah lengan benar-benar mati, bukan sekadar dicurigai mati.
- Perbaikannya struktural, bukan tambal tiga baris: `region(body, awal, akhir)` dan `regionFrom(body, awal)` di `test/smoke/harness.cjs` **melempar** kalau penanda tidak ketemu, dan mencari penanda akhir hanya **setelah** penanda awal (menutup bug rentang terbalik). Seluruh 15 pemakaian idiom mentah di jalur smoke dikonversi, lalu `v0.1.195` di `misc.cjs` mengunci agar idiom itu tidak bisa kembali.
- **Guard meta itu sendiri sempat punya dua lubang, dan cara saya menemukannya penting.** Versi pertama memverifikasi harness dengan mencocokkan teks sumbernya (`harness.includes("region start marker not found")`, `jumlah throw >= 3`). Saat saya mengubah `throw` pertama menjadi `return ""` guard tetap **hijau** — string pesan yang sama masih ada di `regionFrom`, dan hitungan throw masih lolos ambang. Pelajarannya: **guard untuk perilaku gagal-keras harus MEMANGGIL fungsinya**, bukan membaca kodenya. Versi final menjalankan `region()` atas string uji dan menuntut `throws(...)` untuk penanda hilang serta rentang terbalik. Enam mutasi, keenamnya merah.
- Jebakan tambahan yang sempat menipu saya: probe "merah/hijau" yang cuma membaca exit code tidak bisa membedakan **guard menangkap** dari **suite crash sebelum guard sempat jalan**. Mutasi M4 menghapus `regionFrom` dari ekspor → `TypeError` di modul lain → saya hampir mencatatnya sebagai lubang. Probe red-proof harus memeriksa tiga keadaan: baris `✗` guard itu muncul, baris `✓`-nya muncul, atau tidak dua-duanya (tak konklusif).
- Sisi kebalikan tetap dijaga seperti Lesson 194: prosa yang **menyebut** anti-pola (di harness dan di komentar guard ini sendiri) harus tetap hijau. Penyaring baris-komentar sederhana tidak cukup — baris lanjutan sebuah blok `/* */` tidak diawali `//` maupun `*`, dan guard sempat menuduh komentarnya sendiri. Solusinya mengosongkan komentar sambil **mempertahankan newline**, supaya nomor baris pada pesan pelanggaran tetap menunjuk lokasi asli.
- Aturan yang lahir: **jangan pernah memberi hasil `indexOf` mentah ke `slice`.** Pencarian penanda wajib menegaskan `> -1` dan gagal keras. Dan lebih luas: setiap kali sebuah refactor menghapus penanda tekstual (nama method, komentar penanda, selector), yang harus dicari bukan cuma "apa yang jadi merah" tapi "**apa yang seharusnya merah tapi diam-diam berhenti mengukur**".

### 196. (2026-08-24) Probe red-proof yang tidak pernah mendarat terlihat persis seperti guard yang mati

- Ekstraksi `mcp()` (Phase 3 selesai) saya red-proof dengan sepuluh mutasi. Dua di antaranya melaporkan "❌ tidak ada yang merah — lengan mati". Keduanya **bohong**, dan penyebabnya ada di probe-nya, bukan di guard-nya:
  - M7 memutasi `parseMcpServersDoc(doc` — string itu tidak pernah ada di file; yang asli `parseMcpServersDoc(area.value)`. Mutasi tak pernah diterapkan, file tak berubah, jadi tentu saja suite tetap hijau.
  - M3 mengganti `markModified(` menjadi `noop_markModified(`. Invarian yang dituju menghitung dengan regex `/markModified\(/g`, dan `noop_markModified(` **masih cocok** dengan regex itu. Hitungannya tetap 63, guard tetap hijau, padahal "mutasi berhasil".
- Setelah diperbaiki (hapus baris `markModified(...)` utuh; ganti pemakaian `parseMcpServersDoc(area.value)` jadi `JSON.parse(...)`), keduanya langsung merah: `v0.1.94` dan `mcp: mcp.json import wired`. Sepuluh dari sepuluh.
- Pelajaran: **hasil "hijau" dari sebuah probe red-proof tidak berarti apa-apa sampai kita membuktikan mutasinya benar-benar mendarat.** Harness probe wajib (a) menuntut `count == 1` untuk teks yang dimutasi dan berhenti keras kalau tidak, dan (b) membandingkan file sebelum/sesudah. Tanpa itu, salah ketik pada string probe akan dibaca sebagai temuan lubang guard — persis kesalahan diagnosis yang paling mahal, karena mendorong kita "memperbaiki" guard yang sebenarnya sehat.
- Turunan kedua: **mutasi harus melawan predikat yang sesungguhnya dipakai guard.** Kalau guard menghitung dengan regex, mutasi yang hanya menambah prefiks pada nama fungsi bukan mutasi — ia masih memenuhi regex. Baca dulu bentuk asersinya (`includes` literal? `indexOf` urutan? `match().length`?), baru rancang mutasi minimal yang benar-benar melanggarnya.

### 197. (2026-08-24) Sebuah probe merah bisa merah karena alasan yang SALAH

- Guard sentence-case `v0.1.196` punya beberapa lengan: pemindai Title Case, penjaga ukuran korpus, dan canary "label yang kukenal masih ada". Probe pertama memutasi `.setName("Memory budget")` → `"Memory Budget"` dan memang menghasilkan `✗` — tapi yang menyala **arm canary**, bukan arm Title Case yang sedang diuji. Kalau berhenti di situ, arm utamanya masih belum terbukti sama sekali.
- Perbaikannya: pilih subjek mutasi yang TIDAK dipakai lengan lain (`"Recall budget"` → `"Recall Budget"`), dan cocokkan pesan `✗` yang spesifik milik arm itu (`grep '^✗ v0.1.196 Title Case'`), bukan sekadar exit code atau `✗` apa pun. Setelah itu enam mutasi (label biasa, subheading multiline, modul lain, `settingsTab.ts`, dan segmen setelah titik dua) semuanya merah lewat arm yang benar.
- Kesalahan kedua di sesi yang sama: untuk menguji apakah allowlist proper-noun benar-benar menanggung beban, saya **menambah** entri yang tidak terpakai (`"Nonsense"`, `"Zone2"`). Tentu saja hijau — entri tak terpakai tidak mengubah apa pun. Yang membuktikan cakupan adalah **menghapus** anggota yang load-bearing: buang `"Zone"`, dan `"Danger Zone"` di `general.ts` langsung tertangkap.
- Aturan: satu guard multi-lengan butuh satu mutasi per lengan, masing-masing diverifikasi lewat *pesan* lengan itu; dan daftar-pengecualian diuji dengan pengurangan, bukan penambahan.

### 198. (2026-08-24) Angka temuan scanner adalah hipotesis, bukan fakta — baca tiap "pelanggaran" ke situs definisinya

- Sweep Title Case dibuka dengan scan otomatis atas semua `.setName(` di `src/`, hasilnya **10 pelanggaran**, dan angka itu sempat saya laporkan ke owner sebagai temuan. Setelah tiap kandidat dibaca ke tempat asalnya, hanya **2** yang nyata.
- Yang gugur setelah diverifikasi: `"Quick Ask"` adalah nama command (`src/main.ts:305`) dan entri menu editor; `"MIT License"` adalah judul lisensinya sendiri (baris 1 `LICENSE`); `"Local"` adalah nilai backend `local` di `terminal.ts`; `"Terminal & Processes"` nama toolset yang dipakai di pesan error `service.ts`; `"Browse Hub"` dan `"Mixture of Agents"` fitur Hermes Desktop; `"Brave Search"` nama produk. Pedoman Obsidian sendiri mengecualikan proper noun — "only the first word in a sentence, **and proper nouns**, should be capitalized".
- Empat baris `"Context menu: Add selection to chat"` bahkan bukan pengecualian, melainkan **aturan yang belum saya modelkan**: titik dua memulai kalimat baru, dan segmen setelahnya mengutip entri menu literal di `src/editorMenu.ts`. Jadi yang benar bukan memasukkan `Add`/`Run` ke allowlist (itu melubangi seluruh korpus), melainkan memecah label per `:` sebelum memindai.
- Aturan: scanner mengusulkan kandidat; yang memutuskan adalah pembacaan ke situs definisi. Melaporkan angka mentah scanner sebagai temuan = melaporkan hipotesis sebagai fakta.

### 199. (2026-08-24) Utang yang menyebar lewat penyalinan: tiga fallback ditulis ulang, dua call-site lupa

- Sapuan error/bug menemukan `navigator.clipboard.writeText()` dipanggil tanpa jalur penolakan di `code-block.tsx:82` dan `message.tsx:70`. Di webview Obsidian promise itu **menolak** saat dokumen tidak fokus atau host memblokir Clipboard API; tanpa `.catch`, salin yang gagal tampak identik dengan yang berhasil dan pengguna menempel isi clipboard lama.
- Yang membuat ini bug dan bukan pilihan desain: repo sudah menjawab persoalan yang sama di **empat** tempat lain. Tiga di antaranya (`sections/helpers.ts`, `modals/profile.ts`, `settingsTab.ts`) adalah fallback `execCommand` yang **ditulis ulang sendiri-sendiri**. Tekanan "tulis lagi saja" itulah yang melahirkan dua situs yang lupa. Memperbaiki dua instans tanpa menyatukan sumbernya berarti membiarkan instans keenam lahir nanti.
- Karena itu perbaikannya menyatukan ke `src/ui/clipboard.ts`, bukan menambal dua baris. Arah impornya diverifikasi lebih dulu: `settings/ → ui/` sudah ada 3 kali, `ui/ → settings/` **nol kali**. Usulan awal saya (pakai ulang `copyText` dari `sections/helpers.ts`) akan membalik layering dan menjadi impor `ui → settings` pertama di repo — ditarik sebelum ditulis. **Cek arah ketergantungan yang berlaku sebelum memilih rumah bagi kode bersama.**
- Kontrak modulnya sengaja `Promise<boolean>`, bukan `Promise<void>`: `copyDiagnostics()` dulu menampilkan Notice "diagnostics copied" tanpa syarat, termasuk saat kedua jalur gagal. Fungsi yang menelan kegagalan harus **melaporkan**, agar pemanggil tidak mengklaim sukses yang tak bisa diverifikasi.
- Efek samping yang ikut terangkat: kedua situs React memanggil `setCopied` lewat `setTimeout` 1500 ms tanpa penjaga unmount. `ChatApp` sudah menjaganya dengan `mountedRef`; keduanya tidak.
- Red-proof mengulang jebakan Lesson 195 dalam bentuk baru: lengan M2 ("modul kehilangan fallback") **tidak merah** saat `execCommand` dicabut, karena guard membaca file mentah dan **docstring modul itu sendiri menyebut `document.execCommand("copy")`**. Predikatnya puas dari prosa, bukan dari kode. Perbaikan: strip komentar sebelum memeriksa. Aturan: **guard yang memeriksa keberadaan idiom di sebuah file harus membaca file itu tanpa komentar** — kalau tidak, dokumentasi tentang idiom tersebut memuaskan pemeriksaannya.

### 200. (2026-08-24) "False positive tipe" adalah vonis yang harus dibuktikan, bukan diasumsikan

- Sapuan dimensi A memvonis 9 error `strictNullChecks` sebagai "0 nyata": 4 artefak penyempitan, 5 sudah dijaga. Saat mengeksekusi perbaikannya, membaca ulang **tiap situs** membuktikan vonis itu salah untuk **tiga** baris. Triase cepat berbasis pola cukup untuk memutuskan urutan kerja; ia tidak pernah cukup untuk memutuskan bahwa sesuatu bukan bug.
- `ChatApp.tsx:3966` disebut "dijaga `if (providerId && …)`". Guard itu menjaga **argumen**, bukan hasil `getActiveProvider(settings)` yang bisa `null`. Yang membongkarnya bukan pembacaan tipe, tapi mencari kembarannya: `main.ts:216` melakukan hal yang sama **dengan** `?.`. **Kode kembar yang berbeda penjagaannya adalah asimetri, bukan selera** — salah satunya salah.
- `pdf.ts:249-250` disebut false positive karena `loadingTask` "diisi di L215". Justru sebaliknya: assignment itu ada di dalam closure async, jadi CFA tahu di `finally` luar nilainya masih `null`. `never` bukan keluhan tipe — itu TS memberi tahu bahwa **cabang tersebut mustahil dieksekusi**. Blok cleanup-nya kode mati. **Perlakukan `never` sebagai laporan keterjangkauan, bukan sebagai gangguan anotasi.**
- `terminal/tools.ts:10` disebut "dijaga throw di atasnya". Throw itu memeriksa `terminal` dan `execution`, **tidak** `workspacePolicy` — padahal field itulah yang di-dereference `service.ts:195` untuk memutuskan kurungan `strict-folder`. Membaca guard yang berdekatan dan menganggapnya menjaga semua field adalah cara termudah melewatkan celah keamanan. **Cocokkan setiap field yang wajib dengan pemeriksaannya sendiri.**
- Sebelum menyunting dua kasus `never`, dua perbaikan naif (anotasi ulang ke `const` lokal; setter function) diuji di scratch file — **keduanya tetap `never`**. Tanpa uji itu saya akan menulis perbaikan yang tampak masuk akal, tetap gagal kompilasi, lalu tergoda menambalnya dengan `as` — yang menyembunyikan kode mati alih-alih menghidupkannya. **Uji pola perbaikan di scratch file sebelum menerapkannya ke kode nyata.**
- Guard v0.1.198 sempat merah karena bug di guard-nya sendiri: regex penghapus komentar `/\/\*[\s\S]*?\*\//` memakan `/**/` di dalam glob `"src/**/*.ts"`, mengubah `include` jadi `"src*.ts"`. **Jangan strip komentar dengan regex pada file yang isinya bisa mengandung `/*`** — untuk JSON, parse saja. Lengan "include tidak lagi mencakup src/" ada justru karena flag yang menyala tapi tak mencakup apa pun sama saja dengan flag mati; lengan itu menangkap kesalahan saya sendiri.

### 201. (2026-08-24) Guard yang tak pernah merah itu hiasan — mutasi dulu, dan `void` membutakan `getTypeAtLocation`

- Detektor floating promise pertama lulus dengan `5 checks, 0 failed` dan terasa meyakinkan. Ia **buta total terhadap setiap statement berawalan `void`**. Sebabnya satu baris: `checker.getTypeAtLocation(node)` pada `VoidExpression` mengembalikan tipe `void`, bukan `Promise<T>` milik operand-nya — jadi uji "apakah ini promise" tidak pernah jalan. **Buka bungkus `void` dan tanda kurung sebelum menanyakan tipe sebuah expression statement.**
- Yang membongkarnya bukan pembacaan ulang, melainkan harness 6 lengan (`/tmp/rp199.js`) yang **sengaja merusak kode** lalu menuntut gate merah: 3 lengan tetap hijau. Sejak sekarang, setiap guard baru wajib punya red-proof per lengan, dan tiap lengan harus menegaskan **pola pesan** yang diharapkan — bukan sekadar `exit != 0`.
- Angka "5 offender nyata" ternyata artefak dari kebutaan itu; detektor yang benar menemukan **96**. Pelajaran 198 bilang "instrumentasi sebelum percaya angka besar". Kebalikannya sama berbahayanya: **angka kecil yang melegakan layak dicurigai persis sama**, karena ia menghentikan penyelidikan lebih cepat.
- `void p` menandai *niat* fire-and-forget, tapi **tidak menangani apa pun**; `void p.finally(...)` juga tidak — `.finally` melempar ulang (dibuktikan di `/tmp/rej.js`). Hanya `.catch` eksplisit yang menyerap. Karena itu gate memisahkan dua ember: floating promise **tanpa penanda = gagal keras**, sedangkan yang ber-`void` = **ratchet** `VOID_BUDGET = 96` supaya populasinya tak diam-diam bertambah sambil menunggu refactor.
- Perbaikan `revealLeaf` mengajarkan hal kedua: **jangan merantai `.catch` ke API yang kontrak kembaliannya berubah antar versi.** Typings Obsidian bilang `Promise<void>`, build desktop lama mengembalikan `void`; `.catch` tanpa syarat meledak jadi `TypeError`. Yang menangkapnya adalah trap runtime baru (`test/fail-on-unhandled.cjs`), bukan `tsc` — **tipe menggambarkan versi yang dideklarasikan, bukan versi yang dipakai pengguna.**
- Trap itu sendiri berharga melampaui satu bug: unhandled rejection **senyap di renderer Electron**, jadi 96 situs `void` bisa menumpuk tanpa gejala. Memasangnya lewat `node --require` di semua lane menghindari 40 suntingan file dan membuat kelas bug ini fatal di CI.
- Sempat ada jebakan halus: lengan "unconditional `.catch`" tampak merah, tapi merah karena **lane lain** yang lebih dulu crash, bukan karena guard baru. Setelah mock lane itu dibuat mengembalikan promise, barulah terbukti guard v0.1.199 sendiri yang menangkapnya. **Merah karena alasan yang salah sama tidak berharganya dengan hijau palsu.**

### 202. (2026-08-24) Mutasi yang hanya mengganti kemunculan pertama membuat red-proof melapor MISS palsu

- Red-proof Phase 5 (26 lengan) melaporkan 5 masalah. Empat di antaranya **bukan guard yang mati**, melainkan mutasi yang gagal: `String.replace(needle, repl)` hanya mengganti **kemunculan pertama**, sedangkan pin-nya muncul beberapa kali di file yang sama (`Approval mode` ×3 di `safety.ts`, `markModified(` ×5 di `appearance.ts`). Salinan yang tersisa membuat `includes()` tetap benar, jadi guard tetap hijau dan lengan tampak "tidak pernah merah". **Mutasi dengan `split(needle).join(repl)` agar semua kemunculan mati.**
- Yang menyelamatkan analisis ini adalah assertion `if (mutated.includes(needle)) ABORT` yang dipasang setelah Pelajaran Phase 4. Tanpa itu, keempat lengan tadi akan terbaca sebagai "guard hiasan" dan saya akan memperkuat guard yang sebenarnya sudah benar. **Harness red-proof harus membuktikan mutasinya sendiri sebelum menyalahkan guard** — dan gagal berisik, bukan diam.
- Lengan kelima gagal karena alasan berbeda dan sama instruktifnya: needle `Thinking budget — sent to providers` dicari di `advanced.ts`, padahal baris itu tidak pernah pindah — ia tetap milik `settingsTab.ts`. **Asumsi "string ini ikut pindah" wajib diverifikasi dengan `grep -rn` ke seluruh `src/`, bukan ditebak dari nama section-nya.**
- Pin negatif `!tab.includes("private safety(")` merah bukan karena kode, tapi karena **dua komentar prosa** di `settingsTab.ts` L1553/L1556 yang masih menyebut `private safety()` / `private advanced()`. Jebakan ini sudah tercatat sebelumnya dan tetap terjadi — bedanya kali ini komentarnya memang **sudah basi** dan pantas diperbarui. **Saat sebuah `!includes` merah, `grep -n` literalnya dan pisahkan kode dari prosa sebelum melemahkan guard.**
- Enumerasi free-identifier dijalankan **sebelum** menulis modul (koreksi dari Phase 4, di mana roundtrip byte-exact lolos tapi tsc gagal pada 5 simbol tak ter-import). Hasilnya `tsc` hijau pada percobaan pertama untuk keempat modul. **Roundtrip membuktikan perpindahan, enumerasi import membuktikan kompilasi — keduanya wajib, bukan salah satu.**
- Prediksi "22 guard akan pecah" kini meleset dua fase berturut-turut (Phase 4: 6 dari 11 tertebak; Phase 5: 6 dari 14). **Perlakukan daftar prediksi sebagai petunjuk pencarian, dan diff baseline sebagai satu-satunya otoritas.**

### 203. (2026-08-24) `error` asinkron lolos dari `try/catch`, dan `finally` wajib memutus kabelnya

- Bug MCP: `try { await client.start() } catch {}` di `runtime.ts:102` **tidak** menangkap kegagalan spawn. `child.on("error")` dipancarkan EventEmitter secara asinkron, di luar tumpukan panggilan `try` yang sudah selesai. Akibatnya proses mati diam-diam dan setiap `request()` menunggu penuh 30 detik `MCP_DEFAULT_TIMEOUT_MS`. **Kegagalan asinkron butuh kanal eksplisit** — di sini `onError?()` opsional pada `McpTransport` (opsional agar `HttpTransport` tetap kompilasi) yang memanggil `failAll(err)`, lalu melatch `deadReason` supaya panggilan berikutnya ditolak seketika, bukan menunggu timeout.
- Bug stream: jalur keluar yang gagal meninggalkan `ReadableStream` terkunci dan satu soket bocor per balasan gagal. Perbaikannya di `finally`: `activeReader?.cancel()` (best-effort, `.catch(()=>{})`) **lalu** `ctl.abort()`. **Setiap sumber daya yang dipegang di luar fungsi wajib dilepas di `finally`, bukan di jalur sukses.**
- Pelajaran pengujian yang mengikat: membatalkan stream yang **sudah tertutup** adalah no-op menurut spesifikasi. Guard teardown yang dibangun di atas stream yang mencapai `close()` akan **hijau meski kode teardown-nya dihapus**. Hanya body yang **belum terkuras** (keluar loop lebih awal, mis. `[DONE]` dengan byte masih mengantre) yang benar-benar membuktikan reader dilepas.

### 204. (2026-08-24) Dua kontrak untuk satu tulisan: yang menelan error dan yang meneruskannya

- `saveSettings()` menolak (reject) saat gagal, tetapi ~129 dari 140 pemanggilnya adalah callback UI Obsidian (`onChange`/`onClick`) yang **membuang promise** yang diberikan. Tulisan yang gagal lenyap tanpa jejak: toggle tetap menyala, tidak ada notifikasi, dan setelan hilang saat restart. Perbaikannya **bukan** membuat `saveSettings()` berhenti melempar — sepuluh pemanggil (consent MCP/terminal, transaksi pesan chat) me-*rollback* state in-memory saat gagal, dan menelan error di sana akan mencatat consent sebagai diberikan padahal tidak ada yang sampai ke disk. **Sediakan dua kontrak**: `saveSettings()` tetap melempar untuk pemanggil yang menangani kegagalan, `saveSettingsSafe()` menelan + `console.error` + `Notice` untuk yang tidak.
- Migrasi 140 situs dilakukan dengan AST, bukan `sed`, dan **dipilah menurut risiko**: 10 di dalam `try` (jangan disentuh), 51 yang `await`-nya adalah pernyataan **terakhir** callback (murni fire-and-forget, aman dikonversi mekanis), 39 yang masih ada kode setelahnya (mengubah urutan — periksa satu per satu), 40 sisanya bukan argumen callback. **Hanya kelompok yang terbukti aman yang boleh dikonversi otomatis.**
- `tsc` menangkap dua situs `props.saveSettings` di `ChatApp.tsx` yang bukan milik plugin melainkan prop — bukti bahwa **typecheck adalah bagian dari migrasi mekanis, bukan langkah setelahnya.**

### 205. (2026-08-24) Pelapor error tidak boleh menjadi penyebab error, dan `window` itu milik bersama

- `installRejectionNet()` memanggil `window.addEventListener` tanpa feature-detect. Di host tanpa DOM (harness smoke, runner headless) `window` ada tetapi `addEventListener` tidak — dan karena net dipasang di `onload()` **sebelum** `loadSettings()`, lemparannya membatalkan `onload()` dan **mematikan seluruh plugin**. Lane smoke jatuh dari 296 ✓ menjadi 1 ✓. **Jaring pengaman wajib feature-detect dan membungkus dirinya sendiri dengan `try`: pelapor yang merusak startup lebih buruk daripada tidak ada pelapor.** Ini ditemukan oleh harness, bukan oleh review — nilai nyata dari gate yang benar-benar menjalankan `onload()`.
- Obsidian memakai **satu `window` bersama** untuk semua plugin. Handler `unhandledrejection` yang tidak menyaring akan mengklaim bug plugin lain sebagai milik kita dan memunculkan `Notice` yang menyesatkan. Filternya: abaikan rejection yang `Error.stack`-nya tidak memuat `this.manifest.id`. Handler juga **tidak pernah** memanggil `preventDefault()`, agar catatan konsol asli tetap utuh untuk plugin lain dan untuk kita.
- Guard statis yang melarang bentuk buruk lebih tahan lama daripada guard yang mengecek satu situs: pemindaian AST atas 130 berkas melarang `await x.saveSettings()` di posisi ekor callback UI, sehingga pola ini tidak bisa kembali lewat kode baru mana pun — bukan hanya di 51 situs yang baru diperbaiki.
