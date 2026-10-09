**If there is a slight question, where you are not sure, ASK ME. Do not hesitate, better you ask me than improvise. No tagging in production allowed, we are only working in main, so "latest" on the image**
# GitHub Project management
I created a "project" in GitHub. Fill in all the past issues that we did in this kanban, so we can see the project working. It will also be useful for multi sessions of claude if I work on multiple computers

# First steps : cleaning
- Entrainements. Plus besoin de gérer ça.
- Disponibilité pour le match
- Message de relance pour ceux qui n'ont pas répondu
- Quand on rentre une feuille de match, pas besoin de faire une feuille de match. a partir de maintenant, on place les joueurs sur le terrain, et sur la meme page, en bas on peut dire qui est supporters / remplacant.
- Sur la page de composition / composition de départ, supprimer les différentes formations : il n'y a à partir de maintenant qu'une seule formation -> 1 (GK), 2 (DC * 2), 3 (MC, AT * 2 (gauche et droite, mais ne pas faire de différence, ce sont les ailliers), 1 (BU))
- Supprimer les changements de postes
- N'afficher dans le bouton "Action" que BUT (avec passe D), But Encaissé, Changement et autre (comprendra ce qu'il y a dans remarque, autre, et commentaire).
- Supprimer le bouton "fin" -> remplacer directement par "Sifflet"
- Supprimer les postes préférés sur la page de profil

# New instructions
## Compositions
La nouvelle formation, unique, est le 1 2 3 1, comme indiquée au dessus.
Dans la page de composition, le coach peut donc indiquer qui est supporter. Le reste des joueurs est considéré comme pas sélectionné.

## Mode match
Par défaut la compo principale est appliquée.
Les postes de joueurs doivent être constamment connus. Il faut qu'on sache, dans les evenements, quels sont les postes des gens.

### Changements
- Lors de changements (par exemple 10e minute), on s'en fiche de savoir qui remplace qui lors de changements. Par exemple, je dis que 4 personnes rentrent et 4 personnes sortent, sans dire que X remplace Y. En revanche, une fois que c'est fait, le coach doit pouvoir confirmer la nouvelle compo / nouveaux postes avec un drag & drop. Une fois que c'est bon, il peut confirmer, mais les changements sont actifs pour la minute à laquelle on a cliqué sur le bouton action (donc si je prends 1 mn à noter dans l'application, les changements sont effectués à la 10e et pas à la 11e)
- Lors de changement en groupe, il faut qu'ils soient tous à la même minute, donc il faut la possibilté d'ajouter plusieurs changements à la fois

### Pour les actions
- Il faut désormais pouvoir cliquer sur un joueur sur le terrain pour lui faire faire une action. Si je clique sur lui, le panneau d'action s'affiche. L'action sera donc effectuée sur le joueur en question
- Lorsqu'on fait des changements juste après avoir pris un but, il faut s'assurer que le but encaissé a bien été noté sur l'équipe qui était sur le terrain, pas sur celle qui vient de rentrer. Je propose de les noter à la minute d'après. Si tu as une meilleure manière de faire, fais donc. 
- Il doit être possible de rajouter des actions à la fin d'un match, comme des changements, mais il faut que ce soit réaliste. Ex : si lucas est déjà sur le terrain, je ne peux pas dire "changement, lucas rentre"

## Notes
Peuvent noter : tous les titulaires, tous les remplaçants, et tous les supporters. Les joueurs non sélectionnés ne peuvent pas noter.

## Postes de chaque joueur par le coach
Désormais, c'est les coachs, et uniquement les coachs, qui peuvent indiquer quels sont les postes favoris des joueurs. Ces postes seront utilisés plus tard dans la section statistiques car c'est sur ceux là qu'on se basera pour récupérer les équipes types. Ces postes là ne sont pas important pour les compositions, ou en match. C'est uniquement à titre indicatif (et pour les stats)

# Stats
## Stats générales
- Il faut qu'on ait les stats suivantes (déduites des matchs) (et donc les classements)
  - nombre de buts par joueur
  - nombre de passe décisive par joueur 
  - les buts encaissés en tant que gardien
  - les buts encaissés en étant sur le terrain (par joueur) (joueuur de champs est différent de gardien)
  - qui a pris combien de but
  - les buts encaissés toutes les X minutes
  - les buts encaissés toutes les X minutes pour les goals
  - les minutes d'invincibilité
  - Minutes jouées au goal
  - minutes jouées sur le terrain

- Il faut qu'on sache, pour chaque poste, qui est le meilleur en terme d'impact pour l'équipe .

## Stats "équipe type"
- Pour l'équipe type, il faut qu'on respecte les postes indiqués par le coach pour chaque joueur (poste préférés)
- Il faut équipe type offensive : la meilleure attaque. On priorise les joueurs de champs, par poste, avec le plus grand nombre de buts mis, puis de passe D. Ensuite, parmi ceux qui ont joué au goal, on sélectionne celui avec les meilleures stats de goal (donc le moins de but pris au goal).
- Il faut une équipe type défensive : la meilleure défense. On priorise, par poste, les joueurs de champs qui ont pris le plus petit nombre de buts. Idem pour le goal
- Il faut une équipe "7 de légende" (la meilleure équipe possible) : elle combine le meilleur à chaque poste, en commençant par l'attaque, et en terminant par le goal. Il ne faut pour autant ne pas mettre quelqu'un de trop nul au goal, quitte à mettre (parmi les goals), un joueur de terrain qui est un peu meilleur au goal pour éviter d'avoir un goal trop nul

# Bugs détectés
Il a fait appliquer la compo -> il a fait ignorer la compo -> le terrain a disparu
