---
title: "Settings descriptions audit (2026-08-22)"
type: audit
status: applied
date: 2026-08-22
tags: [openagent, audit, settings, copy]
---

> **Status: applied** — seluruh A–E diterapkan 2026-08-22 (24 edit desc,
> termasuk "Compression threshold" yang tertangkap guard), pin smoke di-amend,
> guard v0.1.191 + voice rules di SKILL.md dibuat. Sisa saran proses
> (pin angka default) menunggu prioritas.

# Settings descriptions audit

Indikator owner (2026-08-22):

1. singkat, padat, jelas, mudah dipahami;
2. deskripsi menerangkan **kegunaan utama**.

Cakupan: 15 deskripsi tab (SECTION_DESC) · 33 deskripsi grup (subheading) ·
102 deskripsi setting (setDesc). Yang tidak disebut = sudah baik, biarkan.

---

## A. Bug & fakta usang (wajib dibetulkan)

### A1. "Max output tokens" — typo
- Sekarang: `0 lets the provider decide. Slider sweeps course values; type any value for precision.`
- Masalah: `course` salah tulis, harusnya `coarse` (kasar vs halus).
- Usul: `Maximum tokens per reply — 0 lets the provider decide. The slider sweeps coarse values; type any number for exact control.`

### A2. Deskripsi tab Chat — menyebut setting yang sudah pindah
- Sekarang: `Chat behaviour: personality, iteration cap, and session storage.`
- Masalah: "iteration cap" (Max tool iterations) SUDAH pindah ke Advanced (v0.1.151). Isi tab Chat kini hanya Personality + Save sessions + Max sessions kept.
- Usul: `Chat behaviour: personality and session storage.`
- Efek: pin smoke `agent: "Chat behaviour: personality, iteration cap, and session storage."` (baris ~4868) wajib di-amend.

### A3. Deskripsi tab General — tidak mencakup isi aslinya
- Sekarang: `Interface behaviour of the chat view.`
- Masalah: tab General juga memuat Backup & Restore + Danger Zone (Export/Import/Reset/Reset everything). Desc menyesatkan.
- Usul: `Chat interface behaviour, plus backup, restore, and reset.`

---

## B. Nama internal Hermes bocor ke UI (bukan kegunaan untuk user)

### B1. "Preserve recent tail"
- Sekarang: `Keep roughly this share of the trigger as verbatim recent messages (token-based; Hermes target_ratio).`
- Usul: `Keep this share of the most recent messages untouched when compressing.`
- Catatan parity `target_ratio` pindah ke komentar kode, bukan UI.

### B2. "Keep last N messages"
- Sekarang: `Minimum trailing messages never folded into the summary (Hermes protect_last_n).`
- Usul: `Minimum recent messages never folded into the summary.`

---

## C. Jargon teknis yang bisa dipahami awam

### C1. "Enable compression"
- Sekarang: `Fold old messages into a rolling summary as the wire nears the window. Off = long chats can hit provider context errors.`
- Usul: `Fold old messages into a rolling summary as the conversation nears the limit. Off = very long chats can hit provider context errors.`

### C2. "Compress when above"
- Sekarang: `Start compacting once the wire estimate crosses this share of the context window.`
- Usul: `Start compacting once the conversation fills this share of the context window.`

### C3. "Context window"
- Sekarang: `Tokens the model can see at once. 0 = auto (provider-advertised, else 256000).`
- Usul: `Tokens the model can see at once. 0 = auto-detect (falls back to 256000).`

### C4. "Custom system prompt"
- Sekarang: `Appended to the assembled system prompt — operator-level instructions.`
- Usul: `Extra instructions appended to every conversation's system prompt.`

### C5. "Debug mode"
- Sekarang: `Log transport details to the developer console.`
- Usul: `Log requests and responses to the developer console.`

### C6. "Test native notification"
- Sekarang: `The only action that may request OS permission. The test bypasses the master, event, away, and throttle gates.`
- Usul: `Sends a test banner — the only action that asks for OS permission. Works even while notifications are off.`

---

## D. Kepanjangan / menerangkan mekanisme, bukan kegunaan

### D1. "Checkpoints" (160c)
- Sekarang: `Before the agent modifies or trashes a note, save a copy of its previous content under openagent/checkpoints/. On by default — turn off to skip the extra files.`
- Usul: `Keep a rollback copy of every note the agent changes. On by default.`

