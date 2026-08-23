---
title: "Documentation consistency audit — v0.1.151"
type: audit
status: done
date: 2026-08-23
tags: [openagent, documentation, audit, plans, release]
---

# Documentation consistency audit — v0.1.151

## Summary

Audit ini membandingkan dokumentasi yang menyatakan pekerjaan “berikutnya”
dengan source, test witness, dan release record yang benar-benar ada pada
v0.1.151.

Kesimpulan: **kode dan release record sudah lebih maju daripada plan aktif**.
Tidak ada pekerjaan MCP Catalog yang masih menunggu implementasi. Modalnya sudah
diekstrak, secret store sudah terpisah, migrasi dan redaksi sudah diuji, dan
real-DOM witness F48 sudah hijau. Dokumen handoff yang belum diperbarui membuat
pekerjaan selesai terlihat masih pending.

Tidak ditemukan kerusakan production code dalam audit ini. Temuan utamanya
adalah drift status/roadmap, hub yang tidak lengkap, release-proof path yang
tidak tersedia, serta beberapa hygiene gap yang belum dijaga `check:docs`.

Raw evidence: [Open Agent v0.1.151 documentation consistency evidence](../../evidence/audits/openagent-v0.1.151-documentation-consistency-evidence-2026-08-23.md).

## Baseline

- Branch: `arena/01a02f3f-obsidian-openagent`.
- Commit: `e4c9a7fca275ac7d8b4d21579adb92f73c77b48b`.
- Branch bersih dan sama dengan `origin/main`; tidak ada PR.
- `package.json` dan `manifest.json`: v0.1.151.
- Checkout adalah upload snapshot dengan satu commit terlihat. Karena riwayat
  intermediate tidak tersedia, ground truth audit adalah source saat ini,
  tracked witnesses, dan `RELEASES.md`.

## Scope and method

Audit mencakup:

1. frontmatter dan status seluruh `docs/**/*.md`;
2. kelengkapan dan status tabel di `docs/README.md`;
3. klaim plan aktif terhadap source ownership dan tracked test witnesses;
4. jalur link/path dalam curated docs;
5. konsistensi release documentation;
6. cakupan nyata `scripts/check-docs.mjs`.

Audit tidak menjalankan provider, MCP server, Docker, atau Obsidian asli. Ia
juga tidak mengklaim ulang validitas runtime v0.1.151; untuk itu audit memakai
witness yang sudah tracked sebagai bukti bahwa klaim “pending” telah selesai.

## Findings

| ID | Severity | Finding | Consequence |
| --- | --- | --- | --- |
| D1 | high | Empat plan/roadmap masih menyatakan ekstraksi modal dan MCP security work belum selesai, padahal source, test, dan release v0.1.151 membuktikan selesai. | Sesi berikutnya dapat mengulang refactor security-sensitive atau mengambil urutan kerja yang salah. |
| D2 | medium | `docs/README.md` belum mencantumkan tiga dokumen material dan menampilkan status MCP credential decision yang tidak sama dengan frontmatter. | Hub tidak lagi menjadi indeks terpercaya. |
| D3 | medium | Kontrak release dahulu menunjuk `releases/vN/`, tetapi tidak ada release report yang tracked, termasuk v0.1.151. | **Remediated 2026-08-23:** immutable GitHub Release sekarang menyimpan keenam asset dan `RELEASES.md` menautkannya. |
| D4 | medium | `check:docs` hijau tetapi tidak memeriksa vocabulary status, kelengkapan hub, status parity, date/tags, link validity, atau release report. | Gate memberi green result pada drift yang seharusnya bisa dideteksi otomatis. |
| D5 | low | Satu audit memakai status tidak terdokumentasi (`applied`), tiga path machine-specific masih ada di curated audits, dan Lesson 149 terduplikasi. | Taxonomy dan process memory lebih sulit diproses serta diaudit. |
| D6 | low | Lessons 123–177 lengkap tetapi tersusun dalam beberapa lompatan dan blok menurun. | Tidak ada lesson hilang, tetapi urutan memperbesar risiko duplikasi dan menyulitkan pembacaan. |

## D1 — completed MCP/settings work is still marked pending

### Facts in the tree

