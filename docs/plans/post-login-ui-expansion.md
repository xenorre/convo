# Plan rozbudowy UI po zalogowaniu: czaty, znajomi, Settings

Status: szkic do dyskusji · 2026-10-20

## Założenia i granice

- **Nie zmieniamy designu.** Nowe ekrany składamy z tego, co już jest: paleta slate/cyan, `rounded-xl`, obramowania `border-slate-700/50`, kontener `BorderAnimatedContainer`, układ dwóch paneli (`aside` w-72/w-80 + sekcja treści), klasy `icon-button`, `avatar-online/offline`, styl przycisków z `ActiveTabSwitch` i `ChatItem`.
- **Nie budujemy Messengera.** Poza zakresem: czaty grupowe, reakcje, relacje/stories, połączenia audio/wideo, edycja i wątki wiadomości, motywy kolorystyczne, redesign.
- Każdy etap ma działać samodzielnie i trafiać na `main` osobnym PR-em.

## Stan obecny (punkt wyjścia)

| Obszar | Co jest | Braki / problemy |
|---|---|---|
| Lista czatów (`ChatsList.tsx`) | Partnerzy rozmów, status online, licznik nieprzeczytanych | Brak podglądu ostatniej wiadomości i godziny, brak sortowania po aktywności, brak wyszukiwania. Backend (`getChats`) pobiera **wszystkie** wiadomości użytkownika, żeby wyliczyć partnerów, co nie skaluje się. |
| „Contacts” (`ContactsList.tsx`) | Lista **wszystkich** zarejestrowanych użytkowników (`GET /messages/contacts`) | Nie ma pojęcia „znajomego”. Każdy widzi każdego (prywatność, skala). Brak wyszukiwania. `onlineUsers.includes()` w pętli. |
| Stan list | Jeden wspólny `isUsersLoading` dla obu zakładek | Przełączanie zakładek miga skeletonem i za każdym razem robi refetch. |
| Settings | Trasa `/settings` renderuje `<div>Settings Page</div>`, link w `ProfileHeader` | Nic nie istnieje. |
| Backend profilu | `GET /users/profile`, `PUT /users/update-profile` (tylko `fullName`), `PUT /users/update-profile-image` | Endpointy są gotowe, ale frontend z nich nie korzysta. |
| Sesje | Jedna aktywna sesja na konto (`activeSessionId`), `session:revoked` przez socket | Brak zmiany hasła i usuwania konta. |
| Wiadomości | Pole `readAt`, `markRead` | `readAt` nie jest pokazywane w UI (potencjalne potwierdzenia odczytu). |
| Duplikacja | Markup awatara powtarza się w 4 komponentach | Warto wydzielić przed rozbudową. |

---

## Etap 0: Fundamenty (mały, odblokowuje resztę)

Cel: przygotować wspólne klocki i routing bez widocznej zmiany wyglądu.

1. **Wspólne komponenty UI** (`frontend/src/components/ui/`), wydzielone 1:1 z istniejącego markupu:
   - `Avatar` (zdjęcie lub ikona zastępcza, wariant online/offline, rozmiary 11/12),
   - `ListItemButton` (styl wiersza z `ChatItem`: zaznaczony / hover / focus),
   - `SegmentedControl` (z `ActiveTabSwitch`),
   - `SearchField` (styl jak `auth-input`, ikona lupy, przycisk czyszczenia),
   - `Switch` / `Toggle` i `ConfirmDialog` (daisyUI jest już podpięty, nadajemy mu nasze tokeny),
   - `PanelHeader` (nagłówek z przyciskiem wstecz na mobile, jak w `ChatHeader`).
2. **Rozdzielenie stanów ładowania** w `useChatStore`: `isChatsLoading`, `isFriendsLoading` zamiast `isUsersLoading`, plus prosty cache (`lastFetchedAt`), żeby nie robić refetchu przy każdym przełączeniu zakładki.
3. **Routing pod zalogowanego użytkownika:**
   - wspólny `AppLayout` (shell z `BorderAnimatedContainer` + `ConnectionStatus`), w nim trasy `/` (czaty) i `/settings/*`,
   - opcjonalnie `/chat/:userId` jako deep link (powiadomienia, przycisk „wstecz” na telefonie zamyka rozmowę zamiast wychodzić z aplikacji); `selectedUser` synchronizowany z URL,
   - `SettingsPage` ładowana leniwie (`lazy`), tak jak `ChatPage`.

**Rozmiar:** S–M · **Backend:** brak zmian

---

## Etap 1: Lista czatów

### Funkcje

