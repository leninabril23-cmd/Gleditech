# GLEDITECH — V4: acceso inicial corregido

**Usuario inicial:** `admin`  
**Contraseña inicial:** `admin`

Al entrar, **se exige cambiar inmediatamente la contraseña por otra de al menos 12 caracteres** antes de usar el sistema. No dejes la contraseña inicial activa en una aplicación pública.

Esta versión contiene una migración que restablece **una sola vez** la cuenta `admin` existente a la clave inicial `admin`, sin borrar tablas, documentos ni usuarios. También cierra las sesiones anteriores de esa cuenta. Después de cambiar la contraseña, un reinicio o despliegue posterior no vuelve a colocarla en `admin`. La migración queda registrada en PostgreSQL.

### Actualizar el servicio actual de Render
1. Descomprime el ZIP y reemplaza los archivos en la raíz del mismo repositorio GitHub que usa tu servicio web **Gleditech**.
2. Mantén la variable `DATABASE_URL` y el grupo de entorno que ya has enlazado. `ADMIN_PASSWORD` ya no se necesita en V4; puedes eliminarla del grupo cuando confirmes que V4 está desplegado.
3. En Render ejecuta **Manual Deploy → Deploy latest commit**. Confirma que el despliegue de V4 termina correctamente antes de intentar iniciar sesión.
4. Ingresa con `admin` / `admin` y elige una clave nueva y privada de al menos 12 caracteres cuando la aplicación lo solicite.
5. No publiques claves nuevas ni la URL de PostgreSQL.

**Atención:** El uso de una contraseña pública y fácil de adivinar implica riesgo hasta completar el primer cambio. Realiza el cambio inmediatamente después del despliegue.

### Notas
- Requiere la URL de PostgreSQL en `DATABASE_URL`.
- La migración afecta solo a la cuenta `admin` y registra su ejecución una sola vez, sin restablecerla posteriormente.
- No se cambian las funciones comerciales ni el esquema de registros existente.
- Debes confirmar el despliegue y el acceso real en Render; esta entrega se valida localmente a nivel de archivos y sintaxis.



## Correcciones V5 (12 noviembre 2026)
- Se agrega `statuses` a `/api/dashboard`, eliminando la excepción `Cannot convert undefined or null to object` en el panel.
- Se incorporan valores predeterminados defensivos en los gráficos y listas del panel.
- Logo oficial suministrado incluido en `public/static/assets/logo.png` y `gleditech-original.jpeg`.
- La imagen de portada y la entrada ya no apuntan a un recurso ausente.
- No se eliminan ni migran tablas o registros existentes. Se conservan las credenciales de la V4 y la obligación de cambiar la contraseña inicial.
- Para actualizar: sustituir los archivos en GitHub, desplegar último commit en Render y recargar con Ctrl+F5.
