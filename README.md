# RAW Cull Viewer

![macOS](https://img.shields.io/badge/macOS-supported-000000?logo=apple&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-25%2B-339933?logo=node.js&logoColor=white)

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

起動後、表示されたURLをブラウザで開きます。

```text
http://127.0.0.1:5173
```

このリポジトリには、起動と同時にブラウザを開くための補助スクリプトも含まれています。

```bash
./start-d4.sh "/path/to/raw-folder"
```

環境変数で指定することもできます。

```bash
RAW_FOLDER="/path/to/raw-folder" ./start-d4.sh
```

複数のカメラや保存先を使い分けている場合は、カメラの機種名や用途ごとに起動スクリプトを分けておくと便利です。

```bash
cp start-d4.sh start-camera-name.sh
RAW_FOLDER="/path/to/raw-folder" ./start-camera-name.sh
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

主にNikon NEFで動作確認しています。

コード上はARW、CR2、CR3、RAF、RW2、ORF、DNGなども対象にしていますが、実機データでの動作確認は未実施です。

そのため、Nikon以外のRAW形式は動作する可能性はありますが、現時点では動作保証外です。

RAW:

```text
NEF, NRW, ARW, CR2, CR3, RAF, RW2, ORF, PEF, DNG, RAW, SR2, SRW, X3F
```

Images:

```text
JPG, JPEG, PNG, HEIC, HEIF, TIFF
```
