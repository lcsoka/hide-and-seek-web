# Süti- és böngészőtárolási tájékoztató — Hide & Seek

_Utolsó frissítés: 2026. július 5._

Ez a tájékoztató bemutatja, milyen sütiket és böngészőtárolást használ a **Hide & Seek**
(`hideandseek.hu`).

## Mit használunk

A Hide & Seek egyoldalas alkalmazás (SPA), amely tokennel — nem nyomkövető sütikkel — tartja Önt
bejelentkezve. Csak azt használjuk, ami az alkalmazás működéséhez szükséges:

| Név / kulcs | Típus | Cél | Megőrzés |
|---|---|---|---|
| Hitelesítési token | `localStorage` | Bejelentkezve tartja Önt a látogatások között (a bearer tokenje). | Kijelentkezésig vagy a fiók törléséig |
| Nyelvi beállítás | `localStorage` | Megjegyzi a választott nyelvet (magyar/angol). | Törlésig |
| Játékállapot | `localStorage` | Megjegyzi az aktuális játékost/játékot, hogy egy oldalfrissítés ne dobja ki Önt a játék közben. | A játék végéig, vagy amíg Ön nem törli |

A bejelentkezés bearer tokent használ (nem bejelentkezési sütiket), így az alkalmazás nem állít be
saját nyomkövető sütiket. Webanalitikánk (**Cloudflare Web Analytics**) és hibafigyelésünk
(**Sentry**) **sütimentes** — nem tárolnak sütiket, és nem építenek profilt Önről. **Nem** használunk
hirdetési sütiket, közösségimédia-nyomkövetőket vagy bármilyen webhelyközi nyomkövetést.

## Harmadik felek kérései

A térkép megjelenítésekor a böngészője **térképcsempéket** tölt be, és **OpenStreetMap**-lekérdezéseket
küld külső szolgáltatóknak. Ezek a szolgáltatók megkapják az Ön IP-címét és a megtekintett
térképterületet, és saját feltételeik szerint saját sütiket állíthatnak be. Lásd az [Adatvédelmi
tájékoztatónk](/legal/privacy) 3. pontját.

## A tárolás kezelése

Mivel a fenti elemek szigorúan szükségesek az alkalmazás működéséhez (a bejelentkezés
fenntartásához), az alkalmazás nyomkövetési hozzájárulási sáv nélkül működik. Ezeket az adatokat
bármikor törölheti:

- Jelentkezzen ki a hitelesítési token eltávolításához, vagy **törölje a fiókját** (Profil →
  Veszélyes zóna).
- Törölje a böngészője webhelyadatait / sütijeit a `hideandseek.hu` esetében a böngésző
  beállításaiban.

A hitelesítési token törlése egyszerűen kijelentkezteti Önt.

## Változások

Előfordulhat, hogy frissítjük ezt a tájékoztatót; az aktuális verzió mindig itt található a fenti
dátummal.

## Kapcsolat

Kérdések: **[CONTACT EMAIL]**.
