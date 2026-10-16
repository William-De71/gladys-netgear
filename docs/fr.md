# NETGEAR

## Présentation

Cette intégration amène un **routeur NETGEAR** dans Gladys : Nighthawk, Orbi et les autres routeurs NETGEAR que les applications NETGEAR (Nighthawk, Orbi, Genie) pilotent sur le réseau local. Elle interroge l’API locale du routeur (SOAP) toutes les 30 secondes :

- le **routeur** : utilisation CPU et mémoire, compteur de trafic du jour et du mois, dernier test de débit, état d’Internet, adresse WAN, clients connectés, micrologiciel ;
- ses **réglages**, sous forme d’interrupteurs : Wi-Fi invité 2,4 GHz et 5 GHz, contrôle d’accès, compteur de trafic, contrôle parental, QoS, Smart Connect (ceux que propose votre modèle) ;
- les **appareils de votre réseau**, comme capteurs de présence, avec leur **accès au réseau** (autorisé ou bloqué) sous forme d’interrupteur.

Elle apporte aussi des déclencheurs de scène (Internet coupé ou rétabli, adresse IP publique changée, appareil arrivé ou parti, nouvel appareil sur le réseau, mise à jour disponible), des actions de scène (lire l’état, lancer un test de débit, vérifier les mises à jour, redémarrer) et trois widgets de tableau de bord.

