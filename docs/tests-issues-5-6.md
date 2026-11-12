# Tests manuels : issues #5 et #6 (PayPal sandbox)

Guide pas à pas, avec les valeurs attendues et les captures à faire.
Faire **#6 avant #5** : #5 exige un sandbox qui marche.

## 0. Pré-requis (les deux issues)

- `.env` rempli : `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`,
  `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_EMAIL_HERY/SOA/RIVO/LALAO/FIDY`
  (5 comptes sandbox **personal**), `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`.
- Comptes sandbox : 1 **business** (clearing) + 5 **personal** (un par trader).
- App lancée : `npm run dev`, base propre : `POST /api/demo/reset`.
- Vérifier le mode réel (pas simulé) :

```bash
curl -s localhost:3000/api/config
# attendu : {"paypalMode":"sandbox",...}
```

Si `paypalMode` vaut `simulated`, stop : les clés ne sont pas prises en compte.
- **Session admin obligatoire** : en mode sandbox, les routes payin/payout exigent
  une session finance, sinon 401 « Sign in to access the PayPal Sandbox account
  and AI tools ». Mettre `FINANCE_ADMIN_PASSWORD=` (≥ 16 caractères, jamais des
  clés PayPal) dans `.env`, **redémarrer** `npm run dev`, puis page `/finance` →
  « Sign in ». Vérifier :

```bash
curl -s localhost:3000/api/finance/session
# attendu : {"authenticated":true,"passwordConfigured":true,...}
```

Sans `authenticated:true`, tous les paiements échouent avec la 401 ci-dessus.

---

## Issue #6 : les 3 points ouverts

**Done when :** un commentaire sur l'issue avec un oui/non par point.

### 6.1 Les payouts partent du compte business une fois financé par les pay-ins

1. Reset : `curl -s -X POST localhost:3000/api/demo/reset`.
2. Ajouter la 9e dette (Rivo→Hery 50 $) : voir étape 2 de #5 ci-dessous.
3. Créer le round : `curl -s -X POST localhost:3000/api/rounds` → noter `id` (ci-après `ROUND`).
4. Payer les 3 pay-ins via la page `/rounds/ROUND` (popup PayPal, compte sandbox du bon trader) :
   Soa 170 $, Lalao 140 $, Fidy 10 $.
5. Contrôler le solde du compte **business** sur le dashboard sandbox :
   attendu **+320,00 $** (3 captures).
6. Envoyer les payouts : `curl -s -X POST localhost:3000/api/rounds/ROUND/payout`.
7. Contrôler sur le dashboard sandbox du compte business (Activity) :
   un batch payout avec 2 items, **Hery 290 $** et **Rivo 30 $**.

| Test | Attendu | Réponse |
|---|---|---|
| Pay-ins crédités sur business | +320,00 $ | oui / non |
| Batch payout créé, 2 items 290 $ + 30 $ | batch visible | oui / non |
| Comptes perso Hery / Rivo crédités | +290 $ / +30 $ | oui / non |

Captures : solde business avant/après, détail du batch payout, solde perso Hery.

### 6.2 Les comptes personnels ont assez de solde pour les pay-ins

1. Sur le dashboard sandbox, noter le solde de chaque compte personal **avant** le round.
2. Jouer les 3 pay-ins (même manip que 6.1).
3. Pour chaque capture, vérifier `status: COMPLETED` dans la réponse de
   `POST /api/rounds/ROUND/payin/:traderId/capture`.

| Payeur | Montant | Solde avant → après |
|---|---|---|
| Soa | 170 $ | ≥ 170 $ requis |
| Lalao | 140 $ | ≥ 140 $ requis |
| Fidy | 10 $ | ≥ 10 $ requis |

Réponse : oui si les 3 captures passent, non sinon (noter le compte et le message PayPal).
Astuce : un compte sandbox frais a un gros solde fictif ; si un compte est à sec,
le recréditer depuis le dashboard sandbox (Add funds / reset).

### 6.3 Le statut des payouts peut être pollé assez vite pour la démo live

