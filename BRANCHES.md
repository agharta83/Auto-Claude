# Structure des branches (Fork personnel)

Ce document explique l'organisation des branches de ce fork.

## Branches principales

| Branche | Usage |
|---------|-------|
| `develop` | Synchronisation avec upstream (AndyMik90/Auto-Claude) |
| `main` | Branche stable personnelle |

## Workflow

### Synchroniser avec upstream

```bash
# Ajouter upstream (une seule fois)
git remote add upstream https://github.com/AndyMik90/Auto-Claude.git

# Récupérer les mises à jour
git fetch upstream

# Mettre à jour develop
git checkout develop
git merge upstream/develop

# Reporter sur main si besoin
git checkout main
git merge develop
```

### Développer une feature

```bash
# Créer une branche depuis main
git checkout main
git checkout -b feat/ma-feature

# Travailler...
git add .
git commit -m "feat: description"

# Pousser
git push -u origin feat/ma-feature

# Merger dans main quand c'est prêt
git checkout main
git merge feat/ma-feature
git branch -d feat/ma-feature
```

### Convention de nommage des branches

- `feat/*` - Nouvelles fonctionnalités
- `fix/*` - Corrections de bugs
- `chore/*` - Maintenance, config, docs

## Contribuer à upstream

Pour soumettre une PR au projet original :

```bash
# Partir de develop (synchronisé avec upstream)
git checkout develop
git checkout -b fix/mon-fix

# Faire les modifications...
git commit -s -m "fix: description"

# Pousser et créer la PR vers upstream/develop
git push origin fix/mon-fix
gh pr create --repo AndyMik90/Auto-Claude --base develop
```
