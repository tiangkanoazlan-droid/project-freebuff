import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { ProjectProvider } from './store/ProjectContext';
import { STORAGE_KEY } from './store/storage';

function renderApp(): void {
  render(
    <ProjectProvider>
      <App />
    </ProjectProvider>,
  );
}

describe('aplikasi Manajemen Proyek', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('menampilkan data contoh pada Gantt Chart', () => {
    renderApp();
    // Nama tugas muncul di tabel dan di bar Gantt, jadi pakai getAllByText.
    expect(screen.getAllByText('Perencanaan Proyek').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Analisis Kebutuhan').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '+ Tugas Baru' })).toBeInTheDocument();
  });

  it('berpindah ke tab Sumber Daya dan menampilkan anggota tim', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Sumber Daya' }));
    expect(screen.getByText('Budi Santoso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Tambah Anggota' })).toBeInTheDocument();
  });

  it('berpindah ke tab Kalender', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Kalender' }));
    expect(screen.getByLabelText('Tanggal hari libur')).toBeInTheDocument();
    // "Akhir pekan" juga muncul di legend, jadi bidik heading section-nya.
    expect(screen.getByRole('heading', { name: 'Akhir pekan' })).toBeInTheDocument();
  });

  it('berpindah ke tab Analisis dan menampilkan jalur kritis', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Analisis' }));
    expect(screen.getByText('Jalur Kritis (Critical Path)')).toBeInTheDocument();
    expect(screen.getByText('Diagram PERT')).toBeInTheDocument();
  });

  it('memuat data dari localStorage bila tersedia', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        projectName: 'Proyek Dari Storage',
        startDate: '2026-01-01',
        tasks: [],
        dependencies: [],
        members: [],
        calendar: { weekendDays: [0, 6], holidays: [] },
      }),
    );
    renderApp();
    expect(screen.getByText(/Proyek Dari Storage/)).toBeInTheDocument();
    expect(screen.getByText('Belum ada tugas.')).toBeInTheDocument();
  });
});