1. Juste après `POST .../payout`, lancer un chrono.
2. Toutes les 10 s : `curl -s -X POST localhost:3000/api/rounds/ROUND/payout/refresh`
   et noter `status` des settlements `pay_out` (`sent` → `confirmed`) et du round (`paying` → `done`).
3. Noter le temps total jusqu'à `done`.

Réponse : oui si `done` en **moins de ~2 minutes** (compatible démo live), non sinon.
Si non : décision actée en section 13 d'`ARCHITECTURE.md` : afficher `sent`
comme état final dans la vidéo.

### Modèle de commentaire pour #6

```
Point 1 (payouts depuis business financé) : oui/non, batch <id>, Hery +290 $, Rivo +30 $.
Point 2 (soldes perso suffisants) : oui/non, soldes avant : Soa X $, Lalao Y $, Fidy Z $.
Point 3 (polling assez rapide) : oui/non, done en <durée>, N polls de 10 s.
Captures : <liens>.
```

---

## Issue #5 : un round complet avec vrais paiements sandbox

**Done when :** le round atteint `done` et un compte personal montre le payout.
En cas d'échec : ouvrir une issue `bug` avec écran + actions + texte d'erreur.

### Scénario nominal (valeurs seed + 9e dette)

| # | Action | Attendu |
|---|---|---|
| 1 | `POST /api/demo/reset` | `{ok:true}`, 5 traders, 8 dettes `confirmed` |
| 2 | Header « view as » → **Rivo**, page `/add`, taper `I owe Hery 50 for rice`, valider le draft | 1 draft : debtor Rivo, creditor Hery, **50,00 $**, dette `proposed`, `debtorOk: true` |
| 3 | « View as » → **Hery**, page `/confirm`, approuver | dette `confirmed` (les deux côtés OK) |
| 4 | Page `/`, bouton « Run clearing » | round `cleared` : total **990 $**, annulé **570 $**, payé **320 $** ; pay-ins Soa 170 / Lalao 140 / Fidy 10 ; pay-outs Hery 290 / Rivo 30 |
| 5 | Page `/rounds/ROUND`, payer comme **Soa** (popup PayPal) | settlement Soa `captured`, round `collecting` |
| 6 | Idem **Lalao**, puis **Fidy** | les 3 pay-ins `captured` |
| 7 | Bouton « Send payouts » | round `paying`, batch payout créé |
| 8 | Attendre / rafraîchir (`payout/refresh`) | settlements pay-out `confirmed`, dettes `settled`, round **`done`** |
| 9 | Dashboard sandbox, compte perso **Hery** | **+290,00 $** visibles (Rivo : +30,00 $) |
| 10 | Page `/statement` en vue Hery, puis Soa | résumé : cercles annulés, net, action (receive / pay_in) |

Captures : `/add` + draft, `/confirm` avant/après, `/rounds/ROUND` (stats 990/570/320),
popup PayPal, round `done`, solde sandbox Hery, un statement.

### Variante photo (même scénario, étape 2 remplacée)

Sur `/add`, envoyer une photo au lieu du texte :

- [photo-1-rivo-hery-50.jpg](test-photos/photo-1-rivo-hery-50.jpg) (facile) :
  « Rivo doit 50 $ à Hery pour riz » → attendu **le même draft que le texte**
  (Rivo→Hery, 5000 cts, confiance high). C'est la variante recommandée pour la démo.
- [photo-2-liste-4-dettes.jpg](test-photos/photo-2-liste-4-dettes.jpg) (moyen) :
  liste Soa→Hery 300, Hery→Fidy 120, Fidy→Soa 90, Lalao→Soa 150 →
  attendu **4 drafts** avec les bons traders et montants.
- [photo-3-alias-ratures.jpg](test-photos/photo-3-alias-ratures.jpg) (difficile) :
  alias (« Rivo hena », « le boucher », « Lalao legioma », « livreur Fidy »),
  mot raturé, sens de la 3e ligne ambigu (« Hery vary 60 $ Lalao ») →
  attendu : alias résolus (Rivo, Lalao, Fidy) **et une question** pour la dette
  ambiguë, jamais une sauvegarde aveugle.