### D2. "Include API keys in exports" (152c)
- Sekarang: `Off (default): API keys and Authorization headers are stripped — safe to share. On: full private backup. Switches back to Off every time this tab opens.`
- Usul: `Off (default): keys and auth headers are stripped — safe to share. On: full private backup. Resets to Off when you leave.`

### D3. "Title generation" (173c)
- Sekarang: `Name new sessions automatically after the first reply. Off by default: enabling it costs one extra model request per new session, which slows the first turn on local models.`
- Usul: `Name new sessions automatically after the first reply. Off by default — it costs one extra request per new session.`

### D4. "Context menu: Quick Ask (floating panel)" (172c)
- Sekarang: `Floating chat panel anchored to the selection (Copilot parity; also available as a hotkey-able command). Works on a bare cursor too — Replace only appears with a selection.`
- Usul: `Floating chat panel anchored to the selection (also a command). Works on a bare cursor too — Replace only appears with a selection.`

### D5. "Docker image" (161c)
- Sekarang: `Fixed by Settings, never chosen by the agent. Commands use --network none, a read-only container root, resource caps, closed stdin, and a masked Workspace mount.`
- Usul: `Chosen by Settings, never by the agent. Commands run with no network, a read-only root, resource caps, closed stdin, and a masked Workspace.`

### D6. "Memory Budget" (167c)
- Sekarang: `Character budget for MEMORY.md (500–20,000). When full, a new memory is refused with the current entries so the agent consolidates instead of growing the file forever.`
- Usul: `Size cap for MEMORY.md (500–20,000). When full, the agent must consolidate before adding more.`

### D7. "Run a script (advanced)" (142c)
- Sekarang: `Optional script run each tick from .obsidian/plugins/openagent/scripts/ (.sh/.js/.py) — output feeds the AI. Can't combine with a monitor URL.`
- Usul: `Script run each tick from .obsidian/plugins/openagent/scripts/ (.sh/.js/.py) — output feeds the AI. Can't combine with a monitor URL.`

### D8. "Script only (no AI)" (127c)
- Sekarang: `Run the script alone and append its output to the target note — the AI is not called at all (watchdog). Requires a script name.`
- Usul: `Run the script alone and append its output to the note — the AI is not called (watchdog). Requires a script name.`

---

## E. Konsistensi kecil

### E1. "Temperature"
- Sekarang: `0 = deterministic, 1 = creative, -1 = omit.`
- Usul: `0 = deterministic, 1 = creative, -1 = don't send.` (`omit` ambigu)

### E2. Deskripsi tab Advanced
- Sekarang: `Low-level transport and prompt overrides — iteration cap, output limits, checkpoint pruning.`
- Usul: `Rarely-needed controls — iteration cap, output limits, checkpoints, debug logging.`

### E3. Penyebutan default (konsistensi suara)
- Ada tiga pola berbeda: `On by default.` · `Off by default.` · `Off (default):`.
- Usul aturan: default disebut di AKHIR dengan `… by default.`, bukan di tengah tanda kurung.

---

## F. Deskripsi tab lain — sudah baik (biarkan)

- model, workspace, safety, appearance, command, profiles, capabilities, memory,
  notifications, automations, about. (dinilai ulang kalau isi tab berubah)

---

## Saran lain (proses, bukan teks)

1. **Voice rules tertulis** di `skills/internal/openagent-ui/SKILL.md` (kontrak UI):
   - kegunaan dulu, mekanisme belakangan;
   - ≤ 2 kalimat, desc setting idealnya ≤ ~100 karakter;
   - default di akhir (`… by default.`);
   - LARANG nama internal upstream (`target_ratio`, `protect_last_n`,
     `provider-advertised`) di UI string — taruh di komentar kode;
   - angka yang bisa drift (mis. 256000) disebut hanya bila perlu.

2. **Guard otomatis (smoke)**: tidak ada `setDesc` > 140 karakter + tidak ada
   token internal di UI string. Sejalan budaya "red-proof" proyek — mencegah
   regresi copy saat ada yang menambah setting baru.

3. **Pin angka default**: angka spesifik di desc (256000, 2000, 12, …) bisa
   drift saat source berubah. Bila tetap disebut, pin di test supaya merah
   saat source berubah.

4. **Selesaikan blok kompresi duplikat** (Model tab vs Memory tab) — istilah
   beda untuk hal yang sama. Rekomendasi tetap: hapus blok Model tab; maka
   separuh jargon kompresi hilang otomatis.
