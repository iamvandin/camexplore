# LokalKH – Cambodia Places Guide (Spring Boot + Frontend)

Full-stack version of the `camexplore.html` UI.

* **Backend:** Spring Boot 3.3 (Java 17+), Spring Security + JWT, Spring Data JPA, H2 (default) or MySQL
* **Frontend:** your original Tailwind/Leaflet UI, served by Spring Boot from `src/main/resources/static`
  (`index.html` + `js/app.js`), now calling the REST API instead of in-memory arrays.

## Run

Requirements: JDK 17+ and Maven 3.9+ (or import the project into IntelliJ / Eclipse / VS Code; Lombok plugin required).

```bash
mvn spring-boot:run
# open http://localhost:8080
```

Sample data is inserted on first start (data persists in `./data/`; delete that folder to reset).

| Demo account | Password | Role |
|---|---|---|
| admin@lokalkh.com | `Admin@123` | Administrator (featured) |
| sokha@lokalkh.com | `Explorer@123` | Explorer (free, view-only) |
| owner@malis.com | `Business@123` | Business, Featured Partner |
| hello@daracafe.kh | `Business@123` | Business, Pro (max 5 places) |

### MySQL
```bash
export DB_USERNAME=root DB_PASSWORD=secret
mvn spring-boot:run -Dspring-boot.run.profiles=mysql
```
The `lokalkh` database is created automatically.

### Production checklist
* Set `JWT_SECRET` (32+ random chars) – never use the default.
* Set `app.seed.enabled=false` and remove the "Demo Admin / Free Explorer" buttons + `DEMO_ACCOUNTS` in `app.js`.
* Serve over HTTPS. Use `spring.jpa.hibernate.ddl-auto=validate` with Flyway/Liquibase migrations.
* Plan upgrades are free (as in the original UI) – no payment provider is integrated.

## REST API

| Method & path | Access | Purpose |
|---|---|---|
| POST `/api/auth/register` `/api/auth/login` | public | Returns `{token, user}` |
| GET `/api/auth/me` | user | Current user |
| PUT `/api/subscription` | user | Change plan `{plan: free|pro|featured}` |
| GET `/api/places?q&city&category&openNow&sort&savedOnly` | public | Search / filter / sort (`recommended|rating|distance`) |
| GET `/api/places/{id}` | public | Detail incl. reviews |
| POST `/api/places` | Pro / Featured / Admin | Add a place (Pro limited to 5) |
| PUT / DELETE `/api/places/{id}` | owner or Admin | Edit / delete |
| POST `/api/places/{id}/reviews` | user | `{author?, rating 1-5, text}` |
| GET `/api/bookmarks`, PUT/DELETE `/api/bookmarks/{placeId}` | user | Saved places |
| GET `/api/content` | public | Hero title / subtitle |
| POST `/api/contact` | public | Contact form |
| GET `/api/admin/stats` `/users` `/messages` | Admin | Dashboard data |
| PATCH `/api/admin/users/{id}/role` `/plan` `/status` | Admin | User management |
| PATCH `/api/admin/places/{id}/featured` | Admin | Toggle featured |
| PUT `/api/admin/content` | Admin | Edit hero content |

Send `Authorization: Bearer <token>` for protected endpoints. Errors are `{ "message": "..." }`.

## Project layout
```
src/main/java/com/lokalkh
  config/      SecurityConfig, DataSeeder
  security/    JwtService, JwtAuthFilter, AuthenticatedUser
  domain/      JPA entities + enums (AppUser, Place, Review, ...)
  repository/  Spring Data repositories
  dto/         Request / response records
  service/     Business rules (plans, ownership, ratings)
  web/         REST controllers
  exception/   ApiException + global error handler
src/main/resources
  application.properties, application-mysql.properties
  seed/places.json                 original 8 places
  static/index.html, static/js/app.js
```

## Changes vs. the original HTML
* All data and auth now live in the database; passwords are BCrypt-hashed, sessions use JWT.
* Bookmarks, reviews and adding places require sign-in; search/filter/sort run on the server.
* Fixed: duplicate `openAddModal()` that bypassed the subscription gate.
* Added: About and Contact views (nav buttons previously pointed to nothing), admin "Contact Messages" tab.
* Security: user text is HTML-escaped (stored-XSS), including the `onerror` placeholder handler.
* New listings start at rating 0 with no fake review; coordinates are placed near the chosen city centre.
