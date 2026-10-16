// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: device and feature names, states, widget contents, scene
// summaries, messages of the Configuration screen. Vocabulary of the Gladys
// interface: appareil / Gerät / dispositivo, scène / Szene / escena; and of
// the NETGEAR router interface: micrologiciel / Firmware / firmware, compteur
// de trafic / Verkehrszähler / medidor de tráfico.
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // devices
  routerDeviceName: {
    en: 'NETGEAR {model}',
    fr: 'NETGEAR {model}',
    de: 'NETGEAR {model}',
    es: 'NETGEAR {model}',
  },
  settingsDeviceName: {
    en: 'NETGEAR {model} settings',
    fr: 'Réglages NETGEAR {model}',
    de: 'NETGEAR {model} Einstellungen',
    es: 'Ajustes NETGEAR {model}',
  },
  band_2g: { en: '2.4 GHz', fr: '2,4 GHz', de: '2,4 GHz', es: '2,4 GHz' },
  band_5g: { en: '5 GHz', fr: '5 GHz', de: '5 GHz', es: '5 GHz' },
  band_6g: { en: '6 GHz', fr: '6 GHz', de: '6 GHz', es: '6 GHz' },
  featureCpu: { en: 'CPU usage', fr: 'Utilisation CPU', de: 'CPU-Auslastung', es: 'Uso de CPU' },
  featureMemory: {
    en: 'Memory usage',
    fr: 'Utilisation mémoire',
    de: 'Speicherauslastung',
    es: 'Uso de memoria',
  },
  feature_download_today: {
    en: 'Downloaded today',
    fr: 'Reçu aujourd’hui',
    de: 'Heute heruntergeladen',
    es: 'Descargado hoy',
  },
  feature_upload_today: {
    en: 'Uploaded today',
    fr: 'Envoyé aujourd’hui',
    de: 'Heute hochgeladen',
    es: 'Subido hoy',
  },
  feature_download_month: {
    en: 'Downloaded this month',
    fr: 'Reçu ce mois-ci',
    de: 'Diesen Monat heruntergeladen',
    es: 'Descargado este mes',
  },
  feature_upload_month: {
    en: 'Uploaded this month',
    fr: 'Envoyé ce mois-ci',
    de: 'Diesen Monat hochgeladen',
    es: 'Subido este mes',
  },
  featureSpeedDown: {
    en: 'Speed test download',
    fr: 'Test de débit descendant',
    de: 'Speedtest Download',
    es: 'Test de velocidad bajada',
  },
  featureSpeedUp: {
    en: 'Speed test upload',
    fr: 'Test de débit montant',
    de: 'Speedtest Upload',
    es: 'Test de velocidad subida',
  },
  featurePing: {
    en: 'Speed test ping',
    fr: 'Ping du test de débit',
    de: 'Speedtest Ping',
    es: 'Ping del test de velocidad',
  },
  featureInternet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  featureWanIp: {
    en: 'WAN IP address',
    fr: 'Adresse IP WAN',
    de: 'WAN-IP-Adresse',
    es: 'Dirección IP WAN',
  },
  featureClients: {
    en: 'Connected clients',
    fr: 'Clients connectés',
    de: 'Verbundene Clients',
    es: 'Clientes conectados',
  },
  featureFirmware: { en: 'Firmware', fr: 'Micrologiciel', de: 'Firmware', es: 'Firmware' },
  featurePresence: { en: 'Presence', fr: 'Présence', de: 'Anwesenheit', es: 'Presencia' },
  featureAccess: {
    en: 'Network access',
    fr: 'Accès au réseau',
    de: 'Netzwerkzugang',
    es: 'Acceso a la red',
  },
  toggle_guest_wifi_2g: {
    en: 'Guest Wi-Fi 2.4 GHz',
    fr: 'Wi-Fi invité 2,4 GHz',
    de: 'Gast-WLAN 2,4 GHz',
    es: 'Wi-Fi de invitados 2,4 GHz',
  },
  toggle_guest_wifi_5g: {
    en: 'Guest Wi-Fi 5 GHz',
    fr: 'Wi-Fi invité 5 GHz',
    de: 'Gast-WLAN 5 GHz',
    es: 'Wi-Fi de invitados 5 GHz',
  },
  toggle_access_control: {
    en: 'Access control',
    fr: 'Contrôle d’accès',
    de: 'Zugangskontrolle',
    es: 'Control de acceso',
  },
  toggle_traffic_meter: {
    en: 'Traffic meter',
    fr: 'Compteur de trafic',
    de: 'Verkehrszähler',
    es: 'Medidor de tráfico',
  },
  toggle_parental_control: {
    en: 'Parental control',
    fr: 'Contrôle parental',
    de: 'Kindersicherung',
    es: 'Control parental',
  },
  toggle_qos: {
    en: 'Quality of service (QoS)',
    fr: 'Qualité de service (QoS)',
    de: 'Dienstgüte (QoS)',
    es: 'Calidad de servicio (QoS)',
  },
  toggle_smart_connect: {
    en: 'Smart Connect',
    fr: 'Smart Connect',
    de: 'Smart Connect',
    es: 'Smart Connect',
  },

  // states
  internet_connected: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  internet_connecting: {
    en: 'Connecting',
    fr: 'Connexion en cours',
    de: 'Verbindung wird aufgebaut',
    es: 'Conectando',
  },
  internet_disconnected: {
    en: 'Disconnected',
    fr: 'Déconnecté',
    de: 'Getrennt',
    es: 'Desconectado',
  },
  internet_unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  connectionWired: { en: 'Wired', fr: 'Filaire', de: 'Kabel', es: 'Por cable' },
  connectionWifi: {
    en: 'Wi-Fi {band}',
    fr: 'Wi-Fi {band}',
    de: 'WLAN {band}',
    es: 'Wi-Fi {band}',
  },
  connectionWifiAny: { en: 'Wi-Fi', fr: 'Wi-Fi', de: 'WLAN', es: 'Wi-Fi' },
  on: { en: 'on', fr: 'activé', de: 'an', es: 'sí' },
  off: { en: 'off', fr: 'désactivé', de: 'aus', es: 'no' },

  // scene summaries
  summaryInternet_connected: {
    en: 'The internet connection is back (IP {ip}).',
    fr: 'La connexion Internet est rétablie (IP {ip}).',
    de: 'Die Internetverbindung ist wieder da (IP {ip}).',
    es: 'La conexión a Internet se ha restablecido (IP {ip}).',
  },
  summaryInternet_disconnected: {
    en: 'The internet connection of the router is down.',
    fr: 'La connexion Internet du routeur est coupée.',
    de: 'Die Internetverbindung des Routers ist unterbrochen.',
    es: 'La conexión a Internet del router está caída.',
  },
  summaryWanIp: {
    en: 'The public IP address changed: {current} (was {previous}).',
    fr: 'L’adresse IP publique a changé : {current} (avant : {previous}).',
    de: 'Die öffentliche IP-Adresse hat sich geändert: {current} (vorher {previous}).',
    es: 'La dirección IP pública ha cambiado: {current} (antes {previous}).',
  },
  summaryPresence_arrived: {
    en: '{name} is connected to the network.',
    fr: '{name} est connecté au réseau.',
    de: '{name} ist mit dem Netzwerk verbunden.',
    es: '{name} está conectado a la red.',
  },
  summaryPresence_left: {
    en: '{name} left the network.',
    fr: '{name} a quitté le réseau.',
    de: '{name} hat das Netzwerk verlassen.',
    es: '{name} ha salido de la red.',
  },
  summaryNewClient: {
    en: 'New device on the network: {name} ({ip}, {connection}).',
    fr: 'Nouvel appareil sur le réseau : {name} ({ip}, {connection}).',
    de: 'Neues Gerät im Netzwerk: {name} ({ip}, {connection}).',
    es: 'Nuevo dispositivo en la red: {name} ({ip}, {connection}).',
  },
  firmwareUnchecked: {
    en: 'The router has not checked for a firmware update yet.',
    fr: 'Le routeur n’a pas encore vérifié les mises à jour du micrologiciel.',
    de: 'Der Router hat noch nicht nach einem Firmware-Update gesucht.',
    es: 'El router aún no ha buscado actualizaciones de firmware.',
  },
  firmwareUpToDate: {
    en: 'The firmware is up to date ({version}).',
    fr: 'Le micrologiciel est à jour ({version}).',
    de: 'Die Firmware ist aktuell ({version}).',
    es: 'El firmware está actualizado ({version}).',
  },
  firmwareAvailable: {
    en: 'A firmware update is available{version}.',
    fr: 'Une mise à jour du micrologiciel est disponible{version}.',
    de: 'Ein Firmware-Update ist verfügbar{version}.',
    es: 'Hay una actualización de firmware disponible{version}.',
  },
  speedTestNone: {
    en: 'The speed test gave no result.',
    fr: 'Le test de débit n’a donné aucun résultat.',
    de: 'Der Speedtest hat kein Ergebnis geliefert.',
    es: 'El test de velocidad no dio ningún resultado.',
  },
  speedTestResult: {
    en: '↓ {down} · ↑ {up} Mbit/s · {ping} ms',
    fr: '↓ {down} · ↑ {up} Mbit/s · {ping} ms',
    de: '↓ {down} · ↑ {up} Mbit/s · {ping} ms',
    es: '↓ {down} · ↑ {up} Mbit/s · {ping} ms',
  },
  summaryStatus: {
    en: 'Router: CPU {cpu} %, memory {memory} %.',
    fr: 'Routeur : CPU {cpu} %, mémoire {memory} %.',
    de: 'Router: CPU {cpu} %, Speicher {memory} %.',
    es: 'Router: CPU {cpu} %, memoria {memory} %.',
  },
  summaryStatusInternet_connected: {
    en: 'Internet connected ({ip}).',
    fr: 'Internet connecté ({ip}).',
    de: 'Internet verbunden ({ip}).',
    es: 'Internet conectado ({ip}).',
  },
  summaryStatusInternet_connecting: {
    en: 'Internet connecting.',
    fr: 'Connexion Internet en cours.',
    de: 'Internetverbindung wird aufgebaut.',
    es: 'Conectando a Internet.',
  },
  summaryStatusInternet_disconnected: {
    en: 'Internet disconnected.',
    fr: 'Internet déconnecté.',
    de: 'Internet getrennt.',
    es: 'Internet desconectado.',
  },
  summaryStatusInternet_unknown: {
    en: 'Internet status unknown.',
    fr: 'État d’Internet inconnu.',
    de: 'Internetstatus unbekannt.',
    es: 'Estado de Internet desconocido.',
  },
  summaryStatusClients: {
    en: '{count} device(s) on the network.',
    fr: '{count} appareil(s) sur le réseau.',
    de: '{count} Gerät(e) im Netzwerk.',
    es: '{count} dispositivo(s) en la red.',
  },
  summaryStatusTraffic: {
    en: 'Today: {down} MB down, {up} MB up.',
    fr: 'Aujourd’hui : {down} Mo reçus, {up} Mo envoyés.',
    de: 'Heute: {down} MB herunter, {up} MB hoch.',
    es: 'Hoy: {down} MB descargados, {up} MB subidos.',
  },

  // widgets
  overviewCaption: {
    en: '{model} · {ip} · {ago}',
    fr: '{model} · {ip} · {ago}',
    de: '{model} · {ip} · {ago}',
    es: '{model} · {ip} · {ago}',
  },
  tileCpu: { en: 'CPU', fr: 'CPU', de: 'CPU', es: 'CPU' },
  tileMemory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  tileClients: { en: 'Clients', fr: 'Clients', de: 'Clients', es: 'Clientes' },
  rowInternet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  rowWanIp: { en: 'WAN IP', fr: 'IP WAN', de: 'WAN-IP', es: 'IP WAN' },
  rowGuestWifi: { en: 'Guest Wi-Fi', fr: 'Wi-Fi invité', de: 'Gast-WLAN', es: 'Invitados' },
  rowFirmware: { en: 'Firmware', fr: 'Micrologiciel', de: 'Firmware', es: 'Firmware' },
  updateAvailable: {
    en: 'Update {version}',
    fr: 'Mise à jour {version}',
    de: 'Update {version}',
    es: 'Actualización {version}',
  },
  buttonCheckUpdates: {
    en: 'Check firmware',
    fr: 'Chercher une mise à jour',
    de: 'Firmware prüfen',
    es: 'Comprobar firmware',
  },
  buttonReboot: { en: 'Reboot', fr: 'Redémarrer', de: 'Neu starten', es: 'Reiniciar' },
  trafficCaption: {
    en: 'Traffic meter of the router · {state}',
    fr: 'Compteur de trafic du routeur · {state}',
    de: 'Verkehrszähler des Routers · {state}',
    es: 'Medidor de tráfico del router · {state}',
  },
  trafficMeterOn: { en: 'on', fr: 'activé', de: 'an', es: 'activado' },
  trafficMeterOff: { en: 'off', fr: 'désactivé', de: 'aus', es: 'desactivado' },
  tileTodayDown: { en: 'Today ↓', fr: 'Aujourd’hui ↓', de: 'Heute ↓', es: 'Hoy ↓' },
  tileTodayUp: { en: 'Today ↑', fr: 'Aujourd’hui ↑', de: 'Heute ↑', es: 'Hoy ↑' },
  tileMonthDown: { en: 'Month ↓', fr: 'Mois ↓', de: 'Monat ↓', es: 'Mes ↓' },
  tileMonthUp: { en: 'Month ↑', fr: 'Mois ↑', de: 'Monat ↑', es: 'Mes ↑' },
  chartToday: {
    en: 'Traffic of the day (MB)',
    fr: 'Trafic du jour (Mo)',
    de: 'Verkehr des Tages (MB)',
    es: 'Tráfico del día (MB)',
  },
  noTraffic: {
    en: 'The router gives no traffic meter: turn it on in its interface (Advanced › Traffic Meter) or with the “Traffic meter” switch.',
    fr: 'Le routeur ne fournit pas de compteur de trafic : activez-le dans son interface (Avancé › Compteur de trafic) ou avec l’interrupteur « Compteur de trafic ».',
    de: 'Der Router liefert keinen Verkehrszähler: Schalten Sie ihn in seiner Oberfläche (Erweitert › Verkehrszähler) oder mit dem Schalter „Verkehrszähler“ ein.',
    es: 'El router no da medidor de tráfico: actívelo en su interfaz (Avanzado › Medidor de tráfico) o con el interruptor «Medidor de tráfico».',
  },
  rowSpeedDown: {
    en: 'Speed test ↓',
    fr: 'Test de débit ↓',
    de: 'Speedtest ↓',
    es: 'Test de velocidad ↓',
  },
  rowSpeedUp: {
    en: 'Speed test ↑',
    fr: 'Test de débit ↑',
    de: 'Speedtest ↑',
    es: 'Test de velocidad ↑',
  },
  rowPing: { en: 'Ping', fr: 'Ping', de: 'Ping', es: 'Ping' },
  unitMB: { en: 'MB', fr: 'Mo', de: 'MB', es: 'MB' },
  unitGB: { en: 'GB', fr: 'Go', de: 'GB', es: 'GB' },
  unitTB: { en: 'TB', fr: 'To', de: 'TB', es: 'TB' },
  rowSpeedTest: {
    en: 'Speed test',
    fr: 'Test de débit',
    de: 'Speedtest',
    es: 'Test de velocidad',
  },
  speedTestNever: {
    en: 'Not run since the start',
    fr: 'Pas lancé depuis le démarrage',
    de: 'Seit dem Start nicht ausgeführt',
    es: 'No ejecutado desde el inicio',
  },
  buttonSpeedTest: {
    en: 'Run a speed test',
    fr: 'Lancer un test de débit',
    de: 'Speedtest starten',
    es: 'Medir la velocidad',
  },
  signalValue: {
    en: 'signal {value} %',
    fr: 'signal {value} %',
    de: 'Signal {value} %',
    es: 'señal {value} %',
  },
  networkCaption: {
    en: '{present} connected of {total} known',
    fr: '{present} connecté(s) sur {total} connu(s)',
    de: '{present} verbunden von {total} bekannten',
    es: '{present} conectado(s) de {total} conocido(s)',
  },
  networkMore: {
    en: '{count} more',
    fr: '{count} de plus',
    de: '{count} weitere',
    es: '{count} más',
  },
  networkEmpty_present: {
    en: 'No device is connected to the router right now.',
    fr: 'Aucun appareil n’est connecté au routeur en ce moment.',
    de: 'Derzeit ist kein Gerät mit dem Router verbunden.',
    es: 'Ningún dispositivo está conectado al router en este momento.',
  },
  networkEmpty_absent: {
    en: 'No device left the network since the integration started.',
    fr: 'Aucun appareil n’a quitté le réseau depuis le démarrage de l’intégration.',
    de: 'Seit dem Start der Integration hat kein Gerät das Netzwerk verlassen.',
    es: 'Ningún dispositivo ha salido de la red desde que se inició la integración.',
  },
  networkEmpty_all: {
    en: 'The router knows no device on the network yet.',
    fr: 'Le routeur ne connaît encore aucun appareil sur le réseau.',
    de: 'Der Router kennt noch kein Gerät im Netzwerk.',
    es: 'El router todavía no conoce ningún dispositivo en la red.',
  },
  badgeHere: { en: 'Here', fr: 'Présent', de: 'Da', es: 'Presente' },
  badgeWired: { en: 'Wired', fr: 'Filaire', de: 'Kabel', es: 'Cable' },
  badgeGone: { en: 'Gone', fr: 'Parti', de: 'Weg', es: 'Ausente' },
  badgeBlocked: { en: 'Blocked', fr: 'Bloqué', de: 'Gesperrt', es: 'Bloqueado' },
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: {
    en: '{n} min ago',
    fr: 'il y a {n} min',
    de: 'vor {n} Min.',
    es: 'hace {n} min',
  },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },

  // connection status, actions, messages
  noCredentials: {
    en: 'Enter the address of the router and the administrator password in the configuration.',
    fr: 'Saisissez l’adresse du routeur et le mot de passe administrateur dans la configuration.',
    de: 'Geben Sie die Adresse des Routers und das Administratorpasswort in der Konfiguration ein.',
    es: 'Introduzca la dirección del router y la contraseña de administrador en la configuración.',
  },
  notReadYet: {
    en: 'The router has not been read yet: come back in a few seconds.',
    fr: 'Le routeur n’a pas encore été lu : revenez dans quelques secondes.',
    de: 'Der Router wurde noch nicht gelesen: Schauen Sie in ein paar Sekunden wieder vorbei.',
    es: 'El router aún no se ha leído: vuelva en unos segundos.',
  },
  statusConnected: {
    en: '{model}: internet {internet}, {clients} device(s) on the network.',
    fr: '{model} : Internet {internet}, {clients} appareil(s) sur le réseau.',
    de: '{model}: Internet {internet}, {clients} Gerät(e) im Netzwerk.',
    es: '{model}: Internet {internet}, {clients} dispositivo(s) en la red.',
  },
  statusAuth: {
    en: 'The router refuses the user name or the password: check them (new attempt in 5 minutes, or at once after saving the configuration).',
    fr: 'Le routeur refuse le nom d’utilisateur ou le mot de passe : vérifiez-les (nouvel essai dans 5 minutes, ou tout de suite après avoir enregistré la configuration).',
    de: 'Der Router lehnt Benutzername oder Passwort ab: Prüfen Sie sie (neuer Versuch in 5 Minuten oder sofort nach dem Speichern der Konfiguration).',
    es: 'El router rechaza el nombre de usuario o la contraseña: compruébelos (nuevo intento en 5 minutos, o al guardar la configuración).',
  },
  statusNotFound: {
    en: 'This address does not answer like a NETGEAR router: check the address and the port.',
    fr: 'Cette adresse ne répond pas comme un routeur NETGEAR : vérifiez l’adresse et le port.',
    de: 'Diese Adresse antwortet nicht wie ein NETGEAR-Router: Prüfen Sie Adresse und Port.',
    es: 'Esta dirección no responde como un router NETGEAR: compruebe la dirección y el puerto.',
  },
  statusUnreachable: {
    en: 'The router does not answer at {host}: check the address, the port and the network.',
    fr: 'Le routeur ne répond pas à {host} : vérifiez l’adresse, le port et le réseau.',
    de: 'Der Router antwortet nicht unter {host}: Prüfen Sie Adresse, Port und Netzwerk.',
    es: 'El router no responde en {host}: compruebe la dirección, el puerto y la red.',
  },
  statusError: {
    en: 'The router answered something unexpected: see the logs of the integration.',
    fr: 'Le routeur a répondu quelque chose d’inattendu : voir les journaux de l’intégration.',
    de: 'Der Router hat unerwartet geantwortet: siehe Protokolle der Integration.',
    es: 'El router respondió algo inesperado: consulte los registros de la integración.',
  },
  statusUnsupported: {
    en: 'This router does not offer this function.',
    fr: 'Ce routeur ne propose pas cette fonction.',
    de: 'Dieser Router bietet diese Funktion nicht an.',
    es: 'Este router no ofrece esta función.',
  },
  testOk: {
    en: 'Connected to {model} (firmware {firmware}) on port {port}.',
    fr: 'Connecté à {model} (micrologiciel {firmware}) sur le port {port}.',
    de: 'Verbunden mit {model} (Firmware {firmware}) über Port {port}.',
    es: 'Conectado a {model} (firmware {firmware}) en el puerto {port}.',
  },
  forgotten: {
    en: 'Known devices forgotten: the next reading is the new reference, without alert.',
    fr: 'Appareils connus oubliés : la prochaine lecture sert de nouvelle référence, sans alerte.',
    de: 'Bekannte Geräte vergessen: Das nächste Lesen ist die neue Referenz, ohne Alarm.',
    es: 'Dispositivos conocidos olvidados: la próxima lectura es la nueva referencia, sin alerta.',
  },
  rebooting: {
    en: 'The router is rebooting: the network is cut for a few minutes.',
    fr: 'Le routeur redémarre : le réseau est coupé quelques minutes.',
    de: 'Der Router startet neu: Das Netzwerk ist einige Minuten unterbrochen.',
    es: 'El router se está reiniciando: la red se corta unos minutos.',
  },
  accessControlOff: {
    en: 'Turn on the access control of the router first (switch “Access control”).',
    fr: 'Activez d’abord le contrôle d’accès du routeur (interrupteur « Contrôle d’accès »).',
    de: 'Schalten Sie zuerst die Zugangskontrolle des Routers ein (Schalter „Zugangskontrolle“).',
    es: 'Active primero el control de acceso del router (interruptor «Control de acceso»).',
  },
  diagnosticDone: {
    en: 'Diagnostic written to the Logs tab. Copy the lines starting with “NETGEAR diagnostic” into your report (no serial number, MAC, name, SSID nor public IP).',
    fr: 'Diagnostic écrit dans l’onglet Journaux. Copiez les lignes commençant par « NETGEAR diagnostic » dans votre retour (sans numéro de série, MAC, nom, SSID ni IP publique).',
    de: 'Diagnose in den Tab Protokolle geschrieben. Kopieren Sie die Zeilen mit „NETGEAR diagnostic“ in Ihre Meldung (ohne Seriennummer, MAC, Namen, SSID und öffentliche IP).',
    es: 'Diagnóstico escrito en la pestaña Registros. Copie las líneas que empiezan por «NETGEAR diagnostic» en su informe (sin número de serie, MAC, nombres, SSID ni IP pública).',
  },
  unknownAction: {
    en: 'Unknown action.',
    fr: 'Action inconnue.',
    de: 'Unbekannte Aktion.',
    es: 'Acción desconocida.',
  },
};

/**
 * @description Whether a value is one of the languages of the integration.
 * @param {unknown} value - The value.
 * @returns {boolean} True for en, fr, de, es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its
 * substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('connectionWifi', 'de', { band: '5 GHz' }); // -> 'WLAN 5 GHz'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testOk', { model: 'R7000', firmware: '1.0.11.134', port: 5000 });
 */
function all(key, values = {}) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, t(key, language, values)]));
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("7,2" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} digits - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(7.25, 'fr', 1); // -> '7,3'
 */
function formatNumber(value, language, digits) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
