// Lapisan data (back-end) — semua komunikasi ke Supabase ada di sini.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

// Isi dari Supabase > Project Settings > API
const SUPABASE_URL = 'https://rsahncvirdmckgdmwhav.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vSOBwyB1wKXmxdbtI2qveA_tJRbzbCX';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const cek = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

export const hariIni = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

// ---- Laporan ----
export const saldoKas = async () => cek(await db.from('v_saldo_kas').select('*').single());
export const laporanHarian = async (n = 14) =>
  cek(await db.from('v_laporan_harian').select('*').limit(n));
export const stokMenipis = async () => cek(await db.from('v_stok_menipis').select('*'));

// ---- Produk ----
export const listProduk = async () => cek(await db.from('produk').select('*').order('nama'));
export const simpanProduk = async (p) =>
  cek(p.id ? await db.from('produk').update(p).eq('id', p.id)
           : await db.from('produk').insert(p));
export const hapusProduk = async (id) => cek(await db.from('produk').delete().eq('id', id));

// ---- Kontak ----
export const listKontak = async () => cek(await db.from('kontak').select('*').order('nama'));
export const simpanKontak = async (k) =>
  cek(k.id ? await db.from('kontak').update(k).eq('id', k.id)
           : await db.from('kontak').insert(k));
export const hapusKontak = async (id) => cek(await db.from('kontak').delete().eq('id', id));

// ---- Transaksi ----
export const listTransaksi = async (n = 50) =>
  cek(await db.from('transaksi').select('*, kontak(nama)')
    .order('tanggal', { ascending: false }).order('id', { ascending: false }).limit(n));

export const buatTransaksi = async ({ tanggal, jenis, kontak_id, keterangan, total, items }) =>
  cek(await db.rpc('buat_transaksi', {
    p_tanggal: tanggal, p_jenis: jenis, p_kontak: kontak_id || null,
    p_ket: keterangan || null, p_total: total || 0, p_items: items || [],
  }));

export const hapusTransaksi = async (id) => cek(await db.from('transaksi').delete().eq('id', id));
