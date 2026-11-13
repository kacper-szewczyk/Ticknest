# Ticknest

[English](README.md) | **Polski**

**Otwartoźródłowy system do śledzenia czasu pracy dla małych zespołów, działający w Twoim własnym projekcie Firebase.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/pl/timesheet-dark.png">
  <img src="docs/screenshots/pl/timesheet-light.png" alt="Karta czasu w Ticknest z włączonym licznikiem i wpisami z tygodnia pogrupowanymi według dni">
</picture>

| Mierzenie czasu                                                                            | Raporty i eksport                                                                      | Zarządzanie zespołem                                                                                        |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| ![Uruchamianie i zatrzymywanie licznika czasu dla projektu](docs/screenshots/pl/timer.gif) | ![Strona raportów z sumami według projektów i osób](docs/screenshots/pl/reports.png)   | ![Lista członków przestrzeni roboczej z rolami i oczekującym zaproszeniem](docs/screenshots/pl/members.png) |
| ![Karta czasu na telefonie](docs/screenshots/pl/mobile.png)                                | ![Pierwsza strona raportu wyeksportowanego do PDF](docs/screenshots/pl/pdf-export.png) |                                                                                                             |

Wszystkie zrzuty ekranu pokazują dane demo i są generowane poleceniem `npm run screenshots`.

**[Wypróbuj demo](https://ticknest-pi.vercel.app)**: zaloguj się jednym z przykładowych kont pokazanych na ekranie logowania. Dane demo są resetowane co 24 godziny. Interfejs jest dostępny po polsku.

Pierwszy raz tutaj? **[Strona projektu](https://ticknest-landing.vercel.app/pl/)** w skrócie pokazuje, co potrafi Ticknest i jak wypada na tle innych trackerów czasu.

Pełna dokumentacja jest po angielsku: zobacz [README](README.md) i [przewodnik wdrożenia](docs/operations.md).

## Co potrafi

- **Timer** zawsze widoczny w nagłówku, z wyborem projektu i zadania. Uruchomione timery zatrzymują się same o północy.
- **Karta czasu pracy** pogrupowana po dniach, z dziennymi sumami i ręcznym dodawaniem wpisów.
- **Klienci, projekty i zadania** w katalogu z wyszukiwaniem i szacunkami w godzinach.
- **Raporty** według dnia, klienta, projektu, zadania lub osoby, z eksportem do **CSV** i **PDF**.
- **Zespoły**: zaproszenia przez link i role Właściciel, Menedżer i Członek.
- **Budżety** (opcjonalne) dla projektów i osób.
- **Import z Clockify**: przenieś historię z pliku CSV raportu szczegółowego, z podglądem przed zapisem.
- **Interfejs po angielsku, hiszpańsku i polsku**, jasne i ciemne palety kolorów, działa na telefonach.

## Dlaczego Ticknest

- **Dane należą do Ciebie.** Wszystko jest w Twoim projekcie Firebase; autorzy nie prowadzą żadnego serwera i nie widzą Twoich wpisów.
- **Bez opłat za użytkownika.** Płacisz tylko za zużycie Firebase.
- **Bez monitorowania.** Żadnych zrzutów ekranu, śledzenia aktywności ani analityki w aplikacji.
- **Otwarty kod** na licencji MIT.

## Ile to kosztuje?

Dla zespołu od 5 do 25 osób, które codziennie rejestrują czas, **zwykle 0 zł miesięcznie**: zmierzone zużycie mieści się w bezpłatnych limitach Firebase (5 osób zużywa ok. 6% dziennego limitu odczytów Firestore, 25 osób ok. 37%). Cloud Functions wymagają jednak planu Blaze i konta rozliczeniowego, więc [ustaw alert budżetowy](docs/operations.md#set-a-budget-alert). [Zmierzony szacunek](docs/operations.md#what-does-it-cost) (po angielsku) podaje założenia, ceny dla europe-west1 i us-central1 oraz datę pomiaru. To szacunek, nie gwarancja.

## Czego (jeszcze) nie ma

- Integracji z innymi narzędziami, publicznego API, aplikacji mobilnej ani rozszerzenia przeglądarki. Aplikacja webowa działa w przeglądarkach mobilnych.
- Fakturowania i stawek godzinowych.

## Wdrożenie

Najkrótsza droga: aplikacja webowa na Vercel, backend (reguły Firestore, indeksy, Functions) w Firebase. Kroki opisuje sekcja [Deploy](README.md#deploy), a szczegóły [przewodnik wdrożenia](docs/operations.md).

## Pytania i pomoc

Pytania, pomysły i własne wdrożenia możesz zgłaszać w [GitHub Discussions](https://github.com/kacper-szewczyk/Ticknest/discussions) (także po polsku), a błędy jako [zgłoszenia (issues)](https://github.com/kacper-szewczyk/Ticknest/issues/new/choose). Luki bezpieczeństwa zgłaszaj prywatnie, zgodnie z [SECURITY.md](SECURITY.md).

## Licencja

Ticknest jest udostępniany na [licencji MIT](LICENSE).
