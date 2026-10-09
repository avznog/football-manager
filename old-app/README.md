# FC Manager

App de gestion d'équipe : calendrier, compos, dispos, stats, notes.
1 admin + N joueurs. Single-page HTML + Supabase.

## Setup (15 min)

### 1. Créer le projet Supabase
1. Va sur https://supabase.com → nouveau projet (choisis une région Europe, ex. `eu-west-3`).
2. Attends que la DB soit provisionnée (~2 min).

### 2. Coller le schéma
1. Dans le dashboard Supabase → **SQL Editor**.
2. Copie tout le contenu de `schema.sql` dans une nouvelle requête.
3. **Run**. Vérifie qu'il n'y a pas d'erreur.

### 3. Récupérer les clés
Dashboard → **Project Settings → API**.
Copie :
- `Project URL` (ex. `https://xxxxxx.supabase.co`)
- `anon public` key (la clé publique, PAS la service_role)

### 4. Configurer l'HTML
Ouvre `index.html`, ligne ~135, remplace :
```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

### 5. (Optionnel) Désactiver la confirmation email
Supabase → **Authentication → Providers → Email** → décoche "Confirm email".
Sinon chaque joueur devra cliquer sur un lien reçu par email pour valider.

### 6. Créer ton compte admin
1. Ouvre `index.html` en local dans un navigateur (double-clic ou serveur local).
2. Onglet **Inscription** → crée ton compte.
3. Retour Supabase → **SQL Editor** :
   ```sql
   update public.profiles set is_admin = true where full_name ilike 'ton_pseudo%';
   ```
4. Reconnecte-toi → tu vois maintenant les onglets **Notes** et **Équipe**.

### 7. Déployer sur Hostinger
Upload `index.html` à la racine (ou dans un sous-dossier) de ton hébergement. C'est tout, pas de build.

## Utilisation

**Admin** :
- Onglet Équipe : ajuste noms et numéros de maillot, promeut/rétrograde admin.
- Calendrier → + Match : crée un match (adversaire, date, championnat/coupe, formation).
- Sur un match : drag & drop pour placer les joueurs. Ajoute des supporters. Après le match : coche "Marquer joué", remplis score/minutes/buts encaissés.

**Joueur** :
- Sur chaque match à venir : Présent / Absent.
- Sur un match joué où il était présent : rappel forcé à la connexion pour noter tous les autres joueurs (0–10 par pas de 0,5).

**Sécurité (RLS)** :
- Chaque joueur voit uniquement les notes qu'IL a mises.
- Seul l'admin voit la compilation des notes reçues par chacun.

## Contraintes connues
- Le drag & drop repose sur `onEnd` global : tout re-render après chaque drop. OK pour 17 personnes.
- Pas de real-time (pas de subscriptions Supabase) — il faut rafraîchir pour voir les changements des autres.
- Pas de gestion offline.