- `src/settings/modals/` berisi delapan module modal.
- `src/settings/modals/mcp-catalog.ts` memiliki `McpCatalogModal`.
- `src/settingsTab.ts` mengimpor dan membuka class tersebut.
- F48 dalam `test/real-preview/settings-audit-probes.json` bernilai
  `fixed: true`; ia membuktikan dua field n8n, password/autocomplete-off,
  failure recovery, tidak ada secret leak ke body text, dan success path.
- Unit/static witnesses untuk secret store, migration, export stripping, dan
  catalog security ada di suite test.
- `RELEASES.md` v0.1.151 mencatat semua hasil itu sebagai shipped.

### Stale documents

1. `settings-tab-modularization-2026-08-23.md` mengatakan modal extraction
   belum landed dan folder implementation belum ada, lalu di bagian lain
   mengatakan Phase 1–3 selesai. Phase 4 masih deferred.
2. `mcp-catalog-modal-security-plan-2026-08-23.md` masih `draft` dan menulis
   witness/extraction sebagai pekerjaan masa depan.
3. `mcp-credential-storage-decision-2026-08-23.md` masih `active` dan menyimpan
   dua item “Pending” yang sudah selesai.
4. `refactor-roadmap-after-skills-2026-08-23.md` masih berlabel “Phase 2 next”
   dan menandai Stage 5 deferred.

**Verdict:** keempat dokumen harus disinkronkan sebelum memilih refactor baru.
Plan modal dan MCP layak menjadi `done`; roadmap lintas-stage dapat tetap
`active` hanya jika current label-nya dipindahkan ke reassessment berikutnya.

## D2 — documentation hub is incomplete

Dokumen material yang belum terdaftar di `docs/README.md`:

- plan: `session-panel-extraction-2026-08-23.md`;
- study: `memory-context-engine-research-2026-08-21.md`;
- audit: `settings-descriptions-audit-2026-08-22.md`.

Selain itu, hub menyebut MCP credential decision `draft`, sedangkan file-nya
`active`. Setelah D1 dibetulkan, keduanya seharusnya menjadi `done`.

## D3 — release proof is promised but absent

Tiga contract surfaces menyatakan final report berada di `releases/vN/`:

- `RELEASES.md`;
- `docs/working-agreement.md`;
- `skills/internal/openagent-docs/SKILL.md`.

Tidak ada satu pun path `releases/` yang tracked dalam snapshot ini. Ini bisa
berasal dari proses upload yang tidak membawa arsip lama, tetapi kondisi yang
terlihat pembaca tetap sama: changelog menjanjikan detail yang tidak tersedia.

Sebelum menulis ulang kontrak, owner perlu memilih salah satu:

1. pulihkan minimal final report versi terbaru ke `releases/v0.1.151/` tanpa
   meng-commit ZIP generated; atau
2. ubah kontrak agar proof yang memang dipertahankan berada di `evidence/`.

Rekomendasi audit: **opsi 1**, karena ia mempertahankan pemisahan changelog
ringkas dan bukti rilis tanpa memasukkan binary release.

## D4 — current docs gate is structurally incomplete

`npm run check:docs` lulus 24/24. Namun gate hanya memastikan beberapa literal,
version metadata, tidak adanya ZIP di root, dan keberadaan `title/type/status`.
Ia belum menegakkan kontrak docs sepenuhnya.

Setelah konten dikoreksi, gate sebaiknya ditambah untuk:

- lima frontmatter key (`title`, `type`, `status`, `date`, `tags`);
- status hanya `active|done|draft|archived`;
- setiap plan/study/audit/reference material muncul di hub;
- status plan di hub sama dengan frontmatter;
- relative Markdown links resolve, sambil mengabaikan fenced/inline code dan
  contoh placeholder;
- current release memiliki final report atau kontrak proof baru yang dipilih.

## D5–D6 — hygiene findings

- `settings-descriptions-audit-2026-08-22.md` memakai `status: applied`, padahal
  hub hanya mendefinisikan `active`, `done`, `draft`, dan `archived`. Karena
  perubahan sudah diterapkan, nilai yang tepat adalah `done`.
