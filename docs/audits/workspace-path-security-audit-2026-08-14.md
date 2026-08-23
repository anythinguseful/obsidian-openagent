---
title: "Workspace path-security audit (2026-08-14)"
type: audit
status: done
date: 2026-08-14
tags: [openagent, audit, security, workspace, historical]
---

> Historical audit record. Its supporting raw evidence is kept in [`../../evidence/audits/openagent-v0.1.145-workspace-path-security-audit-2026-08-14.md`](../../evidence/audits/openagent-v0.1.145-workspace-path-security-audit-2026-08-14.md). This note preserves the readable audit narrative; logs, matrices, checksums, and other execution artifacts remain in `evidence/`.

# OpenAgent v0.1.145 — Workspace Path-Security Audit

**Tanggal:** 2026-08-14 (Asia/Jakarta)  
**Baseline:** closed release v0.1.144  
**Baseline source:** verified clean-source snapshot for v0.1.144 (historical release workspace; supporting proof is linked above)
**Status:** audit read-only; source dan artifact v0.1.144 tidak diubah

## 1. Ringkasan eksekutif

OpenAgent v0.1.144 mempunyai satu setting `workspaceFolder`, tetapi setting ini belum merupakan security boundary bersama.

- Registry berisi **21 tools**.
- Helper lokal `vaultPath()` hanya dipakai oleh keluarga note path dan destination web cache.
- `list_files`, `search_vault`, `get_active_note`, vault input `vision_analyze`, runner context file, attachment flow, serta cron output tidak memakai boundary yang sama.
- `normalizePath()` merapikan separator, tetapi **bukan** containment check. Segmen `.`/`..`, drive-like path, UNC-like path, malformed workspace root, dan protected config root belum ditolak secara eksplisit.
- Model-controlled atau settings-controlled path mencapai `Vault.create`, `createFolder`, `FileManager.renameFile`, dan beberapa `Adapter` operations tanpa policy boundary bersama.
- Dengan demikian, `workspaceFolder` v0.1.144 harus dipahami sebagai **default path routing**, bukan sandbox.

Temuan paling penting adalah bahwa input seperti `WS/../secret.md`, workspace root `../Outside`, atau workspace root `.obsidian` lolos dari helper saat ini. Apakah sebuah path bersegmen `..` benar-benar keluar dari vault bergantung pada API/adapter/platform Obsidian; audit ini tidak mengklaim exploit filesystem lintas-vault telah dibuktikan. Namun input berbahaya tetap mencapai sink tanpa penolakan, sehingga harus diperlakukan sebagai defect security dan ditutup sebelum mode Strict diperkenalkan.

## 2. Metode audit

Audit mencakup:

1. registry dan implementasi seluruh 21 tools di `src/agent/tools.ts`;
2. seluruh pemanggilan Vault/Adapter yang terdeteksi di `src/`;
3. runner, system prompt, active-note injection, chat attachment dan prompt-token resolution;
4. cron target/archive dan headless execution;
5. memory, skills, hub, profiles, sessions, export/import, dan plugin-private storage;
6. child delegation dan headless allowlists;
7. settings schema, migration pipeline, UI Workspace, dan test harness;
8. simulasi helper path saat ini untuk traversal, absolute-like input, mixed separators, prefix collision, dan malformed workspace root.

Obsidian mendokumentasikan `normalizePath()` sebagai pembersih separator/leading-trailing slash untuk path relatif vault. Ia tidak dapat dipakai sebagai bukti bahwa `..` telah ditolak atau bahwa sebuah path berada dalam subtree tertentu. Obsidian juga mengenali symlink/junction yang dapat menunjuk ke storage di luar vault; keterbatasan ini memengaruhi definisi boundary lintas desktop/mobile.

## 3. Peta seluruh sink vault

### 3.1 Agent-controlled user-content paths

