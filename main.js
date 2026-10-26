import * as api from '../../backend/app.js';

const $ = (s) => document.querySelector(s);
const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tgl = (d) => new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const JUDUL = { dashboard: 'Ringkasan', transaksi: 'Transaksi', produk: 'Produk & stok', kontak: 'Pelanggan & pemasok' };

let view = 'dashboard', produk = [], kontak = [];

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3200);
}
const aman = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

/* ---------- Ringkasan ---------- */
async function dashboard() {
  const [kas, harian, menipis] = await Promise.all([api.saldoKas(), api.laporanHarian(14), api.stokMenipis()]);
  const hi = harian.find((h) => h.tanggal === api.hariIni());
  $('#isi').innerHTML = `
    <section class="kas">
      <div><div class="label">Saldo kas saat ini</div><div class="angka">${rp(kas.saldo)}</div></div>
      <div><div class="label">Total kas masuk</div><div class="sub masuk">${rp(kas.kas_masuk)}</div></div>
      <div><div class="label">Total kas keluar</div><div class="sub keluar">${rp(kas.kas_keluar)}</div></div>
    </section>
    <div class="dua">
      <section class="panel">
        <h2>Laporan harian</h2>
        <p style="color:var(--abu);margin-bottom:10px">Hari ini: penjualan <b>${rp(hi?.penjualan)}</b>, arus kas bersih <b>${rp(hi?.arus_kas_bersih)}</b></p>
        <div class="tbl"><table>
          <tr><th>Tanggal</th><th class="n">Penjualan</th><th class="n">Pembelian</th><th class="n">Biaya</th><th class="n">Kas bersih</th></tr>
          ${harian.map((h) => `<tr><td>${tgl(h.tanggal)}</td><td class="n">${rp(h.penjualan)}</td><td class="n">${rp(h.pembelian)}</td>
            <td class="n">${rp(h.biaya)}</td><td class="n ${h.arus_kas_bersih >= 0 ? 'plus' : 'minus'}">${rp(h.arus_kas_bersih)}</td></tr>`).join('')
            || '<tr><td colspan="5" class="kosong">Belum ada transaksi. Klik “Catat transaksi”.</td></tr>'}
        </table></div>
      </section>
      <section class="panel">
        <h2>Stok hampir habis</h2>
        ${menipis.length ? menipis.map((p) => {
          const pct = Math.min(100, (p.stok / (p.stok_minimum || 1)) * 100);
          return `<div class="stok"><b>${esc(p.nama)}</b>
            <span>Sisa ${p.stok} ${esc(p.satuan)} · batas minimum ${p.stok_minimum}</span>
            <div class="bar"><i class="${p.stok <= 0 ? 'habis' : ''}" style="width:${Math.max(pct, 4)}%"></i></div></div>`;
        }).join('') : '<p class="aman">Semua stok di atas batas minimum.</p>'}
      </section>
    </div>`;
}

