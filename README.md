# Taller: planes de consulta (Administración de Bases de Datos)

Aplicación Express + PostgreSQL para que los estudiantes practiquen SQL básico y planes de consulta desde el navegador.

## Archivos

- `sql/01_crear_esquemas_estudiantes.sql`: crea la función `lab_crear_esquema` y los esquemas `est01`…`est20` con sus datos.
- `server.js`: servidor, validación de SQL, sesiones y rutas.
- `ejercicios.json`: enunciados del taller (sin soluciones).
- `public/`: interfaz web.

## Puesta en marcha

1. Cargar el script SQL en la base del taller (con phpPgAdmin o `psql`, como usuario de la base):
   `\i sql/01_crear_esquemas_estudiantes.sql`
2. Instalar dependencias: `npm install --omit=dev`
3. Configurar las variables de entorno (ver abajo) y arrancar: `npm start`

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DB_HOST` | Servidor de PostgreSQL (`localhost` en cPanel) |
| `DB_PORT` | Puerto (por defecto 5432) |
| `DB_NAME` | Nombre de la base |
| `DB_USER` | Usuario de la base |
| `DB_PASSWORD` | Contraseña del usuario |
| `SESSION_SECRET` | Cadena aleatoria larga para firmar las sesiones |
| `CODIGOS_JSON` | Mapa código → esquema, por ejemplo `{"ABC12345":"est01"}` |
| `COOKIE_SEGURA` | `true` cuando el sitio usa HTTPS |

Los códigos de acceso no van en el repositorio: se configuran solo como variable de entorno.