| Surface | Read/write | Kondisi v0.1.144 |
|---|---|---|
| `read_note` | read | melewati `vaultPath()`; tidak ada policy/containment bersama |
| `write_note` | create/modify/append | melewati `vaultPath()`; folder dan file sink menerima path hasil normalisasi tanpa penolakan segmen traversal |
| `edit_note` | read/modify | sama |
| `delete_note` | trash | sama |
| `rename_move_note` | read/rename | source dan destination melewati helper, tetapi tidak ada independent containment proof |
| `list_files` | enumerate | memakai seluruh `getMarkdownFiles()`; argumen folder bukan workspace boundary |
| `search_vault` | enumerate/read | membaca seluruh markdown vault |
| `get_active_note` | read | membaca active file tanpa workspace check |
| `vision_analyze` vault source | binary read | langsung `normalizePath(value)` lalu `adapter.readBinary`; tidak memakai workspace helper |
| `web_extract` cache | create/modify | destination fixed hash melewati `vaultPath()`; remote URL bukan vault path |
| cron target note | create/append | langsung memakai `task.targetNote`; tidak memakai workspace helper |
| cron run archive | create | selalu `openagent/cron/runs/...`; tidak memakai workspace helper |
| runner context file | read | langsung `settings.contextFile`; tidak memakai workspace helper |
| runner active-note metadata/content | read/inject | path/content active note tidak di-scope |
| chat vault attachments | enumerate/read | file, image, folder, `@[[...]]`, `{[[...]]}`, `{activeNote}`, dan tag sweep dapat melihat seluruh vault |

### 3.2 Managed OpenAgent storage

| Surface | Storage | Klasifikasi |
|---|---|---|
| memory tools | `MEMORY.md`, `USER.md` di configured/profile memory folder | durable OpenAgent control-plane data di vault |
| skill tools | `SKILL.md` dan supporting files di configured/profile skills folder | durable OpenAgent control-plane data di vault |
| Skills Hub | adapter writes ke active profile skills folder | user-approved control-plane install flow, bukan model vault tool biasa |
| sessions | `.obsidian/plugins/<id>/sessions/*.json` melalui adapter | plugin-private metadata/transcript store |
| todo | disimpan di session JSON atau ephemeral child/headless state | bukan user-content vault path |
| profile removal | adapter recursive delete pada managed profile/session roots | explicit user UI action |
| settings/profile import | explicit vault picker + read | explicit user UI action |
| settings/chat export | fixed `openagent/exports` destination | explicit user command/UI action |
| PDF worker | plugin-bundled file melalui adapter | trusted bundled asset, bukan workspace content |

Managed storage harus dipisahkan secara eksplisit dari user-content workspace. Tanpa klasifikasi ini, mode Strict dapat diam-diam memutus memory/skills/sessions atau, sebaliknya, mengklaim isolasi proyek yang tidak benar.

### 3.3 Display-only/non-agent reads

- Changed-files card membuka file yang dipilih user; ia tidak mengirim konten ke model.
- Markdown preprocess dapat menyelesaikan vault image untuk dirender di UI; ini display-only, bukan model read.
- Settings automation UI melihat folder archive untuk tombol pengelolaan.

Surface ini tetap perlu regression coverage agar path card/UI konsisten, tetapi bukan primary model-data boundary.

## 4. Temuan security

### F1 — Helper path saat ini bukan containment boundary (**High**)

`vaultPath()`:

1. menormalisasi separator;
2. menormalisasi `workspaceFolder`;
3. menerima path yang sudah sama dengan root atau diawali `root/`;
4. selain itu menambahkan prefix root.

Ia tidak menolak `.`/`..`, absolute-like input, drive/UNC-like input, NUL/control characters, config directory, atau malformed workspace root.

Contoh hasil aktual helper:

| Workspace | Input | Hasil helper saat ini |
|---|---|---|
| `WS` | `../secret.md` | `WS/../secret.md` |
| `WS` | `WS/../secret.md` | `WS/../secret.md` |
| `WS` | `/absolute.md` | `WS/absolute.md` (silently reinterpreted) |
| `WS` | `C:\secret.md` | `WS/C:/secret.md` |
| `WS/..` | `note.md` | `WS/../note.md` |
| `../Outside` | `note.md` | `../Outside/note.md` |
| `.obsidian` | `note.md` | `.obsidian/note.md` |

Prefix collision `WS2/...` tidak salah dianggap berada di `WS` karena helper memakai `ws + "/"`; bagian ini sudah benar.

### F2 — Scope diterapkan tidak konsisten (**High**)

Model dapat memperoleh nama/path dari seluruh vault melalui list/search/active note, walaupun explicit note operations default ke workspace folder. Karena Preferred saat ini tidak pernah benar-benar menjadi sandbox, UI tidak boleh mengklaim boundary.

### F3 — Settings-controlled roots belum divalidasi bersama (**High**)