### Cas limites à essayer (au moins 3)

1. **Payout trop tôt** : `POST .../payout` alors qu'un pay-in manque → refusé
   (erreur 4xx), aucun batch créé, rejouer après le dernier pay-in marche.
2. **Double capture** : rejouer `POST .../payin/soa/capture` avec le même `orderId` →
   pas de second débit (ORDER_ALREADY_CAPTURED géré), settlement reste `captured` une fois.
3. **Double payout** : rejouer `POST .../payout` → pas de double paiement
   (`sender_batch_id = roundId`), un seul batch.
4. **Dispute** : sur `/confirm`, Hery répond `ok:false` + 45 $ → dette `disputed`,
   `counterAmountCents: 4500` ; Rivo accepte 45 $ → `confirmed` à 45 $
   (et les totaux du round changent : à recalculer, ne plus attendre 990/570/320).
5. **Reset en plein round** : `POST /api/demo/reset` pendant `collecting` →
   base propre, les paiements sandbox déjà faits restent (argent sandbox fictif, le noter).

### Modèle d'issue bug (si une étape échoue)

```
Titre : [bug] <écran> : <ce qui rate>
- Étape du scénario : n°X ci-dessus
- Ce que j'ai fait : ...
- Attendu : ...
- Obtenu : ... + texte d'erreur exact
- Captures : ...
- IDs : round ..., order ..., batch ...
```

---

## Scénarios front (complètent #5 et #6, écran par écran)

À jouer dans l'ordre, sur une base resettée (`Reset demo` dans le menu « More » du header).
Noter `NAV` = barre de navigation, `VIEW` = sélecteur « View as » du header.

### H. Header + navigation (toutes les pages)

| # | Action | Attendu |
|---|---|---|
| H1 | Aller sur chaque page (`/`, `/add`, `/confirm`, `/rounds/latest`, `/statement`) | le lien actif est souligné ; aucun badge « PayPal simulated » (mode sandbox) |
| H2 | Passer VIEW à chaque trader, recharger la page, changer de page | le trader choisi persiste (localStorage) |
| H3 | Après l'étape 2 du scénario #5, VIEW = Hery | l'onglet Confirm affiche un badge compteur **1** |

### M. `/` : Market

| # | Action | Attendu |
|---|---|---|
| M1 | Après reset | stats : **$940.00** de dette confirmée, **8** dettes, **5** traders ; réseau : 5 nœuds, 8 flèches débiteur → créancier ; registre : 8 lignes (colonnes Debtor … Source) |
| M2 | Cliquer « Run clearing » | navigation vers `/rounds/<id>` (round `cleared`) |
| M3 | Revenir sur `/` avec un round ouvert | bouton **« Continue round »** (mène au round), pas « Run clearing » |
| M4 | Round `done`, cliquer « Run clearing » | message d'erreur visible (« No confirmed debt to clear »), pas de navigation ; stats : **$0.00**, 0 dettes confirmées ; registre : 9 lignes aux statuts `cleared`/`settled` |
| M5 | Menu « More », cliquer « Reset demo » | retour à M1, sans erreur |

### A. `/add` : ajout

| # | Action | Attendu |
|---|---|---|
| A1 | Page vide (VIEW = Rivo) | bouton « Read the sentence » **désactivé** ; « Try "I owe Hery 50 for rice" » remplit la phrase sans la lire |
| A2 | Taper `I owe Hery 50 for rice`, « Read with AI » | 1 carte draft : Debtor Rivo, Creditor Hery, Amount 50, badge de confiance ; « Save » actif |
| A3 | « Save » | carte « Saved: Rivo owes Hery $50.00. The other side must confirm it. » + liens Market/Confirm ; le badge Confirm de Hery passe à 1 (H3) |
| A4 | Recommencer avec [photo-1](test-photos/photo-1-rivo-hery-50.jpg) | même draft que A2 (source photo) |
| A5 | [photo-3](test-photos/photo-3-alias-ratures.jpg) | encadré ambre « AI question: … », confiance basse ; corriger à la main avant « Save » |
| A6 | Draft avec débiteur = créditeur | message rouge, « Save » désactivé ; montant invalide : message rouge ; draft sans le trader courant : message « Change "View as" first », « Save » désactivé |
| A7 | « Discard » sur un draft | la carte disparaît, rien n'est enregistré |

