# Football Manager

Une application web pour gérer une équipe de football **à 7** sur une saison : calendrier,
disponibilités, feuille de match, compositions sur le terrain, **mode match en direct** et
statistiques.

Mobile d'abord — elle est faite pour être utilisée au bord du terrain, sur un téléphone, avec une
seule barre de réseau.

## Démarrer

```bash
npm install
npm run db:start          # Postgres local (Homebrew)
cp .env.example .env.local
npm run db:migrate        # applique les migrations SQL versionnées
npm run db:seed           # données de référence + saison de démonstration
npm run dev
```

Puis <http://localhost:3000>. Comptes de démonstration créés par le seed :

| identifiant | mot de passe | rôle |
|---|---|---|
| `admin` | celui de `SUPER_ADMIN_PASSWORD` | coach, super admin |
| `karim` | `motdepasse` | joueur-coach |
| `hugo` | `motdepasse` | joueur |

## Scripts

| commande | effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | build de production |
| `npm run typecheck` | types des routes + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (reducer, permissions, géométrie du terrain…) |
| `npm run db:generate` | génère une migration SQL depuis `db/schema.ts` |
| `npm run db:migrate` | applique les migrations |
| `npm run db:seed` | données de référence + démo (`-- --reference` pour la référence seule) |
| `npm run db:reset` | **efface tout**, remigre, reseede (local uniquement) |
| `npm run db:studio` | Drizzle Studio |

## Où lire

L'ordre de lecture pour reprendre le projet est dans [`CLAUDE.md`](./CLAUDE.md) :

- [`docs/PROJECT.md`](./docs/PROJECT.md) — ce que fait l'application, et ce qu'elle ne fait pas
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — le journal des décisions et leurs raisons
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) — les tables et leurs invariants
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — l'état d'avancement, jalon par jalon
- [`docs/NEXTJS16.md`](./docs/NEXTJS16.md) — les conventions Next.js 16 utilisées ici

Une règle avant tout : **l'interface est en français, le code est en anglais.**