`workspaceFolder`, `memoryFolder`, `skillsFolder`, `contextFile`, cron `targetNote`, dan beberapa managed roots menerima string settings tanpa canonical validator yang sama. Approval mengurangi risiko untuk mutating tools, tetapi bukan pengganti path validation.

### F4 — Automatic model context dapat melewati workspace (**High untuk mode Strict**)

Active note, context file, prompt-token/tag sweep, `@` reference, dan manual vault picker dapat mengirim konten di luar workspace ke model. Strict tidak boleh hanya membatasi tools lalu membiarkan automatic context bypass.

### F5 — Cron target/archive tidak di-scope (**High untuk unattended execution**)

Headless allowlist sudah fail-closed untuk tools, tetapi scheduler sendiri menulis archive dan target note di luar shared tool boundary. Target harus divalidasi sebelum model call dan kedua sink harus memakai policy yang sama.

### F6 — Child/headless mewarisi settings, bukan immutable policy object (**Medium/High**)

Tool allowlists sudah fail-closed, tetapi tidak ada first-class policy snapshot. Child membuat context baru melalui `makeContext()`; mode Strict memerlukan policy yang canonical, tervalidasi, dan diwariskan identik ke parent, child, dan headless run.

### F7 — Tidak ada configurable file-read ceiling di tool boundary (**Medium**)

`read_note` dapat mengembalikan seluruh note ketika paging tidak diberikan. Agent loop baru memotong generic tool result pada 20.000 karakter. Akibatnya model tidak mendapat error/hint paging yang jujur dari `read_note` sendiri. Default v0.1.145 sebaiknya 20.000 karakter agar sesuai effective ceiling yang sudah ada, dengan reject + continuation guidance untuk request yang terlalu besar.

### F8 — Symlink/junction membatasi jaminan cross-platform (**Design limitation**)

Obsidian dapat menampilkan linked folders yang secara fisik berada di luar vault. Public cross-platform Vault API memberi logical vault paths, bukan portable realpath proof. Karena itu implementasi lintas desktop/mobile dapat menjamin **logical Obsidian path boundary**, tetapi tidak boleh mengklaim physical filesystem sandbox tanpa desktop-only native realpath enforcement.

### F9 — Existing tests tidak menguji adversarial path policy (**Medium**)

Test harness memock `normalizePath` sebagai identity. Coverage saat ini menguji prefixing normal, tetapi tidak menguji traversal, malformed workspace roots, config-dir protection, exclusions, strict active note, strict search/list, cron, vision, attachment, child, atau headless inheritance.

## 5. Kontrak tiga mode yang kompatibel

### 5.1 Whole vault

**Tujuan:** perilaku default lama ketika `workspaceFolder` kosong.

- User-content tools boleh mengakses seluruh logical vault.
- Traversal/absolute-like malformed paths dan Obsidian config directory tetap ditolak; “whole vault” berarti user content, bukan izin menulis plugin configuration.
- Configured exclusions tetap diterapkan bila user menambahkannya.
- Tidak ada prefix folder.

### 5.2 Preferred folder

**Tujuan:** mempertahankan perilaku kompatibel untuk existing non-empty `workspaceFolder`; ini convenience routing, bukan sandbox.

- Explicit note operations dan web-cache path mempertahankan default prefix behavior lama.
- Path yang sudah canonical di bawah preferred root tidak di-double-prefix.
- Traversal/absolute-like malformed input dan config directory tetap ditolak.
- Untuk zero-surprise migration, `list_files`, `search_vault`, active note, vision vault input, context file, attachments, memory/skills, dan cron behavior yang dahulu vault-wide tidak diam-diam diklaim aman.
- UI harus berkata jelas: **“Preferred folder changes default path resolution; it does not restrict all vault access.”**

### 5.3 Strict folder boundary

**Tujuan:** logical user-content boundary yang fail-closed.

- Root wajib non-empty, canonical, existing folder, bukan config directory, dan tanpa `.`/`..`/absolute-like shape.
- Semua agent-controlled reads/writes/list/search/rename dan automatic user-content injection harus berada di root subtree dan di luar excluded subtrees.
- Source dan destination rename divalidasi independen; cross-boundary rename ditolak.
- Invalid/missing strict root membuat user-content access fail-closed; tidak fallback ke whole vault.
- Cron target divalidasi sebelum model call; archive dan target berada dalam strict subtree.
- Child dan headless mendapat immutable policy snapshot yang sama.
- Remote/data URL untuk vision dan web tetap bukan vault path; SSRF/network security tetap policy terpisah.
- Jaminan adalah logical Obsidian path boundary kecuali kelak ditambah desktop-only physical realpath mode.

