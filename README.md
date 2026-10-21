# Aplikasi Manajemen Proyek — Gantt Chart

Aplikasi manajemen proyek berbasis **Gantt Chart** yang dibangun dengan **React + TypeScript + Vite**.
Seluruh data disimpan di **localStorage** dan tersedia **data contoh (seed)** agar langsung bisa dicoba.

## Fitur

1. **Task Management**
   - Tambah / edit / hapus tugas (hapus berantai untuk sub-tugas beserta dependensinya).
   - Durasi dalam **hari kerja**, tanggal mulai otomatis digest ke hari kerja terdekat.
   - Prioritas **Low / Medium / High** dengan **warna indikator** (badge prioritas + warna bar yang bisa dikustom).
   - **Sub-tugas (parent-child)** dengan hierarki indentasi, tombol buka/tutup, dan penambahan sub-tugas cepat.

2. **Predecessors & Tampilan Timeline**
   - Hubungan antar tugas **Finish-to-Start (FS)** dan **Start-to-Start (SS)** beserta **jeda hari kerja (lag)**.
   - Visualisasi Gantt Chart: bar tugas, **panah dependensi** berlabel (`FS`, `SS +2`, dll.),
     **drag** bar untuk memindah tanggal mulai, dan **resize** tepi kiri/kanan untuk mengubah durasi.
   - Zoom (perkecil/perbesar), pencarian tugas, jalur kritis dapat di-highlight, penanda hari ini,
     kolom akhir pekan/hari libur tampil di latar.

3. **Resource Management**
   - Pendaftaran anggota tim: nama, email, peran, gaji (per bulan).
   - Alokasi anggota ke tugas lewat form tugas (chip anggota), plus ringkasan beban kerja
     (jumlah tugas, total hari kerja, estimasi biaya) per anggota.

4. **Kalender Proyek**
   - Pengaturan hari **akhir pekan** (bisa pilih hari apa saja, termasuk non-standar).
   - Penambahan/penghapusan **hari libur khusus** (custom holiday).
   - Perhitungan durasi **hanya menghitung hari kerja** (di luar akhir pekan & hari libur),
     termasuk pada penanggalan FS/SS + lag dan pratinjau kalender bulanan.

5. **Analisis Proyek**
   - **Critical Path (CPM)**: forward/backward pass, slack per tugas, daftar rantai kritis,
     tabel ES/EF/LS/LF, dan tombol penandaan jalur kritis di Gantt Chart.
   - **Diagram PERT**: jaringan O/M/P per tugas, `E = (O + 4M + P)/6`, `Var = ((P − O)/6)²`,
     durasi ekspektasi proyek (μ), standar deviasi (σ), dan rentang perkiraan selesai.

## Tech Stack

| Komponen     | Teknologi                                   |
| ------------ | ------------------------------------------- |
| UI           | React 18 + TypeScript                        |
| Build        | Vite 5                                       |
| State        | React Context + `useReducer` (tanpa library) |
| Persistensi  | `localStorage`                               |
| Test         | Vitest + Testing Library (jsdom)             |
| Styling      | CSS murni (responsif)                        |

## Prasyarat

- **Node.js** ≥ 18 dan **npm** ≥ 9.

## Instalasi

```bash
npm install
```

## Menjalankan (development)

```bash
npm run dev
```

Buka <http://localhost:5173>.

## Perintah lain

| Perintah             | Fungsi                                        |
| -------------------- | --------------------------------------------- |
| `npm run typecheck`  | Type-check seluruh proyek (`tsc -b`)          |
| `npm test`           | Menjalankan seluruh unit/integration test     |
| `npm run test:watch` | Test mode watch                               |
| `npm run build`      | Type-check lalu build produksi ke `dist/`     |
| `npm run preview`    | Menjalankan hasil build produksi              |

## Struktur Proyek

```
├── index.html
├── package.json
├── vite.config.ts            # Vite + konfigurasi Vitest (jsdom)
├── tsconfig*.json
└── src/
    ├── main.tsx              # Entry point React
    ├── App.tsx               # Shell: header, tab, routing antar tampilan
    ├── styles.css            # Seluruh gaya (desktop & responsif)
    ├── types.ts              # Model data (Task, Dependency, Member, Calendar, …)
    ├── data/seed.ts          # Data contoh proyek
    ├── store/
    │   ├── projectReducer.ts # Semua mutasi + validasi (guard siklus, dsb.)
    │   ├── storage.ts        # Load/save localStorage
    │   └── ProjectContext.tsx
    ├── utils/
    │   ├── date.ts           # Hari kerja: weekend, holiday, work index
    │   ├── scheduling.ts     # CPM (critical path) + PERT
    │   ├── tree.ts           # Hierarki parent-child & guard siklus
    │   ├── format.ts         # Format rupiah/desimal/initial
    │   └── id.ts
    ├── components/
    │   ├── GanttView.tsx     # Toolbar + orkestrasi tampilan Gantt
    │   ├── GanttChart.tsx    # Grid, bar, drag/resize, panah dependensi
    │   ├── TaskFormModal.tsx # Form tugas + predecessors + alokasi anggota
    │   ├── ResourcesView.tsx # Anggota tim & alokasi
    │   ├── CalendarView.tsx  # Akhir pekan, hari libur, pratinjau
    │   ├── AnalysisView.tsx  # Jalur kritis & diagram PERT
    │   └── Modal.tsx
    └── *.test.ts(x)          # Test Vitest
```

## Catatan Aturan Perhitungan

- **Hari kerja** = hari yang bukan akhir pekan (sesuai pengaturan) dan bukan hari libur khusus.
- Durasi tugas selalu dalam **hari kerja**; tanggal mulai yang jatuh pada hari non-kerja digeser
  ke hari kerja berikutnya.
- **FS**: `ES_succ = EF_pred + 1 + lag` (semua dalam hari kerja).
  **SS**: `ES_succ = ES_pred + lag`.
- Jadwal efektif sebuah tugas = `max(tanggal mulai yang dimasukkan pengguna, batasan predecessor)`,
  sehingga menyeret bar ke kanan selalu berlaku, sementara menyeret ke kiri sebelum batas
  predecessor akan otomatis kembali ke batas tersebut.
- **Slack = LS − ES**; slack 0 = **jalur kritis**.
- **PERT**: `E = (O + 4M + P)/6`, `Var = ((P − O)/6)²`, dengan `O ≤ M ≤ P` (di-clamp otomatis).
- Estimasi biaya tenaga kerja memakai asumsi **22 hari kerja per bulan**:
  `biaya = (gaji bulanan ÷ 22) × total hari kerja tugas yang dialokasikan`.

## Penyimpanan Data

- Data otomatis tersimpan di `localStorage` dengan kunci:
  `manajemen-proyek-gantt:v1`
- Tombol **“Reset Data Contoh”** di header mengembalikan seluruh data ke seed awal.
- Jika data di localStorage korup/tidak valid, aplikasi otomatis memuat ulang seed.

## Lisensi

Projek contoh untuk keperluan pembelajaran/manajemen proyek.


<img width="1919" height="1149" alt="image" src="https://github.com/user-attachments/assets/c2fac239-7113-4c6d-a758-070d5058c1dd" />

