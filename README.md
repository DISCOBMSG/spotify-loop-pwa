# ループプレイリストメーカー for Spotify

3つの枠から1曲ずつ選び、指定時間ぎりぎりまで繰り返すSpotifyプレイリストを作るWebアプリです。

このツールはSpotify公式アプリではありません。各ユーザーが自分のSpotify Developer Dashboardで作成したアプリのClient IDを入力して使います。Client Secretは使いません。

## 利用者向けセットアップ

### 1. Spotify Developer Dashboardを開く

[Spotify Developer Dashboard](https://developer.spotify.com/dashboard) を開き、Spotifyアカウントでログインします。

### 2. Spotifyアプリを作成する

Dashboardで `Create app` を押します。

アプリ名と説明は自由です。例:

```text
App name: 3 Hour Loop Maker
Description: Creates a rotating 3-slot loop playlist
```

### 3. Redirect URIを登録する

アプリ設定のRedirect URIに、このWebアプリ画面に表示されているURLを追加します。

ローカル確認なら:

```text
http://127.0.0.1:5500/
```

GitHub Pagesで公開した場合の例:

```text
https://yourname.github.io/spotify-loop-pwa/
```

最後の `/` まで完全一致が必要です。

Spotifyログインは公式の [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) を使っています。

### 4. Client IDをコピーする

Spotify Developer Dashboardのアプリ画面でClient IDをコピーし、このWebアプリのClient ID欄に貼り付けます。

Client Secretは貼り付けないでください。このアプリでは不要です。

### 5. プレイリストを作成する

Webアプリで以下を入力します。

- 3つの枠のSpotify track URL
- 曲の長さ、例 `3:45`
- プレイリスト名
- 目標時間、通常は `180`

各枠は複数曲にできます。たとえば各枠にそれぞれ2曲入れた場合は、枠1-1、枠2-1、枠3-1、枠1-2、枠2-2、枠3-2のように、各枠から1曲ずつ順番に選んで繰り返します。枠ごとの曲数が違う場合は、それぞれの枠の中で先頭に戻って続きます。

各枠の中の曲順は上下ボタンで変更できます。枠そのものの順番も左右ボタンで変更できます。枠名は現在の表示順に合わせて自動で変わります。

曲の長さ欄を空にすると自動取得を試します。取得できない場合は手入力してください。

曲URLを入力するとジャケット画像、曲名、アーティスト名の表示を試します。長さはSpotifyログイン後に取得を試します。

アーティスト候補欄には、カンマや改行で複数のアーティスト名を指定できます。iTunes補完時は候補に近い結果を優先します。

## ローカル確認

このフォルダでローカルサーバーを起動します。

```powershell
python -m http.server 5500
```

ブラウザで開きます。

```text
http://127.0.0.1:5500/
```

Spotify Dashboardにも同じRedirect URIを登録してください。

## 公開する場合

GitHub Pages、Netlify、Vercel、Cloudflare Pagesなどに、このフォルダの中身をアップロードします。

GitHub Pagesの公式手順:

- [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Adding a file to a repository](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

公開後、公開URLをSpotify DashboardのRedirect URIに追加してください。

公開ページやSNSで紹介する場合は、Spotify公式ではないこと、各ユーザーが自分のClient IDを使うこと、入力内容はブラウザ内に保存されることを一緒に書いておくと安心です。Spotify開発者向けのルールは [Developer Policy](https://developer.spotify.com/policy/) も確認してください。

## スマホで使う

iPhoneではSafariで開いて、共有メニューから「ホーム画面に追加」します。

AndroidではChromeで開いて、メニューから「ホーム画面に追加」または「アプリをインストール」を選びます。

## メモ

- Client IDなどの入力内容はブラウザのlocalStorageに保存され、サーバーには送信されません。
- アクセストークンはsessionStorageに保存され、ブラウザタブを閉じると消えます。
- Client Secretは使いません。
