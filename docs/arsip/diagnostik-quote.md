---
title: "Diagnostik quote bar — babak 2"
type: reference
status: archived
date: 2026-08-07
tags: [openagent, ui, archived]
---

# Diagnostik quote bar — babak 2

Hasil babak 1 (JSON yang kamu kirim) sudah membuktikan:

> **Bar-nya SUDAH dirender ke DOM** (`barTerender: true`), seleksi sah,
> posisi wajar di tengah layar. Jadi bukan bar yang "tak dibuat" —
> melainkan **dibuat tapi tak tampak**. Kasusnya berganti dari logika
> seleksi menjadi visibilitas: koordinat tersesat, ketumpuk elemen lain,
> atau kepotong batas leluhur.

Dua probe di bawah ini murni pengukuran di jendelamu — tak ada perubahan
apapun pada plugin. Langkahnya sama seperti kemarin:

1. Pilih (blok) teks di dalam gelembung pesan di chat utama.
2. Buka DevTools: `Ctrl+Shift+I` → tab **Console**.
3. Paste probe → Enter → salin hasilnya → kirim balik ke sini.

---

## Probe A — ukur bar-nya (wajib)

Paste ini ke Console **saat seleksi masih ada** (tak perlu ditahan):

```js
(()=>{const el=document.querySelector(".oa-selbar");if(!el)return"BAR-KOSONG: pilih teks dulu";const r=el.getBoundingClientRect();const cs=getComputedStyle(el);const cx=Math.round(r.left+r.width/2);const cy=Math.round(r.top+r.height/2);const hit=document.elementFromPoint(cx,cy);const jumlah=document.querySelectorAll(".oa-selbar").length;const hc=hit?hit.tagName+"."+(typeof hit.className==="string"?hit.className:""):"null(di luar layar)";const chain=[];let n=el.parentElement;while(n&&n.tagName!=="HTML"){const c=getComputedStyle(n);const f=[];if(c.transform!=="none")f.push("transform");if(c.filter!=="none")f.push("filter");if(c.backdropFilter&&c.backdropFilter!=="none")f.push("backdrop");if(c.contain!=="none")f.push("contain:"+c.contain);if(c.contentVisibility&&c.contentVisibility!=="visible")f.push("cv");if(c.overflow!=="visible")f.push("ovf:"+c.overflow);if(parseFloat(c.opacity)<0.99)f.push("op:"+c.opacity);if(c.visibility!=="visible")f.push("vis:"+c.visibility);if(c.display==="none")f.push("displaynone");if(f.length)chain.push((n.tagName==="BODY"?"body":n.tagName+"."+String(n.className).split(" ")[0])+"["+f.join("|")+"]");n=n.parentElement}return JSON.stringify({jumlahBar:jumlah,bar:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},pusat:[cx,cy],yangNumpuk:hc,op:cs.opacity,vis:cs.visibility,z:cs.zIndex,pos:cs.position,offPar:el.offsetParent?el.offsetParent.tagName+"."+String(el.offsetParent.className).split(" ")[0]:"null",rantai:chain})})()
```

Kirim balik JSON-nya apa adanya.

## Probe B — paksa muncul kotak merah

Masih di sesi yang sama (kalau seleksinya sudah hilang, pilih ulang dulu),
paste ini:

```js
(()=>{const el=document.querySelector(".oa-selbar");if(!el)return"BAR-KOSONG: pilih teks dulu";const p=(k,v)=>el.style.setProperty(k,v,"important");p("position","fixed");p("left","100px");p("top","100px");p("transform","none");p("opacity","1");p("visibility","visible");p("display","flex");p("z-index","99999");p("outline","3px solid red");p("pointer-events","auto");return"kotak merah seharusnya tampak di kiri atas"})()
```

Lalu jawab satu kalimat:

> **Kotak berbingkai merah di pojok kiri atas layar: kelihatan / tidak?**

(Tenang — ini hanya gaya sementara di jendela itu. `Ctrl+R` di Obsidian
mengembalikan semuanya seperti semula.)

## Bonus (kalau sempat, sangat membantu)

1. **Installer version** Obsidian: Settings → About.
2. **Tema aktif**: Settings → Appearance → Themes (nama temanya saja).
3. **CSS snippets** yang aktif: Settings → Appearance → CSS snippets
   (sebutkan nama-nama yang nyala).

---

## Cara kubaca hasilnya (opsional dibaca — biar kamu tahu arahnya)

| Hasil | Artinya | Arah perbaikan |
|---|---|---|
| `offPar` bukan `"null"` | Konfirmasi kuat: bar `fixed` terjebak sistem koordinat leluhur (transform/filter) | Pindahkan bar ke root `body` (portal) — lepas dari jebakan |
| `yangNumpuk` bukan `.oa-selbar` | Ada elemen lain menutupi bar di titik itu | Naikkan lapis / portal |
| `rantai` berisi `[transform]` / `[filter]` / `[contain:...]` | Tersangka penjebak ketemu, namanya tercetak | Portal ke `body`, tiru kondisi itu di pengadilan lalu buktikan merah→hijau |
| Probe B: kotak merah **tampak** | Styling & koordinat bar sebenarnya sehat; masalahnya posisi/lapis | Perbaikan kecil di CSS/struktur |
| Probe B: kotak merah **tak tampak** | Compositor memotong di level leluhur | Portal ke `body` hampir pasti menyembuhkan |

Begitu hasilmu masuk, aku reproduksi kondisi persisnya di pengadilan
(harness) sampai merah dulu, baru perbaikan + rilis 0.1.102.

---

# PECAH — v0.1.102 ✔

JSON babak 2-mu menunjuk langsung tersangkanya: `offsetParent:
DIV.workspace-leaf` + `rantai: workspace-leaf[contain:strict]` = pane
mencuri sistem koordinat elemen `fixed`; bar dicat di (+241,… ) dan di
mesinmu jatuh di luar layar (`l:1345` vs viewport <1378). Perbaikan
rilis: bar kini di-portal ke `document.body` (ruang viewport itu
sendiri), selector CSS di-re-root, dan pengadilan kini memakai chrome
palsu `contain:strict` agar gejala ini tereproduksi permanen (lane
witness red→green: dx=241 → 0).

**Catatan:** bekas kotak merah Probe B hilang dengan `Ctrl+R`;
setelah pasang 0.1.102 cukup blok teks — bar harus nongol di atas
seleksi seperti semula. Kalau masih aneh, kabari.
