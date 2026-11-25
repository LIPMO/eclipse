#!/usr/bin/env bash
# =====================================================================
#  ECLIPSE — mise à jour demandée depuis le panneau d'administration
#
#  Installé dans /usr/local/sbin/eclipse-maj-demande par scripts/installer-maj-auto.sh.
#  Lancé par « eclipse-maj-demande.path » dès que le jeu dépose le fichier
#  <DATA_DIR>/maj/demande (bouton « Mettre à jour maintenant » de l'admin, propriétaire seulement).
#  Le contenu du fichier n'est jamais exécuté : on regarde seulement s'il demande de forcer.
# =====================================================================
set -uo pipefail
UNIT_FILE=/etc/systemd/system/eclipse.service
DATA_DIR=$(sed -nE 's/^Environment=DATA_DIR=(.*)$/\1/p' "$UNIT_FILE" 2>/dev/null | head -n1)
REQ="${DATA_DIR:-/var/lib/eclipse}/maj/demande"
[ -f "$REQ" ] && [ ! -L "$REQ" ] || { rm -f "$REQ"; exit 0; }
FORCE=0
if head -c 300 "$REQ" | grep -q '"force":true'; then FORCE=1; fi
rm -f "$REQ"
echo "[maj-demande] Mise à jour demandée depuis l'administration (forcée : $FORCE)."
if [ "$FORCE" = 1 ]; then
  rm -f /var/lib/eclipse-maj/failed # un commit en échec peut être réessayé
  exec env ECLIPSE_MAX_WAIT_MIN=0 /usr/local/sbin/eclipse-maj-auto
fi
exec /usr/local/sbin/eclipse-maj-auto
