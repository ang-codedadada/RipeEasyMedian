---
name: Ide Fitur Bot Discord Neva
description: Ide fitur tambahan yang belum diimplementasi untuk bot Discord Neva
---

## 1. Multi-Server Support

- Bot bisa kirim notif YouTube ke beberapa server/channel sekaligus
- Tambah variable: `CHANNEL_ID_2`, `ROLE_VIDEO_ID_2`, `ROLE_LIVE_ID_2` untuk server tambahan
- ID yang sudah ada tetap dipakai, tidak dihapus
- Tambah `TEST_CHANNEL_ID` — channel khusus testing
- `!testnotif` dan `!testlive` hanya muncul di TEST_CHANNEL_ID, tidak ke channel produksi

## 2. AI Chat (Gemini) di Channel Khusus

- Pakai Google Gemini API (gratis: 15 req/menit, 1500 req/hari)
- API Key gratis di: https://aistudio.google.com/app/apikey
- Tambah variable: `GEMINI_API_KEY` dan `AI_CHANNEL_ID`
- Bot reply semua pesan di AI_CHANNEL_ID menggunakan Gemini
- Channel lain tidak terpengaruh
- Bisa ditambah **personality/system prompt** misalnya:
  > "Kamu adalah Neva, asisten Discord yang ramah dan suka bercanda. Jawab dalam bahasa Indonesia santai dan sering pakai emoji."
- Personality bisa dikustomisasi: nama, bahasa, gaya bicara, topik yang boleh/tidak boleh dijawab
