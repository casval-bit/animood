# AniMood sur le Microsoft Store — guide

L'appli de bureau peut être publiée sur le Store sous forme de paquet MSIX/AppX. Le Store **signe** le paquet lui-même :
pas de certificat à acheter. Tout se passe sur Windows.

## 1. Compte développeur (une fois)
1. https://partner.microsoft.com/dashboard → s'inscrire comme **développeur individuel** (compte Microsoft personnel).
   D'après Microsoft (sept. 2025) l'inscription des particuliers est gratuite, avec vérification d'identité (pièce d'identité + selfie).
2. **Applications et jeux → Nouveau produit → Application ou jeu → réserver le nom « AniMood »**
   (si le nom est pris, choisis-en un autre, ex. « AniMood Desktop »).

## 2. Récupérer l'identité du produit
Dans Partner Center : ton app → **Gestion des produits → Identité du produit**. Note ces 3 valeurs :
- `Package/Identity/Name`  → `identityName`
- `Package/Identity/Publisher` (commence par `CN=`) → `publisher`
- `Package/Properties/PublisherDisplayName` → `publisherDisplayName`

Colle-les dans `electron-builder.store.yml` (section `appx`, à la place des « REMPLACE… »). Ce ne sont pas des secrets.

## 3. Construire le paquet
```powershell
cd "C:\Users\brice maillard\animoodv12\animoodv12"
npm run electron:build:store
```
Le fichier `.appx` est créé dans `dist-store\`. (Ne lance jamais `npm install` ici ; si la commande dit « electron-builder introuvable », préviens-moi.)

## 4. Tester avant d'envoyer
- Mode Store sans installer : `$env:ANIMOOD_STORE=1; .\run_desktop.bat` — les plateformes perso disparaissent (voir §6) et la mise à jour automatique est coupée.
- Le « Kit de certification des applications Windows » (Windows App Cert Kit, fourni avec le SDK Windows) lance les mêmes contrôles que le Store.

## 5. Soumettre
Partner Center → ton app → **Démarrer la soumission** :
- **Packages** : envoie le `.appx`.
- **Fiche Store** : description FR + EN, au moins 1 capture d'écran (1366×768 ou plus), logo.
- **Classification d'âge** : questionnaire IARC (voir §6, point 2).
- **Politique de confidentialité** : une adresse web publique (URL) est obligatoire, car l'appli collecte des données de compte.
  Elle n'existe aujourd'hui que dans une fenêtre de l'appli : il faut une page web (ex. `https://ton-site/confidentialite`).
- **Notes pour la certification** : l'appli demande une connexion → donne un compte de démonstration que les testeurs pourront utiliser.
- Les mises à jour se font ensuite en renvoyant un nouveau paquet avec un numéro de version plus grand (`package.json` → `version`).

## 6. Points qui peuvent faire refuser l'appli (soyons francs)
1. **Plateformes de streaming perso** : une appli qui aide à accéder à des sites de streaming non officiels peut être refusée
   (règles 11.2 « droits d'auteur » et 11.8 « activité illégale »). **La version installée depuis le Store masque donc cette fonction**
   (bouton « + Ma plateforme » et section des réglages) ; l'appli téléchargée hors Store la garde.
2. **Contenu adulte** : les règles imposent un contenu de fiche compatible PEGI 12 (règle 11.1). L'appli interroge Jikan avec `sfw:false`,
   donc des animés pour adultes peuvent apparaître (affiches, synopsis). À filtrer pour le Store avant la soumission (je peux le faire).
3. **Contenu des utilisateurs** (forum, messages, profils) : le Store attend signalement + modération + blocage (le blocage existe ; vérifier le signalement).
4. **Images et textes** d'animés (affiches venant de MyAnimeList/AniList) : le Store demande que tout contenu soit sous licence ou autorisé (règle 11.2).
   Le risque est réel mais rarement vérifié en pratique.
5. L'appli est un vrai logiciel (pas un simple site dans une fenêtre) : elle embarque ses fichiers, ce qui respecte la règle 10.1.

## 7. Ce qui est déjà préparé dans le projet
- `electron-builder.store.yml` + logos de tuile `build/appx/` (générés depuis `logo-mark.png`).
- Mode Store : détecté automatiquement (`process.windowsStore`), mises à jour automatiques coupées (le Store s'en charge).
- Icône de la barre système corrigée dans la version installée.
