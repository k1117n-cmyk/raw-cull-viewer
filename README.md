# RAW Cull Viewer

NX Studioの代わりに、RAWファイルを軽く選別するためのローカルビューアです。

Nikon NEFなどのRAWから表示用JPEGを生成し、ブラウザ上でキーボード中心に画像を確認できます。

## Features

- RAWファイルのプレビュー表示
- 下層フォルダの選択
- キーボードで画像移動
- `D`キーでmacOSのゴミ箱へ移動
- `U`キーで直前の削除を取り消し
- RAWの縦横向き補正
- 表示用JPEGキャッシュの自動生成

## Requirements

- macOS
- Node.js
- ImageMagick: `magick`
- ExifTool: `exiftool`

Homebrewを使う場合:

```bash
brew install imagemagick exiftool
```

## Usage

任意のRAWフォルダを指定して起動します。

```bash
npm start -- "/path/to/raw-folder"
```

例:

```bash
npm start -- "/Volumes/SHARE1TB/D4"
```

起動後、表示されたURLをブラウザで開きます。

```text
http://127.0.0.1:5173
```

このリポジトリにはD4用の起動スクリプトも含まれています。

```bash
./start-d4.sh
```

別フォルダ用に作る場合はコピーしてパスを書き換えます。

```bash
cp start-d4.sh start-d7000.sh
```

## Keyboard

- `j`: 次の画像
- `k`: 前の画像
- `→`: 次の画像
- `←`: 前の画像
- `]`: 次のフォルダ
- `[`: 前のフォルダ
- `D`: 表示中のファイルをmacOSのゴミ箱へ移動
- `U`: 直前の削除を取り消し
- `R`: 一覧を再読み込み

## Trash

`D`キーで削除したファイルは、完全削除ではなくmacOSのゴミ箱へ移動します。

外付けボリューム上のファイルは、通常そのボリュームの `.Trashes` 配下へ移動され、Finderのゴミ箱から確認できます。

ゴミ箱への移動に失敗した場合は、起動ルート直下の `trash` フォルダへフォールバックします。

## Cache

RAWの表示用JPEGは、起動ルート直下の `.viewer-cache` に生成されます。

キャッシュはGit管理対象外です。表示がおかしい場合は、サーバを止めて `.viewer-cache` を削除すると再生成されます。

```bash
rm -rf "/path/to/raw-folder/.viewer-cache"
```

## Supported Files

RAW:

```text
NEF, NRW, ARW, CR2, CR3, RAF, RW2, ORF, PEF, DNG, RAW, SR2, SRW, X3F
```

Images:

```text
JPG, JPEG, PNG, HEIC, HEIF, TIFF
```
