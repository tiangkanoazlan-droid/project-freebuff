export type Priority = 'Low' | 'Medium' | 'High';

export type DependencyType = 'FS' | 'SS';

export interface Task {
  id: string;
  name: string;
  /** Induk tugas (null = tugas utama / top-level). */
  parentId: string | null;
  /** Tanggal mulai dalam format ISO yyyy-mm-dd (akan disnap ke hari kerja terdekat). */
  startDate: string;
  /** Durasi dalam hari kerja (bukan hari kalender). */
  duration: number;
  priority: Priority;
  /** Warna bar pada Gantt Chart. */
  color: string;
  /** ID anggota tim yang dialokasikan ke tugas ini. */
  assigneeIds: string[];
  /** Estimasi PERT: waktu optimis (hari kerja). */
  optimistic: number;
  /** Estimasi PERT: waktu pesimis (hari kerja). */
  pessimistic: number;
}

export interface Dependency {
  id: string;
  predecessorId: string;
  successorId: string;
  /** FS = Finish-to-Start, SS = Start-to-Start. */
  type: DependencyType;
  /** Jeda (lag) dalam hari kerja. */
  lag: number;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Gaji per bulan (rupiah). */
  salary: number;
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface CalendarConfig {
  /** Hari akhir pekan: 0=Minggu ... 6=Sabtu. */
  weekendDays: number[];
  holidays: Holiday[];
}

export interface ProjectState {
  projectName: string;
  /** Tanggal mulai proyek (referensi tampilan). */
  startDate: string;
  tasks: Task[];
  dependencies: Dependency[];
  members: Member[];
  calendar: CalendarConfig;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  Low: '#3b82f6',
  Medium: '#f59e0b',
  High: '#ef4444',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  Low: 'Rendah',
  Medium: 'Sedang',
  High: 'Tinggi',
};
