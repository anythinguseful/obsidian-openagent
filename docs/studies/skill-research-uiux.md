---
title: "Riset: skill UI/UX design untuk agent kita"
type: study
status: done
date: 2026-08-06
tags: [openagent, design, skills, study]
---

# Riset: skill UI/UX design untuk agent kita

Diminta owner 2026-08-06 ("apa kita research skills untuk kamu pakai buat
improve skill ui/ux design dulu?"). Semua isi diverifikasi dari sumber asli.

## Format kompatibilitas (fakta kode kita)

Parser kita (`src/agent/skills.ts::parseSkill`) membaca frontmatter `name`,
`description`, `when_to_use`/`whenToUse`, `enabled`, `contextMenu`; sisanya
diabaikan aman. Kesimpulan: **skill eksternal dengan frontmatter
name+description drop-in langsung jalan**. Loader hanya membaca `SKILL.md` —
file referensi lain di folder skill TIDAK ikut terbaca (penting saat menilai
skill ber-bundel besar).

## Kandidat yang diverifikasi isinya (2026-08-06)

### 1. anthropics/skills — `frontend-design` ✅ verbatim-fetched
`https://raw.githubusercontent.com/anthropics/skills/main/skills/vendor/anthropics/frontend-design/SKILL.md`
- Frontmatter: name + description + license → **100% kompatibel apa adanya**.
- Isi (revisi "clarity" terbaru, bukan versi pendek lama): framing design-lead
  studio; ground-to-subject; kalibrasi anti-default (menyebut persis 3 gaya
  "AI look" 2026: cream+serif+terracotta / near-black+acid accent / broadsheet
  hairline); proses dua-lolos (token system: 4–6 hex, peran type, wireframe
  ASCII, signature element → review → build); peringatan spesifisitas CSS
  (selector collision); restraint (satu tempat bold; quality floor: responsif,
  focus keyboard terlihat, prefers-reduced-motion); aturan menulis UI copy
  (active voice, nama dari sisi pengguna, error tidak minta maaf, empty state
  = undangan bertindak).
- Karakter: untuk MENCIPTA desain baru yang khas/distinctive (halaman web,
  hero, display fonts). **Sumir dengan UI plugin**: target kita justru
  native-look ikut host — "berani beda" adalah musuh native. Tetap bernilai
  untuk karya yang agent buatkan untuk pengguna (web, poster, prototype).

### 2. ibelick/ui-skills — `baseline-ui` ✅ verbatim-fetched
`https://raw.githubusercontent.com/ibelick/ui-skills/main/skills/baseline-ui/SKILL.md`
(ibu dari prompt-kit yang sudah kita port)
- Frontmatter name+description → kompatibel.
- Checklist "deslop": MUST/SHOULD/NEVER per kategori (Stack, Components,
  Interaction, Animation, Typography, Layout, Performance, Design). Contoh
  yang sangat selaras buku lesson kita: aria-label di tombol ikon-saja; animasi
  hanya transform/opacity, ≤200ms umpan balik, hormati reduced-motion; satu
  accent per view; empty state satu aksi jelas; error di dekat aksi;
  tanpa gradient ungu/multiwarna; token tema dulu sebelum warna baru.
- Karakter: POLISH pass atas UI yang sudah ada — persis pekerjaan harian
  kita. Bagian "Stack/Components" Tailwind/React-primitives tidak cocok
  Obsidian (perlu adaptasi); bagian lain mudah diterjemahkan.

### 3. vercel-labs/agent-skills — `web-design-guidelines` ✅ verbatim-fetched
- Skill kecil yang ME-FETCH aturan segar dari URL remote tiap review
  (butuh WebFetch; aturan tak berversi). Ide audit "file:line findings" bagus;
  ketergantungan jaringan + moving target tidak cocok di-bundle.

### 4. nextlevelbuilder/ui-ux-pro-max-skill ❌ dinilai tidak cocok
`https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` (114k★)
- Database besar (192 palet, 74 pasangan font, 98 guideline, **22 stack**
  termasuk WPF/WinUI/Avalonia) digerakkan CLI `uipro`-nya sendiri; loader kita
  hanya membaca SKILL.md → mesin utamanya mati. Mayoritas konten tidak relevan
  Obsidian. Mahal, konflik arah (distinctive-first), wajah tipikal
  "AI slop generator" kalau dipakai di plugin native.

### 5. kepano/obsidian-skills (tap bawaan kita) — diverifikasi listing
`https://github.com/kepano/obsidian-skills/tree/main/skills`
- Tetap 5 skill (defuddle, json-canvas, obsidian-bases, obsidian-cli,
  obsidian-markdown). **Tidak ada skill UI/CSS/theme Obsidian** di ekosistem
  resmi Obsidian — celah yang hanya bisa kita isi sendiri.
- Catatan pinggir: `obsidian-cli` relevan siklus dev plugin (build-run-test).

## Kesenjangan & arah rekomendasi (analisa, bukan keputusan)

Tiga kebutuhan berbeda jangan dicampur jadi satu skill:
1. **UI plugin yang native-look** (pekerjaan kita sehari-hari; target =
   diam rapi mengikuti host; buku lesson berisi fingerprint-nya: token var
   ber-fallback, tanpa hex liar, radius bersertifikat, light&dark, ribbon
   kecil, touch). → tak ada skill publik — tulis sendiri, tipis, dari
   working-agreement + styles-hygiene yang sudah teruji.
2. **Desain baru untuk pengguna** (web/artifact/prototipe) → pakai
   `frontend-design` verbatim (hub: custom tap `anthropics/skills` subtree
   `skills/`). Perhatian: owner 2026-07-23 menghapus tap bawaan anthropics
   dari Hermes — pasang sebagai tap KUSTOM (keputusan pengguna), plugin tidak
   perlu menjadikannya default.
3. **Polish pass cepat** → ide `baseline-ui` diterjemahkan ke konteks
   Obsidian (bagian stack-nya dibuang); bisa digabung ke (1) atau skill
   terpisah.

### 6. ui.sh (Tailwind CSS team × penulis Refactoring UI) — atas pointer owner
`https://ui.sh/` (video tutorial: youtube.com/watch?v=-B7uyMp54S4, Dan Vega,
2026-07-07)
- **Apa**: koleksi agent skills BERBAYAR + invite-only ("building UIs that
  don't suck") — /design (keahlian desainer senior), /ideas (bandingkan
  beberapa arah di browser), brand-kit, componentize, canonicalize-tailwind,
  add-dark-mode, dark-mode-image, make-responsive, markup-from-image.
- **Fakta lisensi**: konten SKILL.md TIDAK publik (instal lewat npx + token
  setelah diundang/bayar) → tidak bisa diverifikasi isi, tidak boleh diambil.
  Yang sah dipakai: TAKSONOMI task-oriented-nya (validasi struktur 3-bagian
  playbook kita) + materi PUBLIK Refactoring UI di bawah.
- **Materi publik sah (medium.com/refactoring-ui, "7 Practical Tips for
  Cheating at Design", 2019)** — 7 aturan verbatim-ringkas:
  1) hierarki via WARNA+TEBAL teks, bukan sekadar ukuran font;
  2) jangan teks abu di latar berwarna (opacity putih / warna turunan latar);
  3) bayangan di-offset (jangan simetris samar);
  4) kurangi border (box-shadow / dua latar / spasi lebih);
  5) jangan membesarkan ikon yang memang dirancang kecil;
  6) border aksen untuk desain yang pucat;
  7) tak semua tombol butuh latar (primary = jelas solid; secondary = outline/
     kontras rendah; tertiary = gaya tautan).
  (Pemetaan 1:1 ke konvensi kita: 1≠text-faint/muted/normal; 5=lesson glyph
  24px; 7=disc primary vs ghost icon-btn.)