| # | Funkcja | Priorytet | Uwagi |
|---|---|---|---|
| 1.1 | Podgląd ostatniej wiadomości (prefiks „You:”, „📎 Attachment” dla plików) | MVP | Zastępuje tekst Online/Offline pod nazwą; status zostaje w kropce awatara. |
| 1.2 | Czas ostatniej wiadomości (`14:32`, `Yesterday`, `Mon`, `12.10`) | MVP | `Intl.DateTimeFormat`, bez nowych zależności. |
| 1.3 | Sortowanie po ostatniej aktywności + przesuwanie rozmowy na górę na żywo (wysłana i odebrana wiadomość) | MVP | Aktualizacja w `sendMessage` i w handlerze `newMessage`. |
| 1.4 | Wyszukiwarka nad listą (filtr po nazwie, po stronie klienta) | MVP | `useDebounce` już istnieje. |
| 1.5 | Filtr „All / Unread” | Nice-to-have | Ten sam `SegmentedControl` w mniejszym rozmiarze albo chip. |
| 1.6 | Menu kontekstowe wiersza: *Mark as unread*, *Mute*, *Hide conversation* | Etap 4 | Wymaga stanu per rozmowa na backendzie. |
| 1.7 | Paginacja / doładowywanie listy | Później | Potrzebna dopiero przy dużej liczbie rozmów. |

### Backend

- Przepisać `getChats` na jedną agregację: `$match` (moje wiadomości), `$sort createdAt desc`, `$group` po partnerze z `$first` (ostatnia wiadomość) i licznikiem nieprzeczytanych, potem `$lookup` do `users` (bez email/hasła).
- Indeksy: `{ senderId: 1, receiverId: 1, createdAt: -1 }` oraz `{ receiverId: 1, readAt: 1 }`.
- Odpowiedź (zgodna wstecz, `unreadCounts` zostaje):
  ```json
  { "chats": [{ "_id", "fullName", "profilePic",
                "lastMessage": { "text", "hasAttachment", "senderId", "createdAt" } }],
    "unreadCounts": { "<userId>": 3 } }
  ```
- Typ `ChatSummary extends Contact` w `types/chat.ts`.

**Rozmiar:** M · **Testy:** store (sortowanie, aktualizacja przy `newMessage`/`sendMessage`), agregacja na backendzie.

---

## Etap 2: Settings, MVP (na istniejących endpointach)

### Układ (bez nowego designu)

Ten sam dwupanelowy shell co czaty:

- **Lewy panel (`aside`)**: nagłówek z przyciskiem „← Back to chats” i tytułem *Settings*, poniżej lista sekcji w stylu `ListItemButton` (ikona lucide + nazwa + krótki opis).
- **Prawy panel**: treść sekcji, karty `surface-panel` z grupami pól, przycisk *Save* aktywny dopiero po zmianie.
- **Mobile**: `/settings` pokazuje listę sekcji, `/settings/:section` pokazuje treść z `PanelHeader` i strzałką wstecz. Działa tak samo jak lista czatów → rozmowa.
- Trasy: `/settings/profile`, `/account`, `/privacy`, `/notifications`, `/preferences`, `/about`. Na desktopie `/settings` przekierowuje do `profile`.

### Sekcje i funkcje

Legenda: **MVP** w etapie 2 · **E3** po systemie znajomych · **E4** później

#### 1. Profile
| Funkcja | Priorytet | Backend |
|---|---|---|
| Zmiana zdjęcia profilowego (podgląd, walidacja 5 MB / JPG-PNG-WebP po stronie klienta) | MVP | ✅ istnieje `update-profile-image` |
| Usunięcie zdjęcia (powrót do domyślnego) | MVP | nowy `DELETE /users/profile-image` |
| Zmiana imienia i nazwiska (2–50 znaków) | MVP | ✅ istnieje `update-profile` |
| E-mail tylko do odczytu | MVP | ✅ |
| Krótki opis / status tekstowy („About”, maks. 140 znaków) | E4 | rozszerzenie schematu |
| Podgląd „jak widzą mnie inni” (wiersz listy + nagłówek czatu) | Nice-to-have | — |

Po zapisie aktualizujemy `authUser` w `useAuthStore`. Warto też emitować `user:updated` przez socket, żeby u innych odświeżył się awatar i nazwa na listach.