### C. `/confirm` : approbation

| # | Action | Attendu |
|---|---|---|
| C1 | VIEW = Hery, après A3 | section « Waiting for you (1) » : « Rivo owes Hery $50.00 » + note ; badges Proposed, « Debtor approved » vert, « Creditor not approved » |
| C2 | VIEW = Rivo | la dette est dans « Waiting for the other side », texte « Waiting for Hery. » |
| C3 | Hery : « Approve $50.00 » | la dette quitte la liste, le badge compteur tombe à 0 ; sur `/` le registre la montre `confirmed` |
| C4 | « Change amount » → 45 → « Send amount » | statut Disputed, tableau « Recorded amount $50.00 / Hery says $45.00 » ; bouton « Ask the AI » → encadré « AI suggestion: … » (+ bouton Accept si montant proposé) |
| C5 | Dette acceptée des deux côtés | liste vide : « Nothing to confirm » |

### R. `/rounds/[id]` : clearing et paiement (cœur de #5 et #6)

| # | Action | Attendu |
|---|---|---|
| R1 | Après « Run clearing » (9 dettes) | titre « **$990.00 of debt settled with $320.00** », badge `cleared` ; 4 stats : $990.00 / $570.00 / $320.00 / **67.7%** ; cartes Before/After ; liste « Circles cancelled » cliquable → surligne le cercle dans Before |
| R2 | Plan de règlement | pay-ins Soa $170.00 / Lalao $140.00 / Fidy $10.00, badges « Not started » ; pay-outs Hery $290.00 / Rivo $30.00 ; texte « Payouts start when every pay-in is paid. » (pas de bouton Send) |
| R3 | VIEW ≠ payeur | bouton « View as Soa to pay » → bascule VIEW, le **bouton PayPal** apparaît (sandbox ; en simulé : bouton « Pay … (simulated) ») |
| R4 | Payer Soa via popup PayPal (compte sandbox Soa) | badge Soa → « Paid in », statut round → `collecting` ; répéter Lalao, Fidy → bouton **« Send payouts »** |
| R5 | « Send payouts » | « Payouts sent. Waiting for PayPal to confirm them… », statuts pay-out → « Sent » puis « Paid out » **sans recharger** (poll auto 3 s) ; final : « Round complete. Every pay-in and pay-out is done. » + « Read your statement »; chronométrer pour le point 6.3 |
| R6 | `/rounds/latest` sans aucun round | état vide « No clearing round yet » + lien Market |

### S. `/statement` : relevé

| # | Action | Attendu |
|---|---|---|
| S1 | VIEW = Hery, round `done` | « Statement for Hery », **« You receive $290.00 »**, résumé IA, table Counterparty/Direction/Before/After/Reason, lien « View round » |
| S2 | VIEW = Soa | « You pay $170.00 » ; VIEW = Fidy : « You pay $10.00 » |
| S3 | Sans round | état vide « No clearing round yet » |

### P. Téléphone (complète l'issue #8)

| # | Action | Attendu |
|---|---|---|
| P1 | Largeur 390 px, toutes les pages | nav scrollable horizontalement, header lisible, pas de débordement ; table statement scrollable |
| P2 | `/add` sur téléphone | le champ photo propose l'appareil photo (`capture="environment"`) ; une photo de carnet 1600 px reste lisible pour l'IA |
| P3 | `/rounds/[id]` sur téléphone | popup PayPal utilisable, badges et boutons lisibles sans zoom |
