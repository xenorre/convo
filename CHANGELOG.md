# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 1.0.0 (2026-10-30)

### Features

* **account:** let users change their sign-in email with a confirmation link ([f4236c3](https://github.com/xenorre/convo/commit/f4236c38ce7ab975b84b400004d7b9304689c64c))
* **account:** let users delete their account and download their data ([2acbb32](https://github.com/xenorre/convo/commit/2acbb327ff27819013810ca0aa7d5e3391b206e3))
* add unread message badge with notification, small fixes ([087756e](https://github.com/xenorre/convo/commit/087756ea4d0c53edad245cbd084672cbbda4afec))
* **auth:** enforce a modern password policy with a strength meter ([5f2e737](https://github.com/xenorre/convo/commit/5f2e737e8289c7888bae4d0aaa074d741073e13f))
* **auth:** let every password field show what was typed ([a688068](https://github.com/xenorre/convo/commit/a688068f3a99f00f1bc63fd50af589ff3c430262))
* **auth:** let users reset a forgotten password by email ([302fae9](https://github.com/xenorre/convo/commit/302fae98a3c9b43bf9d5ca559c07dfa81d0ddefb))
* **auth:** require email confirmation before the first sign-in ([ff1d938](https://github.com/xenorre/convo/commit/ff1d9382d33611b867782a191ad43eb448e2ec46))
* **chats:** add search to the chat list ([354e64e](https://github.com/xenorre/convo/commit/354e64ec57d8e225433706ad106e40a5622b823f))
* **chats:** hide conversations and minimize open ones ([4f6f691](https://github.com/xenorre/convo/commit/4f6f6919c3c6b0467988367a92271a0769b80615))
* **chats:** let users delete a chat and its history ([bd8106e](https://github.com/xenorre/convo/commit/bd8106e0ef41b1d1146a54e539e0e77cbc12e053))
* **chats:** mute notifications for a conversation ([34cabdc](https://github.com/xenorre/convo/commit/34cabdced38b3308f6694d55459740502ca8e8a4))
* **chats:** show last message preview and time in the chat list ([bfd1f74](https://github.com/xenorre/convo/commit/bfd1f74ea3b7c6b2749606e9c42fda39f825cd5e))
* **chats:** show when the other person is typing ([8a756a7](https://github.com/xenorre/convo/commit/8a756a750ea7096eaa1593e7a4ae780631e1ff15))
* **deploy:** add the production Compose setup with MongoDB and daily backups ([7071144](https://github.com/xenorre/convo/commit/70711448c431ea65895b6fbb7eaebc10df1d2098))
* **deploy:** deploy to the VPS with one script that checks, builds and rolls back ([df28c83](https://github.com/xenorre/convo/commit/df28c83cac2511eae239043a7a1b3c58fe3ebd75))
* dockerfile for fullstack deployment with render.yaml template ([2ae8b47](https://github.com/xenorre/convo/commit/2ae8b47f8ceb7260e03afc8103e081a779260719))
* **friends:** add friendships API, user search and data migrations ([077a000](https://github.com/xenorre/convo/commit/077a000b8b997cdfb141c60fe8a0414a87bc999d))
* **friends:** replace contacts with a friends tab ([e419fe5](https://github.com/xenorre/convo/commit/e419fe59e76e1a92ea4cc1b84bf340b052ac9faa))
* **messages:** edit messages and delete them for me or everyone ([1167b99](https://github.com/xenorre/convo/commit/1167b992a5d67c9edfb86c19747b0c41c3f87d79))
* **messages:** load conversation history page by page as the user scrolls up ([039e5c3](https://github.com/xenorre/convo/commit/039e5c3c03e08702e070fff1dfcb88ba6405ed7f))
* **messages:** show read receipts with a mutual privacy switch ([1936135](https://github.com/xenorre/convo/commit/19361354306a9f54dc820088d087074cdcc7a907))
* **notifications:** add styled toast notifications ([12e7cf0](https://github.com/xenorre/convo/commit/12e7cf030137236e9dd8849ff41bca760751fb95))
* open conversations from incoming message notifications; enforce a single active session per account (!) ([74d01b8](https://github.com/xenorre/convo/commit/74d01b869420d3ee2d94f391d4660a8805b96ddd))
* **privacy:** add blocking and privacy settings ([81ca252](https://github.com/xenorre/convo/commit/81ca25296fdc9ec02fc7780c80e2952ca2d01431))
* **privacy:** add privacy settings and blocking to the UI ([a0fc85b](https://github.com/xenorre/convo/commit/a0fc85b026bb010961b3ef4f2d0f948e64cc09ad))
* **release:** version the API under /api/v1 and report the running build ([768bac9](https://github.com/xenorre/convo/commit/768bac9164b669ec69b39ce1a11fb8849f433e1a))
* **settings:** add notification and animation preferences ([6c0f581](https://github.com/xenorre/convo/commit/6c0f58197aa1439dd9eef7cc5a423205bc743a63))
* **settings:** add password change to account settings ([cdf97b5](https://github.com/xenorre/convo/commit/cdf97b562850d7c9b5a5aa705bd15e2faa247b39))
* **settings:** add settings page with profile and about sections ([95ea2f3](https://github.com/xenorre/convo/commit/95ea2f31acf6fb4299de8cbd2f45ff9fddfe1758))
* **storage:** keep uploaded files on the server's disk and serve them under /uploads ([0f2b879](https://github.com/xenorre/convo/commit/0f2b8797703ff9f8a725a794bd7b69487943c4f0))

### Bug Fixes

* **auth:** suppress misleading alerts before login ([f4771e0](https://github.com/xenorre/convo/commit/f4771e0d5c77e0dff856c1f597ea44a79441928a))
* **connection:** reconnect after long outages, show the reconnecting state and clear all lint errors ([efcc500](https://github.com/xenorre/convo/commit/efcc500afca8614b0d03809d4bc222c424552c19))
* cors config ([e4c9f50](https://github.com/xenorre/convo/commit/e4c9f502a856ff848d5f7d3f5aa60688792c2013))
* describe real features on the sign-in screen instead of made-up claims ([9ab2076](https://github.com/xenorre/convo/commit/9ab2076e92fea73eec4a6360cc53e2898db846a1))
* **messages:** return conversation messages in chronological order ([6a3c1cd](https://github.com/xenorre/convo/commit/6a3c1cd01386d39bdbbe756346d9b548569c12ce))
* **privacy:** make "friends only" mean current friends ([0bc949b](https://github.com/xenorre/convo/commit/0bc949b1065a14aaed61f647111f3ff09b0ac8d8))
* production friendly env variables defaults ([c8d20ce](https://github.com/xenorre/convo/commit/c8d20ce081264d23a01ddcc3b73849b9f86dc2b8))
* replace the wildcard route ([681efc8](https://github.com/xenorre/convo/commit/681efc8ea37e85c8cbba7a7e1271478bf318c1dd))
* root route ([01553ed](https://github.com/xenorre/convo/commit/01553ed93bd68d16d099fdca42a05b4a81ba4902))
* **ui:** improve mobile responsiveness ([ed77ec8](https://github.com/xenorre/convo/commit/ed77ec88726c8fd5331f62b9b16276c77fc13d3e))

### Performance

* **chats:** build chat list with a single aggregation query ([f48c2c8](https://github.com/xenorre/convo/commit/f48c2c89c399c804455d06edf1aa305ec3b08017))
* improve Lighthouse performance scores ([2d65513](https://github.com/xenorre/convo/commit/2d65513a3ebd71afe6bdd9519043b22fbf20cbfd))

### Refactoring

* **frontend:** stop setting state and refs during render or in effect bodies" ([615bab5](https://github.com/xenorre/convo/commit/615bab5651fad1257a23c6db7e79f1900edd16df))