/* ---------- Transaksi ---------- */
async function transaksi() {
  const rows = await api.listTransaksi();
  $('#isi').innerHTML = `<section class="panel tbl"><table>
    <tr><th>Tanggal</th><th>Jenis</th><th>Pihak</th><th>Keterangan</th><th class="n">Total</th><th></th></tr>
    ${rows.map((t) => `<tr><td>${tgl(t.tanggal)}</td><td><span class="tag ${t.jenis}">${t.jenis}</span></td>
      <td>${esc(t.kontak?.nama || '-')}</td><td>${esc(t.keterangan || '-')}</td>
      <td class="n ${t.arah_kas === 'masuk' ? 'plus' : 'minus'}">${t.arah_kas === 'masuk' ? '+' : '−'} ${rp(t.total)}</td>
      <td><button class="btn bahaya sm" data-del="${t.id}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="6" class="kosong">Belum ada transaksi.</td></tr>'}
  </table></section>`;
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = aman(async () => {
    if (!confirm('Hapus transaksi ini? Stok tidak dikembalikan otomatis.')) return;
    await api.hapusTransaksi(b.dataset.del); toast('Transaksi dihapus'); render();
  })));
}

function formTransaksi() {
  const opt = (arr, f) => arr.map(f).join('');
  const frm = $('#frm');
  frm.innerHTML = `<h2>Catat transaksi</h2>
    <div class="f g2">
      <label>Jenis<select name="jenis"><option value="penjualan">Penjualan</option><option value="pembelian">Pembelian stok</option>
        <option value="biaya">Biaya operasional</option><option value="modal">Tambah modal</option></select></label>
      <label>Tanggal<input type="date" name="tanggal" value="${api.hariIni()}" required></label>
    </div>
    <div class="f"><label id="lKontak">Pelanggan / pemasok<select name="kontak_id"><option value="">— tanpa nama —</option>
      ${opt(kontak, (k) => `<option value="${k.id}">${esc(k.nama)} (${k.tipe})</option>`)}</select></label>
      <label>Keterangan<input name="keterangan" placeholder="mis. Bayar listrik, Penjualan tunai"></label></div>
    <div id="boxItem" class="f"><div id="items"></div>
      <button type="button" class="btn alt sm" id="addItem" style="justify-self:start">+ Tambah barang</button></div>
    <label id="boxTotal" class="f" hidden>Jumlah (Rp)<input type="number" name="total" min="0" step="any"></label>
    <div class="ttl" id="ttl">Total: Rp 0</div>
    <div class="aksi"><button type="button" class="btn alt" id="batal">Batal</button><button class="btn">Simpan transaksi</button></div>`;

  const jenis = frm.elements.jenis;
  const hitung = () => {
    let t = 0; frm.querySelectorAll('.baris').forEach((r) => (t += r.querySelector('[name=qty]').value * r.querySelector('[name=harga]').value));
    $('#ttl').textContent = 'Total: ' + rp(['penjualan', 'pembelian'].includes(jenis.value) ? t : frm.elements.total.value);
  };
  const tambah = () => {
    const d = document.createElement('div'); d.className = 'baris';
    d.innerHTML = `<select name="produk_id" required><option value="">Pilih produk</option>${opt(produk, (p) => `<option value="${p.id}">${esc(p.nama)} (stok ${p.stok})</option>`)}</select>
      <input type="number" name="qty" min="0.01" step="any" value="1" aria-label="Jumlah"><input type="number" name="harga" min="0" step="any" aria-label="Harga satuan">
      <button type="button" class="btn bahaya sm" aria-label="Hapus baris">×</button>`;
    d.querySelector('select').onchange = (e) => {
      const p = produk.find((x) => x.id == e.target.value);
      if (p) d.querySelector('[name=harga]').value = jenis.value === 'pembelian' ? p.harga_beli : p.harga_jual; hitung();
    };
    d.querySelector('button').onclick = () => { d.remove(); hitung(); };
    d.oninput = hitung; $('#items').append(d);
  };
  const atur = () => {
    const barang = ['penjualan', 'pembelian'].includes(jenis.value);
    $('#boxItem').hidden = !barang; $('#boxTotal').hidden = barang; $('#lKontak').hidden = !barang;
    frm.elements.total.required = !barang;
    if (barang && !$('#items').children.length) tambah(); hitung();
  };
  jenis.onchange = atur; frm.elements.total.oninput = hitung; $('#addItem').onclick = tambah;
  $('#batal').onclick = () => $('#dlg').close();
  frm.onsubmit = aman(async (e) => {
    const f = frm.elements, barang = ['penjualan', 'pembelian'].includes(f.jenis.value);
    const items = barang ? [...frm.querySelectorAll('.baris')].map((r) => ({
      produk_id: r.querySelector('[name=produk_id]').value, qty: r.querySelector('[name=qty]').value, harga: r.querySelector('[name=harga]').value })) : [];
    await api.buatTransaksi({ tanggal: f.tanggal.value, jenis: f.jenis.value, kontak_id: f.kontak_id.value,
      keterangan: f.keterangan.value, total: f.total.value, items });
    toast('Transaksi disimpan'); await muatMaster(); render();
  });
  atur(); $('#dlg').showModal();
}

/* ---------- Produk ---------- */
async function produkView() {
  await muatMaster();
  $('#isi').innerHTML = `<div class="alat" style="margin-bottom:12px"><button class="btn alt" id="tambahP">+ Produk baru</button></div>
    <section class="panel tbl"><table><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th class="n">Harga beli</th><th class="n">Harga jual</th><th class="n">Stok</th><th></th></tr>
    ${produk.map((p) => `<tr><td>${esc(p.kode)}</td><td>${esc(p.nama)}</td><td>${esc(p.kategori || '-')}</td>
      <td class="n">${rp(p.harga_beli)}</td><td class="n">${rp(p.harga_jual)}</td>
      <td class="n ${p.stok <= p.stok_minimum ? 'minus' : ''}">${p.stok} ${esc(p.satuan)}</td>
      <td class="alat"><button class="btn alt sm" data-e="${p.id}">Ubah</button><button class="btn bahaya sm" data-d="${p.id}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="7" class="kosong">Belum ada produk.</td></tr>'}</table></section>`;
  $('#tambahP').onclick = () => formProduk();
  document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => formProduk(produk.find((p) => p.id == b.dataset.e))));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = aman(async () => {
    if (confirm('Hapus produk ini?')) { await api.hapusProduk(b.dataset.d); toast('Produk dihapus'); render(); }
  })));
}
function formProduk(p = {}) {
  const v = (k, d = '') => esc(p[k] ?? d);
  $('#frm').innerHTML = `<h2>${p.id ? 'Ubah' : 'Produk'} produk</h2><div class="f g2">
    <label>Kode<input name="kode" value="${v('kode')}" required></label><label>Nama<input name="nama" value="${v('nama')}" required></label>
    <label>Kategori<input name="kategori" value="${v('kategori')}" placeholder="Pupuk, Benih, Alat"></label><label>Satuan<input name="satuan" value="${v('satuan', 'pcs')}" required></label>
    <label>Harga beli<input type="number" name="harga_beli" min="0" value="${v('harga_beli', 0)}"></label><label>Harga jual<input type="number" name="harga_jual" min="0" value="${v('harga_jual', 0)}"></label>
    <label>Stok<input type="number" name="stok" step="any" value="${v('stok', 0)}"></label><label>Stok minimum<input type="number" name="stok_minimum" step="any" value="${v('stok_minimum', 5)}"></label></div>
    <div class="aksi"><button type="button" class="btn alt" id="batal">Batal</button><button class="btn">Simpan produk</button></div>`;
  $('#batal').onclick = () => $('#dlg').close();
  $('#frm').onsubmit = aman(async () => {
    const d = Object.fromEntries(new FormData($('#frm'))); if (p.id) d.id = p.id;
    await api.simpanProduk(d); toast('Produk disimpan'); render();
  });
  $('#dlg').showModal();
}