## 6. Matriks 21 tools

| # | Tool | Vault surface | Whole vault | Preferred folder | Strict folder |
|---:|---|---|---|---|---|
| 1 | `read_note` | user note read | allowed, exclusions/protected-root enforced | legacy default prefix | root + exclusions + read cap |
| 2 | `write_note` | user note create/modify/append | allowed after canonical validation | legacy default prefix | destination must be in scope |
| 3 | `edit_note` | user note read/modify | same | same | source/destination file in scope |
| 4 | `delete_note` | user note trash | same | same | target in scope |
| 5 | `rename_move_note` | source + destination | both canonical | legacy prefix on both | both independently in scope; no cross-boundary move |
| 6 | `list_files` | enumerate markdown | whole minus exclusions | legacy vault-wide minus exclusions | enumerate only strict subtree minus exclusions |
| 7 | `search_vault` | enumerate/read markdown | whole minus exclusions | legacy vault-wide minus exclusions | filter path before reading content |
| 8 | `get_active_note` | active note read | allowed unless excluded/protected | legacy vault-wide | out-of-scope active note returns scoped refusal/no content |
| 9 | `web_extract` | remote read + cache write | network unchanged; cache canonical | legacy workspace-prefixed cache | cache in strict subtree; remote fetch remains network policy |
| 10 | `save_memory` | managed memory write | managed-store policy | managed-store policy | decision required: managed exception vs workspace-local |
| 11 | `update_user_profile` | managed memory write | managed-store policy | managed-store policy | same decision as memory |
| 12 | `search_memory` | managed memory read | managed-store policy | managed-store policy | same decision as memory |
| 13 | `create_skill` | managed skill write | managed-store policy | managed-store policy | decision required: managed exception vs workspace-local |
| 14 | `list_skills` | managed skill enumerate | managed-store policy | managed-store policy | same decision as skills |
| 15 | `view_skill` | managed skill read | managed-store policy | managed-store policy | same decision as skills |
| 16 | `manage_skill` | managed skill read/write/delete | validated managed root + relative traversal guard | same | same decision as skills |
| 17 | `cronjob` | global task config; later target/archive writes | target canonical | preserve legacy semantics | target/archive strict; validate create/update/run before model call |
| 18 | `clarify` | UI only | no vault path | no vault path | no vault path |
| 19 | `todo` | ephemeral/session metadata | no user-content path | no user-content path | no user-content path |
| 20 | `vision_analyze` | data URL, HTTP URL, or vault binary | vault input canonical | preserve legacy vault-wide | vault source strict; data/HTTP unaffected by workspace |
| 21 | `delegate_task` | child access via allowlist | inherit parent policy | inherit parent policy | immutable strict policy inherited; no widening |

## 7. Non-tool model-visible matrix

| Surface | Whole | Preferred | Strict recommendation |
|---|---|---|---|
| Active-note auto attach | vault-wide | legacy vault-wide | omit/refuse when out of scope |
| Active-note path in system prompt | vault-wide | legacy vault-wide | expose only in-scope path |
| `contextFile` | configured vault-relative file | preserve legacy resolution | resolve within strict root; fail closed if out of scope |
| Vault file/image/folder picker | all vault | all vault | filter strictly; no out-of-scope one-turn override |
| `@[[...]]`, `{[[...]]}`, `{activeNote}`, tag sweep | all vault | all vault | filter strictly; out-of-scope content is not sent |
| Approval write preview | same resolver as write | same | must use exact strict resolver used by execution |
| Changed-files card | display/open only | resolved paths | display only in-scope tool effects |
| Chat transcript export | explicit user command | fixed legacy destination | user action; decide whether destination follows workspace |
| Settings/profile import | explicit user picker | all vault | user control-plane action, not agent read |

## 8. Recommended schema and migration

Proposed fields:

```ts
type WorkspaceMode = "whole-vault" | "preferred-folder" | "strict-folder";

workspaceMode: WorkspaceMode;
workspaceFolder: string;
workspaceExcludedFolders: string[];
fileReadMaxChars: number; // proposed range 1,000–20,000; default 20,000
```

Migration for settings without `workspaceMode`:

