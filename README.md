# The Mind Online — Stage 1

Starter project untuk game kartu kooperatif online yang terinspirasi dari The Mind.

## Kebutuhan
- Node.js 20 atau lebih baru
- npm
- Windows 10/11

## Menjalankan di Windows

1. Ekstrak `the-mind-online-stage1.zip`.
2. Buka folder hasil ekstrak di VS Code.
3. Buka terminal di folder project.
4. Jalankan:

```bash
npm install
npm run dev
```

5. Buka `http://localhost:3000`.

## Tes multiplayer
- Buka alamat tersebut di dua browser berbeda, atau satu browser normal dan satu Incognito.
- Buat room dari browser pertama.
- Salin kode room, lalu gabung dari browser kedua.
- Host dapat menekan tombol Mulai Permainan setelah ada minimal dua pemain.
- Pilih kartu untuk memainkannya. Chat hanya tersedia selama lobby.

Untuk mengetes dari HP yang berada di Wi-Fi yang sama, buka `http://IP-LOKAL-KOMPUTER:3000` dari HP. Pastikan firewall Windows mengizinkan koneksi Node.js pada jaringan privat.

## Build production lokal

```bash
npm run build
npm start
```

## Catatan tahap awal
- Data room disimpan di memori server. Restart server akan menghapus semua room.
- Belum ada akun, penyimpanan leaderboard, reconnect/resume, atau database.
- Sistem level dan nyawa dasar sudah tersedia. Shuriken, aturan level lengkap, dan penyempurnaan validasi akan dikerjakan pada tahap berikutnya.
- Ini memakai custom Node.js + Socket.IO server. Jangan deploy konfigurasi server ini sebagai Next.js serverless biasa di Vercel. Frontend dan realtime server perlu dipisahkan untuk deployment.

## Perintah penting
```bash
npm run dev       # Jalankan Next.js + Socket.IO
npm run build     # Build Next.js
npm start         # Jalankan server production lokal
```
