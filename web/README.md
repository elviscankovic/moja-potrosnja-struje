# Moja potrošnja struje

Jednostavna lokalna web-aplikacija za spremanje očitanja VT/NT, izračun potrošnje i informativnu procjenu troška.

## Pokretanje

U ovoj mapi pokrenuti:

```bash
python3 -m http.server 8080
```

Zatim otvoriti `http://localhost:8080`.

Može se objaviti i povlačenjem cijele mape na Netlify Drop. Podaci se spremaju samo u preglednik (`localStorage`), zato je povremeno dobro koristiti **Izvezi podatke**.

## Test izračuna

```bash
node test.mjs
```

Kontrolni primjer: 325 kWh VT + 175 kWh NT = 85,76 € za jedan mjesec.

## Zadane tarifne stavke

Zadane cijene odgovaraju HEP-ovu Bijelom tarifnom modelu i kontrolnom izračunu korištenom 10. 8. 2026.:

- energija: VT 0,097189 €/kWh, NT 0,047688 €/kWh
- prijenos: VT 0,021256 €/kWh, NT 0,008175 €/kWh
- distribucija: VT 0,044446 €/kWh, NT 0,020514 €/kWh
- OIE: 0,013239 €/kWh
- opskrba: 0,982 €/mj.; mjerno mjesto: 1,983 €/mj.; PDV: 13 %

Sve stavke mogu se promijeniti unutar aplikacije bez izmjene koda.