#### 2. Account & security
| Funkcja | Priorytet | Backend |
|---|---|---|
| Zmiana hasła (obecne + nowe + powtórzenie, te same reguły co przy rejestracji) | MVP | nowy `PUT /users/password`, rotacja `activeSessionId` |
| Informacja o bieżącej sesji (urządzenie/przeglądarka, data logowania) + objaśnienie, że zalogowanie gdzie indziej wyloguje tutaj | MVP | zapis `userAgent`/`createdAt` przy loginie |
| Wyloguj | MVP | ✅ |
| Zmiana e-maila z potwierdzeniem linkiem (Resend już skonfigurowany) | E4 | token weryfikacyjny |
| Eksport moich danych (JSON: profil + wiadomości) | E4 | endpoint eksportu |
| Usunięcie konta (strefa „Danger zone”, hasło + `ConfirmDialog`) | E4 | kasowanie użytkownika, plików z storage, anonimizacja wiadomości |

#### 3. Privacy (pełna wersja w etapie 3)
| Funkcja | Priorytet |
|---|---|
| Pokazuj mój status online (wyłączony = inni widzą mnie jako offline) | E3 (backend filtruje `getOnlineUsers`) |
| Kto może wysyłać mi zaproszenia: *Everyone / Nobody* | E3 |
| Kto może do mnie pisać: *Everyone / Friends only* | E3 (zależy od decyzji D1) |
| Lista zablokowanych użytkowników + odblokowanie | E3 |
| Potwierdzenia odczytu on/off | E4 (jeśli wprowadzimy „Seen”) |

#### 4. Notifications
| Funkcja | Priorytet | Gdzie zapisane |
|---|---|---|
| Toasty o nowych wiadomościach on/off | MVP | lokalnie (urządzenie) |
| Pokazuj treść wiadomości w powiadomieniu on/off | MVP | lokalnie |
| Dźwięk powiadomienia on/off | MVP | lokalnie |
| Powiadomienia systemowe przeglądarki (Notification API, prośba o zgodę, gdy karta w tle) | Nice-to-have | lokalnie |
| Powiadomienia o zaproszeniach do znajomych | E3 | lokalnie |
| Lista wyciszonych rozmów | E4 | serwer |

`notifyIncomingMessage` w `utils/messageNotifications.tsx` czyta te preferencje przed pokazaniem toastu.

#### 5. Preferences (zachowanie i dostępność, bez zmian wizualnych)
| Funkcja | Priorytet |
|---|---|
| Enter wysyła / Enter = nowa linia (Ctrl/Cmd+Enter wysyła) | MVP |
| Ograniczenie animacji: *System / On / Off* (nadpisuje `useReducedMotion`) | MVP |
| Rozmiar tekstu wiadomości: *Small / Default / Large* (skala `rem`, bez zmiany stylu) | Nice-to-have |
| Kompaktowa lista czatów (mniejszy padding) | Nice-to-have |

#### 6. About & help
| Funkcja | Priorytet |
|---|---|
| Wersja aplikacji (z `package.json` przez `import.meta.env`) | MVP |
| Stan połączenia z serwerem (dane z `healthMonitor`) | MVP |
| Skróty klawiszowe (Esc zamyka rozmowę itd.) | MVP |

### Przechowywanie ustawień

- **Preferencje urządzenia** (powiadomienia, Enter, animacje): nowy `useSettingsStore` (zustand + `persist` w `localStorage`, klucz per `authUser._id`, odczyt w `try/catch`).
- **Ustawienia konta** (prywatność, wyciszenia): `User.settings` (poddokument), endpointy `GET /users/settings` i `PATCH /users/settings` ze ścisłym schematem `zod` (`.strict()`, jak `updateProfileSchema`).

**Rozmiar:** M · **Backend w MVP:** zmiana hasła, usunięcie zdjęcia, metadane sesji.

---

## Etap 3: Znajomi (zastępuje „Contacts”)

Największy etap: zmienia model danych i semantykę zakładki.

### Backend

- Model `Friendship`: `{ requester, recipient, status: "pending" | "accepted", createdAt, respondedAt }`, unikalny indeks na parę (posortowane ID). Blokady w osobnej kolekcji `Block { blocker, blocked }`, żeby nie mieszać ich ze stanem znajomości.
- Endpointy (`/api/friends`):
  - `GET /friends` – zaakceptowani,
  - `GET /friends/requests` – przychodzące i wysłane,
  - `POST /friends/requests` `{ userId }` – wyślij (respektuje ustawienie „kto może zapraszać” i blokady),
  - `POST /friends/requests/:id/accept` · `/decline` · `DELETE /friends/requests/:id` (anuluj wysłane),
  - `DELETE /friends/:userId` – usuń ze znajomych,
  - `POST /users/:id/block` · `DELETE /users/:id/block`, `GET /users/blocked`.
