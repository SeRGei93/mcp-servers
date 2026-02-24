# Nesty.by API

Base URL: `https://api.nesty.by`

Headers (required):
```
Origin: https://nesty.by
Referer: https://nesty.by/tabs/home
Accept: application/json
```

## GET /api/posts

Список объявлений аренды.

### Query Parameters

| Param | Type | Description |
|---|---|---|
| `city` | string | Название города на русском: Минск, Брест, Гродно, Гомель, Могилёв, Витебск |
| `page` | number | Номер страницы (с 1) |
| `limit` | number | Кол-во на странице (фронт использует 20) |
| `sortBy` | string | Сортировка: `date_desc`, `date_asc`, `price_asc`, `price_desc`, `area_asc`, `area_desc` |
| `priceFrom` | number | Мин. цена USD/мес |
| `priceTo` | number | Макс. цена USD/мес |
| `areaFrom` | number | Мин. площадь м² |
| `areaTo` | number | Макс. площадь м² |
| `floorFrom` | number | Мин. этаж |
| `floorTo` | number | Макс. этаж |
| `yearFrom` | number | Мин. год постройки |
| `yearTo` | number | Макс. год постройки |
| `ownerType` | string | Тип владельца |
| `rooms[]` | number[] | Кол-во комнат (1,2,3,4,5). 5 = 5+ (фронт отправляет 5,6,7,8,9,10) |
| `district[]` | string[] | Районы (значения из /api/posts/filters/{city}) |
| `subDistrict[]` | string[] | Микрорайоны |
| `metro[]` | string[] | Станции метро |
| `streets[]` | string[] | Улицы |
| `sources[]` | string[] | Источники: Realt, Kufar, Onliner, Domovita, Hata, Neagent |
| `lat` | number | Широта (поиск по радиусу) |
| `lng` | number | Долгота |
| `radius` | number | Радиус поиска |
| `excludeMaleOnly` | "true" | Исключить "только мужчинам" |
| `excludeFemaleOnly` | "true" | Исключить "только женщинам" |
| `excludeFamilyOnly` | "true" | Исключить "только семьям" |
| `excludeNoStudents` | "true" | Исключить "без студентов" |
| `excludeNoChildren` | "true" | Исключить "без детей" |
| `excludeNoPets` | "true" | Исключить "без животных" |
| `active` | "true"/"false" | Только активные объявления |

### Response

- Header `X-Total-Count` — общее кол-во объявлений по фильтру
- Body: JSON array of post objects

Ключевые поля поста:
```
id, headline, priceUsd, storeysCount, storey, roomsCount, areaTotal,
metroStationName, stateDistrictName, streetName, houseNumber,
publishedAt, updatedAt, parsedSource, imagesUrls, localImagesUrls
```

## GET /api/actualized-posts

Детальные карточки объявлений (описание, ссылка на оригинал).

| Param | Type | Description |
|---|---|---|
| `ids` | string | Comma-separated post IDs |

Response: JSON array с полями `id`, `description`, `parsedSource`, `originalUrl`.

## GET /api/posts/filters/{city}

Доступные фильтры для города (районы, станции метро).

`city` — название города на русском (URL-encoded).

Response:
```json
{
  "districts": ["Ленинский район", ...],
  "metroStations": ["Немига", ...]
}
```

## GET /api/posts/{id}

Детальная карточка одного объявления.

## GET /api/posts/{id}/similar

Похожие объявления. Param: `limit` (default 6).