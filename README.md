# Moja potrošnja struje — Android

Android paket aplikacije **Moja potrošnja struje**. Aplikacija je izrađena pomoću Capacitor Androida i u APK ugrađuje cijelu web-aplikaciju, pa osnovne funkcije rade bez internetske veze.

## Identitet

- Application ID: `hr.cankovic.mojapotrosnjastruje`
- Verzija: `1.0.1`
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

## Instalacija i nadogradnje putem Obtainiuma

[Dodaj aplikaciju u Obtainium jednim dodirom](https://apps.obtainium.imranr.dev/redirect?r=obtainium://app/%7B%22id%22%3A%22hr.cankovic.mojapotrosnjastruje%22%2C%22url%22%3A%22https%3A%2F%2Fgithub.com%2Felviscankovic%2Fmoja-potrosnja-struje%22%2C%22author%22%3A%22elviscankovic%22%2C%22name%22%3A%22Moja%20potro%C5%A1nja%20struje%22%7D)

Ili je dodaj ručno:

1. Instaliraj [Obtainium](https://github.com/ImranR98/Obtainium/releases/latest).
2. U Obtainiumu odaberi **Add App**.
3. Kao izvor zalijepi ovu adresu:

   `https://github.com/elviscankovic/moja-potrosnja-struje`

4. Potvrdi dodavanje aplikacije. Obtainium će prepoznati GitHub izdanje i ponuditi instalaciju najnovijeg APK-a.

Nakon toga Obtainium automatski provjerava nova izdanja. Nadogradnje se instaliraju preko postojeće aplikacije i čuvaju lokalno spremljena očitanja.