- **Halaman per-skill (ui.sh/skills/design + /ideas, publik)**:
  - design = skill guidelines-based; menyebut persis "AI tells" yang ia
    ganjal: **palet dominan ungu, gradient pada TEKS, dan memo-kotakkan
    konten ke dalam panel yang tak perlu** (box-in-box). Tiga fingerprint
    ini masuk daftar anti-slop playbook (baru: text-gradient & panelitis).
  - Metode (dikutip): "builds within the project's EXISTING framework,
    components, assets, and conventions" (conventions-first — selaras
    native-look kita) + "checks the result across responsive breakpoints
    and important interaction states" (verifikasi state, bukan cuma
    keadaan default).
  - ideas = hasilkan beberapa ARAH desain sekaligus + picker di browser
    untuk bandingkan/gabung — pola eksplorasi-multi-opsi (analog lane
    screenshot kita, tapi untuk desain).
  - Instalasi `npx @uidotsh/install <skill> --token=…` (token berbayar),
    "most testing with Claude Code Opus + Codex".

## LIVE SET (2026-08-06) — di sinilah skill dev-ku berdiri

Foldernya: `skills/` (BUKAN ~/.claude/... — jalan lama basi,
working-agreement sudah dibetulkan). Isi: `openagent-ui` (kontrak binding
+ kini seksi Anti-slop fingerprints kalibrasi 2026-08-06), `frontend-design`
(revisi clarity upstream + LICENSE.txt), `functional-ui` (distilasi surface
fungsional), `web-design-guidelines` (bootstrap Vercel + vendored reference
— diverifikasi IDENTIK upstream byte-per-byte 2026-08-06). Ritual dan
pasangan skill dijelaskan di openagent-ui/SKILL.md; working-agreement.md
menunjuk set ini sebagai wajib-baca pra-kerja-UI.

## Catatan lisensi (belum diverifikasi penuh — cek sebelum BUNDLE)
Skill frontmatter menyebut "Complete terms in LICENSE.txt"; repo
anthropics/skills = Apache-2.0 menurut indeks agenticskills.io. Hub-install
(di-download pengguna sendiri) tidak menimbulkan isu bundling; kalau suatu
saat kita ship salinannya → wajib sertakan LICENSE.
