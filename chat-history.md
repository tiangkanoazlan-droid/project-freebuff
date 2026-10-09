# Riwayat Sesi — Aplikasi Manajemen Proyek (Gantt Chart)

**Tanggal:** 10 Oktober 2026
**Proyek:** `aplikasi-manajemen-proyek-gantt` (React 18 + TypeScript + Vite 5)
**Repo:** https://github.com/tiangkanoazlan-droid/project-freebuff

---

## 1. Melanjutkan pekerjaan: 2 test gagal

Permintaan awal: `lanjutkan`. Kondisi awal `node_modules` belum terpasang, typecheck lolos tapi **2 dari 36 test gagal**.

### Bug A — `src/utils/date.ts` (`countWorkingDays`)

Guard rentang terbalik:

```ts
// sebelum — menghitung from − to, sehingga rentang maju selalu dianggap negatif
if (diffDays(to, from) < 0) return 0;
// sesudah
if (diffDays(from, to) < 0) return 0;
```

Dampak nyata di aplikasi, bukan cuma skor test:

- `TaskFormModal.tsx:92` → preview durasi tugas selalu `0`
- `GanttChart.tsx:200,205` → hasil resize bar selalu `1` (tertutup `Math.max(1, …)`)

### Bug B — `src/App.test.tsx:39` (query ambigu)

`getByText('Akhir pekan')` kena 2 elemen sah: heading section **dan** legend pratinjau. Diganti ke query yang **lebih ketat**, bukan dilemahkan:

```ts
screen.getByRole('heading', { name: 'Akhir pekan' })
```

**Hasil:** 36/36 test pass, typecheck 0, build 0.

---

## 2. Menjalankan aplikasi

| Perintah | Exit | Hasil |
| --- | --- | --- |
| `npm install` | 0 | 176 paket |
| `npm run typecheck` | 0 | pass |
| `npm test` | 0 | 36/36 |
| `npm run build` | 0 | `dist/` OK |
| `npm run dev` | — | **http://localhost:5173/** (HTTP 200) |

---

## 3. Laporan bug: fitur Gantt Chart "tidak ada yang terjadi"

### Bug C — `src/utils/tree.ts` (`buildTaskRows`) ✅ bug nyata

Loop **fallback** di akhir fungsi (seharusnya hanya untuk tugas terjebak siklus parent-child) memakai guard `if (visited.has(task.id))`. Tapi anak dari induk yang *collapsed* juga tidak pernah `visited`, jadi disembunyikan oleh `walk` lalu **langsung ditambahkan balik di `depth: 0`**.

Akibatnya sub-tugas tidak pernah bisa ditutup — klik "Tutup Semua"/twisty tampak tidak berpengaruh (17 → 17 baris), dan sub-tugas malah **loncat ke bawah** daftar.

Perbaikan: hitung dulu set `reachable` (abaikan status collapse), lalu batasi fallback hanya untuk task yang benar-benar tak terjangkau.

```
sebelum: Perencanaan Proyek | Analisis Kebutuhan | … | Desain Antarmuka | …
sesudah: Perencanaan Proyek | Desain Antarmuka | Pengembangan | Pengujian | Peluncuran
```

### Bukan bug: drag & resize

Probe sempat melaporkan drag/resize gagal. Setelah diperiksa itu **artefak jsdom** — `PointerEvent`, `setPointerCapture`, `button`, `clientX`, `pointerId` semuanya `undefined`, sehingga guard `if (event.button !== 0) return` di `startDrag` melakukan *early return*.

Kode **tidak diubah** demi memuaskan test. Sebagai gantinya diverifikasi di **Chrome asli** via CDP:

```
PASS  Tutup Semua menyembunyikan sub-tugas   — 17 -> 5 baris
PASS  Urutan baris tetap top-level
PASS  Buka Semua mengembalikan semua baris   — 17 baris
PASS  Drag bar memindahkan tanggal mulai     — 12 Okt -> 20 Okt | left 336px -> 528px
PASS  Resize tepi kanan mengubah durasi      — 4 hr -> 8 hr
PASS  Klik ganda bar membuka modal edit      — Edit Tugas: Desain Antarmuka
=== 7/7 PASS ===
```

**Test baru:** `src/utils/tree.test.ts` (9 regression test) — collapse parsial/penuh, tugas yatim, siklus parent-child, dan kasus pemicu bug.

**Hasil akhir:** 45/45 test, typecheck 0, build 0.

---

## 4. Pemeriksaan kebersihan proyek

- **`.gitignore`** — sudah mengecualikan `node_modules` (baris 2) dan `dist` (baris 5).
- **`README.md`** — lengkap: Fitur, Instalasi (`npm install`), Menjalankan (`npm run dev`), Prasyarat, Perintah lain, Struktur Proyek, Aturan Perhitungan.
- **Rahasia/token** — tidak ada `.env`/`.npmrc`/`.netrc`. Secret scan atas seluruh source (kecuali `node_modules`, `dist`, lockfile) bersih. Kecocokan awal di `package-lock.json` dan bundle minified semuanya false positive (`css-tokenizer`, `js-tokens`).

---

## 5. Git: init, commit, push

```
git init -b main
git add -A
git commit -m "Initial commit: Gantt Chart project management app"
git remote add origin https://github.com/tiangkanoazlan-droid/project-freebuff.git
git push -u origin main
```

| Item | Nilai |
| --- | --- |
| Branch | `main` |
| Commit | `ca68b726d2f093082ca6df7b437c751e97700c38` |
| Isi | 35 file, 9141 baris |
| `node_modules`/`dist` | ter-ignore (`git check-ignore` exit 0) |
| Status akhir | `## main...origin/main` — sinkron, hash identik |

---

## Ringkasan perubahan kode

| File | Perubahan |
| --- | --- |
| `src/utils/date.ts` | Perbaiki guard `countWorkingDays` (argumen `diffDays` terbalik) |
| `src/utils/tree.ts` | Perbaiki `buildTaskRows`: fallback tidak lagi mengembalikan anak yang di-collapse |
| `src/utils/tree.test.ts` | Baru — 9 regression test |
| `src/App.test.tsx` | Query `getByText` → `getByRole('heading', …)` |

## Catatan tersisa

- Secret scan berbasis pola (statis), bukan detektor seperti gitleaks.
- Peringatan `LF will be replaced by CRLF` muncul saat commit — perilaku `core.autocrlf` Windows, bukan error. Belum ditambahkan `.gitattributes`.
- Dev server mungkin masih berjalan di http://localhost:5173/.
