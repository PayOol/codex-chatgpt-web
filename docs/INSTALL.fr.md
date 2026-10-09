# Installer Codex Web GPT avec OpenCodex

Cette distribution réunit le lanceur Codex Web GPT Enhanced et le moteur officiel OpenCodex. L'installateur Windows x64 contient les composants nécessaires ; aucune installation manuelle de Git, Node, npm, Python ou OpenCodex n'est nécessaire.

1. Télécharge l'exécutable Windows depuis la [release](https://github.com/PayOol/codex-chatgpt-web/releases/tag/v6.1.7-Enhanced.1-Integrated.1). Les limites de validation de cette préversion sont indiquées dans ses notes.
2. Lance l'installateur, puis **Codex Web GPT** depuis le menu Démarrer.
3. Connecte ton propre compte ChatGPT, teste le navigateur et installe l'intégration dans Codex depuis le lanceur.
4. Configure **Codex Native2** dans le parcours MCP si tu souhaites utiliser les outils natifs avec les modèles Web.
5. Dans **OpenCodex**, sous **Configuration**, ajoute tes propres fournisseurs et comptes. Leurs modèles sont servis à Codex par Codex Web GPT.
6. Redémarre complètement Codex après sa configuration initiale pour recharger le catalogue.

Les identifiants, quotas et modèles d'une autre personne ne sont pas inclus. Une installation vierge démarre sans comptes fournisseurs configurés. Les modèles et niveaux disponibles dépendent de tes accès.

## Mises à jour

Utilise le tableau de bord OpenCodex pour mettre à jour son moteur. La mise à jour attend jusqu'à 30 minutes la fin des tâches, puis redémarre seulement OpenCodex. Si l'attente expire, le paquet est conservé et tu peux relancer l'opération une fois les tâches terminées.

Le lanceur recherche les versions stables sur le dépôt **PayOol**. Une préversion se télécharge explicitement depuis Releases. Les données et fournisseurs restent dans le profil local et une mise à jour du lanceur conserve la version OpenCodex que tu as déjà actualisée.

## Si Codex Web GPT est déjà installé

Termine les tâches et quitte normalement l'ancien lanceur avant d'ouvrir la distribution. Le profil existant est réutilisé ; ne lance pas deux versions sur le même profil. Le programme refuse de remplacer l'intégration lorsqu'un processus la possède encore.

Le lanceur doit rester actif pour que Codex puisse utiliser ses modèles. L'option de maintien en arrière-plan permet de fermer sa fenêtre sans quitter le service. Quitter complètement le programme coupe cette connexion.

## Vérifier le téléchargement

La release fournit `checksums.txt`. Avec PowerShell, calcule l'empreinte de l'installateur :

```powershell
Get-FileHash -Algorithm SHA256 .\codex-web-gpt-6.1.7-Enhanced.1-Integrated.1-win-x64.exe
```

Compare le résultat à la ligne correspondante dans `checksums.txt`. Cette préversion n'est pas signée avec un certificat de publication Windows. Smart App Control peut donc bloquer son exécution sur certains ordinateurs, y compris celui utilisé pour préparer cette version. Une empreinte correcte ne remplace pas une signature. Si Windows la bloque, conserve ton installation actuelle et attends une distribution signée ; ne désactive pas les protections Windows.