/* ---------- Kontak ---------- */
async function kontakView() {
  await muatMaster();
  $('#isi').innerHTML = `<div class="alat" style="margin-bottom:12px"><button class="btn alt" id="tambahK">+ Kontak baru</button></div>
    <section class="panel tbl"><table><tr><th>Nama</th><th>Tipe</th><th>Telepon</th><th>Alamat</th><th></th></tr>
    ${kontak.map((k) => `<tr><td>${esc(k.nama)}</td><td><span class="tag">${k.tipe}</span></td><td>${esc(k.telepon || '-')}</td><td>${esc(k.alamat || '-')}</td>
      <td class="alat"><button class="btn alt sm" data-e="${k.id}">Ubah</button><button class="btn bahaya sm" data-d="${k.id}">Hapus</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="kosong">Belum ada kontak.</td></tr>'}</table></section>`;
  $('#tambahK').onclick = () => formKontak();
  document.querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => formKontak(kontak.find((k) => k.id == b.dataset.e))));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = aman(async () => {
    if (confirm('Hapus kontak ini?')) { await api.hapusKontak(b.dataset.d); toast('Kontak dihapus'); render(); }
  })));
}
function formKontak(k = {}) {
  const v = (x) => esc(k[x] ?? '');
  $('#frm').innerHTML = `<h2>${k.id ? 'Ubah' : 'Tambah'} kontak</h2><div class="f">
    <label>Nama<input name="nama" value="${v('nama')}" required></label>
    <label>Tipe<select name="tipe"><option value="pelanggan" ${k.tipe === 'pelanggan' ? 'selected' : ''}>Pelanggan</option><option value="pemasok" ${k.tipe === 'pemasok' ? 'selected' : ''}>Pemasok</option></select></label>
    <label>Telepon<input name="telepon" value="${v('telepon')}"></label><label>Alamat<input name="alamat" value="${v('alamat')}"></label></div>
    <div class="aksi"><button type="button" class="btn alt" id="batal">Batal</button><button class="btn">Simpan kontak</button></div>`;
  $('#batal').onclick = () => $('#dlg').close();
  $('#frm').onsubmit = aman(async () => {
    const d = Object.fromEntries(new FormData($('#frm'))); if (k.id) d.id = k.id;
    await api.simpanKontak(d); toast('Kontak disimpan'); render();
  });
  $('#dlg').showModal();
}

/* ---------- Navigasi ---------- */
const muatMaster = async () => { [produk, kontak] = await Promise.all([api.listProduk(), api.listKontak()]); };
const render = aman(async () => {
  $('#dlg').open && $('#dlg').close();
  $('#judul').textContent = JUDUL[view];
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  await { dashboard, transaksi, produk: produkView, kontak: kontakView }[view]();
});
document.querySelectorAll('#nav button').forEach((b) => (b.onclick = () => { view = b.dataset.view; render(); }));
$('#btnBaru').onclick = aman(async () => { await muatMaster(); formTransaksi(); });
render();
