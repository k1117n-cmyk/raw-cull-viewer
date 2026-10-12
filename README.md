# RAW Cull Viewer

NX Studioの代わりに、RAWファイルを軽く選別するためのローカルビューアです。

## 使い方

```bash
npm start -- /path/to/raw-folder
```

起動後、表示されたURLをブラウザで開きます。

## 操作

- 左右矢印: 前後の画像へ移動
- `D`: 表示中のファイルを `.viewer-trash` へ移動
- `U`: 直前の削除を取り消し
- `R`: 一覧を再読み込み

## 対応形式

NEF, NRW, ARW, CR2, CR3, RAF, RW2, ORF, PEF, DNG, RAW, SR2, SRW, X3F と、JPEG/PNG/HEIC/TIFFを対象にします。

RAWの表示用プレビューはmacOSの `sips` / `qlmanage`、またはImageMagickの `magick` が使える場合に自動生成されます。生成したプレビューは `.viewer-cache` に保存されます。