![Les trois widgets de l’intégration : vue d’ensemble du routeur NETGEAR, trafic Internet et appareils du réseau (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-netgear/main/docs/assets/widgets.fr.png)

L’image ci-dessus est une illustration générée, pas une capture d’écran.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Un routeur NETGEAR ou un système Orbi en mode routeur. En mode point d’accès, le routeur liste toujours ses clients, mais les fonctions Internet restent vides.
- Le compte administrateur du routeur : l’utilisateur `admin` et le mot de passe de son interface web (**pas** la clé Wi-Fi).
- Gladys doit joindre le routeur : son adresse sur le réseau local (souvent `192.168.1.1`, `10.0.0.1` pour un Orbi). L’API locale écoute sur le port 5000 pour la plupart des routeurs, 80 pour les Orbi, 443 ou 5555 pour quelques-uns : **Automatique** le trouve.
- Chaque groupe de fonctionnalités n’apparaît que si votre modèle y répond : CPU et mémoire, compteur de trafic, test de débit et chaque réglage dépendent du modèle et du micrologiciel.

## Configuration

| Champ                        | Description                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Adresse du routeur           | Son adresse IP, `192.168.1.1` par exemple.                                                                           |
| Port de l’API                | Automatique (par défaut) essaie 5000, 80, 443 puis 5555. N’en choisissez un que si la détection automatique échoue.  |
| Nom d’utilisateur            | `admin` par défaut.                                                                                                  |
| Mot de passe                 | Le mot de passe de l’interface web du routeur.                                                                       |
| Intervalle de lecture (s)    | De 10 à 300 secondes, 30 par défaut.                                                                                 |
| Appareils du réseau proposés | Ceux qui ont un nom (par défaut), tous, ou aucun.                                                                    |
| Délai d’absence (min)        | Un appareil est absent après ce délai sans être vu. 5 par défaut : un téléphone en veille quitte le Wi-Fi un moment. |
| Langue des textes            | Noms, états et résumés des scènes. Automatique : la langue de votre tableau de bord, dès qu’un widget a été affiché. |

Trois boutons en dessous : **Tester la connexion** affiche le modèle, le micrologiciel et le port trouvé ; **Oublier les appareils connus** fait des appareils présents la référence du déclencheur « nouvel appareil » ; **Diagnostic** écrit un rapport anonymisé dans l’onglet Journaux de l’intégration (voir Dépannage).

## Utilisation

### Appareils

Ouvrez **Découvrir** dans l’intégration et ajoutez les appareils voulus :

| Appareil           | Fonctionnalités                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routeur NETGEAR    | Utilisation CPU et mémoire (%), reçu et envoyé aujourd’hui et ce mois-ci (Mo), dernier test de débit (Mbit/s, ms), Internet, IP WAN, clients connectés, micrologiciel   |
| Réglages NETGEAR   | Interrupteurs : Wi-Fi invité 2,4 GHz, Wi-Fi invité 5 GHz, contrôle d’accès, compteur de trafic, contrôle parental, QoS, Smart Connect (ceux auxquels le routeur répond) |
| Appareil du réseau | Présence : 1 tant que le routeur le liste, 0 une fois absent depuis le délai d’absence. Accès au réseau : autorisé (allumé) ou bloqué (éteint), si le routeur l’indique |

Le compteur de trafic ne compte que s’il est activé dans le routeur (**Avancé › Configuration avancée › Compteur de trafic**, ou l’interrupteur « Compteur de trafic »).

### Présence des appareils

Un appareil est présent dès que le routeur le liste, et absent une fois parti depuis le délai d’absence. Tant qu’il est présent, sa présence est renvoyée chaque minute, comme la présence Bluetooth de Gladys : l’action « vérifier la présence » d’une scène fonctionne avec. Certains routeurs gardent un appareil quelques minutes dans leur liste après son départ : ajoutez-les au délai. Donnez un nom aux téléphones dans le routeur (**Appareils connectés**) pour les retrouver facilement : par défaut, seuls les appareils qui ont un nom sont proposés.

### Accès au réseau et réglages

L’interrupteur **Accès au réseau** d’un appareil le bloque (éteint) ou l’autorise (allumé) sur le réseau, via le contrôle d’accès du routeur : activez d’abord l’interrupteur **Contrôle d’accès** (ou **Sécurité › Contrôle d’accès** dans le routeur). Changer un réglage fait appliquer sa configuration au routeur : le Wi-Fi peut se couper quelques secondes. Chaque changement est relu sur le routeur : il ne compte que si le routeur l’indique.

### Widgets du tableau de bord

- **Routeur NETGEAR** : jauges CPU et mémoire, clients connectés, Internet, adresse WAN, Wi-Fi invité, micrologiciel, et deux boutons : **Chercher une mise à jour** et **Redémarrer** (avec confirmation).
- **Trafic Internet** : reçu et envoyé aujourd’hui et ce mois-ci, le graphique du jour (une fois l’appareil routeur ajouté), le dernier test de débit et un bouton **Lancer un test de débit**. Réglage : période du graphique.
- **Appareils du réseau** : les appareils connectés en ce moment, ceux partis, ou tous, avec leur connexion (filaire, bande Wi-Fi, réseau, signal, débit du lien) et un badge « Bloqué ». Réglage : ce qu’il faut afficher.

### Scènes

Déclencheurs :

- **Internet coupé ou rétabli** : lien du port Internet et adresse publique. Filtre sur l’état. Variables : état, IP WAN, résumé.
- **Adresse IP publique changée** : le fournisseur a donné une nouvelle adresse. Variables : nouvelle et ancienne adresse, résumé.
- **Appareil arrivé ou parti** : un appareil ajouté dans Gladys, ou n’importe lequel. Variables : nom, événement, MAC, IP, connexion, résumé.
- **Nouvel appareil sur le réseau** : une adresse MAC jamais vue, une seule fois (mémorisée entre les redémarrages). Filtre : Wi-Fi ou filaire.
- **Mise à jour disponible** : vérifiée toutes les 6 heures.

Actions :

- **Lire l’état** : CPU, mémoire, Internet, IP WAN, appareils présents, trafic du jour et du mois, Wi-Fi invité, micrologiciel, mise à jour disponible, et un résumé pour un message.
- **Lancer un test de débit** : le routeur mesure sa ligne (Ookla) pendant une minute au plus ; débit descendant, montant, ping et un résumé.
- **Vérifier les mises à jour** : demande au routeur de consulter tout de suite le serveur NETGEAR.
- **Redémarrer le routeur** : le réseau et Internet sont coupés quelques minutes.

Exemples : quand des invités arrivent (un bouton de scène), activer le Wi-Fi invité, et le couper à minuit ; à 21 h, bloquer la console des enfants, la réautoriser à 7 h ; quand l’adresse IP publique change, l’envoyer par message.

### Transport

Local uniquement : l’intégration dialogue avec l’API locale du routeur sur votre réseau, rien ne passe par un cloud. Le routeur contacte lui-même le serveur de mises à jour NETGEAR lors d’une vérification, et les serveurs Ookla lors d’un test de débit.

## Dépannage

- **« Le routeur refuse le nom d’utilisateur ou le mot de passe »** : ressaisissez le mot de passe de l’interface web (pas la clé Wi-Fi) ; l’intégration attend 5 minutes avant de réessayer, enregistrer la configuration réessaie tout de suite.
- **« ne répond pas comme un routeur NETGEAR »** ou **« ne répond pas »** : vérifiez l’adresse ; choisissez le port à la main (5000, puis 80 pour un Orbi). Certains anciens modèles n’ont pas d’API locale.
- **Une fonctionnalité manque** : votre modèle n’y répond pas (CPU, compteur de trafic, test de débit, certains réglages). Cliquez sur **Diagnostic** : le rapport liste ce à quoi le routeur répond.
- **Le trafic reste à 0** : activez le compteur de trafic dans le routeur.
- **Bloquer un appareil n’a pas d’effet** : activez d’abord le contrôle d’accès.
- **Un téléphone apparaît absent alors qu’il est là** : augmentez le délai d’absence ; certains téléphones endorment leur Wi-Fi longtemps.
- **Signaler un problème** : cliquez sur **Diagnostic**, ouvrez l’onglet Journaux de l’intégration et copiez les lignes commençant par `NETGEAR diagnostic` (numéro de série, adresses MAC, noms, SSID et IP publique en sont retirés) dans un ticket sur [GitHub](https://github.com/William-De71/gladys-netgear/issues), avec les versions de Gladys et de l’intégration. Le mot de passe n’apparaît jamais dans les journaux.