- Wyszukiwanie użytkowników: `GET /users/search?q=` (min. 3 znaki, limit 20, rate limit przez istniejący Arcjet, bez e-maili w odpowiedzi; zob. decyzja D3).
- Zdarzenia socket: `friend:request`, `friend:accepted`, `friend:removed` (do pokoju `user:<id>`).
- `GET /messages/contacts` wycofujemy po migracji frontendu.
- Blokada działa też w `sendMessage` (403) i ukrywa status online.

### UI (zakładka „Friends” w miejscu „Contacts”)

- `SegmentedControl`: **Chats | Friends**, przy Friends badge z liczbą oczekujących zaproszeń (ten sam styl co licznik nieprzeczytanych).
- Na górze zakładki: `SearchField` filtrujący znajomych + przycisk ikonowy **Add friend** (`UserPlusIcon`).
- Sekcja **Requests** (zwijana, widoczna tylko gdy niepusta): wiersz z awatarem, nazwą, przyciskami *Accept* / *Decline*; wysłane z przyciskiem *Cancel*.
- Lista znajomych pogrupowana: **Online (n)** / **Offline (n)**, alfabetycznie.
- Wiersz znajomego: klik otwiera rozmowę; menu „⋯”: *Remove friend*, *Block*.
- **Add friend**: panel w miejscu listy (bez modala, spójnie z mobile), wyszukiwarka i wyniki ze stanem przycisku *Add* / *Pending* / *Friends*.
- Puste stany w stylu `NoChatsFound` („No friends yet → Add friend”). `NoChatsFound` kieruje do zakładki Friends.
- Akcje w nagłówku czatu (`ChatHeader`), w menu „⋯”: *Add friend* (jeśli to nie znajomy), *Block*.
- Toast przy nowym zaproszeniu (ten sam `AppToaster`, z akcją „View”).

### Migracja

Skrypt jednorazowy: istniejący partnerzy rozmów stają się znajomymi (`accepted`), żeby nikt nie stracił dostępu do swoich czatów (zob. D2).

**Rozmiar:** L · **Testy:** backend (przejścia stanów, blokady, uprawnienia), store, komponenty Requests/Add friend.

---

## Etap 4: Rozszerzenia (po walidacji poprzednich)

- Stan rozmowy per użytkownik (`ConversationState { userId, partnerId, mutedUntil, hiddenAt, markedUnread }`): menu kontekstowe na liście czatów i sekcja wyciszeń w Settings.
- Potwierdzenia odczytu „Seen” (dane już są: `readAt`) z przełącznikiem w Privacy.
- Wskaźnik „typing…” w nagłówku czatu i na liście (zdarzenia socket `typing:start/stop` z throttlingiem).
- Opis profilu, zmiana e-maila, eksport danych, usunięcie konta.

---

## Kolejność i zależności

```
Etap 0 (fundamenty) ─┬─> Etap 1 (lista czatów)
                     └─> Etap 2 (Settings MVP) ──> Etap 3 (znajomi + Privacy) ──> Etap 4
```

Etapy 1 i 2 są niezależne i mogą iść równolegle po etapie 0. Etap 3 dokłada sekcję Privacy do gotowego szkieletu Settings.

## Decyzje do podjęcia

| # | Pytanie | Rekomendacja |
|---|---|---|
| D1 | Czy pisać można tylko do znajomych? | **Tak dla nowych rozmów**, z ustawieniem „Who can message me” (domyślnie *Friends only*). Istniejące rozmowy zostają. |
| D2 | Czy automatycznie zamienić obecnych partnerów rozmów w znajomych? | **Tak**, jednorazowa migracja, inaczej obecni użytkownicy stracą „Contacts”. |
| D3 | Wyszukiwanie po imieniu (ryzyko enumeracji kont) czy po dokładnym e-mailu / unikalnym `@username`? | Krótkoterminowo **imię z limitami i rate limitem**; docelowo rozważyć `@username`. |
| D4 | Preferencje powiadomień per urządzenie czy per konto? | **Per urządzenie** (localStorage); synchronizację dodać tylko na żądanie. |
| D5 | Język UI | Zostajemy przy angielskim; i18n poza zakresem. |

## Kryteria „done” dla każdego etapu

- Brak nowych kolorów, fontów i promieni; tylko istniejące klasy i tokeny.
- Mobile 375 px: brak poziomego scrolla, cele dotykowe ≥ 44 px (`min-h-11`), działa przycisk wstecz.
- Dostępność: `aria-pressed` / `aria-current` w nawigacji, focus-visible jak w obecnych komponentach, etykiety przycisków ikonowych.
- Lighthouse nie gorszy niż po `perf: improve Lighthouse performance scores` (nowe strony ładowane leniwie).
- Testy Vitest dla store'ów i nowych komponentów, testy backendu dla nowych endpointów.
