# Flujo de Caja — Guía de instalación en iPhone y sincronización

Tu app es una **PWA**: una app web que se instala en la pantalla de inicio del iPhone y funciona como una app normal (incluso sin internet). Esta guía tiene 3 partes:

1. **Subir la app a internet** (paso obligatorio para poder instalarla en el iPhone).
2. **Instalarla en el iPhone**.
3. **Activar la sincronización** entre el iPhone y el computador (Firebase).

> Puedes probarla primero en tu computador: haz **doble clic en `index.html`**. Funciona, pero para instalarla en el iPhone y sincronizar necesitas seguir los pasos de abajo.

---

## Parte 1 — Subir la app a internet (gratis, sin cuenta)

Usaremos **Netlify Drop**: arrastras la carpeta y te da un enlace `https://` en segundos.

1. Abre en el navegador: **https://app.netlify.com/drop**
2. Abre la carpeta `FLUJO DE CAJA` en el explorador de Windows.
3. **Selecciona estos archivos** (no la carpeta contenedora, sino su contenido) y arrástralos a la ventana de Netlify:
   - `index.html`
   - `manifest.webmanifest`
   - `service-worker.js`
   - `icon-180.png`, `icon-192.png`, `icon-512.png`
   > Truco: entra a la carpeta, presiona `Ctrl+A` para seleccionar todo y arrastra. (El archivo `GUIA.md` puedes incluirlo o no, da igual.)
4. Netlify te dará una dirección tipo **`https://algo-al-azar.netlify.app`**. Esa es tu app.
5. (Opcional) Crea una cuenta gratis en Netlify para que el enlace no expire y puedas ponerle un nombre más bonito en *Site settings → Change site name*.

> **Cada vez que yo actualice la app**, vuelves a este paso y arrastras los archivos de nuevo (o, si creaste cuenta, usas "Deploys → Drag and drop").

**Alternativa gratis:** GitHub Pages (si tienes cuenta de GitHub). Avísame y te guío.

---

## Parte 2 — Instalar en el iPhone

1. En el iPhone abre la dirección de Netlify **en Safari** (tiene que ser Safari, no Chrome).
2. Toca el botón **Compartir** (el cuadrito con la flecha hacia arriba, abajo al centro).
3. Baja y toca **"Agregar a inicio"** (Add to Home Screen).
4. Toca **Agregar**. Aparecerá el ícono de *Flujo de Caja* en tu pantalla de inicio.
5. Ábrela desde ese ícono: se ve a pantalla completa, como una app. Ya puedes registrar gastos e ingresos día a día, incluso sin internet.

---

## Parte 3 — Activar la sincronización iPhone ↔ computador (Firebase)

Sin esto, los datos del iPhone y del computador van por separado. Con esto, lo que registras en uno aparece en el otro. Es **gratis** para tu uso.

### 3.1 Crear el proyecto en Firebase
1. Entra a **https://console.firebase.google.com** con tu cuenta Google (maickol354@gmail.com).
2. **Agregar proyecto** → ponle un nombre (ej: *Flujo de Caja*) → puedes **desactivar Google Analytics** → Crear.

### 3.2 Crear la base de datos
1. Menú izquierdo: **Compilación → Firestore Database**.
2. **Crear base de datos** → elige una ubicación (ej: `southamerica-east1`) → empieza en **modo producción** → Habilitar.
3. Entra a la pestaña **Reglas** y reemplaza todo por esto, luego **Publicar**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

> Esto asegura que **solo tú** (con tu sesión iniciada) puedas leer/escribir tus datos.

### 3.3 Activar el inicio de sesión
1. Menú: **Compilación → Authentication → Comenzar**.
2. En **Sign-in method**, elige **Correo electrónico/contraseña** → **Habilitar** → Guardar.

### 3.4 Obtener la configuración (la "llave" de conexión)
1. Arriba a la izquierda, engranaje ⚙️ → **Configuración del proyecto**.
2. Baja hasta **"Tus apps"** → toca el ícono **`</>`** (Web).
3. Ponle un apodo (ej: *web*) → **Registrar app** (NO actives Firebase Hosting).
4. Te mostrará un bloque como este. **Cópialo completo**:

```js
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "flujo-de-caja.firebaseapp.com",
  projectId: "flujo-de-caja",
  storageBucket: "flujo-de-caja.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123...:web:abc..."
};
```

### 3.5 Conectar la app
1. Abre la app (en el iPhone o el computador) → pestaña **Más → Sincronización**.
2. Pega el bloque en el recuadro y toca **Guardar configuración**. La app se recargará.
3. Vuelve a **Más → Sincronización** → **Crear cuenta** con tu correo y una contraseña (mínimo 6 caracteres). Esa será tu cuenta.
4. En el **otro dispositivo**, repite 1–2 (pega la misma configuración) y usa **Entrar** con el **mismo correo y contraseña**.
5. Listo: verás arriba a la derecha el indicador en verde **"Sincronizado"**. Lo que registres en un dispositivo aparecerá en el otro.

> Si al iniciar sesión te diera un error de dominio: en Firebase → **Authentication → Settings → Dominios autorizados → Agregar dominio**, y agrega tu dirección de Netlify (ej: `algo.netlify.app`).

---

## Cosas importantes

- **Funciona sin internet.** Registras igual y se sincroniza cuando vuelve la conexión.
- **Respalda de vez en cuando.** En **Más → Respaldo** puedes exportar un archivo `.json` (copia de seguridad) y un `.csv` para Excel. Recomendado al menos una vez al mes.
- **Evita editar en dos dispositivos al mismo tiempo sin conexión**: al reconectar, gana el último que guardó (podrías perder cambios del otro). Para uso normal de una persona, no es problema.
- **Privacidad:** los datos viven en tu proyecto de Firebase (tu cuenta Google). Nadie más tiene acceso con las reglas de seguridad de arriba.
- La `apiKey` de Firebase **no es secreta**: es normal que vaya dentro de la app; la seguridad real la dan las reglas + tu contraseña.

¿Dudas en algún paso? Dime en cuál y te ayudo.