- Tiga absolute workspace paths berada di dua audit historis. Path tersebut
  sebaiknya diganti dengan relative evidence link atau deskripsi baseline yang
  tidak terikat mesin.
- Working Agreement memiliki 178 heading untuk rentang Lesson 1–177. Lesson
  149 muncul dua kali berturut; heading pertama kosong dan aman dihapus.
- Tidak ada lesson yang hilang, tetapi urutan setelah 122 tidak numerik. Ini
  bukan kehilangan data dan tidak perlu dirombak bersamaan dengan sync status;
  lakukan sebagai cleanup terpisah agar diff process memory tetap reviewable.

## Healthy checks

Hal berikut konsisten dan tidak perlu diubah dalam sync pertama:

- working tree bersih dan branch sama dengan `origin/main`;
- metadata versi v0.1.151 sinkron;
- `RELEASES.md` memiliki v0.1.151 sebagai entry terbaru;
- README tool inventory adalah 25 tools dalam 10 toolsets dan dijaga gate;
- seluruh 52 note pre-audit memiliki kelima frontmatter key;
- tidak ada confirmed broken project-relative doc link setelah contoh/code
  dikeluarkan dari hasil scan;
- syntax `@[[note]]` yang muncul dalam inline code adalah dokumentasi perilaku
  produk, bukan navigation wikilink untuk docs.

## Recommended remediation order

1. Sinkronkan empat plan/roadmap terhadap v0.1.151.
2. Perbarui hub dan ubah `applied` menjadi `done`.
3. Putuskan/pulihkan release final-report contract.
4. Bersihkan duplicate Lesson 149 dan tiga machine paths dalam commit docs
   terpisah.
5. Perkuat `check:docs` agar D1–D5 tidak berulang.
6. Baru setelah docs hijau dan jujur, pilih refactor berikutnya.

## Remediation follow-up — 2026-08-23

The owner approved documentation reconciliation after reviewing this audit.
The same-session follow-up completed:

- D1: the four Settings/MCP plans and roadmap now match v0.1.151;
- D2: the missing plan, study, and audit are listed in the hub with matching
  status;
- D5: the non-standard status, three machine-specific paths, and duplicate
  Lesson 149 heading are corrected;
- related drift found during reconciliation: the Hermes tools gap is now a
  completed historical study with the current 25-tool inventory, and the
  Memory & Context study records all three shipped phases.

Still open by design:

- D4: strengthening `check:docs` changes project tooling and should be a
  separate test-first change;
- D6: Lessons 123–177 remain out of numeric order. No lesson is missing; a
  large process-memory reorder is deferred to a dedicated reviewable cleanup.

## D3 remediation — 2026-08-23

D3 is resolved by the owner-approved GitHub Release contract, not by restoring
an unavailable `releases/vN/` directory. [Open Agent v0.1.151](https://github.com/anythinguseful/obsidian-openagent/releases/tag/v0.1.151)
is public, non-draft, and targets `0ccc352995c8d31b42a8935bfce1d2d25f4d5395`.
It retains exactly these six immutable assets:

1. `openagent-obsidian-plugin-v0.1.151.zip`
2. `openagent-obsidian-plugin-v0.1.151.zip.sha256`
3. `openagent-v0.1.151-clean-source.zip`
4. `openagent-v0.1.151-clean-source.zip.sha256`
5. `openagent-v0.1.151-source-manifest.sha256`
6. `openagent-v0.1.151-final-report.md`

The successful [publication workflow run](https://github.com/anythinguseful/obsidian-openagent/actions/runs/32655385414)
built the complete set, downloaded and hash-verified the remote assets while
the release was draft, then repeated verification after publication. The install
ZIP checksum is `d58e7fc6c9ffa04445994d11017f4764973bd168b74d00cef614c6400f0e22fb`.

D3 is fully remediated. After explicit owner approval, the final-report asset
and release body were corrected to disclose reconstructed historical bytes while
preserving the tag, target commit, and the five other assets. This audit does not
claim historical byte or checksum identity.

## Outcome

Audit and deterministic documentation reconciliation are complete. **There is
no reason to continue MCP Catalog extraction or credential migration; both are
shipped.** The roadmap now waits for a new owner decision between Settings
section modularization, test-harness split, composer extraction, or product
feature/bug work.
