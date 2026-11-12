# GLEDITECH — GitHub + Render

Conversión del archivo `GLEDITECH_Vista_Previa.html` a una aplicación Node.js/Express con PostgreSQL y autenticación real. El aspecto y las pantallas originales se preservan.

## Implementado
- Acceso con usuario y contraseña, sesiones HTTP-only y protección CSRF.
- Primer acceso: obligación de cambiar contraseña.
- Roles `admin` y `technician`.
- El administrador puede crear usuarios, cambiar roles, activar/desactivar cuentas y reiniciar contraseñas asignando una temporal nueva.
- PostgreSQL persistente para cuentas, clientes, proyectos, precios, presupuestos/proformas, gastos, fotografías y documentos cargados (hasta 20 MB/archivo).
- Auditoría básica de operaciones, panel, búsquedas y reportes básicos.

## Importante: funciones aún no integradas
La vista previa suministrada **solo incluía el frontend y un simulador de datos**, no el backend original. Por eso este paquete es una **primera versión funcional del backend** y **no reproduce todavía todas las funcionalidades avanzadas**. Quedan pendientes: generación de PDF/QR, envío de correos, exportación Excel, importaciones masivas o legadas, cálculo APU avanzado, historial de revisiones y copias ZIP. Estos endpoints responden error 501 cuando se solicitan; no deben presentarse como disponibles.

La función «Olvidé mi contraseña» informa que hay que contactar al administrador. El administrador puede asignar una nueva contraseña temporal desde Usuarios y permisos.

## Subir a GitHub
1. En GitHub, crea un repositorio **privado** nuevo, por ejemplo `gleditech`.
2. Extrae el ZIP y sube **los archivos y la carpeta `public`** a la raíz del repositorio, o utiliza Git:
   ```bash
   git init
   git add .
   git commit -m "GLEDITECH con usuarios y PostgreSQL"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/gleditech.git
   git push -u origin main
   ```
3. **No subas** `.env` ni contraseñas al repositorio. `.env.example` solo contiene valores ficticios.

## Publicar en Render
1. En https://dashboard.render.com, pulsa **New > Blueprint** y conecta el repositorio.
2. Render encontrará `render.yaml` y propondrá un servicio web Node.js y una base de datos PostgreSQL.
3. Configura la variable secreta `ADMIN_PASSWORD` con una contraseña **única de al menos 12 caracteres**. No la escribas en el código.
4. **Revisa los costos antes de crear los recursos.** El `render.yaml` usa planes pagados actuales de Render: `0.5c-512mb` para el servicio web y `0.1c-256mb` para PostgreSQL. Esto evita que la base de datos gratuita expire a los 30 días y que se pierdan los datos. Si solo quieres probar temporalmente, puedes cambiar ambos planes a `free`, pero la web se dormirá tras 15 minutos sin tráfico y la base gratuita expirará a los 30 días.
5. Despliega y abre la URL HTTPS del servicio. La ruta `/health` permite validar la conexión.
6. Accede con el usuario de `ADMIN_USER` (`admin` por defecto) y `ADMIN_PASSWORD`. Se solicitará cambiar la contraseña en el primer ingreso.
7. Ve a **Usuarios y permisos > Nuevo usuario** para añadir empleados.

**Para un servicio ya existente:** crea/conecta una base PostgreSQL, define `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_USER`, `ADMIN_NAME` y `NODE_ENV=production` en Environment, configura Build Command `npm install`, Start Command `npm start` y Health Check Path `/health`. Asegúrate de que `DATABASE_URL` corresponda a la base PostgreSQL del mismo entorno.

## Gestión de cuentas
- **Administrador:** gestiona usuarios y configuración, dispone de reportes y auditoría.
- **Técnico:** accede a los módulos operativos, pero no administra cuentas.
- Contraseñas: mínimo 12 caracteres; bcrypt; nunca guardadas en el HTML o en GitHub.
- La cuenta inicial solo se crea cuando la base no tiene ningún usuario. Modificar `ADMIN_PASSWORD` más adelante **no cambia** la contraseña del administrador existente.

## Comprobaciones recomendadas antes de usar en producción
1. Crear administrador y cambiar contraseña obligatoria.
2. Añadir técnico, cerrar sesión e iniciar con su cuenta.
3. Comprobar que un técnico no pueda abrir Usuarios y permisos.
4. Guardar un cliente y un proyecto; reiniciar Render y comprobar su persistencia.
5. Configurar copias de seguridad de PostgreSQL y probar restauración.
6. Verificar cálculos y flujos operativos contra la aplicación original antes de utilizar documentos comerciales reales.

