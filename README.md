# Moja potrošnja struje — Android

Android paket aplikacije **Moja potrošnja struje**. Aplikacija je izrađena pomoću Capacitor Androida i u APK ugrađuje cijelu web-aplikaciju, pa osnovne funkcije rade bez internetske veze.

## Identitet

- Application ID: `hr.cankovic.mojapotrosnjastruje`
- Verzija: `1.0.0`
- Version code: `1`
- Licenca: GPL-3.0-only

## Izgradnja

Potrebni su Node.js, Java 21 i Android SDK (API 35).

```bash
npm install
npm run build:debug
```

Web-izvor aplikacije nalazi se u mapi `web/`. Naredba za izgradnju automatski ga kopira u Android projekt i sinkronizira Capacitor dodatke.

Za javnu distribuciju koristi se release APK potpisan trajnim privatnim ključem. Taj ključ mora ostati sigurno spremljen jer se svaka buduća nadogradnja mora potpisati istim ključem.

## Privatnost

Aplikacija ne prikuplja niti šalje korisničke podatke. Očitanja se spremaju lokalno na uređaju.

## Distribucija

Projekt je pripremljen za objavu izvornog koda i APK izdanja na GitHubu te za kataloge poput IzzyOnDroida i F-Droida. Aplikacija nije službeni proizvod HEP-a.
