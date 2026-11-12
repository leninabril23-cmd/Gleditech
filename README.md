# GLEDITECH — GitHub + Render

Conversión del archivo `GLEDITECH_Vista_Previa.html` a una aplicación Node.js/Express con PostgreSQL y autenticación real. El aspecto y las pantallas originales se preservan.

## Implementado
- Acceso con usuario y contraseña, sesiones HTTP-only y protección CSRF.
- Primer acceso: obligación de cambiar contraseña.
- Roles `admin` y `technician`.
- El administrador puede crear usuarios, cambiar roles, activar/desactivar cuentas y reiniciar contraseñas asignando una temporal nueva.
- PostgreSQL persistente para cuentas, clientes, proyectos, precios, presupuestos/proformas, gastos, fotografías y documentos cargados (hasta 12 MB/archivo).
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
4. Revisa el plan y los posibles costos de Render antes de crear recursos. El archivo usa `starter` para el web service; los planes disponibles y los costos de la base varían.
5. Despliega y abre la URL HTTPS del servicio. La ruta `/health` permite validar la conexión.
6. Accede con el usuario de `ADMIN_USER` (`admin` por defecto) y `ADMIN_PASSWORD`. Se solicitará cambiar la contraseña en el primer ingreso.
7. Ve a **Usuarios y permisos > Nuevo usuario** para añadir empleados.

**Para un servicio ya existente:** crea/conecta una base PostgreSQL persistente, define `DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_USER`, `NODE_ENV=production` en Environment, configura Build Command `npm install`, Start Command `npm start`, Health Check Path `/health`.

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

> Esta versión se preparó y verificó sintácticamente, pero no se ejecutó contra una base PostgreSQL de Render desde este entorno. El despliegue y las pruebas de integración siguen siendo necesarios.
