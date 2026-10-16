# NETGEAR

## Presentación

Esta integración lleva un **router NETGEAR** a Gladys: Nighthawk, Orbi y los demás routers NETGEAR que las apps de NETGEAR (Nighthawk, Orbi, Genie) gestionan en la red local. Consulta la API local del router (SOAP) cada 30 segundos:

- el **router**: uso de CPU y memoria, medidor de tráfico del día y del mes, último test de velocidad, estado de Internet, dirección WAN, clientes conectados, firmware;
- sus **ajustes**, como interruptores: Wi-Fi de invitados 2,4 GHz y 5 GHz, control de acceso, medidor de tráfico, control parental, QoS, Smart Connect (los que ofrece su modelo);
- los **dispositivos de su red**, como sensores de presencia, con su **acceso a la red** (permitido o bloqueado) como interruptor.

También aporta disparadores de escena (Internet caído o restablecido, IP pública cambiada, dispositivo llegó o se fue, nuevo dispositivo en la red, actualización de firmware disponible), acciones de escena (leer el estado, medir la velocidad, buscar una actualización, reiniciar) y tres widgets de panel.

![Los tres widgets de la integración: resumen del router NETGEAR, tráfico de Internet y dispositivos de red (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-netgear/main/docs/assets/widgets.es.png)

La imagen de arriba es una ilustración generada, no una captura de pantalla.

## Requisitos previos

- Gladys Assistant 5.1.0 o posterior.
- Un router NETGEAR o un sistema Orbi en modo router. En modo punto de acceso el router sigue listando sus clientes, pero las funciones de Internet quedan vacías.
- La cuenta de administrador del router: el usuario `admin` y la contraseña de su interfaz web (**no** la clave Wi-Fi).
- Gladys debe alcanzar el router: su dirección en la red local (a menudo `192.168.1.1`, `10.0.0.1` para un Orbi). La API local escucha en el puerto 5000 en la mayoría de los routers, 80 en Orbi, 443 o 5555 en algunos: **Automático** lo encuentra.
- Cada grupo de funciones solo aparece si su modelo lo responde: CPU y memoria, medidor de tráfico, test de velocidad y cada ajuste dependen del modelo y del firmware.

## Configuración

| Campo                         | Descripción                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Dirección del router          | Su dirección IP, `192.168.1.1` por ejemplo.                                                                          |
| Puerto de la API              | Automático (por defecto) prueba 5000, 80, 443 y 5555. Elija uno solo si la detección automática falla.               |
| Nombre de usuario             | `admin` por defecto.                                                                                                 |
| Contraseña                    | La contraseña de la interfaz web del router.                                                                         |
| Intervalo de lectura (s)      | De 10 a 300 segundos, 30 por defecto.                                                                                |
| Dispositivos de red ofrecidos | Los que tienen nombre (por defecto), todos o ninguno.                                                                |
| Retardo de ausencia (min)     | Un dispositivo está ausente tras este tiempo sin verse. 5 por defecto: un teléfono en reposo sale del Wi-Fi un rato. |
| Idioma de los textos          | Nombres, estados y resúmenes de escenas. Automático: el idioma de su panel, en cuanto se haya mostrado un widget.    |

Tres botones debajo: **Probar la conexión** muestra el modelo, el firmware y el puerto encontrado; **Olvidar dispositivos conocidos** convierte los dispositivos presentes en la referencia del disparador «nuevo dispositivo»; **Diagnóstico** escribe un informe anonimizado en la pestaña Registros de la integración (ver Solución de problemas).

## Uso

### Dispositivos

Abra **Descubrir** en la integración y añada los dispositivos que quiera:

| Dispositivo        | Funciones                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router NETGEAR     | Uso de CPU y memoria (%), descargado y subido hoy y este mes (MB), último test de velocidad (Mbit/s, ms), Internet, IP WAN, clientes conectados, firmware           |
| Ajustes NETGEAR    | Interruptores: Wi-Fi de invitados 2,4 GHz, Wi-Fi de invitados 5 GHz, control de acceso, medidor de tráfico, control parental, QoS, Smart Connect (los que responde) |
| Dispositivo de red | Presencia: 1 mientras el router lo lista, 0 tras el retardo de ausencia. Acceso a la red: permitido (encendido) o bloqueado (apagado), si el router lo indica       |

El medidor de tráfico solo cuenta si está activado en el router (**Avanzado › Configuración avanzada › Medidor de tráfico**, o el interruptor «Medidor de tráfico»).

### Presencia de los dispositivos

Un dispositivo está presente en cuanto el router lo lista, y ausente cuando lleva fuera el retardo de ausencia. Mientras está presente, su presencia se envía de nuevo cada minuto, como la presencia Bluetooth de Gladys: la acción «comprobar la presencia» de una escena funciona con ella. Algunos routers mantienen un dispositivo unos minutos en su lista tras irse: súmelos al retardo. Ponga nombre a los teléfonos en el router (**Dispositivos conectados**) para encontrarlos fácilmente: por defecto, solo se ofrecen los dispositivos con nombre.

### Acceso a la red y ajustes

El interruptor **Acceso a la red** de un dispositivo lo bloquea (apagado) o lo permite (encendido) en la red, mediante el control de acceso del router: active primero el interruptor **Control de acceso** (o **Seguridad › Control de acceso** en el router). Cambiar un ajuste hace que el router aplique su configuración: el Wi-Fi puede cortarse unos segundos. Cada cambio se vuelve a leer en el router: solo cuenta si el router lo indica.

### Widgets del panel

- **Router NETGEAR**: indicadores de CPU y memoria, clientes conectados, Internet, dirección WAN, Wi-Fi de invitados, firmware, y dos botones: **Comprobar firmware** y **Reiniciar** (con confirmación).
- **Tráfico de Internet**: descargado y subido hoy y este mes, el gráfico del día (una vez añadido el dispositivo router), el último test de velocidad y un botón **Medir la velocidad**. Ajuste: periodo del gráfico.
- **Dispositivos de red**: los dispositivos conectados ahora, los que se fueron, o todos, con su conexión (cable, banda Wi-Fi, red, señal, velocidad del enlace) y una etiqueta «Bloqueado». Ajuste: qué mostrar.

### Escenas

Disparadores:

- **Internet caído o restablecido**: enlace del puerto de Internet y dirección pública. Filtro por estado. Variables: estado, IP WAN, resumen.
- **IP pública cambiada**: el proveedor ha dado una nueva dirección. Variables: dirección nueva y anterior, resumen.
- **Dispositivo llegó o se fue**: un dispositivo añadido en Gladys, o cualquiera. Variables: nombre, evento, MAC, IP, conexión, resumen.
- **Nuevo dispositivo en la red**: una dirección MAC nunca vista, una vez (recordada entre reinicios). Filtro: Wi-Fi o cable.
- **Actualización disponible**: comprobada cada 6 horas.

Acciones:

- **Leer el estado**: CPU, memoria, Internet, IP WAN, dispositivos presentes, tráfico del día y del mes, Wi-Fi de invitados, firmware, actualización disponible y un resumen para un mensaje.
- **Medir la velocidad**: el router mide su línea (Ookla) durante un minuto como máximo; bajada, subida, ping y un resumen.
- **Buscar actualización de firmware**: pide al router que consulte ahora el servidor de NETGEAR.
- **Reiniciar el router**: la red e Internet se cortan unos minutos.

Ejemplos: cuando llegan invitados (un botón de escena), activar el Wi-Fi de invitados y apagarlo a medianoche; a las 21:00, bloquear la consola de los niños y permitirla de nuevo a las 7:00; cuando cambia la IP pública, enviarla por mensaje.

### Transporte

Solo local: la integración habla con la API local del router en su red, nada pasa por una nube. El propio router contacta con el servidor de actualizaciones de NETGEAR al comprobar el firmware, y con los servidores de Ookla durante un test de velocidad.

## Solución de problemas

- **«El router rechaza el nombre de usuario o la contraseña»**: vuelva a escribir la contraseña de la interfaz web (no la clave Wi-Fi); la integración espera 5 minutos antes de reintentar, guardar la configuración lo intenta en el acto.
- **«no responde como un router NETGEAR»** o **«no responde»**: compruebe la dirección; elija el puerto a mano (5000, luego 80 para un Orbi). Algunos modelos antiguos no tienen API local.
- **Falta una función**: su modelo no la responde (CPU, medidor de tráfico, test de velocidad, algunos ajustes). Pulse **Diagnóstico**: el informe lista lo que responde el router.
- **El tráfico se queda en 0**: active el medidor de tráfico en el router.
- **Bloquear un dispositivo no tiene efecto**: active primero el control de acceso.
- **Un teléfono aparece ausente estando en casa**: aumente el retardo de ausencia; algunos teléfonos duermen su Wi-Fi mucho tiempo.
- **Informar de un problema**: pulse **Diagnóstico**, abra la pestaña Registros de la integración y copie las líneas que empiezan por `NETGEAR diagnostic` (número de serie, direcciones MAC, nombres, SSID e IP pública se omiten) en una incidencia en [GitHub](https://github.com/William-De71/gladys-netgear/issues), con las versiones de Gladys y de la integración. La contraseña nunca aparece en los registros.
