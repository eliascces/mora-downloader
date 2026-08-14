# Mora Downloader

Descarga **MP3 y video (MP4)** de [YouTube](https://www.youtube.com), [Facebook](https://www.facebook.com) y cualquier otra plataforma soportada por [yt-dlp](https://github.com/yt-dlp/yt-dlp), vigilando el portapapeles.

Copias un enlace, la app detecta el link y te deja elegir formato (audio o video + calidad) a través de una mini-ventana. Es una app de escritorio **Electron** con interfaz en **español e inglés**, empaquetada como **.exe portable** (no requiere instalación).

## Características

- Monitor de portapapeles con interruptor ON/OFF (funciona aunque la app esté en segundo plano).
- Descarga MP3 (audio 320 kbps) o video MP4 con selección de calidad: `Best / 1080p / 720p / 480p`.
- Mini-ventana al copiar un link fuera de la app para elegir el formato (atajos: `M` MP3, `V` video, `Esc` cancelar).
- Soporte de **playlists** (opción activable) y deduplicación de enlaces repetidos.
- Biblioteca con reproductor integrado, **favoritos** (⭐) y **playlists de tu biblioteca**.
- Historial de descargas persistente.
- Notificaciones nativas al completar/fallar descargas.
- Verificación de espacio libre (< 100 MB avisa).
- Actualización automática de yt-dlp desde la interfaz.

Los archivos descargados se guardan en tu carpeta destino dentro de subcarpetas `MP3/` y `Videos/` (por defecto crea `Mora Música` en `Descargas`).

## Requisitos

Ninguno: la app incluye `yt-dlp.exe`, `ffmpeg` y `ffprobe` empaquetados. Solo se necesita Windows x64.

## Uso

1. Descarga `MoraDownloader-1.0.0.exe` desde [Releases](https://github.com/eliascces/mora-downloader/releases).
2. Activa el toggle. Elige carpeta de destino si no quieres la predeterminada.
3. Copia un enlace de un video (YouTube, Facebook, etc.).
4. Elige formato y calidad; la descarga comienza sola.

## Desarrollo

```bash
npm install
npm run setup:binaries   # descarga yt-dlp + ffmpeg a assets/resources
npm run icons            # genera iconos
npm start                # ejecuta en desarrollo
npm test                 # tests unitarios (node:test)
npm run dist             # empaqueta el .exe portable en dist/
```

Hay una prueba end-to-end real (descarga de verdad) con `node scripts/e2e.js`.