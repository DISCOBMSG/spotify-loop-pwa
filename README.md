# Spotify 3時間ループ PWA

3曲を指定時間ぎりぎりまで繰り返すSpotifyプレイリストを作るWebアプリです。

各ユーザーが自分のSpotify DeveloperアプリのClient IDを入力して使います。Client Secretは使いません。

## 利用者向けセットアップ

### 1. Spotify Developer Dashboardを開く

[Spotify Developer Dashboard](https://developer.spotify.com/dashboard) を開き、Spotifyアカウントでログインします。

### 2. Spotifyアプリを作成する

Dashboardで `Create app` を押します。

アプリ名と説明は自由です。例:

```text
App name: Spotify 3 Hour Loop
Description: Creates a 3-track loop playlist
```

Spotifyアプリの考え方は公式ドキュメントの [Apps](https://developer.spotify.com/documentation/web-api/concepts/apps) も参考になります。

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

- 3曲のSpotify track URL
- 曲の長さ、例 `3:45`
- プレイリスト名
- 目標時間、通常は `180`

曲の長さ欄を空にすると自動取得を試します。Spotify側に拒否された場合は手入力してください。

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

## スマホで使う

iPhoneではSafariで開いて、共有メニューから「ホーム画面に追加」します。

AndroidではChromeで開いて、メニューから「ホーム画面に追加」または「アプリをインストール」を選びます。

## メモ

- Client IDなどの入力内容はブラウザのlocalStorageに保存されます。
- アクセストークンはsessionStorageに保存され、ブラウザタブを閉じると消えます。
- Client Secretは使いません。
