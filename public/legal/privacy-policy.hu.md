# Adatvédelmi tájékoztató — Hide & Seek

_Utolsó frissítés: 2026. július 5._

Ez a tájékoztató bemutatja, hogyan gyűjti és használja a **[OPERATOR NAME]** ("mi"), a **Hide & Seek**
(`hideandseek.hu`) üzemeltetője az Ön személyes adatait, valamint ismerteti az Ön jogait az EU
általános adatvédelmi rendelete (GDPR) és a magyar adatvédelmi jog szerint.

**Adatkezelő:** [OPERATOR NAME], [ADDRESS], e-mail: **[CONTACT EMAIL]**.

## 1. Milyen adatokat gyűjtünk

- **Fiókadatok** (regisztrált felhasználók): e-mail-cím, jelszó kivonata (hash), megjelenítendő név
  és opcionális profilkép.
- **Vendégadatok**: az Ön által választott megjelenítendő név és egy ideiglenes fiókazonosító. A
  vendégfiókok egy inaktív időszak után automatikusan törlődnek.
- **Pontos helymeghatározási adatok**: a játék ideje alatt a készüléke GPS-koordinátáit gyűjtjük és
  pozíciótörténetként tároljuk, hogy a játék működjön és visszajátszható legyen. Ez **pontos
  helymeghatározási adat**, és a legérzékenyebb adat, amelyet kezelünk.
- **Játékadatok**: az Ön szerepe, a feltett/megválaszolt kérdések, a kijátszott átkok, a
  tömegközlekedési utazások, időzítések, pontszámok, valamint a bizonyítékként feltöltött fényképek.
- **Felhasználók által létrehozott tartalom** (regisztrált felhasználók): az Ön által létrehozott
  egyéni kérdések és átkok.
- **Visszajelzés**, amelyet az alkalmazáson keresztül küld.
- **Technikai adatok**: IP-cím és alapvető kéréskiszolgálási naplók, eszköz-/böngészőinformációk,
  valamint a bejelentkezés fenntartásához szükséges hitelesítési tokenek.

- **Hibadiagnosztika**: ha az alkalmazásban hiba lép fel, egy diagnosztikai jelentés (hibaüzenet,
  hívási verem és technikai környezet — helyadatok és fiókjelszavak nélkül) elküldésre kerül a
  hibafigyelő szolgáltatónknak, hogy javíthassuk a hibákat.

**Nem** gyűjtünk tudatosan 16 évnél fiatalabb gyermekektől adatokat (Magyarországon ez a digitális
hozzájárulás korhatára). **Nem** használunk hirdetési vagy webhelyközi nyomkövetést, és analitikánk
**sütimentes** — ezért nincs szükség hozzájárulási sávra (cookie banner).

## 2. Miért használjuk, és mi a jogalap

| Cél | Jogalap (GDPR 6. cikk) |
|---|---|
| A játék működtetése (helymeghatározás, játékmenet, valós idejű funkciók) | Szerződés teljesítése; a pontos helyadatokhoz az Ön **hozzájárulása** |
| Fiók létrehozása és védelme | Szerződés teljesítése |
| Mérkőzéselőzmények és statisztikák megjelenítése | Jogos érdek / szerződés |
| Visszaélések megelőzése, a szolgáltatás megbízhatóságának fenntartása | Jogos érdek |
| Visszajelzések és támogatási kérések megválaszolása | Jogos érdek |

A helymeghatározási hozzájárulást bármikor visszavonhatja a helyhozzáférés letiltásával vagy a
játékból való kilépéssel; ekkor a helyadatoktól függő játékmenet nem fog működni.

## 3. Kivel osztjuk meg (adatfeldolgozók és címzettek)

- **Tárhely**: szervereink a **DigitalOcean**-en futnak (adatfeldolgozó).
- **CDN + webanalitika**: a webalkalmazást a **Cloudflare** szolgálja ki, amely a **sütimentes**
  webanalitikánkat is biztosítja (összesített oldalletöltések, hivatkozók — személyes profilok és
  sütik nélkül).
- **Hibafigyelés**: a **Sentry** hiba- és diagnosztikai jelentéseket kap, hogy javíthassuk a
  problémákat (minimalizált személyes adatokkal — IP-cím csatolása nélkül).
- **OpenStreetMap-infrastruktúra**: a földrajzi kérdések megválaszolásához és a térkép
  megrajzolásához koordinátákat és térképi lekérdezéseket küldünk az **Overpass / Nominatim / OSM
  csempeszolgáltatók** felé. Ez azt jelenti, hogy a helyadatokból származó lekérdezések eljutnak
  ezekhez a harmadik felekhez. Lásd a vonatkozó adatvédelmi feltételeiket.
- **E-mail-kézbesítés**: a jelszó-visszaállítási és értesítő e-maileket a **[EMAIL PROVIDER]**
  szolgáltatón keresztül küldhetjük.

Nem értékesítjük az Ön személyes adatait. Csak azt osztjuk meg, ami a szolgáltatás működtetéséhez
szükséges.

## 4. Nemzetközi adattovábbítás

Egyes adatfeldolgozók (pl. térkép- vagy e-mail-szolgáltatók) az EGT-n kívül is kezelhetnek adatokat.
Ahol ez történik, megfelelő garanciákra támaszkodunk, például az EU általános szerződési feltételeire
(SCC). [Szolgáltatónként megerősítendő.]

## 5. Meddig őrizzük meg

- **Vendégfiókok és adataik**: inaktivitás után automatikusan törlődnek.
- **Befejezett vagy megszakadt játékok** (a pozíciónyomvonalakkal együtt): **30 nap** után törlődnek.
- **Regisztrált fiókok**: addig őrizzük, amíg Ön nem törli a fiókját (lásd 7. pont), vagy nem kéri a
  törlést.
- **Kéréskiszolgálási naplók**: biztonsági és hibakeresési célból rövid ideig őrizzük.

## 6. Hogyan védjük

A jelszavakat kizárólag sózott kivonatként (hash) tároljuk; a kapcsolatok HTTPS/WSS titkosítást
használnak; az éles adatokhoz való hozzáférés korlátozott. Egyetlen rendszer sem tökéletesen
biztonságos, de a kockázatnak megfelelő, ésszerű intézkedéseket teszünk.

## 7. Az Ön jogai

A GDPR alapján Ön jogosult: hozzáférni az adataihoz; helyesbíteni azokat; **töröltetni** azokat;
korlátozni vagy tiltakozni az adatkezelés ellen; hordozható másolatot kapni; és visszavonni a
hozzájárulását.

- **Törölje a fiókját saját maga**: nyissa meg a **Profil → Veszélyes zóna → Fiók törlése**
  menüpontot. Ez véglegesen törli a fiókját, statisztikáit és egyéni tartalmait, visszavonja a
  munkameneteit, és anonimizálja a korábbi játékokban való részvételét a többi játékos számára. Ez
  nem vonható vissza.
- Bármely egyéb kérés esetén írjon a **[CONTACT EMAIL]** címre.

Önnek joga van panaszt tenni a magyar felügyeleti hatóságnál, a **Nemzeti Adatvédelmi és
Információszabadság Hatóságnál (NAIH)** — naih.hu.

## 8. Változások

Előfordulhat, hogy frissítjük ezt a tájékoztatót; az új verziót itt tesszük közzé, és a fenti
dátumot frissítjük.

## 9. Kapcsolat

A tájékoztatóval vagy adataival kapcsolatos kérdések: **[CONTACT EMAIL]**.
