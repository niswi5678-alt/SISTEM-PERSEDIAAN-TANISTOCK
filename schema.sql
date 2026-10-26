-- =====================================================================
-- SISTEM AKUNTANSI TOKO PERTANIAN (Supabase / PostgreSQL)
-- Jalankan seluruh isi file ini di Supabase > SQL Editor > New query
--
-- ERD (4 entitas):
--   kontak 1 ──< transaksi 1 ──< detail_transaksi >── 1 produk
-- =====================================================================

-- RESET: menghapus objek lama agar script ini bisa dijalankan ulang.
-- PERHATIAN: seluruh data di tabel-tabel ini ikut terhapus.
drop view if exists v_stok_menipis, v_laporan_harian, v_saldo_kas;
drop function if exists buat_transaksi(date, text, bigint, text, numeric, jsonb);
drop table if exists detail_transaksi, transaksi, produk, kontak cascade;
drop function if exists trg_detail_transaksi();

create table kontak (
  id bigint generated always as identity primary key,
  nama text not null,
  tipe text not null check (tipe in ('pelanggan','pemasok')),
  telepon text,
  alamat text,
  dibuat_pada timestamptz default now()
);

create table produk (
  id bigint generated always as identity primary key,
  kode text unique not null,
  nama text not null,
  kategori text,
  satuan text not null default 'pcs',
  harga_beli numeric(14,2) not null default 0,
  harga_jual numeric(14,2) not null default 0,
  stok numeric(12,2) not null default 0,
  stok_minimum numeric(12,2) not null default 5
);

create table transaksi (
  id bigint generated always as identity primary key,
  tanggal date not null default current_date,
  jenis text not null check (jenis in ('penjualan','pembelian','biaya','modal')),
  arah_kas text generated always as
    (case when jenis in ('penjualan','modal') then 'masuk' else 'keluar' end) stored,
  kontak_id bigint references kontak(id) on delete set null,
  keterangan text,
  total numeric(14,2) not null default 0,
  dibuat_pada timestamptz default now()
);

create table detail_transaksi (
  id bigint generated always as identity primary key,
  transaksi_id bigint not null references transaksi(id) on delete cascade,
  produk_id bigint not null references produk(id),
  qty numeric(12,2) not null check (qty > 0),
  harga numeric(14,2) not null check (harga >= 0),
  subtotal numeric(14,2) generated always as (qty * harga) stored
);

create index on transaksi (tanggal);
create index on detail_transaksi (transaksi_id);

-- Trigger: stok bergerak otomatis & total transaksi dihitung dari detail
create or replace function trg_detail_transaksi() returns trigger
language plpgsql as $$
declare v_jenis text; v_stok numeric;
begin
  select jenis into v_jenis from transaksi where id = new.transaksi_id;
  if v_jenis = 'penjualan' then
    select stok into v_stok from produk where id = new.produk_id for update;
    if v_stok < new.qty then
      raise exception 'Stok tidak cukup (tersedia %, diminta %)', v_stok, new.qty;
    end if;
    update produk set stok = stok - new.qty where id = new.produk_id;
  elsif v_jenis = 'pembelian' then
    update produk set stok = stok + new.qty, harga_beli = new.harga where id = new.produk_id;
  end if;
  update transaksi set total = (select sum(subtotal) from detail_transaksi
                                where transaksi_id = new.transaksi_id)
   where id = new.transaksi_id;
  return new;
end $$;

create trigger detail_transaksi_aiu after insert on detail_transaksi
for each row execute function trg_detail_transaksi();

-- Fungsi atomik: simpan transaksi + item dalam satu langkah
create or replace function buat_transaksi(
  p_tanggal date, p_jenis text, p_kontak bigint,
  p_ket text, p_total numeric, p_items jsonb
) returns bigint language plpgsql as $$
declare v_id bigint; it jsonb;
begin
  insert into transaksi (tanggal, jenis, kontak_id, keterangan, total)
  values (p_tanggal, p_jenis, p_kontak, p_ket, coalesce(p_total,0))
  returning id into v_id;
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into detail_transaksi (transaksi_id, produk_id, qty, harga)
    values (v_id, (it->>'produk_id')::bigint, (it->>'qty')::numeric, (it->>'harga')::numeric);
  end loop;
  return v_id;
end $$;

-- View laporan
create view v_saldo_kas as
select coalesce(sum(total) filter (where arah_kas='masuk'),0)  as kas_masuk,
       coalesce(sum(total) filter (where arah_kas='keluar'),0) as kas_keluar,
       coalesce(sum(total) filter (where arah_kas='masuk'),0)
     - coalesce(sum(total) filter (where arah_kas='keluar'),0) as saldo
from transaksi;

create view v_laporan_harian as
select tanggal,
  count(*) as jumlah_transaksi,
  coalesce(sum(total) filter (where jenis='penjualan'),0) as penjualan,
  coalesce(sum(total) filter (where jenis='pembelian'),0) as pembelian,
  coalesce(sum(total) filter (where jenis='biaya'),0)     as biaya,
  coalesce(sum(total) filter (where jenis='modal'),0)     as modal,
  coalesce(sum(total) filter (where arah_kas='masuk'),0)
- coalesce(sum(total) filter (where arah_kas='keluar'),0) as arus_kas_bersih
from transaksi group by tanggal order by tanggal desc;

create view v_stok_menipis as
select id, kode, nama, satuan, stok, stok_minimum
from produk where stok <= stok_minimum order by (stok / nullif(stok_minimum,0));

-- Akses (PROTOTIPE: anon boleh semua. Ganti dengan Supabase Auth untuk produksi!)
alter table kontak enable row level security;
alter table produk enable row level security;
alter table transaksi enable row level security;
alter table detail_transaksi enable row level security;
create policy "akses_anon" on kontak for all to anon using (true) with check (true);
create policy "akses_anon" on produk for all to anon using (true) with check (true);
create policy "akses_anon" on transaksi for all to anon using (true) with check (true);
create policy "akses_anon" on detail_transaksi for all to anon using (true) with check (true);
grant select on v_saldo_kas, v_laporan_harian, v_stok_menipis to anon;

-- Data contoh
insert into kontak (nama,tipe,telepon) values
 ('Pak Slamet','pelanggan','0812-0000-1111'),
 ('CV Subur Makmur','pemasok','024-555-0101');
insert into produk (kode,nama,kategori,satuan,harga_beli,harga_jual,stok,stok_minimum) values
 ('PUP-001','Pupuk Urea 50kg','Pupuk','sak',270000,300000,40,10),
 ('BNH-001','Benih Padi Inpari 5kg','Benih','pak',55000,68000,8,10),
 ('PES-001','Pestisida Antracol 250g','Pestisida','botol',42000,52000,3,6),
 ('ALT-001','Cangkul Baja','Alat','buah',65000,85000,15,4);
select buat_transaksi(current_date,'modal',null,'Modal awal',20000000,null);