> Se verificó la sintaxis de `server.js`, el JavaScript incluido en `public/index.html` y la estructura YAML de `render.yaml`. No fue posible ejecutar una instalación completa de dependencias ni conectarse a una base PostgreSQL de Render desde este entorno; el despliegue y las pruebas de integración deben confirmarse en Render.


## Solución del error ECONNREFUSED 127.0.0.1:5432 en Render

Este error significa que la aplicación intenta conectarse a PostgreSQL en el propio contenedor web. En Render, la base de datos es un servicio separado: no uses `localhost`, `127.0.0.1` ni `::1`.

### Si despliegas con Blueprint (`render.yaml`)
1. En Render, crea o actualiza el Blueprint desde el repositorio que contiene `render.yaml`.
2. Asegúrate de que se cree el recurso PostgreSQL `gleditech-db`.
3. Asegúrate de que el servicio web `gleditech` tenga `DATABASE_URL` vinculada a `gleditech-db` mediante `fromDatabase` (ya está declarada en `render.yaml`).
4. Si Render solicita `ADMIN_PASSWORD`, introduce una contraseña única de al menos 12 caracteres.
5. Guarda los cambios y ejecuta un nuevo deploy.

### Si creaste el servicio web manualmente (sin Blueprint)
1. Abre el servicio PostgreSQL de GLEDITECH en Render.
2. Copia **Internal Database URL** (no External Database URL).
3. Abre el servicio web `gleditech` → **Environment**.
4. Crea o actualiza `DATABASE_URL` y pega la Internal Database URL completa.
5. Guarda y realiza **Manual Deploy → Deploy latest commit**.

### Comprobación
- `DATABASE_URL` debe existir y su host no debe ser `localhost`, `127.0.0.1` ni `::1`.
- La base PostgreSQL y el servicio web deben estar en la misma región para usar la URL interna.
- No publiques ni compartas el valor de `DATABASE_URL`, porque contiene credenciales.
- El servidor ahora se detiene con un mensaje claro si `DATABASE_URL` falta o apunta a localhost.


## Actualización de Multer

Se actualizó `multer` de la rama 1.x a `^2.0.2` para evitar la advertencia de vulnerabilidades de la versión 1.x. La API utilizada por el proyecto (`memoryStorage` y límites de tamaño) sigue siendo compatible.

Si el repositorio de GitHub contiene un `yarn.lock` antiguo, actualízalo desde la carpeta del proyecto antes de desplegar:

```bash
yarn upgrade multer@^2.0.2
git add package.json yarn.lock
git commit -m "Actualiza Multer a 2.x"
git push
```

Si utilizas npm en lugar de Yarn:

```bash
npm install
git add package.json package-lock.json
git commit -m "Actualiza dependencias"
git push
```

**Nota sobre `error Command failed with exit code 1`:** esa línea es un resumen, no identifica por sí sola el fallo. El registro enviado muestra que Yarn terminó de resolver e instalar paquetes (`Done in 1.02s`); el error real debe estar después, normalmente durante `yarn start`. En este proyecto, verifica también que Render haya creado PostgreSQL y que el servicio web tenga `DATABASE_URL` vinculada a la base de datos, además de `ADMIN_PASSWORD` configurada con al menos 12 caracteres.


## Correcciones de la versión V3 (12-11-2026)
- Corregida la pérdida del token CSRF tras cambiar la contraseña inicial: ahora el backend devuelve `csrf` y la interfaz conserva el token. Esto evita errores 403 al crear o actualizar registros inmediatamente después del primer acceso.
- Corregido el identificador persistente de la configuración de empresa: los cambios guardados ya no crean accidentalmente un nuevo registro cada vez en bases recién inicializadas.
- Unificado el límite de subida de archivos a 20 MB entre la interfaz y el servidor, con un mensaje claro cuando se supera.
- Validación temprana de `ADMIN_PASSWORD` si está configurada.
- Actualizado el mensaje de conexión de la interfaz para instalaciones Node.js/Render (se eliminó la referencia incorrecta a Python).
- Verificada la sintaxis JavaScript de servidor e interfaz con Node.js 22 y revisada la integridad del ZIP.

**Alcance de las pruebas:** el entorno de preparación no pudo conectarse a `registry.npmjs.org` para instalar dependencias y tampoco dispone de tu base PostgreSQL. Por ello no se verificó un arranque completo ni pruebas de integración en Render. Los módulos pendientes de la sección anterior siguen pendientes; esta versión no los presenta como operativos.

**Actualizar un Render ya existente:** reemplaza el contenido del repositorio y despliega el último commit. Si el servicio y la base ya existen, conserva sus variables y datos: no es necesario borrar PostgreSQL ni crear una base nueva. Verifica `DATABASE_URL` y que `ADMIN_PASSWORD` esté configurada correctamente durante la inicialización.
