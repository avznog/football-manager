# Le projet, en clair

> Ce document décrit ce que fait l'application, en français, du point de vue de ceux qui
> l'utilisent. Pour l'architecture technique, voir `PLAN.md` et `DATA_MODEL.md`.

## À quoi ça sert

Gérer une équipe de **football à 7** sur une saison : savoir qui vient, faire les compositions,
suivre le match en direct, et garder les statistiques de tout le monde.

## Les rôles

- **Super admin** — peut tout faire, sur toutes les équipes. Nomme les coachs.
- **Coach** — gère son équipe : effectif, invitations, nomination d'autres coachs, matchs,
  entraînements, compositions, mode jeu, blessures, présences aux entraînements.
  Un coach peut aussi être joueur : il fait alors tout ce qu'un joueur fait.
- **Joueur** — indique ses disponibilités, choisit ses postes préférés, se déclare blessé,
  note ses coéquipiers après un match, consulte toutes les données de l'équipe.

Sans équipe, on n'a accès à rien : le seul écran disponible est « rejoindre une équipe ».
On rejoint avec un code d'invitation donné par un coach.

## Le déroulé d'une semaine

1. Le coach crée le match dans le calendrier : adversaire, date, heure, lieu, domicile ou
   extérieur, type de compétition (championnat, coupe, amical, tournoi).
2. Chaque joueur indique s'il est disponible. Le coach voit qui n'a pas répondu.
3. Le coach établit la feuille de match : titulaires, remplaçants, supporters.
4. Le coach fait la composition sur le terrain, en glissant les joueurs sur les postes.
   Il peut préparer d'autres compositions « à partir de la 30ᵉ minute » : l'application en déduit
   toute seule les changements à faire.
5. Le jour du match, le coach lance le **mode jeu**.
6. Après le match, tout le monde note tout le monde. Le recap affiche le score, les buteurs et
   l'homme du match.

## Le mode jeu

Un seul téléphone pilote le match : celui du coach, ou celui de la personne qu'il désigne.

À l'écran : le chrono en haut, le terrain avec les 7 joueurs, le banc en dessous, et un gros
bouton **ACTION**. Le bouton ouvre la liste de ce qui peut se passer : but, but encaissé, csc,
penalty, changement, changement de poste, faute, blessure.

Pour aller plus vite, le bouton **TERRAIN** ouvre le terrain en glisser-déposer : on réorganise
toute l'équipe, banc compris, et on valide une seule fois.

Aux minutes prévues, l'application propose la composition préparée à l'avance : elle ouvre le
terrain déjà rempli et signale en rouge les joueurs blessés ou déjà sortis. **Rien ne s'applique
sans validation du coach.**

Le chrono est continu : en 2×30, la deuxième période va de la 30ᵉ à la 60ᵉ minute. On peut mettre
en pause.

Tout est enregistré en base au fur et à mesure. Si le réseau tombe au bord du terrain, les
actions sont gardées sur le téléphone avec leur minute exacte et remontent dès que ça revient.
Rien n'est jamais effacé : une erreur s'annule, et la ligne reste visible comme annulée
(« but de Karim 58' — annulé »).

## Les notes

Seuls les joueurs présents sur la feuille de match peuvent noter. Chacun note tous les autres —
et lui-même — de 0 à 10, avec un commentaire s'il veut. Les notes sont signées : tout le monde
voit qui a mis quoi.

On ne voit les notes des autres qu'après avoir donné les siennes. Les notes sont ouvertes jusqu'au
coup d'envoi du match suivant. L'homme du match en est déduit.

## Les statistiques

Par joueur : matchs joués, minutes, buts, passes décisives, csc, fautes, clean sheets quand il
était gardien, « minutes d'invincibilité » (minutes passées sur le terrain sans encaisser),
nombre de fois venu comme titulaire, remplaçant, gardien ou supporter, taux de présence aux
entraînements, moyenne des notes reçues.

Par équipe : résultats, forme, meilleurs buteurs, meilleures moyennes. Tout est filtrable par
compétition.

## Les entraînements

Calendrier, chacun dit s'il vient, et le coach coche les présents le jour même.

## Ce que l'application ne fait pas

Volontairement, pour rester simple :

- pas de cartons jaunes ni rouges ;
- pas de buteurs adverses, ni de tirs, arrêts ou corners ;
- pas de classement du championnat à saisir à la main ;
- pas de notifications ni d'e-mails : l'application montre ce qui attend une réponse, et au coach
  la liste de ceux qui n'ont pas répondu ;
- pas de récupération de mot de passe en autonomie : un coach le réinitialise.
