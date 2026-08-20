# Objavljivanje novog APK izdanja

GitHub Actions workflow automatski izrađuje, potpisuje i prilaže APK kada se pošalje oznaka oblika `v1.0.0`.

U postavkama GitHub repozitorija potrebno je jednom dodati ove tajne:

- `ANDROID_KEYSTORE_BASE64` — Base64 sadržaj datoteke `moja-potrosnja-struje-release.jks`
- `ANDROID_KEYSTORE_PASSWORD` — sadržaj datoteke `key-password.txt`
- `ANDROID_KEY_ALIAS` — `moja-potrosnja`

Zatim se izdanje pokreće naredbama:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Privatni ključ ne smije se dodati u repozitorij. Svaka nova verzija mora imati veći `versionCode` u `android/app/build.gradle` i novi `versionName`.