- `workspaceFolder.trim() === ""` → `whole-vault`;
- non-empty `workspaceFolder` → `preferred-folder`;
- never auto-migrate an existing vault into Strict.

Other requirements:

- one canonical settings sanitizer for root/exclusions;
- invalid Strict data from hand-edited/imported JSON remains Strict-but-invalid and fails closed; it must not silently become Whole vault;
- exclusions stored as canonical vault-relative folder paths and matched by exact segment boundaries;
- config directory (normally `.obsidian`) is an implicit protected root, not merely a default exclusion the model can bypass;
- mode/root/exclusions should be represented by one immutable `WorkspacePolicy` object per run.

## 9. Shared enforcement design

Recommended module: `src/agent/workspacePolicy.ts`.

It should own:

1. lexical validation before normalization (absolute/UNC/drive-like/control-character rejection);
2. canonical vault-relative normalization;
3. explicit rejection of `.` and `..` segments;
4. protected config-root rejection;
5. exact segment-boundary `contains(root, path)`;
6. exact segment-boundary exclusion matching;
7. mode-aware resolution for file/folder paths;
8. scope checks for existing `TFile`/`TFolder` paths;
9. immutable policy snapshot and human-readable refusal errors;
10. policy fingerprint for diagnostics/tests.

No tool, runner, scheduler, attachment flow, or approval preview should reimplement containment with raw `startsWith()`.

## 10. Regression matrix minimum

### 10.1 Canonical path tests

- blank path; slash-only path;
- `.` and `..` as whole segments at every depth;
- mixed `/` and `\\` separators;
- duplicate separators;
- leading `/`, `\\`, UNC-like, and Windows drive-like input;
- NUL/control characters;
- Unicode normalization and non-breaking spaces;
- root equality and child containment;
- prefix collision: `WS` vs `WS2`;
- case behavior documented rather than guessed across platforms;
- config root and config-root descendants;
- exclusions exact root/child and prefix collision;
- invalid/missing strict root fails closed.

### 10.2 Tool tests

- all read/write/edit/delete paths in three modes;
- source and destination rename matrix including cross-boundary attempts;
- list/search filter before content read;
- active note in-scope/out-of-scope/excluded;
- read cap whole, paged, oversized line/range, continuation hint;
- web cache destination;
- vision vault source plus unaffected HTTP/data URL;
- cron create/update/run, target, archive, error path, silent path;
- memory/skills according to chosen managed-storage contract;
- delegate child and nested batch inheritance;
- headless inheritance and invalid policy fail-closed.

### 10.3 UI/integration tests

- mode selector copy and warning text;
- folder picker + existence/type validation;
- exclusion add/remove/dedupe and overlap warning;
- invalid Strict state cannot look healthy;
- automatic active/context injection;
- vault picker, prompt tokens, `@` references, and tag sweep according to final decision;
- approval preview path equals execution path byte-for-byte;
- changed-files paths remain correct;
- settings migration/export/import round trip;
- Main Chat and Settings browser fixtures;
- complete existing v0.1.144 gates and clean rebuild.

### 10.4 Symlink tests/limitations

- logical paths under the strict root pass;
- logical paths outside fail;
- documentation and UI explicitly say linked folders visible under the root are treated as part of the logical workspace;
- do not claim physical filesystem containment without a separate desktop-only realpath design.

## 11. Approved design decisions

Recorded on 2026-08-14:

1. **Strict attachments:** filter/block every out-of-scope vault picker, `@` reference, prompt token, tag sweep, and active-note input. There is no per-message out-of-scope override.
2. **Project-isolated managed state:** memory and skills are partitioned per strict workspace. Session history remains in plugin-private storage but is partitioned by workspace/policy so project context cannot cross automatically.
3. **Symlink contract:** v0.1.145 guarantees a cross-platform **logical Obsidian path boundary**. UI/docs warn that a linked folder logically under the root is treated as in-scope even if its physical target is external.

These decisions make Strict a complete logical model-visible boundary while preserving plugin-private session storage.

## 12. Implementation gate

The design-decision gate is satisfied. Implementation order:

1. create a new working copy from verified clean source v0.1.144;
2. implement pure policy/schema/migration tests first;
3. wire tools, runner, cron, vision, and attachments to the shared policy;
4. add Settings UI and browser fixtures;
5. run serial typecheck/build/full tests/docs/browser/security gates;
6. build new v0.1.145 artifacts without altering v0.1.144.
